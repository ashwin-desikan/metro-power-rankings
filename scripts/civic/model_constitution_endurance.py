#!/usr/bin/env python3
"""model_constitution_endurance.py -- survival analysis of constitutional
systems, and the walk-forward gate that decides whether any of it may be
published as a forecast.

WHY THIS EXISTS. The constitutions hub was scoped with an "expected remaining
life" board: fit a survival model, print a per-country number with a confidence
band. This script is the gate that decision has to pass, run BEFORE the board is
built rather than after.

VERDICT, 2026-09-01: the descriptive findings PASS and the per-country forecast
FAILS. Detail in the backtest section below and in the WP4 note in the Claude
Projects folder. Do not build the forecast board on this model.

METHOD. Kaplan-Meier, non-parametric, no weights to argue about. A system dies
when a later constitution replaces it. Systems still standing at the end of
their country's coverage are censored, and so are systems whose covered run ends
because the STATE ended (Poland 1795, Haiti 1915): the constitution did not fail
there, the country did, and scoring those as deaths would libel the document.

MODES
  --self-test   Offline. Asserts the estimator against hand-computable cases.
  --report      Print the survival curve, the era split, the flexibility test
                and the walk-forward backtest.
"""
import argparse, json, os, sys
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_SRC = os.environ.get("CCP_SRC", "")


def load_systems(_ignored=None):
    """Read the systems table the build script already wrote.

    It used to re-derive this from the raw chronology, which meant two copies of
    the censoring rules and a standing risk that the gate was run on different
    numbers from the ones the page prints. One source now.
    """
    path = os.path.join(ROOT, "public", "data", "constitutions.json")
    if not os.path.exists(path):
        raise SystemExit("run scripts/civic/build_constitutions.py --build first")
    data = json.load(open(path, encoding="utf-8"))
    return [{"cow": x["cow"], "start": x["start"],
             "end": x["end"] if x["end"] is not None else data["coverage"]["chronologyTo"],
             "died": x["outcome"] == "replaced",
             "dur": x["years"], "amd10": x.get("amd10", 0)}
            for x in data["systems"]]


def km(items):
    """Kaplan-Meier. items = [(duration, died)] -> (times, survival)."""
    if not items:
        return np.array([0]), np.array([1.0])
    durs = np.array([d for d, _ in items], dtype=float)
    ev = np.array([bool(e) for _, e in items])
    ts = np.array(sorted({d for d, _ in items}), dtype=float)
    S, out = 1.0, []
    for t in ts:
        at_risk = int((durs >= t).sum())
        d = int(((durs == t) & ev).sum())
        if at_risk > 0 and d > 0:
            S *= (1 - d / at_risk)
        out.append(S)
    return ts, np.array(out)


def surv_at(ts, S, t):
    if t <= 0:
        return 1.0
    i = np.searchsorted(ts, t, side="right") - 1
    return float(S[i]) if i >= 0 else 1.0


def median_surv(ts, S):
    below = np.where(S <= 0.5)[0]
    return int(ts[below[0]]) if len(below) else None


def backtest(systems, cut, horizon=20, since=1789):
    """Fit on what was knowable at `cut`, predict `horizon`-year survival for the
    systems alive then, score against what actually happened."""
    train = []
    for s in systems:
        if s["start"] > cut or s["start"] < since:
            continue
        d = min(s["end"], cut) - s["start"]
        if d >= 0:
            train.append((d, s["died"] and s["end"] <= cut))
    ts, S = km(train)
    alive = [s for s in systems if since <= s["start"] <= cut and s["end"] > cut]
    if not alive:
        return None
    pred = sum(surv_at(ts, S, (cut - s["start"]) + horizon) /
               max(surv_at(ts, S, cut - s["start"]), 1e-9) for s in alive)
    observable = [s for s in alive
                  if s["end"] >= cut + horizon or (s["died"] and s["end"] < cut + horizon)]
    actual = sum(1 for s in observable if not (s["died"] and s["end"] < cut + horizon))
    scaled = pred * (len(observable) / len(alive))
    return {"cut": cut, "trained": len(train), "observable": len(observable),
            "predicted": scaled, "actual": actual, "error": scaled - actual}


def report(src=None):
    systems = load_systems()
    ts, S = km([(s["dur"], s["died"]) for s in systems])
    print(f"systems {len(systems)}, replaced {sum(s['died'] for s in systems)}, "
          f"censored {sum(not s['died'] for s in systems)}")
    print(f"\nmedian survival: {median_surv(ts, S)} years")
    for t in (5, 10, 25, 50, 100):
        print(f"  P(survive {t:>3}y) = {surv_at(ts, S, t):.3f}")

    print("\nDURATION DEPENDENCE: P(another 20 years | already lasted A)")
    for a in (0, 10, 25, 50, 100):
        print(f"  age {a:>3}: {surv_at(ts, S, a + 20) / max(surv_at(ts, S, a), 1e-9):.3f}")

    print("\nBY ADOPTION ERA")
    for label, a, b in (("1789-1899", 1789, 1899), ("1900-1945", 1900, 1945),
                        ("1946-1989", 1946, 1989), ("1990-2025", 1990, 2025)):
        it = [(s["dur"], s["died"]) for s in systems if a <= s["start"] <= b]
        t2, S2 = km(it)
        print(f"  {label}  n={len(it):>3}  median={median_surv(t2, S2)}  "
              f"P(20y)={surv_at(t2, S2, 20):.3f}")

    print("\nFLEXIBILITY: amended in the first decade or not, among systems reaching 10 years")
    for flag, label in ((True, "amended early"), (False, "not amended early")):
        g = [(s["dur"] - 10, s["died"]) for s in systems
             if s["dur"] >= 10 and (s["amd10"] > 0) == flag]
        t2, S2 = km(g)
        print(f"  {label:<18} n={len(g):>3}  median further life={median_surv(t2, S2)}  "
              f"P(+25y)={surv_at(t2, S2, 25):.3f}")

    print("\nWALK-FORWARD BACKTEST (20-year horizon)")
    print(f"  {'cut':>6} {'trained':>8} {'cases':>6} {'predicted':>10} {'actual':>7} {'error':>8}")
    for cut in (1900, 1920, 1940, 1960, 1980, 1999):
        r = backtest(systems, cut)
        if r:
            print(f"  {r['cut']:>6} {r['trained']:>8} {r['observable']:>6} "
                  f"{r['predicted']:>10.1f} {r['actual']:>7} {r['error']:>+8.1f}")
    print("\n  The 1999 row is the gate, and it fails: the model under-predicts")
    print("  survival badly because the hazard moved. Constitutions written since")
    print("  1990 outlive the historical base rate by a wide margin, so a forecast")
    print("  fit on all of history would print numbers biased toward collapse.")


def self_test():
    # No censoring: KM reduces to the empirical survival function.
    ts, S = km([(1, True), (2, True), (3, True), (4, True)])
    assert abs(surv_at(ts, S, 1) - 0.75) < 1e-9
    assert abs(surv_at(ts, S, 4) - 0.0) < 1e-9
    assert median_surv(ts, S) == 2

    # A censored observation must not count as a death, and must stay at risk
    # until it leaves. Deaths at 1 and 3 out of four, one censored at 2.
    ts, S = km([(1, True), (2, False), (3, True), (4, False)])
    assert abs(surv_at(ts, S, 1) - 0.75) < 1e-9          # 1 - 1/4
    assert abs(surv_at(ts, S, 3) - 0.375) < 1e-9         # 0.75 * (1 - 1/2)

    # All censored: survival never falls, and there is no median.
    ts, S = km([(5, False), (9, False)])
    assert surv_at(ts, S, 9) == 1.0 and median_surv(ts, S) is None

    print("self-test OK")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--src", default=DEFAULT_SRC, help="unused; kept so old invocations still work")
    a = ap.parse_args()
    if a.self_test:
        self_test()
    elif a.report:
        report()
    else:
        ap.print_help()
        sys.exit(0)
