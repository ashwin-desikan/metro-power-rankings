#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""apply.py (2026-06-23) - NBA Greatest Games: show Arena on the hub all-time/
decade view and the cross-sport Greatest Games page (the shared NBA TopGamesTable
gated on arena_as_of, which only the per-team JSON has; all-time/decade rows carry
arena_canonical). Falls back to arena_canonical. Also adds state to the NBA team-
page top-games arena cell for parity. Anchor-asserted, CRLF/BOM-preserving, idempotent.
Run on Windows:  python apply.py   then  npx tsc --noEmit
"""
import os, sys
REPO = os.environ.get("COW_REPO", r"C:\Users\ashwi\Desktop\Projects\Metro Area Project")

EDITS = [
 ("app/teams/nba/TopGamesTable.tsx",
  "{g.arena_as_of ? (",
  "{(g.arena_as_of || g.arena_canonical) ? ("),
 ("app/teams/nba/TopGamesTable.tsx",
  "title={[g.arena_as_of, g.arena_metro, g.arena_state]",
  "title={[(g.arena_as_of || g.arena_canonical), g.arena_metro, g.arena_state]"),
 ("app/teams/nba/TopGamesTable.tsx",
  "                    >\n                      {g.arena_as_of}\n",
  "                    >\n                      {g.arena_as_of || g.arena_canonical}\n"),
 ("app/teams/nba/[slug]/page.tsx",
  '{g.arena_metro ? ` · ${g.arena_metro}` : ""}',
  '{g.arena_metro ? ` · ${g.arena_metro}${g.arena_state ? `, ${g.arena_state}` : ""}` : ""}'),
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
print("Done. Next: npx tsc --noEmit")
