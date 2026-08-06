"""The Ground Floor: conditions rank, and the gap against the power ranking.

See GROUND-FLOOR-SPEC.md. This is the engine; dimensions are data.

WHAT IT DOES
------------
For each conditions dimension, rank every metro independently (ties share the
average rank). Take the MEDIAN of a metro's dimension ranks as its Ground Floor
rank. Then set that against the metro's accumulation rank from the power
ranking, and publish the distance between them.

WHY MEDIAN OF RANKS, NOT A WEIGHTED SCORE
-----------------------------------------
A weighted composite asserts its conclusion in its weights, and invites the
reader to argue with the weighting instead of the finding. We are not in a
position to claim that clean air matters more than green space. Median of ranks
needs no weights, no normalisation, and no decision about the relative worth of
incommensurable units (ug/m3 against percent cover). It is also robust: one bad
dimension moves the median very little.

WHY THE TWO SCORES NEVER MERGE
------------------------------
Merging them would hide the only thing worth knowing. The power ranking answers
"where has capital and institution gathered". The Ground Floor answers "what is
it like to live there". The distance between those two answers is the product.

HONEST LIMITS OF THE GAP (read before quoting it)
-------------------------------------------------
1. It is BOUNDED BY POSITION. A metro ranked 1st on accumulation cannot have a
   negative gap, and one ranked last cannot have a positive one. The gap is not
   a statistic with a symmetric distribution; it is a legible way of saying
   "these two ranks are far apart". Do not compute a mean gap and treat it as
   an effect size.
2. It CORRELATES WITH SIZE by construction. Accumulation counts scale with
   population; several conditions do too (big metros have worse air). The
   correlation is reported at build time so it is never a surprise.
3. With few dimensions the Ground Floor rank is close to a single dimension's
   rank. Treat it as a rank only when MIN_DIMENSIONS is comfortably above one.

USAGE
    python scripts/groundfloor/build_ground_floor.py --self-test
    python scripts/groundfloor/build_ground_floor.py            # dry run
    python scripts/groundfloor/build_ground_floor.py --write
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "public" / "data"
GF = DATA / "ground-floor"
METROS = DATA / "metros.json"
OUT = GF / "index.json"

# The dimension registry. Explicit rather than inferred from the directory so
# that adding a dimension is a reviewed decision, not a side effect of a file
# appearing. `lower_is_better` says which end of the scale is a better place
# to live -- it is the ONLY editorial judgement in this file, and each one
# should be uncontroversial on its face.
DIMENSIONS = [
    {
        "key": "airQuality",
        "file": "air-quality.json",
        "label": "Air quality",
        "unit": "ug/m3 PM2.5, annual mean",
        "lower_is_better": True,
    },
    {
        # Earns its place: Spearman 0.53 against PM2.5, so it is a genuinely
        # different view rather than the same ranking twice. NO2 is
        # overwhelmingly combustion-derived (traffic, industry, power), with
        # no natural dust or sea-salt component at all.
        "key": "no2",
        "file": "no2.json",
        "label": "Nitrogen dioxide",
        "unit": "ug/m3 NO2, annual mean",
        "lower_is_better": True,
    },
    {
        # A different KIND of condition to the two air measures: what share of
        # people lack improved water or sanitation. Provision, not geography.
        # ONE dimension, not two: udw and usa are combined in the builder so
        # water cannot take half the median's weight by accident. Coarser than
        # the rasters (province-level, ~48% distinct values) so it produces more
        # ties, which average ranks handle correctly.
        "key": "waterSanitation",
        "file": "water-sanitation.json",
        "label": "Water and sanitation",
        "unit": "share of population with unimproved service",
        "lower_is_better": True,
    },
]

COVERAGE_FLOOR = 0.95


# --------------------------------------------------------------------------
# pure logic (covered by --self-test)
# --------------------------------------------------------------------------
def rank_values(values, lower_is_better=True):
    """slug -> rank, 1-based, TIES SHARE THE AVERAGE RANK.

    Average ranks matter here: with competition ranking (1,2,2,4) a cluster of
    tied metros would all be pulled toward the better end, quietly flattering
    them. Average ranking (1,2.5,2.5,4) is unbiased and is what a median of
    ranks assumes.
    """
    if not values:
        return {}
    items = sorted(values.items(), key=lambda kv: kv[1], reverse=not lower_is_better)
    ranks = {}
    i = 0
    while i < len(items):
        j = i
        while j + 1 < len(items) and items[j + 1][1] == items[i][1]:
            j += 1
        avg = (i + 1 + j + 1) / 2.0
        for k in range(i, j + 1):
            ranks[items[k][0]] = avg
        i = j + 1
    return ranks


def median(nums):
    """Median of a non-empty sequence. Even counts average the middle pair."""
    s = sorted(nums)
    n = len(s)
    if n == 0:
        return None
    mid = n // 2
    if n % 2:
        return float(s[mid])
    return (s[mid - 1] + s[mid]) / 2.0


def dense_rank(scores, lower_is_better=True):
    """Turn a slug -> score map into 1..N positions with average ties.
    Used to convert median-of-ranks back into a presentable rank."""
    return rank_values(scores, lower_is_better=lower_is_better)


def gap(conditions_rank, accumulation_rank):
    """Positive = accumulates more than it delivers. Negative = delivers more
    than it accumulates. See the bounded-by-position warning in the header."""
    if conditions_rank is None or accumulation_rank is None:
        return None
    return round(conditions_rank - accumulation_rank, 1)


def percentile(rank, n):
    """0 = best, 100 = worst. Comparable across sets of different size."""
    if rank is None or not n or n < 2:
        return None
    return round(100.0 * (rank - 1) / (n - 1), 2)


def pearson(xs, ys):
    """Correlation, for the size-confound report. No numpy dependency."""
    n = len(xs)
    if n < 2 or len(ys) != n:
        return None
    mx, my = sum(xs) / n, sum(ys) / n
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    dx = sum((x - mx) ** 2 for x in xs) ** 0.5
    dy = sum((y - my) ** 2 for y in ys) ** 0.5
    if dx == 0 or dy == 0:
        return None
    return round(num / (dx * dy), 4)


def payload_changed(old, new):
    if not isinstance(old, dict):
        return True
    return old.get("metros") != new.get("metros")


# --------------------------------------------------------------------------
def self_test():
    fails, checks = [], 0

    def check(name, got, want):
        nonlocal checks
        checks += 1
        if got != want:
            fails.append(f"{name}: got {got!r} want {want!r}")

    # ranking, lower is better
    check("rank simple", rank_values({"a": 1, "b": 2, "c": 3}),
          {"a": 1.0, "b": 2.0, "c": 3.0})
    check("rank reversed", rank_values({"a": 1, "b": 2, "c": 3}, lower_is_better=False),
          {"c": 1.0, "b": 2.0, "a": 3.0})
    # TIES: the case that would otherwise flatter tied metros
    check("rank ties average", rank_values({"a": 1, "b": 2, "c": 2, "d": 4}),
          {"a": 1.0, "b": 2.5, "c": 2.5, "d": 4.0})
    check("rank all tied", rank_values({"a": 5, "b": 5, "c": 5}),
          {"a": 2.0, "b": 2.0, "c": 2.0})
    check("rank two tied at top", rank_values({"a": 1, "b": 1, "c": 9}),
          {"a": 1.5, "b": 1.5, "c": 3.0})
    check("rank single", rank_values({"a": 7}), {"a": 1.0})
    check("rank empty", rank_values({}), {})

    check("median odd", median([3, 1, 2]), 2.0)
    check("median even", median([1, 2, 3, 4]), 2.5)
    check("median single", median([9]), 9.0)
    check("median empty", median([]), None)
    check("median floats", median([1.5, 2.5]), 2.0)

    check("gap positive", gap(1000, 5), 995.0)
    check("gap negative", gap(5, 1000), -995.0)
    check("gap zero", gap(42, 42), 0.0)
    check("gap none cond", gap(None, 5), None)
    check("gap none acc", gap(5, None), None)

    check("pct best", percentile(1, 101), 0.0)
    check("pct worst", percentile(101, 101), 100.0)
    check("pct mid", percentile(51, 101), 50.0)
    check("pct degenerate", percentile(1, 1), None)
    check("pct none", percentile(None, 10), None)

    check("pearson perfect", pearson([1, 2, 3], [1, 2, 3]), 1.0)
    check("pearson inverse", pearson([1, 2, 3], [3, 2, 1]), -1.0)
    check("pearson flat", pearson([1, 1, 1], [1, 2, 3]), None)
    check("pearson short", pearson([1], [1]), None)

    check("changed vs none", payload_changed(None, {"metros": {}}), True)
    check("changed same", payload_changed({"metros": {"a": 1}}, {"metros": {"a": 1}}), False)
    check("changed ignores meta",
          payload_changed({"metros": {"a": 1}, "_meta": {"generatedAt": "x"}},
                          {"metros": {"a": 1}, "_meta": {"generatedAt": "y"}}), False)

    # End-to-end on a tiny fixture: two dimensions, one tied pair.
    #   d1 values 10,20,20,40 -> ranks a=1, b=2.5, c=2.5, d=4   (tie averaged)
    #   d2 values  5, 1, 9, 2 -> ranks b=1, d=2, a=3, c=4
    d1 = rank_values({"a": 10, "b": 20, "c": 20, "d": 40})
    d2 = rank_values({"a": 5, "b": 1, "c": 9, "d": 2})
    check("e2e d1 ties", d1, {"a": 1.0, "b": 2.5, "c": 2.5, "d": 4.0})
    check("e2e d2", d2, {"b": 1.0, "d": 2.0, "a": 3.0, "c": 4.0})
    med = {s: median([d1[s], d2[s]]) for s in d1}
    check("e2e a", med["a"], 2.0)      # ranks 1 and 3
    check("e2e b", med["b"], 1.75)     # ranks 2.5 and 1
    check("e2e c", med["c"], 3.25)     # ranks 2.5 and 4
    check("e2e d", med["d"], 3.0)      # ranks 4 and 2
    # and the median-of-ranks ordering is not simply either dimension's order
    final = rank_values(med, lower_is_better=True)
    check("e2e final order", final, {"b": 1.0, "a": 2.0, "d": 3.0, "c": 4.0})

    if fails:
        print("SELF-TEST FAILED")
        for f in fails:
            print("  " + f)
        return 1
    print(f"self-test OK ({checks} checks)")
    return 0


# --------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--min-dimensions", type=int, default=0,
                    help="metros with fewer dimensions are excluded "
                         "(default: all available dimensions required)")
    args = ap.parse_args()

    if args.self_test:
        return self_test()

    metros = json.loads(METROS.read_text(encoding="utf-8"))
    acc_rank = {m["slug"]: m.get("rank") for m in metros}
    pop = {m["slug"]: (m.get("pop") or 0) for m in metros}
    names = {m["slug"]: m.get("name") for m in metros}
    countries = {m["slug"]: m.get("country") for m in metros}

    # load dimensions
    loaded, dim_ranks = [], {}
    for d in DIMENSIONS:
        p = GF / d["file"]
        if not p.exists():
            print(f"  MISSING dimension file, skipping: {d['file']}")
            continue
        payload = json.loads(p.read_text(encoding="utf-8"))
        vals = payload.get("metros") or {}
        vals = {k: v for k, v in vals.items() if v is not None}
        dim_ranks[d["key"]] = rank_values(vals, lower_is_better=d["lower_is_better"])
        loaded.append({**d, "n": len(vals), "year": (payload.get("_meta") or {}).get("year")})
        print(f"  {d['key']:14s} {len(vals):5d} metros  "
              f"({'lower' if d['lower_is_better'] else 'higher'} is better)")

    if not loaded:
        print("no dimensions available; nothing to build")
        return 1

    required = args.min_dimensions or len(loaded)
    print(f"\ndimensions loaded: {len(loaded)}   required per metro: {required}")
    if len(loaded) < 3:
        print("  NOTE: fewer than three dimensions. The Ground Floor rank is "
              "close to a single dimension's rank; treat it as provisional.")

    # median of ranks
    scores, per_metro_dims = {}, {}
    for slug in acc_rank:
        rs = [dim_ranks[k][slug] for k in dim_ranks if slug in dim_ranks[k]]
        if len(rs) >= required and rs:
            scores[slug] = median(rs)
            per_metro_dims[slug] = len(rs)

    cond_rank = dense_rank(scores, lower_is_better=True)
    n = len(cond_rank)
    print(f"metros ranked: {n} / {len(metros)}")

    if n < COVERAGE_FLOOR * len(metros):
        print("COVERAGE FLOOR NOT MET. Refusing to write.")
        return 2

    # the size confound, reported rather than discovered later
    slugs = [s for s in cond_rank if acc_rank.get(s) and pop.get(s)]
    r_pop_cond = pearson([pop[s] for s in slugs], [cond_rank[s] for s in slugs])
    r_acc_cond = pearson([acc_rank[s] for s in slugs], [cond_rank[s] for s in slugs])
    print(f"\ncorrelations (reported, not corrected):")
    print(f"  population vs conditions rank : {r_pop_cond}")
    print(f"  accumulation rank vs conditions rank : {r_acc_cond}")

    # PERCENTILE GAP IS THE PRIMARY MEASURE. The raw rank difference is kept
    # for display but must not be compared across the table: conditions ranks
    # spread over ~4,300 while a top-100 accumulator's rank cannot exceed 100,
    # so EVERY top accumulator shows a large positive raw gap by construction.
    # Measured on the first real run: Brisbane, comfortably the best-delivering
    # major metro in the set, still showed a raw gap of +91. In percentile
    # terms it is +2.2, which is the truth. Do not promote gapRanks back.
    n_acc = len(acc_rank)
    rows = {}
    for s in cond_rank:
        a = acc_rank.get(s)
        cpct = percentile(cond_rank[s], n)
        apct = percentile(a, n_acc) if a else None
        rows[s] = {
            "conditionsRank": round(cond_rank[s], 1),
            "accumulationRank": a,
            "conditionsPct": cpct,
            "accumulationPct": apct,
            "gap": (round(cpct - apct, 2)
                    if cpct is not None and apct is not None else None),
            "gapRanks": gap(cond_rank[s], a),
            "dimensions": per_metro_dims.get(s),
        }

    # the editorial payload: biggest gaps among metros that actually accumulate
    top = [s for s in rows if (rows[s]["accumulationRank"] or 99999) <= 100]
    worst = sorted(top, key=lambda s: -(rows[s]["gap"] or 0))[:12]
    best = sorted(top, key=lambda s: (rows[s]["gap"] or 0))[:8]
    print(f"\n=== among the top 100 by accumulation ===")
    hdr = f"{'metro':24s} {'acc':>5s} {'cond':>7s} {'acc%':>6s} {'cond%':>6s} {'GAP':>7s}"
    print("  -- accumulates most above what it delivers --")
    print(hdr)
    for s in worst:
        r = rows[s]
        print(f"{names.get(s,s)[:24]:24s} {r['accumulationRank']:5d} "
              f"{r['conditionsRank']:7.1f} {r['accumulationPct']:6.2f} "
              f"{r['conditionsPct']:6.2f} {r['gap']:7.2f}")
    print("  -- delivers most in line with, or above, what it accumulates --")
    print(hdr)
    for s in best:
        r = rows[s]
        print(f"{names.get(s,s)[:24]:24s} {r['accumulationRank']:5d} "
              f"{r['conditionsRank']:7.1f} {r['accumulationPct']:6.2f} "
              f"{r['conditionsPct']:6.2f} {r['gap']:7.2f}")

    payload = {
        "_meta": {
            "what": ("Ground Floor conditions rank (median of dimension ranks) "
                     "and its gap against the accumulation rank"),
            "method": ("each dimension ranked independently with average ties; "
                       "median of a metro's dimension ranks; no weights, no "
                       "normalisation"),
            "gapConvention": ("gap = conditionsPct minus accumulationPct, in "
                              "percentile points. Positive = accumulates more "
                              "than it delivers. gapRanks is the raw rank "
                              "difference, for display only."),
            "gapLimits": ("USE gap, NOT gapRanks, for any comparison. Raw rank "
                          "differences are not comparable across the table: a "
                          "top-100 accumulator's rank cannot exceed 100 while "
                          "conditions ranks spread over ~4,300, so every top "
                          "accumulator shows a large positive raw gap by "
                          "construction. Both measures remain bounded by "
                          "position and correlated with size; neither is an "
                          "effect size."),
            "dimensions": [{"key": d["key"], "label": d["label"],
                            "unit": d["unit"], "year": d.get("year"),
                            "lowerIsBetter": d["lower_is_better"], "metros": d["n"]}
                           for d in loaded],
            "dimensionsRequired": required,
            "metrosRanked": n,
            "provisional": len(loaded) < 3,
            "correlations": {"populationVsConditionsRank": r_pop_cond,
                             "accumulationVsConditionsRank": r_acc_cond},
            "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        },
        "metros": {k: rows[k] for k in sorted(rows)},
    }

    old = None
    if OUT.exists():
        try:
            old = json.loads(OUT.read_text(encoding="utf-8"))
        except Exception:
            old = None
    if not payload_changed(old, payload):
        print("\nno change; nothing to write")
        return 0
    if not args.write:
        print(f"\nDRY RUN. Would write {OUT.relative_to(ROOT)} ({n} metros).")
        return 0

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=1) + "\n", encoding="utf-8")
    print(f"\nwrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size/1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
