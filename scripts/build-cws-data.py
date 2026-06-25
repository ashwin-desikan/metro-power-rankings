#!/usr/bin/env python3
"""Build public/data/baseball/cws.json from the 'CWS Standings' sheet of
OtherLeagues.xlsx (repo root). One row per team's College World Series
appearance (Year, Team, W, L, Finals, Champion). Emits the per-year champions
roll and an all-time aggregate (titles / finals / appearances). Run:
    python scripts/build-cws-data.py
"""
import openpyxl, json, os, time
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "OtherLeagues.xlsx")
OUT = os.path.join(ROOT, "public", "data", "baseball", "cws.json")

wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
ws = wb["CWS Standings"]
it = ws.iter_rows(values_only=True); next(it)
rows = []
for r in it:
    if not r or not r[1] or not r[2]:
        continue
    rows.append({"year": int(r[1]), "team": str(r[2]).strip(),
                 "finals": r[6] == "Y", "champ": r[7] == "Y"})

years = sorted({r["year"] for r in rows})
champions = []
for y in sorted(years, reverse=True):
    yr = [r for r in rows if r["year"] == y]
    champions.append({"year": y,
        "champion": next((r["team"] for r in yr if r["champ"]), None),
        "runner_up": next((r["team"] for r in yr if r["finals"] and not r["champ"]), None)})

apps = Counter(r["team"] for r in rows)
titles = Counter(r["team"] for r in rows if r["champ"])
fin = Counter(r["team"] for r in rows if r["finals"])
last = {}
for r in rows:
    if r["champ"]:
        last[r["team"]] = max(last.get(r["team"], 0), r["year"])
teams = [{"name": t, "titles": titles[t], "finals": fin[t], "apps": apps[t], "last_title": last.get(t)} for t in apps]
teams.sort(key=lambda x: (-x["titles"], -x["apps"], x["name"]))

out = {"generated": time.strftime("%Y-%m-%d"), "first_year": years[0], "last_year": years[-1],
       "editions": len(years), "champions": champions, "teams": teams}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"wrote {OUT}: {len(years)} editions, {len(teams)} teams")
