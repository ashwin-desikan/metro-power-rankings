#!/usr/bin/env python3
"""
nrl_ladders.py
--------------
Scrape the final end-of-season ladder (premiership standings) for every
NSWRL/ARL/NRL rugby league season from afltables.com and write them all to
one combined CSV.

Source pages look like:  https://afltables.com/rl/seas/2025.html
The final ladder sits under the <a name="lad"> anchor on each season page.
Note: on the rugby league pages the "YYYY Ladder" title is in its own little
table, so the real data table is the *next* table that carries a "Team"
header. This script walks forward to that table rather than grabbing the
first table after the anchor.

Usage:
    python nrl_ladders.py                       # 1908-2025 -> nrl_ladders.csv
    python nrl_ladders.py --start 1990 --end 2000
    python nrl_ladders.py --out my_ladders.csv --delay 1.0

Dependencies:
    pip install requests beautifulsoup4
"""

import argparse
import csv
import sys
import time

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://afltables.com/rl/seas/{year}.html"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; nrl-ladder-scraper/1.0; personal research)"
}

# afltables rugby league ladder header is:
#   # | Team | P | W | D | L | B | TGF | F | Av. | TGF | A | Av. | Pts | Diff
# "TGF" and "Av." appear twice: the first pair describes the For side, the
# second pair the Against side. We disambiguate them by order of appearance.
#
# Cell formats:
#   TGF  -> e.g. "113t 101g" (tries and goals; field goals fold into points)
#   F/A  -> total points for / against
#   Av.  -> average points per game
#   Pts  -> competition (premiership) points: 2 per win, 1 per draw, 2 per bye
#   Diff -> points differential (F - A), e.g. "+148"
SIMPLE_MAP = {
    "#": "Rank",
    "Team": "Team",
    "P": "Played",
    "W": "Wins",
    "D": "Draws",
    "L": "Losses",
    "B": "Byes",
    "F": "PointsFor",
    "A": "PointsAgainst",
    "Pts": "CompetitionPoints",
    "Diff": "PointsDiff",
}
# Labels that repeat; map by 1st/2nd occurrence (For side, then Against side).
DUP_MAP = {
    "TGF": ["TriesGoalsFor", "TriesGoalsAgainst"],
    "Av.": ["AvgFor", "AvgAgainst"],
}

PREFERRED_ORDER = [
    "Season", "Rank", "Team", "Played", "Wins", "Draws", "Losses", "Byes",
    "TriesGoalsFor", "PointsFor", "AvgFor",
    "TriesGoalsAgainst", "PointsAgainst", "AvgAgainst",
    "CompetitionPoints", "PointsDiff",
]


def fetch_page(year, session, retries=3, delay=1.0):
    url = BASE_URL.format(year=year)
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            resp = session.get(url, headers=HEADERS, timeout=30)
            resp.raise_for_status()
            return resp.text
        except Exception as e:  # noqa: BLE001
            last_err = e
            if attempt < retries:
                time.sleep(delay * attempt)
    raise RuntimeError("Failed to fetch {} after {} tries: {}".format(url, retries, last_err))


def cell_text(cell):
    return cell.get_text(strip=True)


def find_ladder_table(soup):
    """Return the ladder <table> following <a name='lad'>.

    The title sits in its own table, so we walk through every table after the
    anchor and return the first one that contains a 'Team' header cell.
    """
    anchor = soup.find("a", attrs={"name": "lad"})
    if anchor is None:
        return None
    for table in anchor.find_all_next("table"):
        for tr in table.find_all("tr"):
            cells = [cell_text(c) for c in tr.find_all(["th", "td"])]
            if "Team" in cells:
                return table
    return None


def resolve_columns(headers):
    """Map raw header labels to clean names, disambiguating repeats by order."""
    seen = {}
    clean = []
    for h in headers:
        if h in DUP_MAP:
            idx = seen.get(h, 0)
            variants = DUP_MAP[h]
            clean.append(variants[idx] if idx < len(variants) else "{}_{}".format(h, idx))
            seen[h] = idx + 1
        else:
            clean.append(SIMPLE_MAP.get(h, h))
    return clean


def parse_ladder(table, year):
    rows = table.find_all("tr")

    header_idx = None
    headers = []
    for i, tr in enumerate(rows):
        cells = [cell_text(c) for c in tr.find_all(["th", "td"])]
        if "Team" in cells:
            header_idx = i
            headers = cells
            break
    if header_idx is None:
        return []

    clean_cols = resolve_columns(headers)

    records = []
    for tr in rows[header_idx + 1:]:
        cells = [cell_text(c) for c in tr.find_all(["th", "td"])]
        if not cells:
            continue
        # Data rows start with a numeric rank; the trailing "Total games" row does not.
        if not cells[0].isdigit():
            continue
        if len(cells) < len(clean_cols):
            cells = cells + [""] * (len(clean_cols) - len(cells))
        record = {"Season": year}
        for col, val in zip(clean_cols, cells):
            record[col] = val
        # Blank cells shown for zero draws/byes -> normalise to "0".
        if record.get("Draws", "") == "":
            record["Draws"] = "0"
        if record.get("Byes", "") == "":
            record["Byes"] = "0"
        records.append(record)
    return records


def order_columns(all_keys):
    ordered = [c for c in PREFERRED_ORDER if c in all_keys]
    extras = [c for c in sorted(all_keys) if c not in ordered]
    return ordered + extras


def main():
    ap = argparse.ArgumentParser(description="Scrape NRL/ARL/NSWRL season ladders from afltables.com")
    ap.add_argument("--start", type=int, default=1908, help="first season (default 1908)")
    ap.add_argument("--end", type=int, default=2025, help="last season (default 2025)")
    ap.add_argument("--out", default="nrl_ladders.csv", help="output CSV path")
    ap.add_argument("--delay", type=float, default=1.0,
                    help="seconds to wait between requests (be polite; default 1.0)")
    args = ap.parse_args()

    session = requests.Session()
    all_rows = []
    all_keys = set()

    for year in range(args.start, args.end + 1):
        try:
            html = fetch_page(year, session, delay=args.delay)
        except RuntimeError as e:
            print("WARN  {}".format(e), file=sys.stderr)
            continue

        soup = BeautifulSoup(html, "html.parser")
        table = find_ladder_table(soup)
        if table is None:
            print("WARN  {}: no ladder table found".format(year), file=sys.stderr)
            continue

        rows = parse_ladder(table, year)
        if not rows:
            print("WARN  {}: ladder parsed empty".format(year), file=sys.stderr)
            continue

        all_rows.extend(rows)
        for r in rows:
            all_keys.update(r.keys())
        print("OK    {}: {} teams".format(year, len(rows)))
        time.sleep(args.delay)

    if not all_rows:
        print("No data scraped. Exiting.", file=sys.stderr)
        sys.exit(1)

    columns = order_columns(all_keys)
    with open(args.out, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        for r in all_rows:
            writer.writerow(r)

    seasons = len({r["Season"] for r in all_rows})
    print("\nDone. {} rows across {} seasons -> {}".format(len(all_rows), seasons, args.out))


if __name__ == "__main__":
    main()
