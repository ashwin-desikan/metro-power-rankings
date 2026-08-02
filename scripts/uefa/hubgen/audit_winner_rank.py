#!/usr/bin/env python3
"""Audit: where does the actual European Cup / Champions League winner rank in
each season hub's club power ranking? Read-only; prints one line per hub plus a
summary. Used to tune TOP_TROPHY_BONUS / PED_WEIGHT (see gen_hub_early.py).

Run from repo root: python scripts/uefa/hubgen/audit_winner_rank.py
"""
import glob
import io
import json
import os
import sys

ROOT = os.getcwd()
NOT1 = []
ROWS = []
for f in sorted(glob.glob(os.path.join(ROOT, "public", "data", "football", "hub-*.json"))):
    d = json.load(io.open(f, encoding="utf-8"))
    season = d.get("season", os.path.basename(f))
    clubs = d.get("clubs") or []
    if not clubs:
        ROWS.append((season, None, None, None, "no clubs (live hub)"))
        continue
    winner = None
    for comp in d.get("continental") or []:
        if comp.get("section") == "ucl":
            for e in comp.get("entries") or []:
                if e.get("trophy"):
                    winner = e.get("name")
    if not winner:
        ROWS.append((season, None, None, None, "no UCL winner entry"))
        continue
    by_name = {c["name"]: c for c in clubs}
    w = by_name.get(winner)
    top = clubs[0] if clubs and clubs[0].get("rank") == 1 else min(clubs, key=lambda c: c.get("rank", 999))
    if w is None:
        ROWS.append((season, winner, None, top["name"], "WINNER NOT IN CLUB LIST"))
        continue
    gap = round(top["score"] - w["score"], 4)
    ROWS.append((season, winner, w.get("rank"), top["name"], gap))
    if w.get("rank") != 1:
        NOT1.append((season, winner, w.get("rank"), top["name"], gap, w.get("score"), top.get("score")))

for r in ROWS:
    print("%-9s winner=%-28s rank=%-4s top=%-28s gap=%s" % (r[0], r[1], r[2], r[3], r[4]))
print()
print("hubs with a ranked winner:", sum(1 for r in ROWS if r[2]))
print("winner NOT #1 in %d hubs:" % len(NOT1))
for s, w, rk, top, gap, ws, ts in NOT1:
    print("  %-9s %-28s rank=%-3s behind %-28s by %.4f" % (s, w, rk, top, gap))
if "--fail-if-any" in sys.argv and NOT1:
    sys.exit(1)
