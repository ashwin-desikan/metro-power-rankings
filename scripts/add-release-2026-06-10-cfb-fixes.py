#!/usr/bin/env python3
r"""Add the 2026-06-10 /updates entry (CFB fixes) to lib/releases.ts. Idempotent."""
import os, sys, shutil
TARGET = sys.argv[1] if len(sys.argv) > 1 else os.path.join("lib", "releases.ts")
OLD = 'export const RELEASES: Release[] = [\n  {\n    date: "2026-06-09",'
NEW = ('export const RELEASES: Release[] = [\n'
       '  {\n'
       '    date: "2026-06-10",\n'
       '    headline: "College Football: bowls, champions, former programs",\n'
       '    items: [\n'
       '      "Season tables now show a clearer Bowl column (a check for a bowl, a Major tag, and the era: Bowl Coalition, Bowl Alliance, BCS, or CFP) and link each season to Sports Reference.",\n'
       '      "National-title seasons get a gold champion tag, Heisman counts now reflect winners only (not finalists), and the Award winners table has a sticky header.",\n'
       '      "New National Champions table on the College Football hub: every season with its Heisman winner, each school linking to its program page.",\n'
       '      "Metro pages now list former major programs (no longer FBS or FCS) in the Defunct Teams section, and pre-1900 games finally show their dates.",\n'
       '    ],\n'
       '  },\n'
       '  {\n'
       '    date: "2026-06-09",')
def main():
    if not os.path.isfile(TARGET):
        print("ABORTED: missing " + TARGET); raise SystemExit(1)
    s = open(TARGET, encoding="utf-8").read()
    if '"2026-06-10"' in s:
        print("Already has a 2026-06-10 entry; nothing to do."); return
    if s.count(OLD) != 1:
        print("ABORTED: anchor matched %d times (expected 1)." % s.count(OLD)); raise SystemExit(1)
    s = s.replace(OLD, NEW, 1)
    shutil.copyfile(TARGET, TARGET + ".rel.bak")
    open(TARGET, "w", encoding="utf-8", newline="\n").write(s)
    print("Patched " + TARGET)
if __name__ == "__main__":
    main()
