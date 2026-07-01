#!/usr/bin/env python3
"""
fetch-conflicts.py — runs in the GitHub Action.
Fetches the Wikipedia article "List of interstate wars since 1945", parses the
wikitables into normalized rows, and writes public/data/conflicts_raw.json (the
structured input for build-conflicts.py). Belligerents are the country links
inside each side cell, in order. Aborts if it parses an implausibly small number
of wars, so a broken parse never overwrites good data.

The table mixes cell shapes: single-estimate wars use one combat-deaths cell
(colspan=2), and some rows carry rowspanned date cells. We therefore expand each
table into a colspan/rowspan-aware grid so every logical row has the full column
set before reading it by index (0 Start, 1 Finish, 2 Name, 3 Side A, 4 Side B,
5 Deaths min, 6 Deaths max). A single-estimate deaths cell lands in both 5 and 6.
"""
import json, re, sys
from pathlib import Path
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public/data/conflicts_raw.json"

MONTHS = {m: i for i, m in enumerate(
    ["January","February","March","April","May","June","July","August",
     "September","October","November","December"], 1)}

def get_html():
    r = requests.get("https://en.wikipedia.org/w/api.php",
        params={"action":"parse","page":"List_of_interstate_wars_since_1945",
                "prop":"text","format":"json","formatversion":2},
        headers={"User-Agent":"metro-power-rankings conflicts-refresh/1.0 (github actions)"},
        timeout=60)
    r.raise_for_status()
    return r.json()["parse"]["text"]

def parse_date(s):
    s = (s or "").strip()
    if not s or s.lower() == "ongoing": return None
    m = re.match(r"(?:(\d{1,2})\s+)?([A-Za-z]+)\s+(\d{4})", s)
    if m:
        return f"{int(m.group(3)):04d}-{MONTHS.get(m.group(2),1):02d}-{int(m.group(1) or 1):02d}"
    m = re.match(r"(\d{4})", s)
    return f"{m.group(1)}-01-01" if m else None

def belligerents(td):
    names = []
    if td is None: return names
    for a in td.select("a[href^='/wiki/']"):
        t = a.get_text(strip=True)
        seg = a.get("href", "").split("/wiki/")[-1]
        if not t or ":" in seg or re.match(r"^\[?\d+\]?$", t): continue
        if t not in names: names.append(t)
    return names

def num(s):
    s = re.sub(r"[^\d]", "", s or "")
    return int(s) if s else None

def expand(table):
    """Return a list of rows; each row is a list of cell elements with colspan
    duplicated and rowspan carried down, so every row is column-aligned."""
    out = []
    carry = {}  # col -> [cell, remaining_rows]
    for tr in table.find_all("tr"):
        cells = tr.find_all(["td", "th"], recursive=False)
        if not cells and not carry:
            continue
        row = {}
        col = 0
        ci = 0
        while ci < len(cells) or any(col2 >= col for col2 in carry):
            if col in carry:
                cell, rem = carry[col]
                cs = int(cell.get("colspan", 1) or 1)
                for k in range(cs): row[col + k] = cell
                if rem - 1 > 0: carry[col] = [cell, rem - 1]
                else: del carry[col]
                col += cs
                continue
            if ci >= len(cells):
                break
            cell = cells[ci]; ci += 1
            cs = int(cell.get("colspan", 1) or 1)
            rs = int(cell.get("rowspan", 1) or 1)
            for k in range(cs): row[col + k] = cell
            if rs > 1:
                for k in range(cs): carry[col + k] = [cell, rs - 1]
            col += cs
        if row:
            width = max(row) + 1
            out.append([row.get(i) for i in range(width)])
    return out

HEADER_WORDS = {"start", "finish", "name of conflict", "states in conflict",
                "combat deaths", "min. estimate", "max. estimate", "min estimate",
                "max estimate", "min", "max"}

def main():
    soup = BeautifulSoup(get_html(), "html.parser")
    wars = []
    seen = set()
    for table in soup.select("table.wikitable"):
        for row in expand(table):
            if len(row) < 7:
                continue
            name_cell = row[2]
            if name_cell is None or name_cell.name == "th":
                continue
            name = re.sub(r"\[\d+\]", "", name_cell.get_text(" ", strip=True)).strip()
            name = re.sub(r"\s*Part of the .*$", "", name).strip()
            if not name or name.lower() in HEADER_WORDS:
                continue
            a, b = belligerents(row[3]), belligerents(row[4])
            if not a and not b:
                continue
            if name in seen:
                continue
            seen.add(name)
            link = name_cell.find("a", href=re.compile("^/wiki/"))
            wiki = link.get("href").split("/wiki/")[-1] if link else name.replace(" ", "_")
            end_txt = row[1].get_text(" ", strip=True) if row[1] is not None else ""
            ongoing = end_txt.strip().lower() == "ongoing"
            mincell, maxcell = row[5], row[6]
            deaths_min = num(mincell.get_text()) if mincell is not None else None
            deaths_max = num(maxcell.get_text()) if (maxcell is not None and maxcell is not mincell) else None
            wars.append({
                "name": name, "wiki": wiki,
                "start": parse_date(row[0].get_text(" ", strip=True) if row[0] is not None else ""),
                "end": None if ongoing else parse_date(end_txt),
                "ongoing": ongoing, "side_a": a, "side_b": b,
                "deaths_min": deaths_min, "deaths_max": deaths_max,
            })
    if len(wars) < 60:
        sys.exit(f"parsed only {len(wars)} wars — aborting (Wikipedia layout may have changed)")
    OUT.write_text(json.dumps(wars, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"parsed {len(wars)} wars -> {OUT.name}")

if __name__ == "__main__":
    main()
