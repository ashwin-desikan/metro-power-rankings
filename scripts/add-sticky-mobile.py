#!/usr/bin/env python3
r"""
Mobile sticky-table refinement (app/globals.css): on phones (<=640px) freeze the
first column of any table so the row label stays visible while swiping a wide
table sideways, plus momentum scrolling and a subtle divider. Desktop unchanged.
Pairs with add-sticky-tables.py (which makes headers sticky site-wide).

Run from repo root:  python scripts/add-sticky-mobile.py
Idempotent (appends once). NOTE: preview on a phone / narrow viewport.
"""
import os, sys, shutil

TARGET = sys.argv[1] if len(sys.argv) > 1 else os.path.join("app", "globals.css")
MARKER = "Mobile: freeze first column"
BLOCK = (
    "\n"
    "/* === Mobile: freeze first column + momentum for table scroll boxes ===\n"
    "   On phones, keep the first column (row label) visible while swiping a wide\n"
    "   table sideways. Relies on the site-wide header rule for the top-sticky\n"
    "   part; this adds the left-sticky part. Desktop is unaffected. */\n"
    "@media (max-width: 640px) {\n"
    "  .overflow-x-auto:has(> table),\n"
    "  .overflow-auto:has(> table),\n"
    "  .overflow-hidden:has(> table) {\n"
    "    -webkit-overflow-scrolling: touch;\n"
    "  }\n"
    "  table tbody td:first-child,\n"
    "  table tfoot td:first-child {\n"
    "    position: sticky;\n"
    "    left: 0;\n"
    "    z-index: 15;\n"
    "    background: var(--bg-card);\n"
    "    box-shadow: inset -1px 0 0 var(--border);\n"
    "  }\n"
    "  table thead th:first-child {\n"
    "    left: 0;\n"
    "    z-index: 30;\n"
    "    box-shadow: inset -1px 0 0 var(--border);\n"
    "  }\n"
    "}\n"
)

def main():
    if not os.path.isfile(TARGET):
        print("ABORTED: missing " + TARGET); raise SystemExit(1)
    s = open(TARGET, encoding="utf-8").read()
    if MARKER in s:
        print("globals.css mobile rule already present; nothing to do."); return
    shutil.copyfile(TARGET, TARGET + ".stickymobile.bak")
    open(TARGET, "w", encoding="utf-8", newline="\n").write(s.rstrip("\n") + "\n" + BLOCK)
    print("Appended mobile sticky rule to " + TARGET)

if __name__ == "__main__":
    main()
