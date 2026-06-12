#!/usr/bin/env python3
"""Move the WC2026 live-tables bullet into a new 2026-06-12 entry.

Yesterday's 2026-06-11 block shipped in 579f9f08a; restore it exactly as
published and give today's work its own dated entry (one entry per day rule).

Run from the repo root:  python scripts/patches/2026-06-12-releases-date-fix.py
"""
import io
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PATH = os.path.join(ROOT, "lib", "releases.ts")

CURRENT = '''  {
    date: "2026-06-11",
    headline: "National teams: football, cricket, rugby union",
    items: [
      "Every country page now has a National Teams section: men's football (federation, FIFA and ELO ranks, World Cup record, major trophies), women's World Cup history, and cricket and rugby union cards.",
      "New International Cricket portal: every men's international since 1877 for all 110 nations, with recomputed monthly ICC rankings, number-one reigns, major honours, and the named series trophies.",
      "New Rugby Union portal: test rugby since 1871, every Six Nations and Rugby Championship season, all ten World Cup finals, and weekly world rankings since 2003.",
      "World Cup 2026 group tables now update live from ESPN between deploys, joining the other live league tables; bracket projections still refresh daily.",
    ],
  },'''

REPLACEMENT = '''  {
    date: "2026-06-12",
    headline: "World Cup group tables go live",
    items: [
      "World Cup 2026 group tables now update live from ESPN between deploys, joining the other live league tables; bracket projections still refresh daily with the simulation.",
    ],
  },
  {
    date: "2026-06-11",
    headline: "National teams: football, cricket, rugby union",
    items: [
      "Every country page now has a National Teams section: a men's football card with federation, FIFA and ELO ranks, World Cup appearances and major trophies, plus a women's card with World Cup history.",
      "Cards link straight to each team's full tournament record, covering 230 men's national teams and all 44 Women's World Cup nations.",
      "New International Cricket portal: every men's international since 1877 for all 110 nations, with recomputed monthly ICC rankings, number-one reigns, major honours, and the named series trophies.",
      "New Rugby Union portal: test rugby since 1871, every Six Nations and Rugby Championship season, all ten World Cup finals, and weekly world rankings since 2003; both sports join the country-hub cards.",
    ],
  },'''

src = io.open(PATH, encoding="utf-8").read()
if REPLACEMENT in src:
    print("SKIPPED (already applied)")
else:
    n = src.count(CURRENT)
    assert n == 1, f"ANCHOR FAIL: expected 1 occurrence, found {n}"
    io.open(PATH, "w", encoding="utf-8", newline="").write(src.replace(CURRENT, REPLACEMENT))
    print("OK: 2026-06-12 entry added, 2026-06-11 restored to shipped form")
