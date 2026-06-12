#!/usr/bin/env python3
"""Wire the Olympics portal into the site.

Anchor-asserted, idempotent. Touches DesktopNav, MobileMenu, sports page,
leagueStatus, sportLabels (icon), check-client-imports, and the 2026-06-12
release entry.

Run from the repo root:  python scripts/patches/2026-06-12-olympics-wiring.py
"""
import io
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
changed, skipped = [], []


def read(path):
    with io.open(os.path.join(ROOT, path), "r", encoding="utf-8") as f:
        return f.read()


def write(path, content):
    with io.open(os.path.join(ROOT, path), "w", encoding="utf-8", newline="") as f:
        f.write(content)


def patch(path, old, new, label):
    src = read(path)
    if new in src:
        skipped.append(label + " (already applied)")
        return
    n = src.count(old)
    assert n == 1, f"ANCHOR FAIL [{label}] in {path}: expected 1 occurrence, found {n}"
    write(path, src.replace(old, new))
    changed.append(label)


# ---------------- DesktopNav ----------------
patch(
    "app/DesktopNav.tsx",
    '  { href: "/teams/baseball", name: "Baseball", sport: "Baseball" },\n];',
    '  { href: "/teams/baseball", name: "Baseball", sport: "Baseball" },\n'
    '  { href: "/teams/olympics", name: "Olympics", sport: "Olympics" },\n];',
    "DesktopNav: Olympics entry",
)
patch(
    "app/DesktopNav.tsx",
    "IPL &middot; AFL &middot; NRL &middot; CFL &middot; Cricket &middot; Rugby &middot; Baseball</span>",
    "IPL &middot; AFL &middot; NRL &middot; CFL &middot; Cricket &middot; Rugby &middot; Baseball &middot; Olympics</span>",
    "DesktopNav: subtitle",
)

# ---------------- MobileMenu ----------------
patch(
    "app/MobileMenu.tsx",
    "  { href: '/teams/baseball', label: 'Baseball', hint: 'The complete World Baseball Classic: every edition, game and final since 2006, all 23 nations', group: 'Sports' },",
    "  { href: '/teams/baseball', label: 'Baseball', hint: 'The complete World Baseball Classic: every edition, game and final since 2006, all 23 nations', group: 'Sports' },\n"
    "  { href: '/teams/olympics', label: 'Olympics', hint: 'Every Summer and Winter Games since 1896: all-time medal table with lineages folded into modern nations', group: 'Sports' },",
    "MobileMenu: Olympics entry",
)

# ---------------- sports page ----------------
WBC_CARD = (
    "  {\n"
    '    league: "WBC",\n'
    '    label: "International Baseball",\n'
    '    sport: "Baseball",\n'
    '    status: "live",\n'
    '    page: "/teams/baseball",\n'
    "    team_count: 0,\n"
    "  },"
)
patch(
    "app/sports/page.tsx",
    WBC_CARD,
    WBC_CARD + "\n"
    "  {\n"
    '    league: "OLY",\n'
    '    label: "Olympics",\n'
    '    sport: "Olympics",\n'
    '    status: "live",\n'
    '    page: "/teams/olympics",\n'
    "    team_count: 0,\n"
    "  },",
    "sports page: Olympics card",
)
patch(
    "app/sports/page.tsx",
    '    "/teams/cricket", "/teams/rugby-union", "/teams/baseball",',
    '    "/teams/cricket", "/teams/rugby-union", "/teams/baseball", "/teams/olympics",',
    "sports page: HUB_ORDER",
)

# ---------------- leagueStatus ----------------
patch(
    "lib/leagueStatus.tsx",
    '  "/teams/baseball":   { label: "Next WBC 2029", tone: "offseason" },',
    '  "/teams/baseball":   { label: "Next WBC 2029", tone: "offseason" },\n'
    '  "/teams/olympics":   { label: "Next: LA 2028", tone: "offseason" },',
    "leagueStatus: Olympics tag",
)

# ---------------- sport icon ----------------
patch(
    "lib/sportLabels.ts",
    '  "Gymnastics": "🤸", "Water Polo": "🤽",',
    '  "Gymnastics": "🤸", "Water Polo": "🤽", "Olympics": "🏅",',
    "sportLabels: Olympics icon",
)

# ---------------- client-import guard ----------------
patch(
    "scripts/check-client-imports.mjs",
    '  "@/lib/baseball",\n];',
    '  "@/lib/baseball",\n  "@/lib/olympics",\n];',
    "check-client-imports: register olympics",
)

# ---------------- releases (amend 2026-06-12, keep 4-bullet cap) ----------------
patch(
    "lib/releases.ts",
    '''    headline: "Baseball arrives; World Cup tables go live",
    items: [
      "New International Baseball portal: the complete World Baseball Classic, every edition, game and final from 2006 through Venezuela's 2026 title, with an all-time table and pages for all 23 nations.",
      "World Cup 2026 group tables now update live from ESPN between deploys, joining the other live league tables; bracket projections still refresh daily with the simulation.",
      "Cricket rankings now carry the Citizen of Nowhere name, with a methodology note owning exactly where our recomputed tables differ from the official ones.",
      "Country pages now lead with National Teams: sport icons, gold title chips, flags, and two-way links between every national team, its country, and its sport hub.",
    ],''',
    '''    headline: "Baseball and the Olympics arrive",
    items: [
      "New Olympics portal: every Summer and Winter Games since 1896 plus the 1906 Intercalated Games, an all-time medal table, and pages for 151 teams with lineages folded into modern nations.",
      "New International Baseball portal: the complete World Baseball Classic, every edition, game and final from 2006 through Venezuela's 2026 title, with an all-time table and pages for all 23 nations.",
      "World Cup 2026 group tables now update live from ESPN between deploys, and cricket rankings now carry the Citizen of Nowhere name with a methodology note owning their differences.",
      "Country pages now lead with National Teams: sport icons, gold title chips, flags, and two-way links between every national team, its country, and its sport hub.",
    ],''',
    "releases: 2026-06-12 amended with Olympics",
)

print("CHANGED:")
for c in changed:
    print("  +", c)
if skipped:
    print("SKIPPED:")
    for s in skipped:
        print("  =", s)
print("OK" if changed or skipped else "NO-OP")
