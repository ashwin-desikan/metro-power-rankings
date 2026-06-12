#!/usr/bin/env python3
"""Metro TeamCard: T20 title chips + rugby brand-color monogram circles.

Run from the repo root: python scripts/patches/2026-06-12-t20-chips-rugby-colors.py
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

# 1. imports
patch(
    RANK,
    'import { getRugbyClubHonours } from "@/lib/rugbyClubs";',
    'import { getRugbyClubHonours } from "@/lib/rugbyClubs";\n'
    'import { getT20Honours } from "@/lib/cricketClubs";\n'
    'import { rugbyClubColor, rugbyMonogram } from "@/lib/rugby-colors";',
    "rankings: imports",
)

# 2. lookups (extend the rugby block)
patch(
    RANK,
    '  const sportLower = (team.sport || "").toLowerCase();\n'
    '  const rugbyHonours = sportLower.includes("rugby") && !sportLower.includes("league")\n'
    '    ? getRugbyClubHonours(team.team, team.league)\n'
    '    : [];',
    '  const sportLower = (team.sport || "").toLowerCase();\n'
    '  const isRugbyUnionClub = sportLower.includes("rugby") && !sportLower.includes("league");\n'
    '  const rugbyHonours = isRugbyUnionClub\n'
    '    ? getRugbyClubHonours(team.team, team.league)\n'
    '    : [];\n'
    '  const t20Honours = sportLower.includes("cricket")\n'
    '    ? getT20Honours(team.team)\n'
    '    : [];\n'
    '  const rugbyColor = isRugbyUnionClub ? rugbyClubColor(team.team) : null;',
    "rankings: t20 + color lookups",
)

# 3. T20 chips after the rugby chips block
patch(
    RANK,
    '      {rugbyHonours.length > 0 && (\n'
    '        <div className="flex gap-1.5 mb-1.5 flex-wrap">\n'
    '          {rugbyHonours.slice(0, 3).map((h) => (',
    '      {t20Honours.length > 0 && (\n'
    '        <div className="flex gap-1.5 mb-1.5 flex-wrap">\n'
    '          {t20Honours.slice(0, 2).map((h) => (\n'
    '            <span key={h.league} className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide"\n'
    '                  style={{ background: "rgba(212,175,55,0.16)", color: "#d4af37" }}\n'
    '                  title={`${h.league}: ${h.years.join(", ")}`}>\n'
    '              {h.titles}× {h.league} title{h.titles === 1 ? "" : "s"}\n'
    '            </span>\n'
    '          ))}\n'
    '        </div>\n'
    '      )}\n'
    '      {rugbyHonours.length > 0 && (\n'
    '        <div className="flex gap-1.5 mb-1.5 flex-wrap">\n'
    '          {rugbyHonours.slice(0, 3).map((h) => (',
    "rankings: t20 chips",
)

# 4. rugby monogram circle: render when no teamLinks entry exists
patch(
    RANK,
    '      <div className="flex items-center gap-2.5">\n'
    '        {link ? (',
    '      <div className="flex items-center gap-2.5">\n'
    '        {!link && rugbyColor ? (\n'
    '          <span\n'
    '            className="inline-grid place-items-center rounded-full flex-shrink-0"\n'
    '            style={{\n'
    '              background: rugbyColor.bg,\n'
    '              color: rugbyColor.fg,\n'
    '              width: 28, height: 28, fontSize: 10, fontWeight: 700, letterSpacing: "-0.02em",\n'
    '            }}\n'
    '            title={rugbyColor.known ? undefined : "Club colors pending"}\n'
    '            aria-hidden\n'
    '          >\n'
    '            {rugbyMonogram(team.team)}\n'
    '          </span>\n'
    '        ) : null}\n'
    '        {link ? (',
    "rankings: rugby color circle",
)

# 5. guard registration
patch(
    "scripts/check-client-imports.mjs",
    '  "@/lib/rugbyClubs",\n];',
    '  "@/lib/rugbyClubs",\n  "@/lib/cricketClubs",\n];',
    "check-client-imports: cricketClubs",
)

# 6. release bullet (amend the club-rugby line to cover T20)
patch(
    "lib/releases.ts",
    '      "Club rugby joins the Rugby Union hub: winners-only rolls for the Champions Cup, Top 14, Premiership, Super Rugby, Currie Cup, URC, and Japan\'s League One, with gold title chips on metro team cards.",',
    '      "Domestic honours arrive for club rugby and franchise T20 cricket: winners-only hubs for 7 rugby and 11 T20 competitions, gold title chips and club colors on metro cards, and defunct clubs on their metros.",',
    "releases: domestic honours bullet",
)

print("CHANGED:", changed)
print("SKIPPED:", skipped)
print("OK")
