#!/usr/bin/env python3
"""Add defunct/relocated club-rugby tiles to metro pages.

User decisions 2026-06-12: Wasps per-stint (London 1867-2014 relocated,
Coventry 2014-2022 defunct); Stade Bordelais -> Bordeaux; FC Lyon -> Lyon;
Olympique -> Paris. Lourdes/Tarbes/Narbonne/Vienne/Carmaux/Quillan/La Voulte
are not in the metro corpus, so their champions stay roll-only for now.

Idempotent: appends to scripts/relocations/curated.csv (so the next full
build-relocations.py run reproduces the tiles) AND injects the same rows
into public/data/sports/relocations-by-metro.json directly (avoiding a full
workbook rebuild today). Also gives leagueIcon a rugby-union case.

Run from repo root: python scripts/patches/2026-06-12-rugby-defunct-tiles.py
"""
import csv
import io
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

ROWS = [
    # metro_slug, league, sport, name, years, href, kind
    ("london", "rugby-union", "Rugby Union", "Wasps", "1867–2014",
     "/teams/rugby-union/clubs#premiership", "relocated"),
    ("coventry", "rugby-union", "Rugby Union", "Wasps", "2014–2022",
     "/teams/rugby-union/clubs#premiership", "defunct"),
    ("bordeaux", "rugby-union", "Rugby Union", "Stade Bordelais", "1899–1911",
     "/teams/rugby-union/clubs#top14", "defunct"),
    ("lyon", "rugby-union", "Rugby Union", "FC Lyon", "1910",
     "/teams/rugby-union/clubs#top14", "defunct"),
    ("paris", "rugby-union", "Rugby Union", "Olympique", "1896",
     "/teams/rugby-union/clubs#top14", "defunct"),
]

# ---------------- curated.csv ----------------
cur_path = os.path.join(ROOT, "scripts", "relocations", "curated.csv")
existing = io.open(cur_path, encoding="utf-8").read()
added_csv = 0
lines_to_add = []
for r in ROWS:
    needle = f"{r[0]},{r[1]},{r[2]},{r[3]},{r[4]}"
    if needle not in existing:
        lines_to_add.append(",".join(r))
        added_csv += 1
if lines_to_add:
    with io.open(cur_path, "a", encoding="utf-8", newline="") as f:
        if not existing.endswith("\n"):
            f.write("\n")
        f.write("\n".join(lines_to_add) + "\n")

# ---------------- relocations-by-metro.json ----------------
json_path = os.path.join(ROOT, "public", "data", "sports", "relocations-by-metro.json")
data = json.load(io.open(json_path, encoding="utf-8"))
added_json = 0
for (slug, league, sport, name, years, href, kind) in ROWS:
    rows = data.setdefault(slug, [])
    if any(x.get("name") == name and x.get("years") == years for x in rows):
        continue
    rows.append({
        "league": league, "sport": sport, "name": name, "years": years,
        "href": href, "kind": kind,
        "relocated": kind == "relocated", "defunct": kind == "defunct",
        "stats": {"champ": 0, "div": 0, "finals": 0, "pct": 0.0},
    })
    added_json += 1
io.open(json_path, "w", encoding="utf-8", newline="").write(
    json.dumps(data, ensure_ascii=False, indent=0))

# ---------------- leagueIcon rugby case ----------------
sl_path = os.path.join(ROOT, "lib", "sportLabels.ts")
src = io.open(sl_path, encoding="utf-8").read()
if 'case "rugby-union"' not in src:
    old = '    case "nrl": return "🏉";'
    assert src.count(old) == 1, "leagueIcon anchor"
    src = src.replace(old, '    case "nrl": case "rugby-union": return "🏉";')
    io.open(sl_path, "w", encoding="utf-8", newline="").write(src)
    icon = "added"
else:
    icon = "present"

print(f"curated.csv +{added_csv}; relocations json +{added_json}; leagueIcon {icon}")
