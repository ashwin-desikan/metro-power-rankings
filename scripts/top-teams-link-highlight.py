#!/usr/bin/env python3
"""
Highlight linked teams on /top-teams (teal + dotted underline). Standalone
follow-up because the combined script's guard skips the already-split file.
Run from the repo root:

    python scripts/top-teams-link-highlight.py

Idempotent; backs up app/top-teams/page.tsx to *.v11.bak. Nothing committed.
"""
import os, sys, shutil

TT = os.path.join("app", "top-teams", "page.tsx")
OLD = '''                                      <Link
                                        href={link.href}
                                        className="inline-flex items-center gap-1.5 hover:text-[var(--accent)] transition-colors"
                                        style={{ color: "var(--text)" }}
                                      >'''
NEW = '''                                      <Link
                                        href={link.href}
                                        className="inline-flex items-center gap-1.5 underline decoration-dotted underline-offset-2 hover:opacity-80 transition-opacity"
                                        style={{ color: "var(--accent)" }}
                                      >'''

def main():
    if not os.path.isfile(TT):
        print("ABORTED: " + TT + " not found. Run from the repo root."); sys.exit(1)
    src = open(TT, encoding="utf-8").read()
    if "underline decoration-dotted underline-offset-2" in src:
        print("  skip    " + TT + " (already highlighted)"); return
    if OLD not in src:
        print("ABORTED: linked <Link> anchor not found in " + TT + ". Send me the current file."); sys.exit(1)
    shutil.copyfile(TT, TT + ".v11.bak")
    open(TT, "w", encoding="utf-8", newline="\n").write(src.replace(OLD, NEW, 1))
    print("  patched " + TT + " (linked teams now teal + underlined)")
    print()
    print("Done. Run your TS type check, then preview /top-teams before committing.")

if __name__ == "__main__":
    main()
