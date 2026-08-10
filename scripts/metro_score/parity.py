"""Prove the Python engine reproduces the workbook's own Score, to the decimal.

This is the whole job. A migration that silently changes the rankings is worse
than not migrating, so the engine ships behind this gate and stays behind it
after cutover, where it becomes the drift detector between the two.

    python scripts/metro_score/parity.py --self-test     # pure logic, no I/O
    python scripts/metro_score/parity.py                 # against the workbook
    python scripts/metro_score/parity.py --explain Tokyo # one metro, term by term

Exit codes: 0 pass, 1 mismatch, 2 could not run.

HONEST CAVEAT, and it is the important one. The workbook's cached BG is only as
fresh as the last time Excel actually recalculated. A mismatch here means the
two disagree; it does NOT tell you which is right. When the workbook has not
been recalculated since its inputs changed, the ENGINE is the correct one and
the cache is stale — that is the entire reason for the migration. Read the
report, do not assume the direction.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import time
from pathlib import Path

if __package__ in (None, ""):  # allow `python scripts/metro_score/parity.py`
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from metro_score import score as score_mod, sources, weights as weights_mod
else:
    from . import score as score_mod, sources, weights as weights_mod

REPO = Path(__file__).resolve().parent.parent.parent
DEFAULT_XLSX = REPO / "MetroAreas.xlsx"
BASELINE = REPO / "scripts" / "score-drift-baseline.json"
TOLERANCE = 1e-9
# The baseline stores values to six places, so matching one needs a looser
# comparison than the parity tolerance itself.
BASELINE_TOL = 1e-5


def load_baseline(path: Path):
    """Metros already known to differ from the workbook's cached BG.

    A ratchet, same discipline as scripts/slug-baseline.json and the
    check:skyscrapers baseline: known drift passes, NEW drift fails, and the
    list only ever shrinks. Every entry carries the reason it is there, because
    a baseline without a reason is just a suppressed test.
    """
    if not path.exists():
        return {}
    raw = json.loads(path.read_text(encoding="utf-8"))
    return {e["metro"]: e for e in raw.get("entries", [])}


# --------------------------------------------------------------------- self-test
class SelfTestFailure(AssertionError):
    pass


def _w():
    return weights_mod.load()


def self_test() -> int:
    """Every case here is one hit in production, not a synthetic happy path."""
    fails = []

    def check(name, got, want):
        if isinstance(want, float) or isinstance(got, float):
            ok = math.isclose(got, want, rel_tol=0, abs_tol=1e-12)
        else:
            ok = got == want
        if not ok:
            fails.append(f"{name}: got {got!r}, want {want!r}")

    w = _w()

    # --- Excel's LOG semantics: IFERROR(LOG(x),0) contributes 0, never an error
    check("log10(0)", score_mod.log10(0), 0.0)
    check("log10(-5)", score_mod.log10(-5), 0.0)
    check("log10(100)", score_mod.log10(100), 2.0)

    # --- Excel's text criteria: case-insensitive, whitespace NOT trimmed.
    # 'Osnabruck ' with a trailing space is a real FootballClub_Data row that
    # Excel silently fails to join. The engine must fail to join it too.
    check("key case", sources.key("New York"), "new york")
    check("key keeps trailing space", sources.key("Osnabruck "), "osnabruck ")
    check("key mismatch on space", sources.key("Osnabruck ") == sources.key("Osnabruck"), False)

    # --- column letters
    check("A('A')", sources.A("A"), 0)
    check("A('J')", sources.A("J"), 9)
    check("A('AQ')", sources.A("AQ"), 42)
    check("A('BG')", sources.A("BG"), 58)

    # --- numeric coercion: a blank rank must not satisfy "<=500"
    check("has_num blank", sources.has_num(None), False)
    check("has_num text", sources.has_num("n/a"), False)
    check("has_num zero", sources.has_num(0), True)
    check("has_num bool", sources.has_num(True), False)

    # --- the caps, and the missing floor
    base = {c: 0.0 for c in ("AU", "AV", "AY", "AZ", "BA", "AX", "BC", "BD", "BE",
                             "BF", "BB", "AS", "BR", "AQ", "AR")}

    cols = dict(base, AR=25, AQ=25)
    t = score_mod.score_terms(0, 0, cols, 0, 0, w)
    check("major league caps at 10", t["major_league_teams"], 10.0)

    cols = dict(base, AR=4, AQ=4)
    t = score_mod.score_terms(0, 0, cols, 0, 0, w)
    check("major league below cap", t["major_league_teams"], 4.0)

    cols = dict(base, AQ=200, AR=0)
    t = score_mod.score_terms(0, 0, cols, 0, 0, w)
    check("other teams caps at 10 points", t["other_teams"], 10.0)

    # Manama: AQ=0, AR=2. Excel has no floor here, so this is NEGATIVE today.
    cols = dict(base, AQ=0, AR=2)
    t = score_mod.score_terms(0, 0, cols, 0, 0, w)
    check("other teams goes negative (Manama)", t["other_teams"], -0.5)

    # --- sporting events cap sits exactly on the boundary: 20 * 0.2 == 4
    for events, want in ((20, 4.0), (21, 4.0), (10, 2.0), (0, 0.0)):
        t = score_mod.score_terms(0, 0, dict(base, AS=events), 0, 0, w)
        check(f"sporting events {events}", t["sporting_events"], want)

    # --- GaWC: blank/0 must yield 0, not a division error
    check("gawc blank", score_mod.score_terms(0, 0, dict(base), 0, 0, w)["gawc"], 0.0)
    check("gawc class 1", score_mod.score_terms(0, 1, dict(base), 0, 0, w)["gawc"], 12.0)
    check("gawc class 12", score_mod.score_terms(0, 12, dict(base), 0, 0, w)["gawc"], 1.0)

    # --- GDP bands, including both sides of every boundary
    for gdp, want in ((501, 3.0), (500, 2.0), (201, 2.0), (200, 1.0),
                      (51, 1.0), (50, 0.5), (11, 0.5), (10, 0.0), (0, 0.0)):
        t = score_mod.score_terms(0, 0, dict(base, BR=gdp), 0, 0, w)
        check(f"gdp band {gdp}", t["gdp_band"], want)

    # --- university split: top-50 at the high weight, the remainder at the low
    t = score_mod.score_terms(0, 0, dict(base, AX=10), 3, 0, w)
    check("top50 unis", t["top50_universities"], 10.5)
    check("other top institutions", t["other_top_institutions"], 15.4)

    # --- every term must be present and summed exactly once, in order
    check("term order covers terms", sorted(score_mod.TERM_ORDER),
          sorted(score_mod.score_terms(0, 0, dict(base), 0, 0, w)))
    check("term order has no duplicate", len(set(score_mod.TERM_ORDER)),
          len(score_mod.TERM_ORDER))

    # --- weights validation refuses to guess
    for broken, why in (
        ({"version": 1, "columns": {}}, "missing terms"),
        ({"version": 2, "terms": {}, "columns": {}}, "wrong version"),
    ):
        try:
            weights_mod.validate(broken)
            fails.append(f"weights validate accepted a file with {why}")
        except weights_mod.WeightsError:
            pass

    for f in fails:
        print(f"  FAIL  {f}")
    print(f"self-test: {'PASS' if not fails else str(len(fails)) + ' FAILURE(S)'}")
    return 0 if not fails else 1


# ------------------------------------------------------------------ live parity
def run_parity(xlsx: Path, tolerance: float, limit: int, explain: str) -> int:
    if not xlsx.exists():
        print(f"parity: {xlsx} not found", file=sys.stderr)
        return 2

    t0 = time.time()
    w = weights_mod.load()
    wb = sources.load(xlsx)
    engine = score_mod.Engine(wb, w)
    load_s = time.time() - t0

    rows = list(engine.rows())
    calc_s = time.time() - t0 - load_s

    if explain:
        target = explain.strip().lower()
        for name, k, cached, got, terms, cols in rows:
            if k == target:
                print(f"{name}  (workbook BG {cached:.10f}, engine {got:.10f})")
                width = max(len(t) for t in score_mod.TERM_ORDER)
                for t in score_mod.TERM_ORDER:
                    v = terms[t]
                    if v:
                        print(f"  {t.ljust(width)}  {v:12.6f}")
                zero = [t for t in score_mod.TERM_ORDER if not terms[t]]
                if zero:
                    print(f"  (zero: {', '.join(zero)})")
                return 0
        print(f"parity: no metro named {explain!r}", file=sys.stderr)
        return 2

    base = load_baseline(BASELINE)
    diffs, known = [], []
    worst = (0.0, "")
    for name, _k, cached, got, _terms, _cols in rows:
        d = abs(got - cached)
        if d > worst[0]:
            worst = (d, name)
        if d <= tolerance:
            continue
        b = base.get(name)
        if (b and abs(b.get("workbook", 1e9) - cached) < BASELINE_TOL
                and abs(b.get("engine", 1e9) - got) < BASELINE_TOL):
            known.append((d, name, cached, got, b.get("note", "")))
        else:
            diffs.append((d, name, cached, got))
    diffs.sort(reverse=True)
    known.sort(reverse=True)

    print(f"metro score parity  ({xlsx.name})")
    print(f"  metros          {len(rows):,}")
    print(f"  load            {load_s:5.1f}s   compute {calc_s:4.1f}s")
    print(f"  worst |diff|    {worst[0]:.3e}  ({worst[1]})")
    print(f"  over tolerance  {len(diffs):,}  (tolerance {tolerance:g})")
    if known:
        print(f"  known drift     {len(known):,}  (in {BASELINE.name}, allowed)")
        for d, name, cached, got, note in known:
            print(f"    {name:<28} workbook {cached:12.6f}  engine {got:12.6f}   {note}")
    resolved = [m for m in base if not any(n == m for _d, n, *_ in known)]
    if resolved:
        print(f"  RESOLVED, remove from {BASELINE.name}: {', '.join(sorted(resolved))}")

    odd = sources.suspicious_keys(wb, (k for _n, k, *_ in rows))
    if odd:
        print("  source rows Excel silently drops (whitespace in the metro name):")
        for line in odd:
            print(f"    {line}")

    if diffs:
        print("\n  the workbook and the engine disagree on these. Which is right depends")
        print("  on whether Excel has recalculated since the inputs last changed:")
        for d, name, cached, got in diffs[:limit]:
            print(f"    {name:<34} workbook {cached:14.6f}   engine {got:14.6f}   d {d:.3e}")
        if len(diffs) > limit:
            print(f"    ... and {len(diffs) - limit:,} more")
        return 1

    if known:
        print(f"\n  PASS - every Score matches the workbook except {len(known)} baselined"
              f" metro(s) above.")
    else:
        print("\n  PASS - the engine reproduces every cached Score in the workbook.")
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Prove the Python metro Score matches the workbook.")
    p.add_argument("xlsx", nargs="?", default=str(DEFAULT_XLSX))
    p.add_argument("--self-test", action="store_true",
                   help="pure decision logic only, no workbook, no network")
    p.add_argument("--tolerance", type=float, default=TOLERANCE)
    p.add_argument("--limit", type=int, default=25, help="how many mismatches to print")
    p.add_argument("--explain", default="", help="one metro, term by term")
    a = p.parse_args(argv)

    if a.self_test:
        return self_test()
    try:
        return run_parity(Path(a.xlsx), a.tolerance, a.limit, a.explain)
    except (weights_mod.WeightsError, KeyError, ValueError) as exc:
        print(f"parity: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    raise SystemExit(main())
