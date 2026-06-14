#!/usr/bin/env python3
"""Idempotent, anchor-asserted patcher for the champion-banner nav feature.

Edits three existing files in place:
  1. lib/leagueStatus.tsx      - import CHAMPION_STATUS, add 'champion' tone,
                                 consult champion banners first in leagueStatusFor.
  2. scripts/run-workbook-sync.py - run emit-champion-status.py after the data builds.
  3. lib/releases.ts           - add the 2026-06-14 /updates entry.

Each replacement asserts its anchor appears exactly once; if the patched text is
already present the step is skipped, so re-running is safe. Run on the Windows
host from the repo root:  python scripts/_apply_champion_nav.py
"""
import os
from pathlib import Path

ROOT = Path(os.environ.get("CHAMPION_PATCH_ROOT", Path(__file__).resolve().parent.parent))


def patch(rel, anchor, replacement, present_marker):
    p = ROOT / rel
    txt = p.read_text(encoding="utf-8")
    if present_marker in txt:
        print(f"  = {rel}: already patched, skipping")
        return
    n = txt.count(anchor)
    assert n == 1, f"ANCHOR ERROR in {rel}: expected 1 match, found {n}. Aborting (no change written)."
    p.write_text(txt.replace(anchor, replacement), encoding="utf-8")
    print(f"  + {rel}: patched")


# ---- 1. lib/leagueStatus.tsx ----
patch(
    "lib/leagueStatus.tsx",
    'export type LeagueStatusTone = "regular" | "playoffs" | "worldcup" | "offseason";',
    'import { CHAMPION_STATUS } from "./championStatus.generated";\n\n'
    'export type LeagueStatusTone = "regular" | "playoffs" | "worldcup" | "champion" | "offseason";',
    'championStatus.generated',
)
patch(
    "lib/leagueStatus.tsx",
    'export function leagueStatusFor(page: string | null | undefined): LeagueStatus | null {\n'
    '  if (!page) return null;\n'
    '  if (page === "/teams/national") {',
    'export function leagueStatusFor(page: string | null | undefined): LeagueStatus | null {\n'
    '  if (!page) return null;\n'
    '  const champ = CHAMPION_STATUS[page];\n'
    '  if (champ) {\n'
    '    return Date.now() <= champ.until\n'
    '      ? { label: champ.label, tone: "champion" }\n'
    '      : { label: "Offseason", tone: "offseason" };\n'
    '  }\n'
    '  if (page === "/teams/national") {',
    'const champ = CHAMPION_STATUS[page];',
)
patch(
    "lib/leagueStatus.tsx",
    '  playoffs:  { bg: "rgba(245,158,11,0.16)", color: "#f59e0b" },',
    '  playoffs:  { bg: "rgba(245,158,11,0.16)", color: "#f59e0b" },\n'
    '  champion:  { bg: "rgba(212,175,55,0.18)", color: "#d4af37" },',
    'champion:  { bg: "rgba(212,175,55,0.18)"',
)

# ---- 2. scripts/run-workbook-sync.py ----
patch(
    "scripts/run-workbook-sync.py",
    '        Step("boundaries",    "13/15  refresh metro boundaries (cached)",',
    '        Step("champion-status", "12.7/15 emit champion banners (nav + sidebar)",\n'
    '             ["python3", str(SCRIPTS / "emit-champion-status.py")],\n'
    '             output_globs=["lib/championStatus.generated.ts"]),\n'
    '        Step("boundaries",    "13/15  refresh metro boundaries (cached)",',
    'emit-champion-status.py',
)

# ---- 3. lib/releases.ts ----
patch(
    "lib/releases.ts",
    'export const RELEASES: Release[] = [\n'
    '  {\n'
    '    date: "2026-06-12",',
    'export const RELEASES: Release[] = [\n'
    '  {\n'
    '    date: "2026-06-14",\n'
    '    headline: "Knicks crowned 2026 NBA champions",\n'
    '    items: [\n'
    '      "The New York Knicks are 2026 NBA champions, their third title and first since 1973; team pages, all-time tables and metro cards now reflect the crown.",\n'
    '      "The Sports menu and league sidebar show a gold Knicks - NBA Champions tag through June 22, then revert to offseason; the NHL gets the same once the Stanley Cup is awarded.",\n'
    '      "A-League clubs across Sydney, Melbourne and other Australian and New Zealand metros are promoted to major-team status.",\n'
    '      "Market capitalization data refreshed across hundreds of metros, updating economic ranks.",\n'
    '    ],\n'
    '  },\n'
    '  {\n'
    '    date: "2026-06-12",',
    'date: "2026-06-14"',
)

print("Done.")
