#!/usr/bin/env python3
r"""
Link the Year cells in the CFB hub National Champions table to their Sports
Reference season pages. Use this if you already ran fix-cfb-hub-champions.py
(which now links the year for fresh runs). Idempotent; soft.

Run from repo root:  python scripts/fix-cfb-champ-year-links.py
"""
import os, sys, shutil
TARGET = sys.argv[1] if len(sys.argv) > 1 else os.path.join("app", "teams", "cfb", "page.tsx")
OLD = '                    <td className="px-3 py-1.5 tabular-nums text-[var(--text-muted)]">{nc.year}</td>'
NEW = '                    <td className="px-3 py-1.5 tabular-nums text-[var(--text-muted)]"><a href={`https://www.sports-reference.com/cfb/years/${nc.year}.html`} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--accent)] hover:underline" title={`${nc.year} season on Sports Reference`}>{nc.year}</a></td>'
def main():
    if not os.path.isfile(TARGET):
        print("SKIP: missing " + TARGET); return
    s = open(TARGET, encoding="utf-8").read()
    if "cfb/years/${nc.year}" in s:
        print("Year cells already linked; nothing to do."); return
    if s.count(OLD) != 1:
        print("SKIP: champions year cell not found once (run fix-cfb-hub-champions.py first)."); return
    shutil.copyfile(TARGET, TARGET + ".champyear.bak")
    open(TARGET, "w", encoding="utf-8", newline="\n").write(s.replace(OLD, NEW, 1))
    print("Linked champion year cells in " + TARGET)
if __name__ == "__main__":
    main()
