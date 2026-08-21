#!/usr/bin/env python3
"""AllFootball.xlsx -> data/football/eng-topflight.csv.gz, the English tier-1
match spine that scripts/football/build_expectation.py reads.

    python scripts/football/extract_topflight.py --dry
    python scripts/football/extract_topflight.py --write

Run this only when the workbook changes. It streams Sheet1 (517,969 rows, a
1.39 GB worksheet XML) in read-only mode and takes about two and a half
minutes; the build itself then runs off the ~1 MB gzip in seconds.

🔴 READ-ONLY. This never writes the workbook.

🔴 THE TOP FLIGHT HAS HAD THREE COMPETITION NAMES IN THIS WORKBOOK.
`Football League` covers 1888-89 to 1891-92, then `First Division`, then
`Premier League`. Filtering on the last two gives exactly 99,290 rows, which
looks like a clean number and is a truncated series: it starts in 1892-93 and
drops 578 real matches. All three, England only, level 1: 100,446 rows.
"""
import argparse, csv, gzip, io, os, sys, time

SRC = os.environ.get("ALLFOOTBALL_XLSX",
                     os.path.expanduser(r"~\OneDrive\Excel Files\AllFootball.xlsx"))
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "data", "football", "eng-topflight.csv.gz")

TIER1 = ("Football League", "First Division", "Premier League")
# 1-based columns in Sheet1, verified against the header row.
COL = {"month": 1, "day": 2, "year": 3, "season": 5, "comp": 6, "team": 11,
       "opp": 13, "gf": 14, "ga": 15, "ha": 30, "metro": 34, "country": 36,
       "level": 59}
FIELDS = ["year", "month", "day", "season", "comp", "team", "opp", "gf", "ga", "ha", "metro"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--src", default=SRC)
    a = ap.parse_args()
    import openpyxl

    t0 = time.time()
    wb = openpyxl.load_workbook(a.src, read_only=True, data_only=True)
    ws = wb["Sheet1"]
    kept, seen_comp, n = [], set(), 0
    for row in ws.iter_rows(min_row=2, values_only=True):
        n += 1
        def g(k):
            i = COL[k] - 1
            return "" if i >= len(row) or row[i] is None else row[i]
        if g("country") != "England" or g("comp") not in TIER1:
            continue
        if str(g("level")) != "1":
            continue
        seen_comp.add(g("comp"))
        kept.append({f: g(f) for f in FIELDS})
    print("scanned %d rows in %ds, kept %d" % (n, time.time() - t0, len(kept)))
    missing = [c for c in TIER1 if c not in seen_comp]
    if missing:
        raise SystemExit("REFUSING: tier-1 competition name(s) %r produced no rows. "
                         "The series would start late and nothing downstream would "
                         "notice." % missing)
    if len(kept) % 2:
        raise SystemExit("REFUSING: %d rows is odd; the log is two rows per match." % len(kept))
    seasons = sorted({r["season"] for r in kept})
    print("comps: %s" % sorted(seen_comp))
    print("seasons: %d, %s -> %s ; matches %d" % (len(seasons), seasons[0], seasons[-1], len(kept) // 2))
    if a.dry or not a.write:
        print("--dry: nothing written")
        return 0
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=FIELDS)
    w.writeheader()
    w.writerows(kept)
    with gzip.open(OUT, "wt", encoding="utf-8", newline="") as fh:
        fh.write(buf.getvalue())
    print("wrote %s (%.0f KB)" % (OUT, os.path.getsize(OUT) / 1024))
    return 0


if __name__ == "__main__":
    sys.exit(main())
