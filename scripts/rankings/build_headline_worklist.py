"""Rank the UNDATED company labels by how loudly the board actually says them.

The metro board prints ONE company name per metro per year, in large type, as
that metro's headline. A label that heads a metro-year gets read. A label at
rank 87 of a hundred-row table gets skimmed. So the tier worth curating next is
not "the companies with the most undated rows" but "the companies whose undated
label HEADLINES a metro-year".

Reads the emitted board (public/data/business/rankings.json) because that file
already carries the two facts this needs and nothing else does: the metro each
row was placed in, and the nameFlag the emitter computed (3 = source-recorded,
undated). Joins back to out/company_rankings.csv on (year, rank) for the
company_key, which is what a curation row is written against.

  python build_headline_worklist.py          # -> out/headline_worklist.csv

Also reports the plain top-N-per-year tier for comparison, because that is the
cheaper proxy and it is worth seeing how much the two disagree.
"""
import argparse, csv, json, os, sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import OUT, log  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
BOARD = os.path.join(REPO, "public", "data", "business", "rankings.json")
SRC = os.path.join(OUT, "company_rankings.csv")
OUTFILE = os.path.join(OUT, "headline_worklist.csv")
FIELDS = ["undated_headlines", "headlines", "undated_rows", "company_key",
          "published_name", "peak_rank", "first_undated", "last_undated",
          "metros", "undated_years"]
UNDATED = 3


def load_keys():
    """(year, rank) -> (company_key, published company name)."""
    if not os.path.exists(SRC):
        sys.exit(f"FATAL: {SRC} missing. Run build_rankings.py first.")
    keys = {}
    with open(SRC, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            keys[(int(r["year"]), int(r["rank"]))] = (r["company_key"], r["company"])
    return keys


def load_board():
    if not os.path.exists(BOARD):
        sys.exit(f"FATAL: {BOARD} missing. Run emit_rankings.py first.")
    with open(BOARD, encoding="utf-8") as f:
        doc = json.load(f)
    idx = {name: i for i, name in enumerate(doc["fields"])}
    for need in ("rank", "company", "nameFlag", "metro"):
        if need not in idx:
            sys.exit(f"FATAL: the board has no {need!r} field; this script is stale.")
    return doc, idx


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=12,
                    help="depth of the cheaper top-N-per-year proxy tier")
    ap.add_argument("--limit", type=int, default=0,
                    help="write only the worst N rows (0 = all)")
    a = ap.parse_args()

    keys = load_keys()
    doc, idx = load_board()
    R, C, F, M = idx["rank"], idx["company"], idx["nameFlag"], idx["metro"]

    agg = defaultdict(lambda: {"headlines": 0, "undated_headlines": 0,
                               "undated_rows": 0, "peak_rank": 10 ** 6,
                               "name": "", "metros": set(), "years": set()})
    proxy = defaultdict(int)          # company_key -> undated rows inside top N
    unmatched = 0
    board_rows = headline_rows = 0

    for ystr, rows in doc["years"].items():
        y = int(ystr)
        best = {}                     # metro -> the row that heads it this year
        for row in rows:
            board_rows += 1
            metro = row[M]
            if metro and (metro not in best or row[R] < best[metro][R]):
                best[metro] = row
            if row[F] == UNDATED and row[R] <= a.top:
                k = keys.get((y, row[R]))
                if k:
                    proxy[k[0]] += 1
        for metro, row in best.items():
            headline_rows += 1
            k = keys.get((y, row[R]))
            if not k:
                unmatched += 1
                continue
            key, published = k
            s = agg[key]
            s["headlines"] += 1
            s["name"] = s["name"] or published
            s["peak_rank"] = min(s["peak_rank"], row[R])
            if row[F] == UNDATED:
                s["undated_headlines"] += 1
                s["metros"].add(metro)
                s["years"].add(y)

    for ystr, rows in doc["years"].items():
        y = int(ystr)
        for row in rows:
            if row[F] != UNDATED:
                continue
            k = keys.get((y, row[R]))
            if k:
                agg[k[0]]["undated_rows"] += 1

    # A company can carry undated rows without ever heading a metro-year, so the
    # second pass creates entries the first never touched. Name them from the CSV
    # rather than leaving a blank label in the worklist.
    latest = {}
    for (y, _r), (key, published) in keys.items():
        if y >= latest.get(key, (0, ""))[0]:
            latest[key] = (y, published)

    rows_out = []
    for key, s in agg.items():
        if not s["undated_headlines"] and not s["undated_rows"]:
            continue
        ys = sorted(s["years"])
        rows_out.append({
            "undated_headlines": s["undated_headlines"],
            "headlines": s["headlines"],
            "undated_rows": s["undated_rows"],
            "company_key": key,
            "published_name": s["name"] or latest.get(key, (0, ""))[1],
            "peak_rank": "" if s["peak_rank"] == 10 ** 6 else s["peak_rank"],
            "first_undated": ys[0] if ys else "",
            "last_undated": ys[-1] if ys else "",
            "metros": " | ".join(sorted(s["metros"])),
            "undated_years": " ".join(str(y) for y in ys),
        })
    rows_out.sort(key=lambda r: (-r["undated_headlines"], -r["undated_rows"],
                                 r["company_key"]))
    if a.limit:
        rows_out = rows_out[: a.limit]

    with open(OUTFILE, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows_out)

    heads = [r for r in rows_out if r["undated_headlines"]]
    total_undated_head = sum(r["undated_headlines"] for r in rows_out)
    log(f"-> {OUTFILE}")
    log(f"board rows {board_rows}; metro-year headlines {headline_rows}"
        + (f"; UNMATCHED (year,rank) joins {unmatched}" if unmatched else ""))
    log(f"undated headlines: {total_undated_head} of {headline_rows} "
        f"({total_undated_head / headline_rows * 100:.1f}%) across "
        f"{len(heads)} companies")
    running = 0
    for n in (10, 25, 50, 100):
        if n <= len(heads):
            running = sum(r["undated_headlines"] for r in heads[:n])
            log(f"  curating the worst {n:>3} companies clears {running} "
                f"({running / total_undated_head * 100:.0f}%) of them")
    log(f"cheaper proxy (undated rows inside the top {a.top} of a year): "
        f"{sum(proxy.values())} rows across {len(proxy)} companies")
    overlap = len(set(proxy) & {r['company_key'] for r in heads[:50]})
    log(f"  {overlap}/{min(50, len(heads))} of the worst-50 headline companies "
        f"also appear in that proxy")


if __name__ == "__main__":
    main()
