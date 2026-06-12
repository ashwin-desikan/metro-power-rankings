#!/usr/bin/env python3
"""Wire club rugby honours into metro team cards + guards + release note.

Run from the repo root: python scripts/patches/2026-06-12-club-rugby-wiring.py
"""
import io
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
changed, skipped = [], []


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


RANK = "app/rankings/[slug]/page.tsx"

# 1. import
patch(
    RANK,
    'import { normalizeSport, sportIcon, leagueIcon } from "@/lib/sportLabels";',
    'import { normalizeSport, sportIcon, leagueIcon } from "@/lib/sportLabels";\n'
    'import { getRugbyClubHonours } from "@/lib/rugbyClubs";',
    "rankings: import rugbyClubs",
)

# 2. lookup const before TeamCard's return
patch(
    RANK,
    '  const isGold = (team.gold === true || isGoldStandardLeague(team.sport, team.league)) &&\n'
    '    (!isFootball || team.level === "1");',
    '  const isGold = (team.gold === true || isGoldStandardLeague(team.sport, team.league)) &&\n'
    '    (!isFootball || team.level === "1");\n\n'
    '  // Club rugby honours (winners-only layer): gold title chips per competition.\n'
    '  const sportLower = (team.sport || "").toLowerCase();\n'
    '  const rugbyHonours = sportLower.includes("rugby") && !sportLower.includes("league")\n'
    '    ? getRugbyClubHonours(team.team, team.league)\n'
    '    : [];',
    "rankings: honours lookup",
)

# 3. chips row after the sport/league header line
patch(
    RANK,
    'aria-label="Top Team">👑</span>}\n      </p>',
    'aria-label="Top Team">👑</span>}\n      </p>\n'
    '      {rugbyHonours.length > 0 && (\n'
    '        <div className="flex gap-1.5 mb-1.5 flex-wrap">\n'
    '          {rugbyHonours.slice(0, 3).map((h) => (\n'
    '            <span key={h.comp} className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide"\n'
    '                  style={{ background: "rgba(212,175,55,0.16)", color: "#d4af37" }}\n'
    '                  title={`${h.comp}: ${h.years.join(", ")}`}>\n'
    '              {h.titles}× {h.comp}\n'
    '            </span>\n'
    '          ))}\n'
    '        </div>\n'
    '      )}',
    "rankings: honours chips",
)

# 4. server-only guard
patch(
    "scripts/check-client-imports.mjs",
    '  "@/lib/olympics",\n];',
    '  "@/lib/olympics",\n  "@/lib/rugbyClubs",\n];',
    "check-client-imports: rugbyClubs",
)

# 5. release note (keep 4-bullet cap)
patch(
    "lib/releases.ts",
    '''      "World Cup 2026 group tables now update live from ESPN between deploys, and cricket rankings now carry the Citizen of Nowhere name with a methodology note owning their differences.",
      "Country pages now lead with National Teams: sport icons, gold title chips, flags, and two-way links between every national team, its country, and its sport hub.",''',
    '''      "Club rugby joins the Rugby Union hub: winners-only rolls for the Champions Cup, Top 14, Premiership, Super Rugby, Currie Cup, URC, and Japan's League One, with gold title chips on metro team cards.",
      "World Cup 2026 group tables now update live from ESPN, cricket rankings carry the Citizen of Nowhere name, and country pages lead with National Teams cards linking countries, teams, and sport hubs.",''',
    "releases: club rugby bullet",
)

print("CHANGED:", changed)
print("SKIPPED:", skipped)
print("OK")
