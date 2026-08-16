"""Link each legacy (1955-1995) series to the modern (1996+) series it continues into.

WHY THIS MATTERS MORE THAN THE NAMES
The 1955-1995 mirror is back-named, and the damage is not only cosmetic. Because the
name it stamps is a LATER name, the series lands on the wrong entity: 41 years of
Standard Oil of California's history are keyed to "ChevronTexaco", a company that
existed from 2001 to 2005. Fixing the label without fixing the link would still leave
those years attached to the wrong company. This resolves the entity, and the era name
then only has to fix what a reader sees.

HOW
The Fortune list for year N reports fiscal year N-1, so a legacy 1995 row and a
modern 1996 row are consecutive observations of the same company. A real continuation
therefore shows a small rank move and a plausible one-year revenue change. A link is
accepted only when the two are each other's BEST candidate, which stops one large
modern company hoovering up several legacy series.

Every accepted link is scored and written out for review. Nothing is applied here.

  python link_legacy.py                    # -> out/legacy_links.csv
  python link_legacy.py --max-rank-move 40
"""
import argparse, csv, os, sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import OUT, log  # noqa: E402

SRC = os.path.join(OUT, "company_rankings.csv")
DEST = os.path.join(OUT, "legacy_links.csv")
BOUNDARY_LEGACY, BOUNDARY_MODERN = 1995, 1996
FIELDS = ["legacy_key", "legacy_name", "legacy_rank", "legacy_rev",
          "modern_key", "modern_name", "modern_rank", "modern_rev",
          "rank_move", "rev_ratio", "score", "verdict"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-rank-move", type=int, default=30)
    ap.add_argument("--rev-tol", type=float, default=0.20, help="max |1 - ratio|")
    a = ap.parse_args()

    if not os.path.exists(SRC):
        sys.exit(f"FATAL: {SRC} missing. Run build_rankings.py first.")
    with open(SRC, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    legacy, modern, spans = {}, {}, defaultdict(list)
    for r in rows:
        y = int(r["year"])
        spans[r["company_key"]].append(y)
        rev = r["revenue_musd"]
        if not rev:
            continue
        if r["source"] == "fortune500-archive" and y == BOUNDARY_LEGACY:
            legacy[r["company_key"]] = (r["company"], int(r["rank"]), float(rev))
        elif r["source"] == "fortune1000" and y == BOUNDARY_MODERN:
            modern[r["company_key"]] = (r["company"], int(r["rank"]), float(rev))

    # Keys present on both sides already agree; they need no link.
    ambiguous = {k: v for k, v in legacy.items() if k not in modern}
    unclaimed = {k: v for k, v in modern.items() if k not in legacy}
    log(f"boundary rows: {len(legacy)} legacy 1995, {len(modern)} modern 1996")
    log(f"already agreeing on key: {len(legacy) - len(ambiguous)}")
    log(f"needing a link: {len(ambiguous)} legacy vs {len(unclaimed)} modern")

    def score(lv, mv):
        move = abs(lv[1] - mv[1])
        ratio = mv[2] / lv[2] if lv[2] else 0
        if move > a.max_rank_move or abs(1 - ratio) > a.rev_tol:
            return None
        return move / a.max_rank_move + abs(1 - ratio) / a.rev_tol

    best_l, best_m = {}, {}
    for lk, lv in ambiguous.items():
        cands = [(score(lv, mv), mk) for mk, mv in unclaimed.items() if score(lv, mv) is not None]
        if cands:
            best_l[lk] = min(cands)[1]
    for mk, mv in unclaimed.items():
        cands = [(score(lv, mv), lk) for lk, lv in ambiguous.items() if score(lv, mv) is not None]
        if cands:
            best_m[mk] = min(cands)[1]

    out = []
    for lk, mk in best_l.items():
        mutual = best_m.get(mk) == lk
        lv, mv = ambiguous[lk], unclaimed[mk]
        out.append({
            "legacy_key": lk, "legacy_name": lv[0], "legacy_rank": lv[1], "legacy_rev": lv[2],
            "modern_key": mk, "modern_name": mv[0], "modern_rank": mv[1], "modern_rev": mv[2],
            "rank_move": mv[1] - lv[1], "rev_ratio": round(mv[2] / lv[2], 3),
            "score": round(score(lv, mv), 3),
            "verdict": "linked" if mutual else "candidate-not-mutual",
        })
    out.sort(key=lambda r: (r["verdict"] != "linked", r["score"]))

    with open(DEST, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader(); w.writerows(out)

    linked = [r for r in out if r["verdict"] == "linked"]
    log(f"LINKED (mutual best) : {len(linked)}")
    log(f"candidates, not mutual: {len(out) - len(linked)}  (left for review, not applied)")
    log(f"unlinked legacy series: {len(ambiguous) - len(linked)}  "
        f"(genuinely ended by 1995, or the rank/revenue moved too far)")
    log(f"-> {DEST}")
    log("strongest links:")
    for r in linked[:12]:
        log(f"   {r['legacy_name']:32s} -> {r['modern_name']:32s} "
            f"rank {r['legacy_rank']}->{r['modern_rank']}, rev x{r['rev_ratio']}")


if __name__ == "__main__":
    main()
