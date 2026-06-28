#!/usr/bin/env python3
"""
fetch-conflicts.py — runs in the GitHub Action.
Fetches the Wikipedia article "List of interstate wars since 1945", parses both
wikitables, and writes public/data/conflicts_raw.json (the structured input for
build-conflicts.py). Belligerents are the country links inside each side cell,
in order. Aborts if it parses an implausibly small number of wars, so a broken
parse never overwrites good data.
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
    for a in td.select("a[href^='/wiki/']"):
        t = a.get_text(strip=True)
        seg = a.get("href", "").split("/wiki/")[-1]
        if not t or ":" in seg or re.match(r"^\[?\d+\]?$", t): continue
        if t not in names: names.append(t)
    return names

def num(s):
    s = re.sub(r"[^\d]", "", s or "")
    return int(s) if s else None

def main():
    soup = BeautifulSoup(get_html(), "html.parser")
    wars = []
    for table in soup.select("table.wikitable"):
        for tr in table.select("tr"):
            tds = tr.find_all("td")
            if len(tds) < 7: continue
            ongoing = tds[1].get_text(" ", strip=True).strip().lower() == "ongoing"
            name_cell = tds[2]
            name = re.sub(r"\[\d+\]", "", name_cell.get_text(" ", strip=True)).strip()
            link = name_cell.find("a", href=re.compile("^/wiki/"))
            wiki = link.get("href").split("/wiki/")[-1] if link else name.replace(" ", "_")
            a, b = belligerents(tds[3]), belligerents(tds[4])
            if not name or (not a and not b): continue
            wars.append({
                "name": name, "wiki": wiki,
                "start": parse_date(tds[0].get_text(" ", strip=True)),
                "end": None if ongoing else parse_date(tds[1].get_text(" ", strip=True)),
                "ongoing": ongoing, "side_a": a, "side_b": b,
                "deaths_min": num(tds[5].get_text()), "deaths_max": num(tds[6].get_text()),
            })
    if len(wars) < 60:
        sys.exit(f"parsed only {len(wars)} wars — aborting (Wikipedia layout may have changed)")
    OUT.write_text(json.dumps(wars, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"parsed {len(wars)} wars -> {OUT.name}")

if __name__ == "__main__":
    main()
