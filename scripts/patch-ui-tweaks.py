#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Two UI tweaks. Run NATIVELY on Windows from repo root:
      python scripts/patch-ui-tweaks.py
ATOMIC + idempotent.
  1) app/RankingsTable.tsx -> Reset button beside the rankings search bar
  2) app/MobileMenu.tsx    -> mobile Sports dropdown mirrors desktop (MARQUEE_HUBS,
                              compact, no long hints); both read MARQUEE_HUBS to stay in sync
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

# 1) RankingsTable: Reset button
fp = path("app", "RankingsTable.tsx"); s = read(fp)
if "Reset search" in s:
    print("skip RankingsTable.tsx (already has Reset)")
else:
    old = ("                </kbd>\n"
           "              )}\n"
           "            </div>\n"
           "          </div>")
    new = ("                </kbd>\n"
           "              )}\n"
           "            </div>\n"
           "            <button\n"
           "              type=\"button\"\n"
           "              onClick={() => { setSearchTerm(''); setSearchScope('all'); searchInputRef.current?.focus(); }}\n"
           "              disabled={!searchTerm && searchScope === 'all'}\n"
           "              className=\"px-4 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-[var(--text)] enabled:hover:border-[var(--accent)] enabled:hover:text-[var(--accent)] disabled:opacity-40 disabled:cursor-default transition-colors\"\n"
           "              aria-label=\"Reset search\"\n"
           "            >\n"
           "              Reset\n"
           "            </button>\n"
           "          </div>")
    s = repl(s, old, new, "RankingsTable reset button")
    pending[fp] = s

# 2) MobileMenu: mirror desktop Sports dropdown
fp = path("app", "MobileMenu.tsx"); s = read(fp)
if "MARQUEE_HUBS" in s:
    print("skip MobileMenu.tsx (already mirrors desktop)")
else:
    s = repl(s, "import { SPORTS_CATALOG, FAMILY_ORDER } from '@/lib/sportsCatalog';",
                "import { MARQUEE_HUBS } from '@/lib/sportsCatalog';", "MobileMenu import")
    old = ("const SPORTS_ITEMS: Item[] = [\n"
           "  { href: '/sports', label: 'Zone Zero Sports Hub', hint: \"Citizen of Nowhere's sports club: every top-flight team on one filterable map\", group: 'Sports' },\n"
           "  ...FAMILY_ORDER.flatMap((fam) =>\n"
           "    SPORTS_CATALOG.filter((e) => e.family === fam && e.status !== 'coming' && !e.subRoll).map((e) => ({\n"
           "      href: e.href,\n"
           "      label: e.label,\n"
           "      hint: e.hint,\n"
           "      group: 'Sports',\n"
           "    })),\n"
           "  ),\n"
           "];")
    new = ("const SPORTS_ITEMS: Item[] = [\n"
           "  { href: '/sports', label: 'Zone Zero Sports Hub', group: 'Sports' },\n"
           "  // Marquee hubs only, mirroring the desktop Sports dropdown (DesktopNav).\n"
           "  // Both surfaces read MARQUEE_HUBS so they stay in sync; sport shown as a\n"
           "  // short sub-label instead of the long hint. Full directory lives at /sports.\n"
           "  ...MARQUEE_HUBS.map((e) => ({\n"
           "    href: e.href,\n"
           "    label: e.label,\n"
           "    hint: e.sport,\n"
           "    group: 'Sports',\n"
           "  })),\n"
           "  { href: '/sports#league-directory', label: 'Browse all leagues \\u2192', group: 'Sports' },\n"
           "];")
    s = repl(s, old, new, "MobileMenu SPORTS_ITEMS")
    pending[fp] = s

for fp, content in pending.items():
    with io.open(fp, "w", encoding="utf-8", newline="\n") as f: f.write(content)
print("PATCH OK. Files changed:", [os.path.relpath(fp, ROOT).replace("\\","/") for fp in pending] or "none")
