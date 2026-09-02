#!/usr/bin/env python3
"""AllFootball.xlsx -> data/football/eng-topflight.csv.gz, the English tier-1
match spine that scripts/football/build_expectation.py reads.

    python scripts/football/extract_topflight.py --dry
    python scripts/football/extract_topflight.py --write

It also applies scripts/football/home_away_corrections.json -- see
apply_corrections() for what that is and why it is not optional.

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
import argparse, csv, gzip, io, json, os, sys, time

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

CORRECTIONS = os.path.join(HERE, "home_away_corrections.json")


def apply_corrections(kept, path=CORRECTIONS):
    """Put 47 fixtures the right way round, and refuse if the table has rotted.

    🔴 THE WORKBOOK RECORDS ONE FIXTURE PER SEASON THE WRONG WAY ROUND, and it
    is the same fault 47 times, not 47 faults: every one is a season's final
    matchday, one per season from 1891-92 to 1991-92. 42 of the 47 pairings
    record BOTH legs at the same ground, which cannot happen in a double
    round-robin and is proof independent of any outside source that the
    workbook is the side that is wrong. engsoccerdata supplies which leg.
    scripts/football/audit_home_away.py is what found them, by comparing all
    50,223 spine fixtures rather than by anyone reading a list.

    🔴 THIS ASSIGNS THE TRUTH, IT DOES NOT TRANSFORM. A transformation has to
    know that a reversed fixture swaps venue AND goals while a venue-only one
    swaps the venue alone, and getting that backwards on a draw is invisible.
    Assigning cannot get it backwards, and it is idempotent: if the workbook is
    ever corrected at source, every row here is already right and this becomes a
    no-op that says so.

    The build FAILS if a correction matches no fixture or matches more than one,
    because a correction table that has quietly stopped applying is worse than
    no table at all.
    """
    if not os.path.exists(path):
        raise SystemExit("REFUSING: %s is missing. The spine would publish 40 "
                         "fixtures with the win credited to the wrong club." % path)
    table = json.load(open(path, encoding="utf-8"))["corrections"]
    index = {}
    for i, r in enumerate(kept):
        key = ("%04d-%02d-%02d" % (int(r["year"]), int(r["month"]), int(r["day"])),
               frozenset([r["team"], r["opp"]]))
        index.setdefault(key, []).append(i)
    changed = already = 0
    problems = []
    for c in table:
        key = (c["date"], frozenset([c["spine_home"], c["spine_away"]]))
        rows = index.get(key, [])
        if len(rows) != 2:
            problems.append("%s %s v %s matched %d rows, expected 2"
                            % (c["date"], c["spine_home"], c["spine_away"], len(rows)))
            continue
        for i in rows:
            r = kept[i]
            if r["team"] == c["true_home"]:
                want = ("Home", c["hg"], c["ag"])
            elif r["team"] == c["true_away"]:
                want = ("Away", c["ag"], c["hg"])
            else:
                problems.append("%s: row team %r is neither %r nor %r"
                                % (c["date"], r["team"], c["true_home"], c["true_away"]))
                continue
            if (r["ha"], int(r["gf"]), int(r["ga"])) == want:
                already += 1
            else:
                r["ha"], r["gf"], r["ga"] = want
                changed += 1
    if problems:
        raise SystemExit("REFUSING: the correction table no longer describes the "
                         "workbook:\n  " + "\n  ".join(problems[:10]))
    print("corrections: %d rows rewritten, %d already correct, from %d fixtures"
          % (changed, already, len(table)))
    if changed == 0 and already:
        print("  (every fixture already reads correctly -- the workbook master "
              "has been fixed at source and this table is now a regression guard)")
    return changed, already


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
    apply_corrections(kept)
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
