#!/usr/bin/env python3
"""Defunct T20 franchise tiles + cricket color circles on metro cards.

User decisions 2026-06-12: Deccan Chargers -> Hyderabad (IPL, 2008-2012),
Comilla Victorians -> Cumilla (BPL, 2015-2024), Jamaica Tallawahs -> Kingston
(CPL, 2013-2023). Tiles into curated.csv + relocations-by-metro.json (same
dual-write as the rugby tiles). Cricket monogram circles via
lib/cricket-colors.ts in the metro TeamCard.

Run from repo root: python scripts/patches/2026-06-12-t20-defunct-and-colors.py
"""
import io
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
changed, skipped = [], []

ROWS = [
    ("hyderabad", "cricket-t20", "T20 Cricket", "Deccan Chargers", "2008–2012",
     "/teams/cricket/t20#ipl", "defunct"),
    ("cumilla", "cricket-t20", "T20 Cricket", "Comilla Victorians", "2015–2024",
     "/teams/cricket/t20#bpl", "defunct"),
    ("kingston", "cricket-t20", "T20 Cricket", "Jamaica Tallawahs", "2013–2023",
     "/teams/cricket/t20#cpl", "defunct"),
]

cur_path = os.path.join(ROOT, "scripts", "relocations", "curated.csv")
existing = io.open(cur_path, encoding="utf-8").read()
lines = [",".join(r) for r in ROWS if f"{r[0]},{r[1]},{r[2]},{r[3]}" not in existing]
if lines:
    with io.open(cur_path, "a", encoding="utf-8", newline="") as f:
        if not existing.endswith("\n"):
            f.write("\n")
        f.write("\n".join(lines) + "\n")
changed.append(f"curated.csv +{len(lines)}")

json_path = os.path.join(ROOT, "public", "data", "sports", "relocations-by-metro.json")
data = json.load(io.open(json_path, encoding="utf-8"))
nj = 0
for (slug, league, sport, name, years, href, kind) in ROWS:
    rows = data.setdefault(slug, [])
    if any(x.get("name") == name for x in rows):
        continue
    rows.append({"league": league, "sport": sport, "name": name, "years": years,
                 "href": href, "kind": kind, "relocated": False, "defunct": True,
                 "stats": {"champ": 0, "div": 0, "finals": 0, "pct": 0.0}})
    nj += 1
io.open(json_path, "w", encoding="utf-8", newline="").write(
    json.dumps(data, ensure_ascii=False, indent=0))
changed.append(f"relocations json +{nj}")


def read(p):
    return io.open(os.path.join(ROOT, p), encoding="utf-8").read()


def write(p, c):
    io.open(os.path.join(ROOT, p), "w", encoding="utf-8", newline="").write(c)


def patch(path, old, new, label):
    src = read(path)
    if new in src:
        skipped.append(label)
        return
    n = src.count(old)
    assert n == 1, f"ANCHOR FAIL [{label}] in {path}: {n} occurrences"
    write(path, src.replace(old, new))
    changed.append(label)


# leagueIcon cricket-t20
patch(
    "lib/sportLabels.ts",
    '    case "nrl": case "rugby-union": return "🏉";',
    '    case "nrl": case "rugby-union": return "🏉";\n    case "cricket-t20": return "🏏";',
    "leagueIcon: cricket-t20",
)

RANK = "app/rankings/[slug]/page.tsx"
patch(
    RANK,
    'import { rugbyClubColor, rugbyMonogram } from "@/lib/rugby-colors";',
    'import { rugbyClubColor, rugbyMonogram } from "@/lib/rugby-colors";\n'
    'import { cricketClubColor } from "@/lib/cricket-colors";',
    "rankings: cricket-colors import",
)
patch(
    RANK,
    '  const rugbyColor = isRugbyUnionClub ? rugbyClubColor(team.team) : null;',
    '  const rugbyColor = isRugbyUnionClub ? rugbyClubColor(team.team) : null;\n'
    '  const cricketColor = sportLower.includes("cricket") && t20Honours.length >= 0\n'
    '    ? cricketClubColor(team.team)\n'
    '    : null;\n'
    '  const clubColor = rugbyColor ?? (cricketColor && cricketColor.known ? cricketColor : null);',
    "rankings: cricket color lookup",
)
patch(
    RANK,
    '        {!link && rugbyColor ? (\n'
    '          <span\n'
    '            className="inline-grid place-items-center rounded-full flex-shrink-0"\n'
    '            style={{\n'
    '              background: rugbyColor.bg,\n'
    '              color: rugbyColor.fg,',
    '        {!link && clubColor ? (\n'
    '          <span\n'
    '            className="inline-grid place-items-center rounded-full flex-shrink-0"\n'
    '            style={{\n'
    '              background: clubColor.bg,\n'
    '              color: clubColor.fg,',
    "rankings: circle uses clubColor (bg)",
)
patch(
    RANK,
    '            title={rugbyColor.known ? undefined : "Club colors pending"}',
    '            title={clubColor.known ? undefined : "Club colors pending"}',
    "rankings: circle title",
)

print("CHANGED:", changed)
print("SKIPPED:", skipped)
print("OK")
