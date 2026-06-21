#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""State coverage scope on the Domestic Leagues Worldwide page. Run on Windows:
      python scripts/patch-domestic-coverage.py
ATOMIC + idempotent. Edits app/teams/football/domestic/page.tsx: metadata
description + visible header paragraph to say we cover every UEFA association in
full plus selected leagues from the other confederations.
"""
import os, io
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
fp = os.path.join(ROOT, "app", "teams", "football", "domestic", "page.tsx")
s = io.open(fp, encoding="utf-8").read()
if "every UEFA association" in s:
    print("skip page.tsx (coverage note already present)")
else:
    def repl(old, new, label):
        global s
        if s.count(old) != 1:
            raise SystemExit(f"ABORT [{label}]: expected 1 anchor, found {s.count(old)}. No write.")
        s = s.replace(old, new)
    # 1) metadata description
    repl(
        '    "Every club that has ever played a tracked first division, marquee leagues and the long tail: " +\n'
        '    "league titles, domestic cups, and continental and Champions League pedigree, split by country " +\n'
        '    "era, across 76 countries in one sortable, filterable master table.",',
        '    "Every club that has ever played a tracked first division: every UEFA association in full, plus " +\n'
        '    "selected leagues from the other confederations (CONMEBOL, CONCACAF, AFC, CAF, OFC). League titles, " +\n'
        '    "domestic cups, and continental and Champions League pedigree, split by country era, in one " +\n'
        '    "sortable, filterable master table.",',
        "metadata description")
    # 2) visible header paragraph
    repl(
        "continental and Champions League pedigree, plus home metro. Honours are split by country era,",
        "continental and Champions League pedigree, plus home metro. Coverage includes every UEFA association "
        "in full, plus selected leagues from the other confederations (CONMEBOL, CONCACAF, AFC, CAF, OFC). "
        "Honours are split by country era,",
        "header paragraph")
    io.open(fp, "w", encoding="utf-8", newline="\n").write(s)
    print("PATCH OK: domestic coverage note added")
