#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Expose champion tiers + award dates on /sports/champions, and reorder sport
families. Run NATIVELY on Windows from the repo root:
      python scripts/patch-champions-tiers.py
ATOMIC + idempotent: verifies every anchor before writing anything.
  1) lib/champions.ts            -> add dateAwarded + nextAwardedDate to the type
  2) app/sports/champions/page.tsx -> pass tier + dates into the table rows
  3) app/sports/champions/ChampionsTable.tsx -> sortable Tier column + full dates
  4) lib/sportsCatalog.ts        -> FAMILY_ORDER: Motorsport, Golf, Tennis under Football
"""
import os, io
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def path(*p): return os.path.join(ROOT, *p)
def read(fp):
    with io.open(fp, encoding="utf-8") as f: return f.read()
def repl(s, old, new, label):
    n = s.count(old)
    if n != 1: raise SystemExit(f"ABORT [{label}]: expected 1 anchor, found {n}. No files written.")
    return s.replace(old, new)
pending = {}

# 1) lib/champions.ts
fp = path("lib", "champions.ts"); s = read(fp)
if "dateAwarded" in s:
    print("skip champions.ts (already has dateAwarded)")
else:
    s = repl(s, "  year: number | null;\n  scope: string;",
                "  year: number | null;\n  dateAwarded: string | null;\n  scope: string;", "champions.ts year")
    s = repl(s, "  nextAwarded: number | null;\n  tier: number | null;\n};",
                "  nextAwarded: number | null;\n  nextAwardedDate: string | null;\n  tier: number | null;\n};", "champions.ts next")
    pending[fp] = s

# 2) app/sports/champions/page.tsx
fp = path("app", "sports", "champions", "page.tsx"); s = read(fp)
if "dateAwarded: c.dateAwarded" in s:
    print("skip page.tsx (already maps dates)")
else:
    s = repl(s,
        "      year: c.year,\n      nextAwarded: c.nextAwarded,\n      gold: c.gold,\n    }));",
        "      year: c.year,\n      dateAwarded: c.dateAwarded,\n      nextAwarded: c.nextAwarded,\n      nextAwardedDate: c.nextAwardedDate,\n      tier: c.tier,\n      gold: c.gold,\n    }));",
        "page.tsx mapping")
    pending[fp] = s

# 3) ChampionsTable.tsx
fp = path("app", "sports", "champions", "ChampionsTable.tsx"); s = read(fp)
if 'k="tier"' in s:
    print("skip ChampionsTable.tsx (already has Tier)")
else:
    s = repl(s, "  year: number | null;\n  nextAwarded: number | null;\n  gold: boolean;\n};",
                "  year: number | null;\n  dateAwarded: string | null;\n  nextAwarded: number | null;\n  nextAwardedDate: string | null;\n  tier: number | null;\n  gold: boolean;\n};", "ChampRow type")
    s = repl(s, 'type SortKey = "team" | "competition" | "scope" | "geo" | "year" | "next";',
                'type SortKey = "team" | "competition" | "scope" | "geo" | "year" | "next" | "tier";', "SortKey")
    s = repl(s,
        'function sportDisplay(s: string): string {\n  return s.replace(/^W /, "Women\'s ");\n}',
        'function sportDisplay(s: string): string {\n  return s.replace(/^W /, "Women\'s ");\n}\n\n'
        'const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];\n'
        'function fmtDate(iso: string | null): string {\n'
        '  if (!iso) return "";\n'
        '  const m = iso.match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);\n'
        '  if (!m) return iso;\n'
        '  return `${parseInt(m[3], 10)} ${MONTHS[parseInt(m[2], 10) - 1]} ${m[1]}`;\n'
        '}', "fmtDate helper")
    s = repl(s,
        '      if (sortKey === "year") {\n        cmp = (a.year ?? 0) - (b.year ?? 0);\n      } else if (sortKey === "next") {\n        cmp = (a.nextAwarded ?? 0) - (b.nextAwarded ?? 0);\n      } else if (sortKey === "geo") {',
        '      if (sortKey === "tier") {\n        cmp = (a.tier ?? 99) - (b.tier ?? 99);\n      } else if (sortKey === "year") {\n        cmp = (a.dateAwarded ?? "").localeCompare(b.dateAwarded ?? "") || (a.year ?? 0) - (b.year ?? 0);\n      } else if (sortKey === "next") {\n        cmp = (a.nextAwardedDate ?? "").localeCompare(b.nextAwardedDate ?? "") || (a.nextAwarded ?? 0) - (b.nextAwarded ?? 0);\n      } else if (sortKey === "geo") {',
        "sort cases")
    s = repl(s,
        '            <tr className="text-xs">\n              <Th label="Champion" k="team" />',
        '            <tr className="text-xs">\n              <Th label="Tier" k="tier" />\n              <Th label="Champion" k="team" />',
        "header Tier Th")
    s = repl(s,
        '              <tr key={`${c.team}-${c.competition}-${i}`} className="border-t" style={{ borderColor: "var(--border)" }}>\n                <td className="py-2 px-3 align-top">',
        '              <tr key={`${c.team}-${c.competition}-${i}`} className="border-t" style={{ borderColor: "var(--border)" }}>\n                <td className="py-2 px-3 align-top tabular-nums text-[var(--text-muted)]" style={mono}>{c.tier ?? ""}</td>\n                <td className="py-2 px-3 align-top">',
        "body Tier cell")
    s = repl(s, "                  {c.year ?? \"\"}\n", "                  {fmtDate(c.dateAwarded) || (c.year ?? \"\")}\n", "Since date cell")
    s = repl(s, "                  {c.nextAwarded ?? \"\"}\n", "                  {fmtDate(c.nextAwardedDate) || (c.nextAwarded ?? \"\")}\n", "Next date cell")
    pending[fp] = s

# 4) lib/sportsCatalog.ts FAMILY_ORDER reorder
fp = path("lib", "sportsCatalog.ts"); s = read(fp)
if '"Football",\n  "Motorsport",' in s:
    print("skip sportsCatalog.ts (FAMILY_ORDER already reordered)")
else:
    old = ('export const FAMILY_ORDER: SportFamily[] = [\n'
           '  "Olympics",\n  "Football",\n  "Gridiron",\n  "Basketball",\n  "Baseball",\n  "Hockey",\n'
           '  "Cricket",\n  "Rugby Union",\n  "Rugby League",\n  "Aussie Rules",\n  "Handball",\n  "Volleyball",\n'
           '  "Golf",\n  "Tennis",\n  "Motorsport",\n];')
    new = ('export const FAMILY_ORDER: SportFamily[] = [\n'
           '  "Olympics",\n  "Football",\n  "Motorsport",\n  "Golf",\n  "Tennis",\n  "Gridiron",\n  "Basketball",\n'
           '  "Baseball",\n  "Hockey",\n  "Cricket",\n  "Rugby Union",\n  "Rugby League",\n  "Aussie Rules",\n'
           '  "Handball",\n  "Volleyball",\n];')
    s = repl(s, old, new, "FAMILY_ORDER reorder")
    pending[fp] = s

for fp, content in pending.items():
    with io.open(fp, "w", encoding="utf-8", newline="\n") as f: f.write(content)
print("PATCH OK. Files changed:", [os.path.relpath(fp, ROOT).replace("\\","/") for fp in pending] or "none")
