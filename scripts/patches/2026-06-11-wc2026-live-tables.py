#!/usr/bin/env python3
"""Wire live ESPN standings into the WC2026 group tables.

Anchor-asserted, idempotent. Touches:
  lib/international.ts                    (bundle gains optional live flag)
  app/teams/national/page.tsx             (async page, fetch + merge live standings)
  app/teams/national/WorldCup2026.tsx     (caption reflects the live source)
  scripts/check-client-imports.mjs        (register @/lib/wc2026Standings)
  lib/releases.ts                         (amend 2026-06-11 entry within 4-bullet cap)

Run from the repo root:  python scripts/patches/2026-06-11-wc2026-live-tables.py
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


# ---------------- 1. bundle type ----------------
patch(
    "lib/international.ts",
    "  knockout: Record<string, WorldCup2026KnockoutMatch[]>;\n  sim?: WorldCup2026Sim | null;\n};",
    "  knockout: Record<string, WorldCup2026KnockoutMatch[]>;\n  sim?: WorldCup2026Sim | null;\n"
    "  // Set server-side when ESPN live group standings were merged over the\n"
    "  // workbook rows (lib/wc2026Standings.ts).\n"
    "  live?: { source: \"espn\" } | null;\n};",
    "international.ts: bundle live flag",
)

# ---------------- 2. page.tsx ----------------
patch(
    "app/teams/national/page.tsx",
    'import { getAllCountrySlugs } from "@/lib/countries";',
    'import { getAllCountrySlugs } from "@/lib/countries";\n'
    'import { getWc2026LiveStandings, mergeWc2026Live } from "@/lib/wc2026Standings";',
    "page: import wc2026Standings",
)
patch(
    "app/teams/national/page.tsx",
    "export default function NationalIndexPage() {",
    "export default async function NationalIndexPage() {",
    "page: async component",
)
patch(
    "app/teams/national/page.tsx",
    "  const wc2026 = getWorldCup2026();",
    "  const wc2026 = getWorldCup2026();\n"
    "  const wc2026Live = wc2026 ? await getWc2026LiveStandings() : null;",
    "page: fetch live standings",
)
patch(
    "app/teams/national/page.tsx",
    "{wc2026 && <WorldCup2026 wc={wc2026} />}",
    "{wc2026 && <WorldCup2026 wc={mergeWc2026Live(wc2026, wc2026Live)} />}",
    "page: merge live into bundle",
)

# ---------------- 3. WorldCup2026 caption ----------------
patch(
    "app/teams/national/WorldCup2026.tsx",
    '    : "Live standings from workbook. Refreshes on next deploy.";',
    '    : wc.live\n'
    '      ? "Live group standings via ESPN\'s public feed, refreshed every half hour. '
    'Projections update with the daily simulation."\n'
    '      : "Live standings from workbook. Refreshes on next deploy.";',
    "WorldCup2026: live caption",
)

# ---------------- 4. client-import guard ----------------
patch(
    "scripts/check-client-imports.mjs",
    '  "@/lib/rugbyUnion",\n];',
    '  "@/lib/rugbyUnion",\n  "@/lib/wc2026Standings",\n];',
    "check-client-imports: register wc2026Standings",
)

# ---------------- 5. releases (amend, keep 4-bullet cap) ----------------
OLD_ITEMS = '''    items: [
      "Every country page now has a National Teams section: a men's football card with federation, FIFA and ELO ranks, World Cup appearances and major trophies, plus a women's card with World Cup history.",
      "Cards link straight to each team's full tournament record, covering 230 men's national teams and all 44 Women's World Cup nations.",
      "New International Cricket portal: every men's international since 1877 for all 110 nations, with recomputed monthly ICC rankings, number-one reigns, major honours, and the named series trophies.",
      "New Rugby Union portal: test rugby since 1871, every Six Nations and Rugby Championship season, all ten World Cup finals, and weekly world rankings since 2003; both sports join the country-hub cards.",
    ],'''
NEW_ITEMS = '''    items: [
      "Every country page now has a National Teams section: men's football (federation, FIFA and ELO ranks, World Cup record, major trophies), women's World Cup history, and cricket and rugby union cards.",
      "New International Cricket portal: every men's international since 1877 for all 110 nations, with recomputed monthly ICC rankings, number-one reigns, major honours, and the named series trophies.",
      "New Rugby Union portal: test rugby since 1871, every Six Nations and Rugby Championship season, all ten World Cup finals, and weekly world rankings since 2003.",
      "World Cup 2026 group tables now update live from ESPN between deploys, joining the other live league tables; bracket projections still refresh daily.",
    ],'''
patch("lib/releases.ts", OLD_ITEMS, NEW_ITEMS, "releases: WC live tables bullet")

print("CHANGED:")
for c in changed:
    print("  +", c)
if skipped:
    print("SKIPPED:")
    for s in skipped:
        print("  =", s)
print("OK" if changed or skipped else "NO-OP")
