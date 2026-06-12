#!/usr/bin/env python3
"""Wire the International Baseball (WBC) portal into the site.

Anchor-asserted, idempotent. Touches DesktopNav, MobileMenu, sports page,
leagueStatus, check-client-imports, and the 2026-06-12 release entry.

Run from the repo root:  python scripts/patches/2026-06-12-baseball-wiring.py
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
    '  { href: "/teams/rugby-union", name: "Rugby Union", sport: "Rugby Union" },\n];',
    '  { href: "/teams/rugby-union", name: "Rugby Union", sport: "Rugby Union" },\n'
    '  { href: "/teams/baseball", name: "Baseball", sport: "Baseball" },\n];',
    "DesktopNav: Baseball entry",
)
patch(
    "app/DesktopNav.tsx",
    "IPL &middot; AFL &middot; NRL &middot; CFL &middot; Cricket &middot; Rugby</span>",
    "IPL &middot; AFL &middot; NRL &middot; CFL &middot; Cricket &middot; Rugby &middot; Baseball</span>",
    "DesktopNav: subtitle",
)

# ---------------- MobileMenu ----------------
patch(
    "app/MobileMenu.tsx",
    "  { href: '/teams/rugby-union', label: 'Rugby Union', hint: 'Test rugby since 1871: Six Nations, Rugby Championship, World Cup finals, and world rankings since 2003', group: 'Sports' },",
    "  { href: '/teams/rugby-union', label: 'Rugby Union', hint: 'Test rugby since 1871: Six Nations, Rugby Championship, World Cup finals, and world rankings since 2003', group: 'Sports' },\n"
    "  { href: '/teams/baseball', label: 'Baseball', hint: 'The complete World Baseball Classic: every edition, game and final since 2006, all 23 nations', group: 'Sports' },",
    "MobileMenu: Baseball entry",
)

# ---------------- sports page ----------------
RUGBY_CARD = (
    "  {\n"
    '    league: "RUGBY",\n'
    '    label: "Rugby Union",\n'
    '    sport: "Rugby Union",\n'
    '    status: "live",\n'
    '    page: "/teams/rugby-union",\n'
    "    team_count: 0,\n"
    "  },"
)
patch(
    "app/sports/page.tsx",
    RUGBY_CARD,
    RUGBY_CARD + "\n"
    "  {\n"
    '    league: "WBC",\n'
    '    label: "International Baseball",\n'
    '    sport: "Baseball",\n'
    '    status: "live",\n'
    '    page: "/teams/baseball",\n'
    "    team_count: 0,\n"
    "  },",
    "sports page: Baseball card",
)
patch(
    "app/sports/page.tsx",
    '    "/teams/cricket", "/teams/rugby-union",',
    '    "/teams/cricket", "/teams/rugby-union", "/teams/baseball",',
    "sports page: HUB_ORDER",
)

# ---------------- leagueStatus ----------------
patch(
    "lib/leagueStatus.tsx",
    '  "/teams/rugby-union": { label: "July tests ahead", tone: "offseason" },',
    '  "/teams/rugby-union": { label: "July tests ahead", tone: "offseason" },\n'
    '  "/teams/baseball":   { label: "Next WBC 2029", tone: "offseason" },',
    "leagueStatus: baseball tag",
)

# ---------------- client-import guard ----------------
patch(
    "scripts/check-client-imports.mjs",
    '  "@/lib/wc2026Standings",\n];',
    '  "@/lib/wc2026Standings",\n  "@/lib/baseball",\n];',
    "check-client-imports: register baseball",
)

# ---------------- releases (amend 2026-06-12) ----------------
patch(
    "lib/releases.ts",
    '''  {
    date: "2026-06-12",
    headline: "World Cup group tables go live",
    items: [
      "World Cup 2026 group tables now update live from ESPN between deploys, joining the other live league tables; bracket projections still refresh daily with the simulation.",
    ],
  },''',
    '''  {
    date: "2026-06-12",
    headline: "Baseball arrives; World Cup tables go live",
    items: [
      "New International Baseball portal: the complete World Baseball Classic, every edition, game and final from 2006 through Venezuela's 2026 title, with an all-time table and pages for all 23 nations.",
      "World Cup 2026 group tables now update live from ESPN between deploys, joining the other live league tables; bracket projections still refresh daily with the simulation.",
      "Cricket rankings now carry the Citizen of Nowhere name, with a methodology note owning exactly where our recomputed tables differ from the official ones.",
      "Country pages now lead with National Teams: sport icons, gold title chips, flags, and two-way links between every national team, its country, and its sport hub.",
    ],
  },''',
    "releases: 2026-06-12 amended",
)

print("CHANGED:")
for c in changed:
    print("  +", c)
if skipped:
    print("SKIPPED:")
    for s in skipped:
        print("  =", s)
print("OK" if changed or skipped else "NO-OP")
