#!/usr/bin/env python3
"""
afl_ladders.py
--------------
Scrape the final end-of-season ladder (home-and-away standings) for every
VFL/AFL season from afltables.com and write them all to one combined CSV.

Source pages look like:  https://afltables.com/afl/seas/2025.html
The final ladder sits under the <a name="lad"> anchor on each season page.

Usage:
    python afl_ladders.py                       # 1897-2025 -> afl_ladders.csv
    python afl_ladders.py --start 1990 --end 2000
    python afl_ladders.py --out my_ladders.csv --delay 1.0

Dependencies:
    pip install requests beautifulsoup4
"""

import argparse
import csv
import sys
import time

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://afltables.com/afl/seas/{year}.html"
HEADERS = {
    # afltables is a hobbyist site; identify ourselves and be polite.
    "User-Agent": "Mozilla/5.0 (compatible; afl-ladder-scraper/1.0; personal research)"
}

# Map the raw afltables header labels to clean, stable column names.
# Anything not in this map is still captured, using its raw label.
COLUMN_MAP = {
    "#": "Rank",
    "Team": "Team",
    "P": "Played",
    "W": "Wins",
    "D": "Draws",
    "L": "Losses",
    "Bye": "Byes",            # only present in 1942 and 1943
    "Home": "HomeRecord",     # e.g. "11-0-1" = W-D-L at home
    "Away": "AwayRecord",
    "GF-BF": "GoalsBehindsFor",      # e.g. "339.244 (58%)"
    "For": "PointsFor",
    "GA-BA": "GoalsBehindsAgainst",
    "Agn": "PointsAgainst",
    "%": "Percentage",
    "Pts": "PremiershipPoints",
    "MR": "MatchRatio",       # only present in recent seasons
}

# Preferred output column order (Season first). Unknown columns get appended.
PREFERRED_ORDER = [
    "Season", "Rank", "Team", "Played", "Wins", "Draws", "Losses", "Byes",
    "HomeRecord", "AwayRecord", "GoalsBehindsFor", "PointsFor",
    "GoalsBehindsAgainst", "PointsAgainst", "Percentage",
    "PremiershipPoints", "MatchRatio",
]


def fetch_page(year, session, retries=3, delay=1.0):
    """Fetch a season page, retrying on transient errors."""
    url = BASE_URL.format(year=year)
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            resp = session.get(url, headers=HEADERS, timeout=30)
            resp.raise_for_status()
            return resp.text
        except Exception as e:  # noqa: BLE001 - we want to retry on anything
            last_err = e
            if attempt < retries:
                time.sleep(delay * attempt)
    raise RuntimeError("Failed to fetch {} after {} tries: {}".format(url, retries, last_err))


def find_ladder_table(soup):
    """Return the <table> element that follows the <a name='lad'> anchor."""
    anchor = soup.find("a", attrs={"name": "lad"})
    if anchor is None:
        return None
    # Walk forward through siblings until we hit a table (or one inside a sibling).
    for sib in anchor.next_elements:
        if getattr(sib, "name", None) == "table":
            return sib
    return None


def cell_text(cell):
    return cell.get_text(strip=True)


def parse_ladder(table, year):
    """Parse one ladder <table> into a list of row dicts keyed by clean names."""
    rows = table.find_all("tr")

    # Locate the header row: the one containing a 'Team' cell.
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

    # Resolve clean column names for each header position.
    clean_cols = [COLUMN_MAP.get(h, h) for h in headers]

    records = []
    for tr in rows[header_idx + 1:]:
        cells = [cell_text(c) for c in tr.find_all(["th", "td"])]
        if not cells:
            continue
        # Data rows start with a numeric rank; the trailing "Totals" row does not.
        if not cells[0].isdigit():
            continue
        # Guard against ragged rows.
        if len(cells) < len(clean_cols):
            cells = cells + [""] * (len(clean_cols) - len(cells))
        record = {"Season": year}
        for col, val in zip(clean_cols, cells):
            record[col] = val
        # Normalise an empty Draws cell (shown blank when 0) to "0".
        if record.get("Draws", "") == "":
            record["Draws"] = "0"
        records.append(record)
    return records


def order_columns(all_keys):
    """Produce a stable column order: preferred first, then any extras."""
    ordered = [c for c in PREFERRED_ORDER if c in all_keys]
    extras = [c for c in sorted(all_keys) if c not in ordered]
    return ordered + extras


def main():
    ap = argparse.ArgumentParser(description="Scrape AFL/VFL season ladders from afltables.com")
    ap.add_argument("--start", type=int, default=1897, help="first season (default 1897)")
    ap.add_argument("--end", type=int, default=2025, help="last season (default 2025)")
    ap.add_argument("--out", default="afl_ladders.csv", help="output CSV path")
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
