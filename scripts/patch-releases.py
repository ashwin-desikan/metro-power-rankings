#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Consolidate the 2026-06-21 /updates block to cover the full day's ship
(Domestic Leagues, F1 hub, champions tier/date/gold, UI polish) within the
4-bullet brevity validator. Run on Windows:  python scripts/patch-releases.py
ATOMIC + idempotent.
"""
import os, io
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
fp = os.path.join(ROOT, "lib", "releases.ts")
s = io.open(fp, encoding="utf-8").read()
if "champions tiers, and UI polish" in s:
    print("skip releases.ts (already consolidated)")
else:
    old = (
'    headline: "Domestic Leagues Worldwide, a Formula 1 hub, and card upgrades",\n'
'    items: [\n'
'      "New Domestic Leagues Worldwide hub: every club that has ever played a tracked first division across 76 countries, with titles, cups and continental pedigree split by country era, and links to club pages.",\n'
'      "Metro team cards add football-club honours, defunct NASL clubs, NFL/NBA/NHL title and finals appearances, college bowl-game and tournament counts, and co-equal top teams now lead their metro.",\n'
'      "New Formula 1 hub: live drivers\' and constructors\' standings, every World Champion since 1950, all-time win leaders, per-circuit race history, and a host-metro table linking each Grand Prix to its city.",\n'
'      "World Cup group tables now apply FIFA\'s 2026 head-to-head tiebreaker; the Zone Zero Cup adds a Netball World Cup pillar and reweights Great Britain football and Athletics.",\n'
'    ],'
    )
    new = (
'    headline: "Domestic Leagues and F1 hubs, champions tiers, and UI polish",\n'
'    items: [\n'
'      "New Domestic Leagues Worldwide hub: every club to play a tracked first division across 76 countries (all UEFA associations plus selected leagues elsewhere), with titles, cups and continental pedigree.",\n'
'      "New Formula 1 hub: live drivers\' and constructors\' standings, every World Champion since 1950, all-time wins, per-circuit history, and host-metro links from every Grand Prix card.",\n'
'      "The Current Champions board adds a sortable tier column and full award dates, and fixes the Gold Standard badges and regions for MLB, F1, golf, tennis and the Olympics.",\n'
'      "Plus richer metro team cards, a home-search reset, a streamlined mobile sports menu with reordered families, and a World Cup head-to-head tiebreaker.",\n'
'    ],'
    )
    if s.count(old) != 1:
        raise SystemExit(f"ABORT: expected 1 anchor, found {s.count(old)}. No write.")
    s = s.replace(old, new)
    io.open(fp, "w", encoding="utf-8", newline="\n").write(s)
    print("PATCH OK: 2026-06-21 release block consolidated")
