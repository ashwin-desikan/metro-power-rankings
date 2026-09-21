#!/usr/bin/env python3
"""Per-list seat simulation for the 2026 Israeli Knesset election.

120 seats, 3.25% threshold, Bader-Ofer (D'Hondt-like largest-remainder-ish
divisor method actually used in Israel) with surplus-vote agreements.
Feeds a later coalition-formation step. Writes nothing but stdout and an
optional --out JSON report; never touches forecast.json.

Stdlib only. No network.
"""

import argparse
import copy
import json
import math
import os
import random
import sys
from datetime import date, datetime

# ---------------------------------------------------------------------------
# Paths, resolved from this file's location so the script runs from anywhere.
# repo root = two levels up from scripts/forecast
# ---------------------------------------------------------------------------
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
POLLS_2026 = os.path.join(ROOT, "data", "forecast", "il_polls.json")
STANCES = os.path.join(ROOT, "data", "forecast", "coalitions", "stances-il-2026.json")
HISTORY = os.path.join(ROOT, "data", "forecast", "coalitions", "polls-il.json")

BLOCS = ("gov", "opposition", "arab", "unaligned")

# Every DEFAULTS value below is a starting value, fitted in a later step.
DEFAULTS = {
    "a": 0.03,            # starting value, fitted in a later step (list error, absolute-seat term)
    "b": 0.35,             # starting value, fitted in a later step (list error, sqrt(S) term)
    "nu": 4,                # starting value, fitted in a later step (fat-tail degrees of freedom)
    "sigma_bloc": 0.04,      # starting value, fitted in a later step (per-bloc shared log shock sd)
    "sigma_arab": 0.10,       # starting value, fitted in a later step (extra arab-list log shock sd)
    "p_squeeze": 0.25,         # starting value, fitted in a later step. Share of elections with a late squeeze:
                               # one clear case in five (April 2019). A squeeze in EVERY draw moved the median of
                               # the two largest lists 2 seats above their polls, which four of five elections contradict.
    "squeeze_mean": 0.15,      # starting value, fitted in a later step (mean of the squeeze size, in a squeeze year)
    "others": 0.010,            # starting value, fitted in a later step (assumed share for parties not on ballot list)
    "prior_below": 0.010,        # starting value, fitted in a later step (assumed share for a 0-seat list with no pct_below).
                                 # 2% each put the wasted vote near 10% with four such lists; the five-election mean is 4.5%.
    "threshold_pct": 3.25,
    "seats": 120,
}

ARAB_NAME_MARKERS = ("Joint List", "Hadash", "Balad", "United Arab List", "Ra'am", "Ta'al")


# ---------------------------------------------------------------------------
# PART 1: allocation (pure, exact)
# ---------------------------------------------------------------------------

def bader_ofer(votes, seats):
    """Bader-Ofer / Hagenbach-Bischoff divisor allocation.

    votes: dict[name -> float], seats: total seats to distribute among them.
    Each unit first gets floor(votes/quota) seats (quota = sum(votes)/seats),
    then remaining seats go one at a time to whoever has the largest
    votes/(seats_so_far+1) -- the classic Jefferson/D'Hondt tie-break rule,
    which is what Bader-Ofer actually is in practice.
    """
    names = list(votes.keys())
    total = sum(votes.values())
    if seats <= 0 or total <= 0:
        return {n: 0 for n in names}
    quota = total / seats
    alloc = {}
    for n in names:
        alloc[n] = int(votes[n] // quota) if quota > 0 else 0
    assigned = sum(alloc.values())
    remaining = seats - assigned
    # Guard: floor division could in principle overshoot with float noise; clamp.
    while remaining > 0:
        best_n, best_key = None, -1.0
        for n in names:
            key = votes[n] / (alloc[n] + 1)
            if key > best_key:
                best_key, best_n = key, n
        alloc[best_n] += 1
        remaining -= 1
    while remaining < 0:
        # Should not happen with correct quota math, but keep allocation exact.
        worst_n, worst_key = None, float("inf")
        for n in names:
            if alloc[n] <= 0:
                continue
            key = votes[n] / alloc[n]
            if key < worst_key:
                worst_key, worst_n = key, n
        alloc[worst_n] -= 1
        remaining += 1
    return alloc


def allocate(votes, total_valid, threshold_pct, agreements, seats=120):
    """Full Knesset allocation with surplus-vote agreements.

    votes: dict[name -> votes]. Returns (seat_dict, failed_names_list).
    A pair agreement applies only if both partners pass the threshold and
    neither is already claimed by an earlier-applied agreement (first
    agreement naming a list wins; later ones mentioning it are ignored).
    """
    passed = [n for n, v in votes.items() if total_valid > 0 and (v / total_valid) * 100 >= threshold_pct]
    passed_set = set(passed)
    failed = [n for n in votes if n not in passed_set]

    applied = []
    claimed = set()
    for pair in (agreements or []):
        a, b = pair[0], pair[1]
        if a in claimed or b in claimed:
            continue
        if a in passed_set and b in passed_set:
            applied.append((a, b))
            claimed.add(a)
            claimed.add(b)

    # Build the units for the first-stage allocation: pairs pooled, singles alone.
    units = {}
    for a, b in applied:
        units[(a, b)] = votes[a] + votes[b]
    for n in passed:
        if n not in claimed:
            units[n] = votes[n]

    unit_seats = bader_ofer(units, seats)

    result = {}
    for key, s in unit_seats.items():
        if isinstance(key, tuple):
            a, b = key
            sub = bader_ofer({a: votes[a], b: votes[b]}, s)
            result[a] = sub[a]
            result[b] = sub[b]
        else:
            result[key] = s
    return result, failed


# ---------------------------------------------------------------------------
# PART 2: polls -> vote shares
# ---------------------------------------------------------------------------

def is_usable_poll(poll, total_seats=120, tol=2):
    if poll.get("kind") == "exit_poll":
        return False, "exit_poll"
    total = sum(poll.get("seats", {}).values())
    if abs(total - total_seats) > tol:
        return False, "seats_out_of_range(%d)" % total
    return True, None


def parse_date(s):
    return datetime.strptime(s, "%Y-%m-%d").date()


def latest_per_pollster(polls):
    """Keep only the latest usable poll per pollster (case-insensitive name)."""
    best = {}
    for p in polls:
        ok, _ = is_usable_poll(p)
        if not ok:
            continue
        key = p.get("pollster", "").strip().lower()
        d = parse_date(p["date"])
        if key not in best or d > best[key][0]:
            best[key] = (d, p)
    return [p for (_, p) in best.values()]


def poll_implied_shares(poll, others=DEFAULTS["others"], prior_below=DEFAULTS["prior_below"]):
    """Per-poll implied vote share for each list that appears in the poll.

    For a list with k>0 seats: share = k/120 * (1 - W), W = others + sum of
    that poll's below-threshold shares (pct_below values, as fractions).
    For a list with k==0: pct_below[list]/100 if present, else prior_below.
    A list absent from the poll is simply not in the returned dict.
    """
    seats = poll.get("seats", {})
    pct_below = poll.get("pct_below", {}) or {}
    n_prior = sum(1 for n, k in seats.items() if not (k and k > 0) and n not in pct_below)
    below_sum = others + sum(v / 100.0 for v in pct_below.values()) + prior_below * n_prior
    w = min(below_sum, 0.999)  # guard against pathological inputs
    thr = DEFAULTS["threshold_pct"] / 100.0
    shares = {}
    for name, k in seats.items():
        if k and k > 0:
            # A pollster prints seats ONLY for a list it measured at or above the
            # threshold, so k seats is a censored reading: the share lies in the
            # band that rounds to k, cut off below at the threshold. Take the
            # band's midpoint. Plain k/120*(1-W) put a 4-seat list at 3.0%, UNDER
            # the threshold it had by definition cleared, and the first run gave
            # RZP-Zehut (4 to 5 seats in every poll) a 46% chance to pass, while
            # 8 of 9 lists polled at 4 to 5 seats from 2019 to 2022 passed.
            lo = max(thr, (k - 0.5) / 120.0 * (1 - w))
            hi = (k + 0.5) / 120.0 * (1 - w)
            if hi <= lo:
                hi = lo + 0.001
            shares[name] = (lo + hi) / 2.0
        else:
            if name in pct_below:
                shares[name] = pct_below[name] / 100.0
            else:
                shares[name] = prior_below
    return shares


def poll_average(polls, today, half_life=21, others=DEFAULTS["others"], prior_below=DEFAULTS["prior_below"]):
    """Weighted mean of per-poll implied shares, latest poll per pollster,
    weight 0.5**(age_days/half_life). Returns (shares_dict_summing_to_1,
    rejected_count, warnings_list). shares_dict includes an "others" entry.
    """
    warnings = []
    usable_input = []
    rejected = 0
    for p in polls:
        ok, reason = is_usable_poll(p)
        if not ok:
            rejected += 1
            continue
        usable_input.append(p)

    kept = latest_per_pollster(usable_input)

    weighted_sum = {}
    weight_total_by_name = {}
    for p in kept:
        d = parse_date(p["date"])
        age_days = (today - d).days
        w = 0.5 ** (age_days / half_life)
        shares = poll_implied_shares(p, others=others, prior_below=prior_below)
        for name, s in shares.items():
            weighted_sum[name] = weighted_sum.get(name, 0.0) + w * s
            weight_total_by_name[name] = weight_total_by_name.get(name, 0.0) + w

    result = {}
    for name in weighted_sum:
        result[name] = weighted_sum[name] / weight_total_by_name[name]
    result["others"] = others

    total = sum(result.values())
    if total > 0:
        for name in result:
            result[name] /= total
    return result, rejected, warnings


# ---------------------------------------------------------------------------
# PART 3: the draw
# ---------------------------------------------------------------------------

def build_blocs(names, roster):
    """Map each list name to a bloc. 'arab' family always wins over
    bloc_by_pollsters. A list missing from the roster -> 'unaligned' + warning.
    """
    by_name = {r["poll_name"]: r for r in roster}
    bloc_of = {}
    warnings = []
    for n in names:
        r = by_name.get(n)
        if r is None:
            bloc_of[n] = "unaligned"
            warnings.append("list '%s' missing from roster; defaulted to bloc 'unaligned'" % n)
            continue
        if r.get("family") == "arab":
            bloc_of[n] = "arab"
        else:
            b = r.get("bloc_by_pollsters", "unaligned")
            bloc_of[n] = b if b in BLOCS else "unaligned"
    return bloc_of, warnings


def squeeze_weight(S):
    """w=1 for S<=8, w=0 for S>=15, linear between."""
    if S <= 8:
        return 1.0
    if S >= 15:
        return 0.0
    return (15 - S) / (15 - 8)


def run_draw(rng, names, shares0, others0, bloc_of, agreements, params, w_mean):
    """One election draw. Returns seat dict (list -> seats, only passed lists)."""
    a, b = params["a"], params["b"]
    nu = params["nu"]
    sigma_bloc = params["sigma_bloc"]
    sigma_arab = params["sigma_arab"]
    squeeze_mean = params["squeeze_mean"]
    seats_total = params["seats"]
    threshold_pct = params["threshold_pct"]

    # shared fat-tail mixing factor for this draw
    chi2_nu = rng.gammavariate(nu / 2.0, 2.0)
    m = math.sqrt(nu / chi2_nu) if chi2_nu > 0 else 1.0

    # per-bloc shocks (one per bloc per draw)
    bloc_shock = {bl: rng.gauss(0, sigma_bloc) for bl in BLOCS}

    log_shares = {}
    for n in names:
        share = shares0.get(n, 0.0)
        S = share * seats_total / (1 - w_mean) if (1 - w_mean) > 0 else share * seats_total
        S_floor = max(S, 1.0)
        sd_seats = math.sqrt((a * S_floor) ** 2 + b * b * S_floor)
        sd_log = sd_seats / max(S_floor, 1.0)
        sd_log *= m
        shock = rng.gauss(0, sd_log) if sd_log > 0 else 0.0
        shock += bloc_shock[bloc_of.get(n, "unaligned")]
        if bloc_of.get(n) == "arab":
            shock += rng.gauss(0, sigma_arab)
        log_shares[n] = math.log(max(share, 1e-9)) + shock

    raw = {n: math.exp(log_shares[n]) for n in names}
    raw["others"] = others0

    # squeeze: late consolidation within gov/opposition blocs only
    # always draw both, so the random stream is the same length in every draw
    u_sq, k_sq = rng.random(), rng.expovariate(1.0 / squeeze_mean)
    K = min(k_sq, 0.5) if u_sq < params.get("p_squeeze", 1.0) else 0.0
    for bl in ("gov", "opposition"):
        members = [n for n in names if bloc_of.get(n) == bl]
        if len(members) < 2:
            continue
        largest = max(members, key=lambda n: raw[n])
        gained = 0.0
        for n in members:
            if n == largest:
                continue
            S_n = raw[n] * seats_total  # approx seats for weight function, pre-normalise
            w = squeeze_weight(S_n)
            take = raw[n] * K * w
            raw[n] -= take
            gained += take
        raw[largest] += gained

    total = sum(raw.values())
    shares = {n: raw[n] / total for n in raw}

    votes = {n: shares[n] for n in names}  # proportional to votes; total_valid is implicit 1.0
    seat_dict, _failed = allocate(votes, 1.0, threshold_pct, agreements, seats=seats_total)
    return seat_dict


def summarize(draws, names, bloc_of, gov_threshold=61):
    def pctile(vals, q):
        s = sorted(vals)
        if not s:
            return 0.0
        idx = q * (len(s) - 1)
        lo = int(math.floor(idx))
        hi = int(math.ceil(idx))
        if lo == hi:
            return s[lo]
        frac = idx - lo
        return s[lo] * (1 - frac) + s[hi] * frac

    n_draws = len(draws)
    per_list = {}
    for n in names:
        vals = [d.get(n, 0) for d in draws]
        passed_count = sum(1 for d in draws if d.get(n, 0) > 0)
        per_list[n] = {
            "median": pctile(vals, 0.5),
            "mean": sum(vals) / n_draws if n_draws else 0.0,
            "p10": pctile(vals, 0.10),
            "p90": pctile(vals, 0.90),
            "pPass": passed_count / n_draws if n_draws else 0.0,
        }

    bloc_totals = {bl: [] for bl in BLOCS}
    for d in draws:
        tot = {bl: 0 for bl in BLOCS}
        for n, s in d.items():
            tot[bloc_of.get(n, "unaligned")] += s
        for bl in BLOCS:
            bloc_totals[bl].append(tot[bl])

    per_bloc = {}
    for bl in BLOCS:
        vals = bloc_totals[bl]
        per_bloc[bl] = {
            "median": pctile(vals, 0.5),
            "mean": sum(vals) / n_draws if n_draws else 0.0,
            "p10": pctile(vals, 0.10),
            "p90": pctile(vals, 0.90),
        }

    pGov61 = sum(1 for v in bloc_totals["gov"] if v >= gov_threshold) / n_draws if n_draws else 0.0
    return per_list, per_bloc, pGov61


def simulate(names, shares0, bloc_of, agreements, params, n_sims, seed, keep_draws=False):
    rng = random.Random(seed)
    others0 = shares0.get("others", params["others"])
    w_mean = others0  # mean below-threshold+others mass used to convert share->implied seats
    draws = []
    for _ in range(n_sims):
        d = run_draw(rng, names, shares0, others0, bloc_of, agreements, params, w_mean)
        draws.append(d)
    per_list, per_bloc, pGov61 = summarize(draws, names, bloc_of)
    out = {"per_list": per_list, "per_bloc": per_bloc, "pGov61": pGov61}
    if keep_draws:
        out["draws"] = draws
    return out


# ---------------------------------------------------------------------------
# Data loading helpers
# ---------------------------------------------------------------------------

def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_2026_inputs():
    polls_doc = load_json(POLLS_2026)
    stances_doc = load_json(STANCES)
    return polls_doc, stances_doc


def stance_surplus_agreements(stances_doc):
    agreements = []
    for row in stances_doc.get("stances", []):
        if row.get("stance") == "pact" and row.get("pact_kind") == "surplus_vote":
            agreements.append([row["from"], row["toward"]])
    return agreements


def polls_2026_to_history_format(polls_doc):
    """Adapt il_polls.json's {parties, polls:[{date,pollster,seats,gov,pct_below?}]}
    into the same per-poll shape used by poll_average (seats + optional pct_below)."""
    return polls_doc.get("polls", [])


# ---------------------------------------------------------------------------
# Default run: 2026
# ---------------------------------------------------------------------------

def run_2026(today, n_sims, seed, out_path=None):
    polls_doc, stances_doc = load_2026_inputs()
    parties = polls_doc["parties"]
    raw_polls = polls_2026_to_history_format(polls_doc)
    agreements = stance_surplus_agreements(stances_doc)
    roster = stances_doc.get("roster", [])

    shares, rejected, _w = poll_average(raw_polls, today, others=DEFAULTS["others"], prior_below=DEFAULTS["prior_below"])
    names = [n for n in shares if n != "others"]
    bloc_of, roster_warnings = build_blocs(names, roster)

    result = simulate(names, shares, bloc_of, agreements, DEFAULTS, n_sims, seed)

    order = sorted(names, key=lambda n: -result["per_list"][n]["median"])
    print("2026 Israeli Knesset seat simulation -- %d draws, seed=%d, today=%s" % (n_sims, seed, today))
    print("(%d poll rows rejected as unusable)" % rejected)
    print()
    print("%-20s %6s %6s %6s %6s %7s %6s" % ("List", "med", "mean", "p10", "p90", "pPass", "bloc"))
    for n in order:
        r = result["per_list"][n]
        print("%-20s %6.1f %6.1f %6.1f %6.1f %6.1f%% %6s" % (
            n, r["median"], r["mean"], r["p10"], r["p90"], r["pPass"] * 100, bloc_of.get(n, "?")))
    print()
    print("Bloc totals:")
    for bl in BLOCS:
        r = result["per_bloc"][bl]
        print("  %-12s median=%5.1f mean=%5.1f p10=%5.1f p90=%5.1f" % (bl, r["median"], r["mean"], r["p10"], r["p90"]))
    print()
    print("pGov61 (P[gov bloc >= 61 seats]) = %.1f%%" % (result["pGov61"] * 100))
    if roster_warnings:
        print()
        print("Warnings:")
        for w in roster_warnings:
            print("  " + w)

    if out_path:
        report = {
            "today": str(today),
            "n_sims": n_sims,
            "seed": seed,
            "rejected_polls": rejected,
            "shares": shares,
            "bloc_of": bloc_of,
            "per_list": result["per_list"],
            "per_bloc": result["per_bloc"],
            "pGov61": result["pGov61"],
            "warnings": roster_warnings,
        }
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=1, ensure_ascii=False)
        print()
        print("Wrote report to %s" % out_path)


# ---------------------------------------------------------------------------
# PART 4: backtest harness (report-only, never touches DEFAULTS)
# ---------------------------------------------------------------------------

def backtest_blocs(names):
    """Heuristic bloc assignment used ONLY by the backtest, per spec:
    everything 'unaligned' except Arab-marker lists -> 'arab'."""
    bloc_of = {}
    for n in names:
        if any(marker in n for marker in ARAB_NAME_MARKERS):
            bloc_of[n] = "arab"
        else:
            bloc_of[n] = "unaligned"
    return bloc_of


def run_backtest(n_sims=4000, seed=20260722):
    history = load_json(HISTORY)
    print("NOTE: poll rows in polls-il.json are provisional (page-summariser transcription, not hand-verified).")
    print()

    pooled_in = 0
    pooled_total = 0
    calib = [{"sum_p": 0.0, "sum_actual": 0, "n": 0} for _ in range(3)]  # bins: <0.33, 0.33-0.67, >0.67

    for el in history["elections"]:
        polls = el.get("final_polls") or []
        pre = [p for p in polls if p.get("kind", "pre_election") == "pre_election"]
        usable = [p for p in pre if is_usable_poll(p)[0]]
        if not usable:
            continue

        today = parse_date(el["election"])
        params = dict(DEFAULTS)
        params["threshold_pct"] = el["threshold_pct"]
        agreements = el.get("surplus_agreements") or []

        shares, rejected, _w = poll_average(pre, today, others=DEFAULTS["others"], prior_below=DEFAULTS["prior_below"])
        names = [n for n in shares if n != "others"]
        bloc_of = backtest_blocs(names)

        result = simulate(names, shares, bloc_of, agreements, params, n_sims, seed)

        real = {r["list"]: r["seats"] for r in el["results"]}

        print("=== %s (threshold %.2f%%, %d usable pre-election polls, %d rejected) ===" % (
            el["election"], el["threshold_pct"], len(usable), rejected))
        print("bloc heuristic: 'unaligned' for all lists except Arab-marker lists -> 'arab'")
        in_count = 0
        n_lists = 0
        for n in sorted(real.keys(), key=lambda k: -real[k]):
            r_seats = real[n]
            info = result["per_list"].get(n)
            if info is None:
                # list not in poll-derived name set (e.g. missing from all usable polls)
                continue
            n_lists += 1
            lo, hi = info["p10"], info["p90"]
            inside = lo <= r_seats <= hi
            if inside:
                in_count += 1
            pooled_total += 1
            pooled_in += 1 if inside else 0
            print("  %-28s real=%3d  p10-p90=[%5.1f, %5.1f]  %s" % (
                n, r_seats, lo, hi, "IN" if inside else "OUT"))
            if 0.05 < info["pPass"] < 0.95:
                actually_passed = 1 if r_seats > 0 else 0
                print("      pPass=%.2f  actually_passed=%s" % (info["pPass"], bool(actually_passed)))
                bidx = 0 if info["pPass"] < 0.33 else (1 if info["pPass"] <= 0.67 else 2)
                calib[bidx]["sum_p"] += info["pPass"]
                calib[bidx]["sum_actual"] += actually_passed
                calib[bidx]["n"] += 1
        coverage = in_count / n_lists if n_lists else 0.0
        print("  coverage (this election): %.1f%% (%d/%d)" % (coverage * 100, in_count, n_lists))
        print()

    pooled_cov = pooled_in / pooled_total if pooled_total else 0.0
    print("Pooled 80%% interval coverage: %.1f%% (%d/%d)" % (pooled_cov * 100, pooled_in, pooled_total))
    print()
    print("Calibration table for pPass (bins by predicted pPass):")
    print("%-14s %10s %10s %6s" % ("bin", "mean_pPass", "actual_%", "n"))
    labels = ["<0.33", "0.33-0.67", ">0.67"]
    for i, lab in enumerate(labels):
        c = calib[i]
        mean_p = c["sum_p"] / c["n"] if c["n"] else float("nan")
        actual = c["sum_actual"] / c["n"] if c["n"] else float("nan")
        print("%-14s %10.3f %10.1f%% %6d" % (lab, mean_p, actual * 100 if c["n"] else 0.0, c["n"]))


# ---------------------------------------------------------------------------
# PART: self-test
# ---------------------------------------------------------------------------

def _check(cond, label, results):
    status = "PASS" if cond else "FAIL"
    print("[%s] %s" % (status, label))
    results.append(cond)


def self_test():
    results = []

    # 1. seven-election exact reproduction
    history = load_json(HISTORY)
    for el in history["elections"]:
        votes = {r["list"]: r["votes"] for r in el["results"]}
        got, _failed = allocate(votes, el["valid_votes"], el["threshold_pct"], el.get("surplus_agreements") or [], seats=120)
        want = {r["list"]: r["seats"] for r in el["results"] if r["passed"]}
        ok = got == want
        if not ok:
            diff = {}
            for k in set(list(got.keys()) + list(want.keys())):
                if got.get(k, 0) != want.get(k, 0):
                    diff[k] = (got.get(k, 0), want.get(k, 0))
            print("    diff (got, want): %s" % diff)
        _check(ok, "exact reproduction: %s" % el["election"], results)

    # 2. 2015 without Kulanu+YB agreement -> Likud 31
    el2015 = next(e for e in history["elections"] if e["election"] == "2015-03-17")
    votes15 = {r["list"]: r["votes"] for r in el2015["results"]}
    agree_wo = [p for p in el2015["surplus_agreements"] if set(p) != {"Kulanu", "Yisrael Beiteinu"}]
    got15, _ = allocate(votes15, el2015["valid_votes"], el2015["threshold_pct"], agree_wo, seats=120)
    _check(got15.get("Likud") == 31, "2015 without Kulanu+YB agreement gives Likud 31", results)

    # 3a. agreement where one partner fails threshold is ignored
    votes_a = {"A": 40, "B": 30, "C": 3, "D": 27}  # C below 3.25% of 100
    got_a, failed_a = allocate(votes_a, 100, 3.25, [["A", "C"]], seats=10)
    ok3a = "C" not in got_a and got_a.get("A", 0) > 0
    _check(ok3a, "agreement ignored when one partner fails threshold", results)

    # 3b. list named in two agreements uses only the first
    votes_b = {"A": 30, "B": 30, "C": 40}
    got_b, _ = allocate(votes_b, 100, 3.25, [["A", "B"], ["A", "C"]], seats=10)
    got_b_solo, _ = allocate(votes_b, 100, 3.25, [["A", "C"]], seats=10)
    # if first agreement (A,B) applied, C stands alone -> differs from (A,C) pooling in general
    ok3b = got_b != got_b_solo or True  # structural check below is the real test
    # stronger check: simulate manually that pooling A+B happened by checking pooled bader_ofer matches
    pooled_ab = bader_ofer({("A", "B"): votes_b["A"] + votes_b["B"], "C": votes_b["C"]}, 10)
    ab_sub = bader_ofer({"A": votes_b["A"], "B": votes_b["B"]}, pooled_ab[("A", "B")])
    expect_b = {"A": ab_sub["A"], "B": ab_sub["B"], "C": pooled_ab["C"]}
    _check(got_b == expect_b, "list in two agreements uses only the first", results)

    # 4. threshold edge cases
    total_valid = 1000000
    exact_votes = int(round(total_valid * 0.0325))
    below_votes = int(math.floor(total_valid * 0.032499))
    votes4 = {"X": exact_votes, "Y": total_valid - exact_votes}
    got4, failed4 = allocate(votes4, total_valid, 3.25, [], seats=120)
    _check("X" in got4 and "X" not in failed4, "threshold edge: exactly 3.25% passes", results)
    votes4b = {"X": below_votes, "Y": total_valid - below_votes}
    got4b, failed4b = allocate(votes4b, total_valid, 3.25, [], seats=120)
    _check("X" in failed4b and got4b.get("X", 0) == 0, "threshold edge: 3.2499% fails", results)

    # 5. bader_ofer hand-computed three-list example
    # votes A=520, B=310, C=170, total=1000, seats=10 -> quota=100
    # floor: A=5, B=3, C=1 -> 9 assigned, 1 remaining seat
    # next-seat keys: A:520/6=86.67, B:310/4=77.5, C:170/2=85 -> A wins -> A=6,B=3,C=1
    bo = bader_ofer({"A": 520, "B": 310, "C": 170}, 10)
    _check(bo == {"A": 6, "B": 3, "C": 1}, "bader_ofer hand-computed three-list example", results)

    # 6. implied shares
    today6 = date(2019, 4, 9)
    pre6 = [p for p in next(e for e in history["elections"] if e["election"] == "2019-04-09")["final_polls"]
            if p.get("kind", "pre_election") == "pre_election"]
    shares6, rej6, _ = poll_average(pre6, today6)
    total6 = sum(shares6.values())
    _check(abs(total6 - 1.0) < 1e-9, "implied shares sum to 1", results)
    # a poll with pct_below uses it; check via poll_implied_shares directly
    sample_poll = pre6[0]
    imp = poll_implied_shares(sample_poll)
    below_name = list((sample_poll.get("pct_below") or {}).keys())
    ok6b = True
    if below_name:
        nm = below_name[0]
        ok6b = abs(imp[nm] - sample_poll["pct_below"][nm] / 100.0) < 1e-12
    _check(ok6b, "poll with pct_below uses it directly", results)
    # a poll without pct_below for a 0-seat list uses prior_below
    no_below_poll = next((p for p in pre6 if any(
        v == 0 and k not in (p.get("pct_below") or {}) for k, v in p["seats"].items())), None)
    ok6c = True
    if no_below_poll:
        imp2 = poll_implied_shares(no_below_poll)
        zero_names = [k for k, v in no_below_poll["seats"].items() if v == 0 and k not in (no_below_poll.get("pct_below") or {})]
        ok6c = all(abs(imp2[k] - DEFAULTS["prior_below"]) < 1e-12 for k in zero_names)
    _check(ok6c, "poll without pct_below on 0-seat list uses prior_below", results)
    # a list absent from one poll is averaged over the others only
    only_in_some = "Zehut"  # appears only in some 2019-04 polls
    present_polls = [p for p in pre6 if only_in_some in p["seats"]]
    ok6d = 0 < len(present_polls) < len(pre6) and only_in_some in shares6
    _check(ok6d, "list absent from a poll is skipped there, averaged over the rest", results)

    # 7. usable-poll filter
    p117 = {"date": "2020-01-01", "pollster": "X", "seats": {"A": 60, "B": 57}, "kind": "pre_election"}
    p118 = {"date": "2020-01-01", "pollster": "X", "seats": {"A": 60, "B": 58}, "kind": "pre_election"}
    exitp = {"date": "2020-01-01", "pollster": "X", "seats": {"A": 60, "B": 60}, "kind": "exit_poll"}
    ok7a = is_usable_poll(p117)[0] is False
    ok7b = is_usable_poll(p118)[0] is True
    ok7c = is_usable_poll(exitp)[0] is False
    _check(ok7a and ok7b and ok7c, "usable-poll filter: 117 rejected, 118 kept, exit_poll rejected", results)

    # 8. squeeze conservation and bloc protection
    rng8 = random.Random(1)
    names8 = ["G1", "G2", "O1", "O2", "AR", "UN"]
    bloc8 = {"G1": "gov", "G2": "gov", "O1": "opposition", "O2": "opposition", "AR": "arab", "UN": "unaligned"}
    shares8 = {"G1": 0.20, "G2": 0.10, "O1": 0.15, "O2": 0.08, "AR": 0.05, "UN": 0.02, "others": 0.010}
    # run the squeeze block in isolation by monkeypatching K via a tiny local copy
    def squeeze_once(raw, bloc_of, K, seats_total=120):
        raw = dict(raw)
        for bl in ("gov", "opposition"):
            members = [n for n in raw if bloc_of.get(n) == bl]
            if len(members) < 2:
                continue
            largest = max(members, key=lambda n: raw[n])
            gained = 0.0
            for n in members:
                if n == largest:
                    continue
                S_n = raw[n] * seats_total
                w = squeeze_weight(S_n)
                take = raw[n] * K * w
                raw[n] -= take
                gained += take
            raw[largest] += gained
        return raw
    raw8 = dict(shares8)
    before_arab, before_un = raw8["AR"], raw8["UN"]
    after8 = squeeze_once(raw8, bloc8, 0.3)
    total_before = sum(raw8.values())
    total_after = sum(after8.values())
    ok8a = abs(total_before - total_after) < 1e-12
    ok8b = abs(after8["AR"] - before_arab) < 1e-12 and abs(after8["UN"] - before_un) < 1e-12
    after8_k0 = squeeze_once(raw8, bloc8, 0.0)
    ok8c = all(abs(after8_k0[n] - raw8[n]) < 1e-12 for n in raw8)
    _check(ok8a and ok8b and ok8c, "squeeze conserves total share and protects arab/unaligned; K=0 is a no-op", results)

    # 9. determinism
    polls_doc, stances_doc = load_2026_inputs()
    raw_polls = polls_2026_to_history_format(polls_doc)
    agreements9 = stance_surplus_agreements(stances_doc)
    roster9 = stances_doc.get("roster", [])
    shares9, _r, _w = poll_average(raw_polls, date(2026, 9, 21))
    names9 = [n for n in shares9 if n != "others"]
    bloc9, _w2 = build_blocs(names9, roster9)
    res_a = simulate(names9, shares9, bloc9, agreements9, DEFAULTS, 300, 42)
    res_b = simulate(names9, shares9, bloc9, agreements9, DEFAULTS, 300, 42)
    res_c = simulate(names9, shares9, bloc9, agreements9, DEFAULTS, 300, 43)
    ok9a = res_a["per_list"] == res_b["per_list"] and res_a["pGov61"] == res_b["pGov61"]
    ok9b = res_a["per_list"] != res_c["per_list"] or res_a["pGov61"] != res_c["pGov61"]
    _check(ok9a, "same seed gives identical output twice", results)
    _check(ok9b, "different seed gives different output", results)

    # 10. every draw sums to 120; pPass ~ 1 at 25%, ~0 at 0.3%
    names10 = ["Big", "Tiny", "Filler"]
    shares10 = {"Big": 0.25, "Tiny": 0.003, "Filler": 0.737, "others": 0.010}
    total10 = sum(shares10.values())
    shares10 = {k: v / total10 for k, v in shares10.items()}
    bloc10 = {"Big": "unaligned", "Tiny": "unaligned", "Filler": "unaligned"}
    res10 = simulate(names10, shares10, bloc10, [], DEFAULTS, 800, 7, keep_draws=True)
    sums_ok = all(sum(d.values()) == 120 for d in res10["draws"])
    _check(sums_ok, "every draw allocates exactly 120 seats", results)
    _check(res10["per_list"]["Big"]["pPass"] > 0.99, "pPass ~1.0 for a list at 25% share", results)
    _check(res10["per_list"]["Tiny"]["pPass"] < 0.10, "pPass ~0 for a list at 0.3% share", results)

    # 11. roster-missing list -> unaligned + warning
    names11 = ["Likud", "Ghost Party"]
    bloc11, warns11 = build_blocs(names11, roster9)
    ok11a = bloc11.get("Ghost Party") == "unaligned"
    ok11b = any("Ghost Party" in w for w in warns11)
    _check(ok11a and ok11b, "list absent from roster lands in 'unaligned' with a warning", results)

    n_fail = sum(1 for r in results if not r)
    print()
    print("%d/%d self-tests passed" % (len(results) - n_fail, len(results)))
    return n_fail == 0


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    ap = argparse.ArgumentParser(description="Per-list seat simulation for the 2026 Israeli Knesset election.")
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--backtest", action="store_true")
    ap.add_argument("--sims", type=int, default=8000)
    ap.add_argument("--seed", type=int, default=20260722)
    ap.add_argument("--today", type=str, default=None, help="YYYY-MM-DD, defaults to today's date")
    ap.add_argument("--out", type=str, default=None)
    args = ap.parse_args()

    if args.self_test:
        ok = self_test()
        sys.exit(0 if ok else 1)

    if args.backtest:
        run_backtest(n_sims=args.sims, seed=args.seed)
        return

    today = parse_date(args.today) if args.today else date.today()
    run_2026(today, args.sims, args.seed, out_path=args.out)


if __name__ == "__main__":
    main()
