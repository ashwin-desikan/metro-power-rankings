#!/usr/bin/env python3
r"""
Amend the single 2026-06-09 release entry to cover the College Football hub
alongside the AFL/NRL portals (one entry per shipping day). Run from repo root:
    python scripts/add-release-2026-06-09-cfb.py
Backs up lib/releases.ts to *.rel.bak. Idempotent.
"""
import os, shutil

REL = os.path.join("lib", "releases.ts")

OLD = '''  {
    date: "2026-06-09",
    headline: "AFL and NRL portals",
    items: [
      "New AFL and NRL portals: every club across VFL/AFL (1897+) and NSWRL/NRL (1908+), with all-time premierships and minor premierships, the latest-season ladder, an honours table, and the full Grand Final roll.",
      "Current and defunct clubs each get their own page; defunct clubs like Fitzroy, Newtown, Balmain and St George also surface as cards in their metro areas.",
      "Metro cards now show premierships, minor premierships, and seasons for the Australian rules and rugby league clubs based there.",
      "Australian football and rugby league histories sourced from afltables.com.",
    ],
  },'''

NEW = '''  {
    date: "2026-06-09",
    headline: "College Football hub, AFL and NRL portals",
    items: [
      "New College Football hub at /teams/cfb: every major program through history with national titles, conference championships, and the greatest games by Game Score, filterable by decade with video for the classics.",
      "FBS programs now lead each metro's college teams with team colors, national titles, conference titles, and major seasons; once-major FCS schools carry the same detail in College/University.",
      "New AFL and NRL portals: every VFL/AFL (1897+) and NSWRL/NRL (1908+) club with all-time premierships, the latest ladder, an honours table, and the full Grand Final roll; defunct clubs get pages and metro cards.",
      "Australian football and rugby league histories sourced from afltables.com.",
    ],
  },'''

def main():
    if not os.path.isfile(REL):
        print("ABORTED: run from repo root."); raise SystemExit(1)
    s = open(REL, encoding="utf-8").read()
    if "College Football hub, AFL and NRL portals" in s:
        print("Already amended; nothing to do."); return
    n = s.count(OLD)
    if n != 1:
        print("ABORTED: 2026-06-09 entry anchor matched %d times (expected 1)." % n); raise SystemExit(1)
    s = s.replace(OLD, NEW, 1)
    shutil.copyfile(REL, REL + ".rel.bak")
    open(REL, "w", encoding="utf-8", newline="\n").write(s)
    print("Amended " + REL)

if __name__ == "__main__":
    main()
