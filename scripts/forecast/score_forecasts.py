# -*- coding: utf-8 -*-
"""Score published election forecasts against results. Stdlib only.

THE POINT
    /predictions/scoreboard scores football against the closing market and
    publishes the unflattering number. Elections sat on that page saying "not
    yet resolvable" while four races -- Brazil, Israel, the US midterms and New
    Zealand -- settle between 4 October and 20 November 2026. This closes that
    gap BEFORE the first one lands, so nothing is reconstructed after the fact.

HOW IT WORKS
    build_forecast.py overwrites data/forecast/snapshots/<code>-<date>.json on
    every run while the race is in the future. Election day passes, the file
    stops being touched, and it is the last forecast published before the polls
    opened. A human then writes the result into
    data/forecast/results/<code>-<date>.json, and this joins the two.

    The results file states FACTS ONLY -- seat counts, a winner's name. This
    module derives the CLAIMS (a probability the forecast made, an interval it
    published) from the snapshot. That split matters: whoever types the result
    cannot accidentally choose which claims get graded.

MEASURES
    Brier      mean (p - outcome)^2 over binary calls. Lower is better; 0.25 is
               what a coin gets, so anything above it is worse than shrugging.
    Skill      1 - model_brier / market_brier, on the races where a closing
               market price was recorded. Identical axis to the football ledger.
    MAE        mean absolute error on seat counts.
    Coverage   share of published intervals that contained the truth. An 80%
               interval should contain it 80% of the time; well under that means
               the sigma is too tight, well over means it is theatre.

Usage:
    python scripts/forecast/score_forecasts.py [--write] [--self-test]
    (prints the table; --write emits public/data/forecast-scoreboard.json)
"""
import json
import os
import sys
from datetime import date, datetime

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
SNAP_DIR = os.path.join(ROOT, "data", "forecast", "snapshots")
RES_DIR = os.path.join(ROOT, "data", "forecast", "results")
OUT = os.path.join(ROOT, "public", "data", "forecast-scoreboard.json")

COUNTRY = {"uk": "United Kingdom", "us": "United States", "nz": "New Zealand",
           "il": "Israel", "br": "Brazil", "fr": "France"}

# The blocs the New Zealand model simulates. Kept here rather than imported so
# a change to the model is a deliberate change to the scoring too.
NZ_RIGHT = ("nat", "act", "nzf")
NZ_LEFT = ("lab", "grn", "tpm")

CALIB_BINS = [(0, 10), (10, 20), (20, 30), (30, 40), (40, 50),
              (50, 60), (60, 70), (70, 80), (80, 90), (90, 100)]


# ------------------------------------------------------------------ helpers --

def _b(key, label, p, outcome, market=None):
    """One binary call. p and market are percentages, outcome is 0/1."""
    if p is None:
        return None
    p = max(0.0, min(100.0, float(p))) / 100.0
    o = 1.0 if outcome else 0.0
    row = {"key": key, "label": label, "p": round(p * 100, 1),
           "outcome": int(o), "brier": round((p - o) ** 2, 5)}
    if market is not None:
        m = max(0.0, min(100.0, float(market))) / 100.0
        row["marketP"] = round(m * 100, 1)
        row["marketBrier"] = round((m - o) ** 2, 5)
    return row


def _i(key, label, rng, actual):
    """One published interval against the truth."""
    if rng is None or actual is None:
        return None
    med, lo, hi = rng.get("median"), rng.get("lo"), rng.get("hi")
    if med is None:
        return None
    row = {"key": key, "label": label, "median": med, "lo": lo, "hi": hi,
           "actual": actual, "err": abs(med - actual)}
    if lo is not None and hi is not None:
        row["inside"] = bool(lo <= actual <= hi)
    return row


def _point(key, label, predicted, actual):
    if predicted is None or actual is None:
        return None
    return {"key": key, "label": label, "median": round(predicted, 1),
            "lo": None, "hi": None, "actual": actual,
            "err": round(abs(predicted - actual), 2)}


def _mkt(result, key):
    return (result.get("market") or {}).get(key)


# ----------------------------------------------------------------- adapters --
# Each returns (binaries, intervals). Every adapter tolerates a partial result
# file: a fact that is absent simply grades nothing, rather than guessing.

def score_us(block, result):
    bins_, ints = [], []
    house = result.get("houseDem")
    if house is not None:
        bins_.append(_b("us_house", "Democrats hold the House",
                        block.get("pDemHouse"), house >= 218, _mkt(result, "us_house")))
        ints.append(_i("us_house_seats", "Democratic House seats",
                       block.get("demSeats"), house))
    sen = block.get("senate") or {}
    sd = result.get("senateDem")
    if sd is not None:
        ctrl = result.get("senateDemControl")
        if ctrl is None:
            ctrl = sd >= 51
        bins_.append(_b("us_senate", "Democrats control the Senate",
                        sen.get("pDemControl"), ctrl, _mkt(result, "us_senate")))
        ints.append(_i("us_senate_seats", "Democratic Senate seats",
                       sen.get("demSeats"), sd))
    gov = block.get("governors") or {}
    gd = result.get("govDem")
    if gd is not None:
        bins_.append(_b("us_gov", "Democrats hold most governorships",
                        gov.get("pDemMajority"), gd >= 26, _mkt(result, "us_gov")))
        ints.append(_i("us_gov_seats", "Democratic governorships",
                       gov.get("demSeats"), gd))
    return bins_, ints


def score_nz(block, result):
    bins_, ints = [], []
    seats = result.get("seats") or {}
    if seats:
        total = result.get("totalSeats") or sum(seats.values())
        need = total // 2 + 1
        right = sum(seats.get(k, 0) for k in NZ_RIGHT)
        left = sum(seats.get(k, 0) for k in NZ_LEFT)
        bins_.append(_b("nz_right", "National-led bloc wins a majority",
                        block.get("pRightBloc"), right >= need, _mkt(result, "nz_right")))
        bins_.append(_b("nz_left", "Labour-led bloc wins a majority",
                        block.get("pLeftBloc"), left >= need, _mkt(result, "nz_left")))
        bins_.append(_b("nz_neither", "Neither bloc reaches a majority",
                        block.get("pNeither"),
                        right < need and left < need, _mkt(result, "nz_neither")))
        for party, rng in (block.get("seats") or {}).items():
            if party in seats:
                ints.append(_i("nz_seats_" + party, "%s seats" % party.upper(),
                               rng, seats[party]))
    return bins_, ints


def score_il(block, result):
    bins_, ints = [], []
    gov_seats = result.get("govBloc")
    if gov_seats is not None:
        gov = block.get("gov") or {}
        bins_.append(_b("il_gov", "Governing bloc reaches 61 seats",
                        gov.get("pMajority"), gov_seats >= 61, _mkt(result, "il_gov")))
        if gov.get("avg") is not None:
            ints.append(_point("il_gov_seats", "Governing-bloc seats",
                               gov["avg"], gov_seats))
    seats = result.get("seats") or {}
    for row in block.get("parties") or []:
        name = row.get("name")
        if name in seats:
            ints.append(_point("il_seats_" + str(name), "%s seats" % name,
                               row.get("seats"), seats[name]))
    return bins_, ints


def _round_scores(block, result, code):
    bins_, ints = [], []
    runoff = result.get("runoff") or {}
    winner = runoff.get("winner")
    if winner:
        for m in block.get("runoffs") or []:
            pair = {m.get("a"), m.get("b")}
            if pair == {runoff.get("a"), runoff.get("b")}:
                bins_.append(_b("%s_runoff" % code,
                                "%s beats %s in the runoff" % (m["a"], m["b"]),
                                m.get("pA"), winner == m["a"],
                                _mkt(result, "%s_runoff" % code)))
                break
    actual_r1 = result.get("firstRound") or {}
    shares = ((block.get("firstRound") or {}).get("shares")) or {}
    for name, pred in shares.items():
        if name in actual_r1:
            ints.append(_point("%s_r1_%s" % (code, name),
                               "%s first-round share" % name, pred, actual_r1[name]))
    return bins_, ints


def score_br(block, result):
    return _round_scores(block, result, "br")


def score_fr(block, result):
    return _round_scores(block, result, "fr")


def score_uk(block, result):
    bins_, ints = [], []
    seats = result.get("seats") or {}
    sim = block.get("sim") or {}
    if seats:
        largest = max(seats, key=lambda k: seats[k])
        for party, p in (sim.get("pLargest") or {}).items():
            bins_.append(_b("uk_largest_" + party, "%s is the largest party" % party.upper(),
                            p, party == largest, _mkt(result, "uk_largest_" + party)))
        total = result.get("totalSeats") or 650
        need = total // 2 + 1
        hung = all(v < need for v in seats.values())
        bins_.append(_b("uk_hung", "Hung parliament", sim.get("pHung"), hung,
                        _mkt(result, "uk_hung")))
        for party, rng in (sim.get("seats") or {}).items():
            if party in seats:
                ints.append(_i("uk_seats_" + party, "%s seats" % party.upper(),
                               rng, seats[party]))
    return bins_, ints


ADAPTERS = {"us": score_us, "nz": score_nz, "il": score_il,
            "br": score_br, "fr": score_fr, "uk": score_uk}


# ------------------------------------------------------------------ scoring --

def summarise(binaries, intervals):
    graded = [b for b in binaries if b]
    ivs = [i for i in intervals if i]
    out = {"binaries": len(graded), "intervals": len(ivs)}
    if graded:
        out["brier"] = round(sum(b["brier"] for b in graded) / len(graded), 5)
        # A "pick" is which side of 50 the forecast came down on. Exactly 50
        # counts as no pick, because it is not one.
        out["correct"] = sum(1 for b in graded
                             if b["p"] != 50 and (b["p"] > 50) == bool(b["outcome"]))
        out["picks"] = sum(1 for b in graded if b["p"] != 50)
        priced = [b for b in graded if "marketBrier" in b]
        if priced:
            mb = sum(b["marketBrier"] for b in priced) / len(priced)
            mo = sum(b["brier"] for b in priced) / len(priced)
            out["marketBrier"] = round(mb, 5)
            out["pricedBrier"] = round(mo, 5)
            out["priced"] = len(priced)
            # The football ledger's axis: positive means the model beat the
            # market, negative means it did not. Reported either way.
            out["skill"] = round(100.0 * (1 - mo / mb), 2) if mb > 0 else None
    if ivs:
        out["mae"] = round(sum(i["err"] for i in ivs) / len(ivs), 2)
        band = [i for i in ivs if "inside" in i]
        if band:
            out["coverage"] = round(100.0 * sum(1 for i in band if i["inside"]) / len(band), 1)
            out["banded"] = len(band)
    return out


def calibration(binaries):
    """Ten-point reliability table: what happened when we said 70%."""
    rows = []
    for lo, hi in CALIB_BINS:
        sel = [b for b in binaries if lo <= b["p"] < hi or (hi == 100 and b["p"] == 100)]
        if not sel:
            rows.append({"lo": lo, "hi": hi, "n": 0, "said": None, "happened": None})
            continue
        rows.append({"lo": lo, "hi": hi, "n": len(sel),
                     "said": round(sum(b["p"] for b in sel) / len(sel), 1),
                     "happened": round(100.0 * sum(b["outcome"] for b in sel) / len(sel), 1)})
    return rows


def score_all(snapshots, results, today=None):
    """snapshots/results: {basename: parsed json}. Pure, for the self-test."""
    today = today or date.today()
    resolved, pending = [], []
    for name in sorted(snapshots):
        snap = snapshots[name]
        code = snap.get("code")
        block = snap.get("block") or {}
        election = snap.get("election")
        res = results.get(name)
        if res is None:
            when = None
            try:
                when = datetime.strptime(election, "%Y-%m-%d").date()
            except (TypeError, ValueError):
                pass
            pending.append({
                "code": code, "country": COUNTRY.get(code, code),
                "election": election,
                "daysAway": (when - today).days if when else None,
                "forecastFrom": snap.get("built"),
                "awaitingResult": bool(when and when <= today),
            })
            continue
        fn = ADAPTERS.get(code)
        if not fn:
            continue
        bins_, ints = fn(block, res)
        bins_ = [b for b in bins_ if b]
        ints = [i for i in ints if i]
        resolved.append({
            "code": code, "country": COUNTRY.get(code, code),
            "election": election,
            "forecastFrom": snap.get("built"),
            "daysBefore": snap.get("daysBefore"),
            "note": res.get("note"),
            "sources": res.get("sources") or [],
            "binaries": bins_, "intervals": ints,
            "summary": summarise(bins_, ints),
        })

    all_b = [b for r in resolved for b in r["binaries"]]
    all_i = [i for r in resolved for i in r["intervals"]]
    totals = summarise(all_b, all_i)
    totals["races"] = len(resolved)
    pending.sort(key=lambda p: (p["election"] or "9999"))
    return {"resolved": resolved, "pending": pending, "totals": totals,
            "calibration": calibration(all_b) if all_b else []}


# ------------------------------------------------------------------- runner --

def _load_dir(path):
    out = {}
    if not os.path.isdir(path):
        return out
    for fn in sorted(os.listdir(path)):
        if fn.endswith(".json"):
            with open(os.path.join(path, fn), encoding="utf-8") as fh:
                out[fn[:-5]] = json.load(fh)
    return out


def main():
    doc = score_all(_load_dir(SNAP_DIR), _load_dir(RES_DIR))
    doc["built"] = date.today().isoformat()
    t = doc["totals"]
    print("resolved races: %d   pending: %d" % (t.get("races", 0), len(doc["pending"])))
    for r in doc["resolved"]:
        s = r["summary"]
        print("  %-14s %s  brier %.4f over %d calls%s" % (
            r["country"], r["election"], s.get("brier", float("nan")),
            s.get("binaries", 0),
            "" if s.get("skill") is None else "   skill vs market %+.2f%%" % s["skill"]))
    for p in doc["pending"]:
        flag = "  <-- VOTED, RESULT NOT FILED" if p["awaitingResult"] else ""
        print("  pending: %-14s %s (%s days)%s" % (
            p["country"], p["election"], p["daysAway"], flag))
    if "--write" in sys.argv:
        json.dump(doc, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("wrote public/data/forecast-scoreboard.json")
    return 0


# ---------------------------------------------------------------- self-test --

def _self_test():
    fails = []

    def check(label, got, want):
        if got != want:
            fails.append("%s: got %r, want %r" % (label, got, want))

    def close(label, got, want, tol=1e-6):
        if got is None or abs(got - want) > tol:
            fails.append("%s: got %r, want %r" % (label, got, want))

    TODAY = date(2026, 11, 20)

    # --- a US midterm that the model half got right -------------------------
    snap_us = {"code": "us", "election": "2026-11-03", "built": "2026-11-02",
               "daysBefore": 1,
               "block": {"pDemHouse": 75.0,
                         "demSeats": {"median": 226, "lo": 205, "hi": 248},
                         "senate": {"pDemControl": 42.4,
                                    "demSeats": {"median": 50, "lo": 47, "hi": 54}},
                         "governors": {"pDemMajority": 37.8,
                                       "demSeats": {"median": 25, "lo": 21, "hi": 28}}}}
    res_us = {"houseDem": 230, "senateDem": 49, "govDem": 24,
              "market": {"us_house": 80.0, "us_senate": 35.0}}
    doc = score_all({"us-2026-11-03": snap_us}, {"us-2026-11-03": res_us}, TODAY)
    r = doc["resolved"][0]
    check("us binaries", len(r["binaries"]), 3)
    # House: said 75%, happened. (0.75-1)^2 = 0.0625
    close("us house brier", r["binaries"][0]["brier"], 0.0625)
    # Senate: said 42.4% control, D got 49 seats, so it did not happen.
    close("us senate brier", r["binaries"][1]["brier"], 0.424 ** 2, 1e-4)
    # Governors: said 37.8%, D got 24, below 26, did not happen.
    close("us gov brier", r["binaries"][2]["brier"], 0.378 ** 2, 1e-4)
    # Intervals: |226-230| + |50-49| + |25-24| = 6 over 3 -> 2.0
    close("us mae", r["summary"]["mae"], 2.0)
    # All three actuals sit inside their published bands.
    check("us coverage", r["summary"]["coverage"], 100.0)
    # Picks: the House call said 75 and was right; the Senate at 42.4 and the
    # Governors at 37.8 both said "no" and both were right. Three of three.
    check("us picks", (r["summary"]["correct"], r["summary"]["picks"]), (3, 3))
    # Skill uses ONLY the two priced calls: model (0.0625 + 0.179776)/2,
    # market ((0.8-1)^2 + 0.35^2)/2 = (0.04 + 0.1225)/2.
    mo = (0.0625 + 0.424 ** 2) / 2
    mb = (0.04 + 0.1225) / 2
    close("us skill", r["summary"]["skill"], round(100.0 * (1 - mo / mb), 2), 0.01)

    # --- New Zealand, three-way bloc call -----------------------------------
    snap_nz = {"code": "nz", "election": "2026-11-07", "built": "2026-11-06",
               "daysBefore": 1,
               "block": {"pRightBloc": 82.1, "pLeftBloc": 10.0, "pNeither": 7.9,
                         "seats": {"nat": {"median": 39, "lo": 35, "hi": 43},
                                   "lab": {"median": 41, "lo": 36, "hi": 45}}}}
    res_nz = {"seats": {"nat": 44, "act": 11, "nzf": 8, "lab": 38, "grn": 14, "tpm": 6},
              "totalSeats": 121}
    doc = score_all({"nz-2026-11-07": snap_nz}, {"nz-2026-11-07": res_nz}, TODAY)
    r = doc["resolved"][0]
    # right = 63 of 121, need 61 -> right majority. left = 58 -> no. neither -> no.
    check("nz right outcome", r["binaries"][0]["outcome"], 1)
    check("nz left outcome", r["binaries"][1]["outcome"], 0)
    check("nz neither outcome", r["binaries"][2]["outcome"], 0)
    # nat 39 vs 44 is outside 35-43; lab 41 vs 38 is inside 36-45 -> 50%.
    check("nz coverage", r["summary"]["coverage"], 50.0)

    # --- Brazil runoff, orientation of the pair -----------------------------
    snap_br = {"code": "br", "election": "2026-10-04", "built": "2026-10-03",
               "daysBefore": 1,
               "block": {"runoffs": [{"a": "Lula", "b": "F. Bolsonaro", "pA": 84.0}],
                         "firstRound": {"shares": {"Lula": 40.3, "F. Bolsonaro": 34.2}}}}
    res_br = {"runoff": {"a": "Lula", "b": "F. Bolsonaro", "winner": "F. Bolsonaro"},
              "firstRound": {"Lula": 38.0, "F. Bolsonaro": 37.0}}
    doc = score_all({"br-2026-10-04": snap_br}, {"br-2026-10-04": res_br}, TODAY)
    r = doc["resolved"][0]
    # Said Lula 84%, Lula lost: a badly wrong call must score badly.
    close("br runoff brier", r["binaries"][0]["brier"], 0.84 ** 2, 1e-4)
    close("br r1 mae", r["summary"]["mae"], round((2.3 + 2.8) / 2, 2), 0.01)

    # --- pending races, and the one that has voted with no result filed -----
    snaps = {"us-2026-11-03": snap_us, "br-2026-10-04": snap_br,
             "fr-2027-04-11": {"code": "fr", "election": "2027-04-11",
                               "built": "2026-11-01", "block": {}}}
    doc = score_all(snaps, {}, TODAY)
    check("all pending", len(doc["pending"]), 3)
    voted = [p for p in doc["pending"] if p["awaitingResult"]]
    check("two awaiting a result", len(voted), 2)
    check("pending sorted", [p["code"] for p in doc["pending"]], ["br", "us", "fr"])
    check("no totals without results", doc["totals"].get("races"), 0)

    # --- calibration bins ---------------------------------------------------
    doc = score_all({"us-2026-11-03": snap_us, "nz-2026-11-07": snap_nz},
                    {"us-2026-11-03": res_us, "nz-2026-11-07": res_nz}, TODAY)
    bins_ = {("%d-%d" % (b["lo"], b["hi"])): b for b in doc["calibration"]}
    # 75.0 and 82.1 land in different bins; 42.4 and 37.8 in theirs.
    check("bin 70-80 n", bins_["70-80"]["n"], 1)
    check("bin 80-90 n", bins_["80-90"]["n"], 1)
    check("bin 0-10 n", bins_["0-10"]["n"], 1)          # nz_neither 7.9
    check("empty bin is zero", bins_["90-100"]["n"], 0)

    # --- a partial result grades only what it states ------------------------
    doc = score_all({"us-2026-11-03": snap_us},
                    {"us-2026-11-03": {"houseDem": 230}}, TODAY)
    check("partial result grades one call", len(doc["resolved"][0]["binaries"]), 1)
    check("partial result has no market", "skill" in doc["resolved"][0]["summary"], False)

    if fails:
        print("SELF-TEST FAILED")
        for f in fails:
            print("  -", f)
        return 1
    print("score_forecasts self-test OK (22 checks)")
    return 0


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        sys.exit(_self_test())
    sys.exit(main())
