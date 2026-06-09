#!/usr/bin/env python3
"""
Freeze the header row on the four Greatest-Games tables (/sports/games): NFL,
NBA, MLB top games + NHL Cup presentation. Run from the repo root:

    python scripts/add-sticky-game-tables.py

(The College Football table already has a sticky header.) Idempotent; backs up
each file to *.sticky.bak. Nothing committed.
"""
import os, sys, shutil
FILES = [
    os.path.join("app","teams","nfl","TopGamesTable.tsx"),
    os.path.join("app","teams","nba","TopGamesTable.tsx"),
    os.path.join("app","teams","mlb","TopGamesTable.tsx"),
    os.path.join("app","teams","nhl","CupPresentationTable.tsx"),
]
OLD = '''      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums">'''
NEW = '''      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full text-xs tabular-nums [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-[var(--bg)]">'''
def main():
    for p in FILES:
        if not os.path.isfile(p): print("  skip    " + p + " (not found)"); continue
        s = open(p, encoding="utf-8").read()
        if "[&_thead_th]:sticky" in s: print("  skip    " + p + " (already sticky)"); continue
        if OLD not in s: print("  WARN    anchor not found in " + p + " (skipped)"); continue
        shutil.copyfile(p, p + ".sticky.bak")
        open(p, "w", encoding="utf-8", newline="\n").write(s.replace(OLD, NEW, 1))
        print("  patched " + p)
    print(); print("Done. Preview /sports/games - all game tables now freeze their header row.")
if __name__ == "__main__": main()
