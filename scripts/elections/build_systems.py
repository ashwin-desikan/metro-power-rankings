# -*- coding: utf-8 -*-
"""Build public/data/election-systems.json: the electoral-system layer.

TWO THINGS LIVE HERE.

1. THE GALLAGHER INDEX, computed from data the atlas already holds.
   Every hub JSON records, per election, each party's vote share and seat
   count. That is exactly what the least-squares index of disproportionality
   needs:

       LSq = sqrt( 0.5 * sum over parties of (vote% - seat%)^2 )

   0 means seats matched votes exactly. Around 1 is the Netherlands. Around 3
   is New Zealand under MMP. Above 15 is a first-past-the-post landslide, and
   the United Kingdom in 2024 set a national record above 23. Nobody publishes
   this across thirty-five countries and two centuries, and the numbers were
   sitting in the repo the whole time.

   Method notes that matter for comparability:
   * Unlisted parties are folded into a single "Others" bucket, with the
     residual vote share against the residual seat share. Dropping them instead
     would flatter every country with a long tail.
   * An election is skipped when the listed vote shares total under
     MIN_VOTE_COVERAGE, because the residual bucket would then be doing more
     work than the data.
   * Seat totals must reconcile with totalSeats within SEAT_SLACK seats.
   * Presidential contests are never scored: a single-winner office has no
     seat share to compare.
   Every skip is counted and reported, so a thin country is visible as thin
   rather than silently absent.

2. THE SYSTEM TABLE, which is editorial and hand-maintained. What family each
   chamber belongs to, its district magnitude, its threshold. This cannot be
   derived from results and is not guessed: where a country has changed system,
   the entry says so, because that is usually what the index is showing.

Usage:
    python scripts/elections/build_systems.py [--write] [--self-test]
"""
import json
import math
import os
import sys
from datetime import date

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
DATA = os.path.join(ROOT, "public", "data")
OUT = os.path.join(DATA, "election-systems.json")

# Tuned against the atlas as it actually is, not as it should be. Spain 2023
# lists six parties covering 93% of the vote and 336 of 350 seats; Israel
# 2022 lists eight covering 83.8% and 111 of 120. Both are perfectly
# scoreable. Demanding 90% coverage and a five-seat reconciliation threw
# away every modern Spanish and Israeli election for no gain.
MIN_VOTE_COVERAGE = 80.0   # listed vote shares must total at least this
MAX_RESIDUAL_SEATS = 0.15  # the Others bucket may hold at most this share
SEAT_OVERSHOOT = 2         # listed seats may exceed totalSeats by this much

# --------------------------------------------------------------------------
# The system table. family drives the grouping on the page; `changed` marks a
# country whose index series spans more than one system, which is the single
# most important caveat when comparing two eras of the same country.
FAMILY = {
    "fptp": "First past the post",
    "mmp": "Mixed-member proportional",
    "mmm": "Mixed-member majoritarian",
    "list-pr": "Party-list proportional",
    "stv": "Single transferable vote",
    "irv": "Instant-runoff (preferential)",
    "two-round": "Two-round majority",
    "bonus-pr": "Proportional with a majority bonus",
    "other": "Other or non-competitive",
}

SYSTEMS = {
    "uk": ("fptp", "650 single-member seats, plurality", None, "Unchanged since the last multi-member seats went in 1950."),
    "us": ("fptp", "435 single-member districts, plurality", None, "Districts are drawn by the states, so the index carries redistricting as well as the system."),
    "ca": ("fptp", "343 single-member seats, plurality", None, "Two referendums on changing it have failed at provincial level."),
    "in": ("fptp", "543 single-member seats, plurality", None, "The largest FPTP electorate in the world."),
    "au": ("irv", "151 single-member seats, instant-runoff (preferential)", None, "Preferential voting with compulsory turnout; the Senate uses STV."),
    "nz": ("mmp", "72 electorates topped up to 120 from party lists", "5% or one electorate", "FPTP until 1993. The index falls off a cliff at 1996, which is the reform itself."),
    "de": ("mmp", "630 seats, half constituency half list", "5% or three constituencies", "The 2023 reform removed overhang seats from 2025."),
    "jp": ("mmm", "289 districts plus 176 by list in 11 blocs", None, "SNTV multi-member districts until 1993."),
    "kr": ("mmm", "254 districts plus 46 by list", "3%", "A semi-mixed top-up since 2020."),
    "tw": ("mmm", "73 districts, 34 by list, 6 indigenous", "5%", "SNTV until 2008."),
    "it": ("bonus-pr", "Closed-list PR with a bonus to the largest coalition", "3% party, 10% coalition", "Changed repeatedly: PR to 1993, mixed to 2005, bonus-PR, Rosatellum from 2017, and a new bonus-PR law legislated in 2026."),
    "es": ("list-pr", "350 seats over 52 provinces, D'Hondt", "3% within a province", "Small provinces elect two or three members, so the system is far less proportional than the label suggests."),
    "pl": ("list-pr", "460 seats over 41 constituencies, D'Hondt", "5% party, 8% coalition", "The Senate is 100 single-member seats, decided in 2023 by an opposition pact rather than by vote share."),
    "nl": ("list-pr", "150 seats, one national district", "one seat, about 0.67%", "The purest large-country PR in the atlas, and reliably the lowest index."),
    "be": ("list-pr", "150 seats over 11 constituencies, D'Hondt", "5% per constituency", "Split Dutch and French electorates; compulsory voting."),
    "dk": ("list-pr", "175 seats plus 4, with levelling seats", "2%", "Levelling seats are explicitly there to hold the index down."),
    "ch": ("list-pr", "200 seats over 26 cantons, open lists", None, "Panachage lets voters split a list across parties."),
    "il": ("list-pr", "120 seats, one national district", "3.25%", "Threshold raised from 2% in 2014, which pushed small parties into joint lists."),
    "za": ("list-pr", "400 seats, closed national and regional lists", None, "No threshold at all."),
    "br": ("list-pr", "513 deputies over 27 states, open lists", "party performance clause", "The presidency is a separate two-round contest."),
    "ar": ("list-pr", "257 deputies, half renewed every two years", "3% of the roll", "Presidential elections use a reduced-threshold runoff."),
    "id": ("list-pr", "580 seats over 84 districts, open lists", "4% nationally", None),
    "eu": ("list-pr", "720 seats, each member state its own system", "up to 5%, set nationally", "Twenty-seven national systems reported as one chamber, so read the index as an aggregate."),
    "fr": ("two-round", "577 single-member seats, two rounds", "12.5% of the roll to reach round two", "PR was used once, in 1986."),
    "my": ("fptp", "222 single-member seats, plurality", None, None),
    "sg": ("fptp", "Group representation constituencies, plurality by team", None, "Multi-member blocs are won whole, which pushes the index high."),
    "ng": ("fptp", "360 single-member seats, plurality", None, "The presidency additionally needs 25% in two-thirds of the states."),
    "tr": ("list-pr", "600 seats over 87 districts, D'Hondt", "7% for an alliance", "Threshold cut from 10% in 2022."),
    "ru": ("mmm", "225 districts plus 225 by list", "5%", "Not a competitive system: the index measures the arithmetic, not consent."),
    "ua": ("list-pr", "450 seats, mixed until 2019", "5%", "Elections suspended under martial law."),
    "iq": ("list-pr", "329 seats, multi-member governorates", None, "Switched between systems repeatedly since 2005."),
    "ps": ("list-pr", "132 seats, half list half district in 2006", "2%", "One competitive legislative election on record."),
    "mx": ("mmm", "300 districts plus 200 by list", "3%", None),
    "cn": ("other", "Indirect election to the National People's Congress", None, "No competitive contest; listed for completeness."),
    "va": ("other", "Conclave of cardinal electors, two-thirds majority", None, "Not a polity-wide ballot, so it carries no index."),
    "gr": ("bonus-pr", "300 seats, PR with a bonus to the largest party", "3%", "The bonus has been as large as fifty seats, was abolished for May 2023 and restored for June, which is why two votes six weeks apart produced different parliaments."),
    "at": ("list-pr", "183 seats over 39 regional districts, three allocation tiers", "4% or one regional seat", "Three tiers make the final result close to the national vote."),
    "pt": ("list-pr", "230 seats over 22 districts, D'Hondt, closed lists", None, "No national threshold, but districts range from two seats to forty-eight, so the small interior ones are effectively two-party."),
    "ie": ("stv", "174 seats in 3-, 4- and 5-seat constituencies, single transferable vote", None, "The only national PR-STV system in this atlas. Seats follow the final count, not first preferences."),
    "ph": ("fptp", "Presidency by simple plurality, one six-year term", None, "No runoff, so pluralities under 40% have repeatedly been enough to win."),
    "eg": ("other", "596 seats: individual constituencies plus absolute-majority closed lists", None, "A list plurality takes every seat on the list, which is why the pro-government coalition has swept them since 2015."),
}


# ------------------------------------------------------------------ scoring --

def gallagher(pairs, total_seats):
    """pairs: [(vote_share, seats)]. Returns (index, why) with one of them None."""
    if not total_seats or total_seats <= 0:
        return None, "no seat total"
    if not pairs:
        return None, "no parties recorded"
    # The commonest gap in this atlas by far: seats recorded, vote shares not.
    # New Zealand and Japan post-war are entirely in this state. Naming it
    # separately turns "we cannot score this" into a to-do somebody can act on.
    if all(v is None for v, _ in pairs):
        return None, "no vote shares recorded"
    listed_votes = sum(v for v, _ in pairs if v is not None)
    listed_seats = sum(s for _, s in pairs if s is not None)
    if listed_votes < MIN_VOTE_COVERAGE:
        return None, "vote coverage %.1f%%" % listed_votes
    if listed_votes > 105.0:
        return None, "vote shares total %.1f%%" % listed_votes
    if listed_seats > total_seats + SEAT_OVERSHOOT:
        return None, "seats %d exceed total %d" % (listed_seats, total_seats)

    terms = []
    for v, s in pairs:
        if v is None or s is None:
            continue
        terms.append((v - 100.0 * s / total_seats) ** 2)
    # The residual: everyone not listed, as one bucket.
    rv = max(0.0, 100.0 - listed_votes)
    rs = max(0.0, 100.0 - 100.0 * listed_seats / total_seats)
    if rs > MAX_RESIDUAL_SEATS * 100.0:
        return None, "residual holds %.1f%% of seats" % rs
    if rv > 0 or rs > 0:
        terms.append((rv - rs) ** 2)
    return math.sqrt(0.5 * sum(terms)), None


def score_election(e):
    parties = e.get("parties") or []
    pairs = [(p.get("share"), p.get("seats")) for p in parties]
    return gallagher(pairs, e.get("totalSeats"))


def vote_coverage(e):
    return sum(p.get("share") or 0.0 for p in (e.get("parties") or []))


def turnout_stats(elections):
    """Turnout across a hub's primary series.

    "Primary" means the array the hub leads with: the legislative record for
    most, the presidential one for the United States, Argentina and Taiwan,
    whose hubs are built that way. That is the series each hub actually shows,
    so it is the one to compare, and the page says which it is.
    """
    rows = [(e.get("year"), e.get("turnout"), e.get("unfree")) for e in elections]
    rows = [(y, t, u) for y, t, u in rows if y is not None and t is not None]
    if not rows:
        return None
    rows.sort()
    # Rituals report turnout near 100% by construction. They stay in the high
    # and low figures, which is where they are informative, and out of the
    # median, which is where they would simply lie.
    honest = [t for _, t, u in rows if u != "unfree"]
    modern = [t for y, t, u in rows if y >= 1945 and u != "unfree"]
    hi = max(rows, key=lambda r: r[1])
    lo = min(rows, key=lambda r: r[1])
    return {
        "n": len(rows),
        "latest": {"year": rows[-1][0], "turnout": rows[-1][1]},
        "median": _median(honest),
        "medianPost1945": _median(modern),
        "high": {"year": hi[0], "turnout": hi[1], "unfree": hi[2] or None},
        "low": {"year": lo[0], "turnout": lo[1], "unfree": lo[2] or None},
    }


def legislative_elections(doc):
    """Seat-allocating contests only. Presidential arrays are never scored."""
    return doc.get("elections") if "elections" in doc else doc.get("legislative") or []


# -------------------------------------------------------------------- build --

def build(load_hub, codes, today=None):
    """load_hub(code) -> parsed hub JSON. Pure, so the self-test can drive it."""
    today = today or date.today()
    hubs = []
    for code in codes:
        doc = load_hub(code)
        if doc is None:
            continue
        fam, chamber, threshold, note = SYSTEMS.get(code, ("other", "", None, None))
        primary = legislative_elections(doc)
        seat_based = any(e.get("totalSeats") for e in primary)
        scored, skipped = [], []
        for e in primary:
            idx, why = score_election(e)
            if idx is None:
                if why:
                    skipped.append({"id": e.get("id"), "year": e.get("year"), "why": why})
                continue
            scored.append({
                "id": e.get("id"),
                "year": e.get("year"),
                "label": e.get("label"),
                "lsq": round(idx, 2),
                "coverage": round(vote_coverage(e), 1),
                "turnout": e.get("turnout"),
                "unfree": e.get("unfree") or None,
                "caveat": bool(e.get("caveat")),
            })
        scored.sort(key=lambda r: r["year"])
        # Only outright rituals leave the median. A restricted franchise
        # ("partial") still allocated seats from votes, and excluding those
        # emptied Singapore's median entirely while telling the reader nothing.
        free = [r for r in scored if r["unfree"] != "unfree"]
        hubs.append({
            "code": code,
            "family": fam,
            "familyLabel": FAMILY.get(fam, fam),
            "chamber": chamber,
            "threshold": threshold,
            "note": note,
            "scored": len(scored),
            "skipped": len(skipped),
            "skippedSample": skipped[:3],
            "noVoteShares": sum(1 for r in skipped if r["why"] == "no vote shares recorded"),
            "notSeatBased": sum(1 for r in skipped if r["why"] == "no seat total"),
            "gapReason": _gap_reason(scored, skipped),
            "seriesKind": "legislative" if seat_based else "presidential",
            "turnout": turnout_stats(primary),
            "median": _median([r["lsq"] for r in free]) if free else None,
            "latest": scored[-1] if scored else None,
            "worst": max(scored, key=lambda r: r["lsq"]) if scored else None,
            "best": min(scored, key=lambda r: r["lsq"]) if scored else None,
            "series": scored,
        })
    hubs.sort(key=lambda h: (h["median"] is None, h["median"] if h["median"] is not None else 0))
    return {
        "built": today.isoformat(),
        "method": ("Gallagher least-squares index of disproportionality, computed from the "
                   "vote shares and seat counts already recorded for every legislative "
                   "election in this atlas. Unlisted parties are folded into one residual "
                   "bucket; an election whose listed vote shares total under %.0f%% is not "
                   "scored." % MIN_VOTE_COVERAGE),
        "families": FAMILY,
        "hubs": hubs,
    }


def _gap_reason(scored, skipped):
    """Why a hub has no series, in words, rather than an empty row.

    An empty cell reads as an oversight. Naming the cause turns it into a
    to-do: three of these are fixed by adding vote shares to data the atlas
    already holds.
    """
    if scored or not skipped:
        return None
    why = [r["why"] for r in skipped]
    if all(w == "no seat total" for w in why):
        return ("This hub records single-winner contests, which have no seat "
                "share to compare a vote share against.")
    if all(w == "no vote shares recorded" for w in why):
        return ("Seats are on file but vote shares are not, so the index cannot "
                "be computed. Adding the shares would unlock the whole series.")
    top = max(set(why), key=why.count)
    return "No election met the scoring rules; the commonest reason was: %s." % top


def _median(xs):
    if not xs:
        return None
    s = sorted(xs)
    n = len(s)
    return round(s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2.0, 2)


def _loader(code):
    path = os.path.join(DATA, "%s-elections.json" % code)
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


# ---------------------------------------------------------------- self-test --

def _self_test():
    fails = []

    def check(label, got, want, tol=None):
        ok = abs(got - want) <= tol if (tol is not None and got is not None) else got == want
        if not ok:
            fails.append("%s: got %r, want %r" % (label, got, want))

    # Perfect proportionality: two parties, votes equal seats exactly.
    idx, why = gallagher([(50.0, 50), (50.0, 50)], 100)
    check("perfect PR", round(idx, 6), 0.0)

    # Textbook single case: 45% of the vote takes 60% of the seats, 55% takes
    # 40%. Deviations are 15 and -15, so LSq = sqrt(0.5*(225+225)) = 15.
    idx, why = gallagher([(45.0, 60), (55.0, 40)], 100)
    check("hand-computed 15", round(idx, 6), 15.0)

    # The residual bucket must count. Listed parties take 90% of votes and 100
    # of 100 seats: the missing 10% of voters got nothing, and that has to show.
    idx, why = gallagher([(45.0, 50), (45.0, 50)], 100)
    check("residual counted", round(idx, 4), round(math.sqrt(0.5 * (25 + 25 + 100)), 4))

    # Guards: thin vote coverage, impossible shares, seats that do not reconcile.
    check("thin coverage skipped", gallagher([(40.0, 50), (30.0, 50)], 100)[0], None)
    check("over-100 skipped", gallagher([(60.0, 50), (60.0, 50)], 100)[0], None)
    check("seat mismatch skipped", gallagher([(50.0, 10), (50.0, 10)], 100)[0], None)
    check("no total skipped", gallagher([(50.0, 50), (50.0, 50)], 0)[0], None)

    # A presidential array must never be scored: build() reads `legislative`,
    # never `presidential`.
    doc = {"presidential": [{"id": "x", "year": 2020, "totalSeats": 1,
                             "parties": [{"share": 51.0, "seats": 1}]}],
           "legislative": [{"id": "y", "year": 2020, "totalSeats": 100, "label": "L",
                            "parties": [{"share": 50.0, "seats": 50},
                                        {"share": 50.0, "seats": 50}]}]}
    out = build(lambda c: doc, ["nl"], date(2026, 8, 30))
    check("one legislative row", out["hubs"][0]["scored"], 1)
    check("that row is the legislative one", out["hubs"][0]["series"][0]["id"], "y")

    # Unfree contests are excluded from the median but stay in the series, so a
    # managed system cannot flatter its own headline number.
    doc2 = {"elections": [
        {"id": "a", "year": 2000, "totalSeats": 100, "label": "A", "unfree": "unfree",
         "parties": [{"share": 99.0, "seats": 100}]},
        {"id": "b", "year": 2004, "totalSeats": 100, "label": "B",
         "parties": [{"share": 50.0, "seats": 50}, {"share": 50.0, "seats": 50}]}]}
    out = build(lambda c: doc2, ["za"], date(2026, 8, 30))
    h = out["hubs"][0]
    check("both scored", h["scored"], 2)
    check("median excludes the unfree row", h["median"], 0.0)

    # Turnout: rituals stay in the extremes and out of the median.
    t = turnout_stats([
        {"year": 1950, "turnout": 60.0},
        {"year": 1960, "turnout": 70.0},
        {"year": 1970, "turnout": 99.9, "unfree": "unfree"},
        {"year": 1980, "turnout": 80.0},
    ])
    check("turnout median ignores the ritual", t["medianPost1945"], 70.0)
    check("the ritual is still the high", t["high"]["year"], 1970)
    check("latest is the latest", t["latest"]["year"], 1980)
    check("turnout n counts every row", t["n"], 4)
    check("no turnout at all returns None", turnout_stats([{"year": 1950}]), None)

    if fails:
        print("SELF-TEST FAILED")
        for f in fails:
            print("  -", f)
        return 1
    print("build_systems self-test OK (16 checks)")
    return 0


def main():
    if "--self-test" in sys.argv:
        return _self_test()
    doc = build(_loader, sorted(SYSTEMS))
    tot = sum(h["scored"] for h in doc["hubs"])
    skip = sum(h["skipped"] for h in doc["hubs"])
    print("scored %d legislative elections across %d hubs (%d skipped)"
          % (tot, len(doc["hubs"]), skip))
    for h in doc["hubs"]:
        if not h["scored"]:
            print("  %-3s %-22s NO SERIES (%d skipped) %s"
                  % (h["code"], h["familyLabel"], h["skipped"], h["gapReason"] or ""))
            continue
        if h["median"] is None:
            print("  %-3s %-22s %d scored, all rituals: no median"
                  % (h["code"], h["familyLabel"], h["scored"]))
            continue
        print("  %-3s %-22s median %5.2f   latest %s %5.2f   worst %s %5.2f   n=%d"
              % (h["code"], h["familyLabel"], h["median"],
                 h["latest"]["year"], h["latest"]["lsq"],
                 h["worst"]["year"], h["worst"]["lsq"], h["scored"]))
    if "--write" in sys.argv:
        json.dump(doc, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("wrote public/data/election-systems.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
