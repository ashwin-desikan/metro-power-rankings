"""Rank the companies still missing an HQ by what they actually cost the BOARD.

The board renders the top 100 of each year, so a company that never cracked a
top 100 cannot change what a reader sees no matter how many years it was listed.
That single filter takes the curation job from 1,936 companies to 213, and those
213 carry 2,725 of the board's 7,176 visible rows. Curating them is finite work
with a measurable payoff; curating all 1,936 is not.

  python build_curation_worklist.py        # -> out/hq_curation_worklist.csv

Emits, worst-first by board_rows: the company, its listing span, its peak rank,
how many BOARD rows it accounts for, the cumulative share of the board those
rows represent, its verified Wikidata QID where the backfill found one, and the
list of years it is actually on the board (so a curated HQ span can be checked
against the years that matter rather than the whole listing span).
"""
import csv, os, sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import OUT, log, select_all  # noqa: E402

OUTFILE = os.path.join(OUT, "hq_curation_worklist.csv")
BOARD_DEPTH = 100
FIELDS = ["board_rows", "cum_share_pct", "company", "company_key", "peak_rank",
          "first_year", "last_year", "span_years", "qid", "board_years"]


def main():
    hq = select_all("/rest/v1/company_hq?select=company_key,company,peak_rank,"
                    "first_year,last_year,hq_city,qid", "company_key")
    unresolved = {h["company_key"]: h for h in hq if not (h.get("hq_city") or "").strip()}
    log(f"{len(unresolved)} companies still without an HQ city")

    rk = select_all(f"/rest/v1/company_rankings?select=company_key,year,rank"
                    f"&rank=lte.{BOARD_DEPTH}", "company_key,year,rank")
    log(f"{len(rk)} board rows (rank <= {BOARD_DEPTH}) across all years")

    years = defaultdict(set)
    for r in rk:
        if r["company_key"] in unresolved:
            years[r["company_key"]].add(int(r["year"]))

    rows = []
    for k, ys in years.items():
        h = unresolved[k]
        fy = int(h.get("first_year") or min(ys))
        ly = int(h.get("last_year") or max(ys))
        rows.append({"board_rows": len(ys), "cum_share_pct": 0,
                     "company": h.get("company") or "", "company_key": k,
                     "peak_rank": h.get("peak_rank") or "",
                     "first_year": fy, "last_year": ly, "span_years": ly - fy,
                     "qid": h.get("qid") or "",
                     "board_years": " ".join(str(y) for y in sorted(ys))})
    rows.sort(key=lambda r: (-r["board_rows"], r["peak_rank"] or 10**6))

    total_board = len(rk)
    running = 0
    for r in rows:
        running += r["board_rows"]
        r["cum_share_pct"] = round(running / total_board * 100, 1)

    with open(OUTFILE, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)

    affected = sum(r["board_rows"] for r in rows)
    with_qid = sum(1 for r in rows if r["qid"])
    long_span = sum(1 for r in rows if r["span_years"] > 20)
    log(f"-> {OUTFILE}")
    log(f"companies that ever reached a top {BOARD_DEPTH}: {len(rows)}")
    log(f"board rows they account for: {affected}/{total_board} "
        f"({affected/total_board*100:.1f}%)")
    log(f"  already carrying a verified QID: {with_qid}")
    log(f"  listed across MORE than 20 years: {long_span} "
        f"(these need a dated span, not one address)")
    for n in (25, 50, 100, 150):
        if n <= len(rows):
            log(f"  top {n:>3} would cover {rows[n-1]['cum_share_pct']}% of the board")


if __name__ == "__main__":
    main()
