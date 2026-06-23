#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""apply.py (2026-06-23) - NBA Greatest Games: use the arena name AT THE TIME of
the game (arena_as_of), not the canonical/current name.

Root cause: read_top_games() put arena_as_of on the per-team rows but only
arena_canonical on the league-wide (all-time/decade) rows, so the hub all-time
view and the Greatest Games page had no as-of name to show and fell back to
canonical. This adds arena_as_of to the league-wide row, and flips the NBA team
page to prefer arena_as_of over arena_canonical. Then regenerates the NBA JSONs.

Anchor-asserted, CRLF/BOM-preserving, idempotent. Run on Windows:
  python apply.py            (also runs scripts/build-nba-data.py)
  npx tsc --noEmit
"""
import os, sys, subprocess
REPO = os.environ.get("COW_REPO", r"C:\Users\ashwi\Desktop\Projects\Metro Area Project")
SKIP_BUILD = os.environ.get("COW_SKIP_BUILD") == "1"

EDITS = [
 ("scripts/build-nba-data.py",
  '                    "ot_count": ot_count,\n                    "arena_canonical": arena_canonical,',
  '                    "ot_count": ot_count,\n                    "arena_as_of": arena_as_of,\n                    "arena_canonical": arena_canonical,'),
 ("app/teams/nba/[slug]/page.tsx",
  "{g.arena_canonical || g.arena_as_of}",
  "{g.arena_as_of || g.arena_canonical}"),
]

def edit(rel, anchor, repl):
    p = os.path.join(REPO, *rel.split("/"))
    raw = open(p, "rb").read(); bom = raw.startswith(b"\xef\xbb\xbf")
    text = raw.decode("utf-8-sig"); crlf = "\r\n" in text
    norm = text.replace("\r\n", "\n")
    if repl in norm:
        print("[skip] already applied:", rel); return
    n = norm.count(anchor)
    if n != 1: sys.exit("[ABORT] %s anchor x%d: %r" % (rel, n, anchor[:60]))
    norm = norm.replace(anchor, repl, 1)
    out = norm.replace("\n", "\r\n") if crlf else norm
    open(p, "wb").write((b"\xef\xbb\xbf" if bom else b"") + out.encode("utf-8"))
    print("[ok]   edited", rel)

for rel, a, r in EDITS: edit(rel, a, r)
if SKIP_BUILD:
    print("[dry] skipping build")
else:
    print("[run] python scripts/build-nba-data.py")
    subprocess.check_call([sys.executable, os.path.join("scripts","build-nba-data.py")], cwd=REPO)
    print("\nDone. Next: npx tsc --noEmit")
