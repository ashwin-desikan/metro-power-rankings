#!/usr/bin/env python3
"""Build public/data/nfl/europe.json from the 'NFL Europe' sheet of
OtherLeagues.xlsx (repo root).

The hub at /teams/nfl/international and the metro-page defunct-team cards
read this JSON; nothing reads the workbook at runtime. Re-run after the
workbook changes:  python scripts/build-nfl-europe-data.py

Editorial model (confirmed with the data owner):
  * The "Name" column is the CANONICAL franchise identity. The "Team"
    column is the contemporaneous name used in a given metro/era. So the
    1991-92 "Birmingham Fire" (metro Birmingham (AL)) and the 1995-2007
    "Rhein Fire" (metro Rhine-Ruhr) are ONE franchise that relocated in
    1995. Likewise the Scottish Claymores span Edinburgh then Glasgow.
  * A franchise is therefore grouped by Name, and split into per-metro
    "stints" so each metro page shows the club under its local name with
    the titles won while it played there.
"""
import openpyxl, json, os
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) \
    if os.path.basename(os.path.dirname(os.path.abspath(__file__))) == "scripts" \
    else os.environ.get("REPO_ROOT", os.getcwd())
SRC = os.path.join(ROOT, "OtherLeagues.xlsx")
OUT = os.path.join(ROOT, "public", "data", "nfl", "europe.json")
METROS = os.path.join(ROOT, "public", "data", "metros.json")

# name -> slug from the canonical metro dataset
metro_slug = {}
for m in json.load(open(METROS, encoding="utf-8")):
    metro_slug[m["name"]] = m["slug"]

wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
ws = wb["NFL Europe"]
rows = [list(r) for r in ws.iter_rows(values_only=True)]

def cell(r, i):
    return r[i] if i < len(r) else None

def clean(v):
    if v is None:
        return None
    if hasattr(v, "year") and hasattr(v, "month"):  # datetime
        return v.strftime("%Y-%m-%d")
    return str(v).strip() if isinstance(v, str) else v

# ---- locate the two sections ----
wb_hdr = std_hdr = None
for idx, r in enumerate(rows):
    if cell(r, 0) == "Season" and cell(r, 1) == "Game":
        wb_hdr = idx
    if cell(r, 0) == "Season" and cell(r, 1) == "Division":
        std_hdr = idx

# ---- World Bowl championship games ----
world_bowls = []
for r in rows[wb_hdr + 1:]:
    if not isinstance(cell(r, 0), int):
        break
    world_bowls.append({
        "season": cell(r, 0),
        "game": clean(cell(r, 1)),
        "date": clean(cell(r, 2)),
        "venue": clean(cell(r, 5)),
        "city": clean(cell(r, 9)),
        "champion": clean(cell(r, 13)),
        "runner_up": clean(cell(r, 15)),
        "score": clean(cell(r, 17)),
    })

# ---- Season standings ----
standings = []
for r in rows[std_hdr + 1:]:
    if not isinstance(cell(r, 0), int):
        continue
    team = clean(cell(r, 3))
    name = clean(cell(r, 13))
    metro = clean(cell(r, 14))
    if not team or not name:
        continue
    standings.append({
        "season": cell(r, 0),
        "division": clean(cell(r, 1)),
        "pos": cell(r, 2),
        "team": team,
        "w": cell(r, 4) or 0, "l": cell(r, 5) or 0, "t": cell(r, 6) or 0,
        "pct": cell(r, 7),
        "pf": cell(r, 8), "pa": cell(r, 9),
        "playoff": cell(r, 10) == "Y",
        "wb_app": cell(r, 11) == "Y",
        "wb_champ": cell(r, 12) == "Y",
        "canonical": name,
        "metro": metro,
        "metro_slug": metro_slug.get(metro),
    })

# warn on any unmapped metro
missing = sorted({s["metro"] for s in standings if not s["metro_slug"]})
if missing:
    print("WARNING unmapped metros:", missing)

def winpct(w, l, t):
    g = w + l + t
    return round((w + 0.5 * t) / g, 4) if g else 0.0

# ---- aggregate franchises by canonical Name, split into metro stints ----
by_name = defaultdict(list)
for s in standings:
    by_name[s["canonical"]].append(s)

franchises = []
for name, srows in by_name.items():
    srows.sort(key=lambda s: s["season"])
    # per-metro stints
    stints_map = defaultdict(list)
    for s in srows:
        stints_map[(s["metro"], s["metro_slug"])].append(s)
    stints = []
    for (metro, slug), mrows in stints_map.items():
        mrows.sort(key=lambda s: s["season"])
        w = sum(x["w"] for x in mrows); l = sum(x["l"] for x in mrows); t = sum(x["t"] for x in mrows)
        # contemporaneous team name in this metro = the EARLIEST Team value in
        # the stint. For relocations this keeps the local name (Birmingham Fire
        # in Birmingham, Rhein Fire in the Rhine-Ruhr); for an in-place rename it
        # keeps the canonical original (London Monarchs, not England Monarchs).
        team_name = mrows[0]["team"]
        stints.append({
            "metro": metro, "metro_slug": slug,
            "team": team_name,
            "first_year": mrows[0]["season"], "last_year": mrows[-1]["season"],
            "seasons": len(mrows),
            "w": w, "l": l, "t": t, "win_pct": winpct(w, l, t),
            "wb_apps": sum(1 for x in mrows if x["wb_app"]),
            "wb_titles": sum(1 for x in mrows if x["wb_champ"]),
        })
    stints.sort(key=lambda x: x["first_year"])
    W = sum(x["w"] for x in srows); L = sum(x["l"] for x in srows); T = sum(x["t"] for x in srows)
    franchises.append({
        "canonical": name,
        "first_year": srows[0]["season"], "last_year": srows[-1]["season"],
        "seasons": len({x["season"] for x in srows}),
        "w": W, "l": L, "t": T, "win_pct": winpct(W, L, T),
        "wb_apps": sum(1 for x in srows if x["wb_app"]),
        "wb_titles": sum(1 for x in srows if x["wb_champ"]),
        "metros": stints,
        "relocated": len(stints) > 1,
    })

# sort: most World Bowl titles, then win pct
franchises.sort(key=lambda f: (-f["wb_titles"], -f["win_pct"], f["canonical"]))

out = {
    "meta": {
        "name": "NFL Europe",
        "aka": "World League of American Football (1991-92, 1995-97) · NFL Europe (1998-2006) · NFL Europa (2007)",
        "years": "1991–2007",
        "championship": "World Bowl",
        "source": "Wikipedia season articles; OtherLeagues.xlsx 'NFL Europe' sheet.",
    },
    "world_bowls": sorted(world_bowls, key=lambda x: x["season"]),
    "franchises": franchises,
    "standings": standings,
}

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(f"Wrote {OUT}")
print(f"  {len(world_bowls)} World Bowls, {len(franchises)} franchises, {len(standings)} season rows")
print("  Franchises (titles | metros):")
for f in franchises:
    ms = ", ".join(f"{st['team']}@{st['metro']} {st['first_year']}-{st['last_year']}" for st in f["metros"])
    print(f"    {f['canonical']:24} {f['wb_titles']}T  {ms}")
