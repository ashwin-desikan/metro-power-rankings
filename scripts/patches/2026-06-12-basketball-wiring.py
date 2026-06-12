#!/usr/bin/env python3
"""Wire International Basketball + EuroLeague into the site.

Run from the repo root: python scripts/patches/2026-06-12-basketball-wiring.py
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


# nav
patch(
    "app/DesktopNav.tsx",
    '  { href: "/teams/olympics", name: "Olympics", sport: "Olympics" },\n];',
    '  { href: "/teams/olympics", name: "Olympics", sport: "Olympics" },\n'
    '  { href: "/teams/basketball", name: "Int\'l Basketball", sport: "Basketball" },\n];',
    "DesktopNav: basketball",
)
patch(
    "app/MobileMenu.tsx",
    "  { href: '/teams/olympics', label: 'Olympics', hint: 'Every Summer and Winter Games since 1896: all-time medal table with lineages folded into modern nations', group: 'Sports' },",
    "  { href: '/teams/olympics', label: 'Olympics', hint: 'Every Summer and Winter Games since 1896: all-time medal table with lineages folded into modern nations', group: 'Sports' },\n"
    "  { href: '/teams/basketball', label: 'Int\\'l Basketball', hint: 'FIBA World Cup finals, every Olympic podium since 1936, and the EuroLeague club crown', group: 'Sports' },",
    "MobileMenu: basketball",
)

# sports page
OLY_CARD = (
    "  {\n"
    '    league: "OLY",\n'
    '    label: "Olympics",\n'
    '    sport: "Olympics",\n'
    '    status: "live",\n'
    '    page: "/teams/olympics",\n'
    "    team_count: 0,\n"
    "  },"
)
patch(
    "app/sports/page.tsx",
    OLY_CARD,
    OLY_CARD + "\n"
    "  {\n"
    '    league: "FIBA",\n'
    '    label: "International Basketball",\n'
    '    sport: "Basketball",\n'
    '    status: "live",\n'
    '    page: "/teams/basketball",\n'
    "    team_count: 0,\n"
    "  },",
    "sports page: basketball card",
)
patch(
    "app/sports/page.tsx",
    '"/teams/baseball", "/teams/olympics",',
    '"/teams/baseball", "/teams/olympics", "/teams/basketball",',
    "sports page: HUB_ORDER",
)

# status
patch(
    "lib/leagueStatus.tsx",
    '  "/teams/olympics":   { label: "Next: LA 2028", tone: "offseason" },',
    '  "/teams/olympics":   { label: "Next: LA 2028", tone: "offseason" },\n'
    '  "/teams/basketball": { label: "Next WC 2027", tone: "offseason" },',
    "leagueStatus: basketball",
)

# guard
patch(
    "scripts/check-client-imports.mjs",
    '  "@/lib/cricketClubs",\n];',
    '  "@/lib/cricketClubs",\n  "@/lib/basketball",\n];',
    "check-client-imports: basketball",
)

# metro EuroLeague chips
RANK = "app/rankings/[slug]/page.tsx"
patch(
    RANK,
    'import { getT20Honours } from "@/lib/cricketClubs";',
    'import { getT20Honours } from "@/lib/cricketClubs";\n'
    'import { getEuroleagueHonours } from "@/lib/basketball";',
    "rankings: euroleague import",
)
patch(
    RANK,
    '  const clubColor = rugbyColor ?? (cricketColor && cricketColor.known ? cricketColor : null);',
    '  const clubColor = rugbyColor ?? (cricketColor && cricketColor.known ? cricketColor : null);\n'
    '  const elHonours = sportLower.includes("basket")\n'
    '    ? getEuroleagueHonours(team.team)\n'
    '    : null;',
    "rankings: euroleague lookup",
)
patch(
    RANK,
    '      {t20Honours.length > 0 && (',
    '      {elHonours && (\n'
    '        <div className="flex gap-1.5 mb-1.5 flex-wrap">\n'
    '          <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide"\n'
    '                style={{ background: "rgba(212,175,55,0.16)", color: "#d4af37" }}\n'
    '                title={`EuroLeague: ${elHonours.years.join(", ")}`}>\n'
    '            {elHonours.titles}× EuroLeague\n'
    '          </span>\n'
    '        </div>\n'
    '      )}\n'
    '      {t20Honours.length > 0 && (',
    "rankings: euroleague chip",
)

# releases (keep 4-bullet cap: fold basketball into the first bullet)
patch(
    "lib/releases.ts",
    '      "New Olympics portal: every Summer and Winter Games since 1896 plus the 1906 Intercalated Games, an all-time medal table, and pages for 151 teams with lineages folded into modern nations.",\n'
    '      "New International Baseball portal: the complete World Baseball Classic, every edition, game and final from 2006 through Venezuela\'s 2026 title, with an all-time table and pages for all 23 nations.",',
    '      "Three new international portals: the Olympics (every Games since 1896, lineages folded into modern nations), the World Baseball Classic, and basketball with FIBA World Cup and Olympic podium history.",\n'
    '      "The EuroLeague joins as basketball\'s club crown: 69 seasons of champions, Final Four history, the all-time table, and gold title chips on metro cards.",',
    "releases: basketball bullets",
)

print("CHANGED:", changed)
print("SKIPPED:", skipped)
print("OK")
