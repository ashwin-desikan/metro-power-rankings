#!/usr/bin/env python3
r"""
Sticky table headers site-wide (global CSS) + open NFL/NBA/MLB season-by-season
by default. Robust to partial prior state:
  - the <details> opener only adds `open` to season blocks that lack it (no
    duplicate-attribute JSX errors);
  - the release note and a Netball-icon correction are best-effort (soft).

Run from repo root:  python scripts/add-sticky-tables.py
Idempotent. Optional argv[1] = repo base dir (for testing).
NOTE: global CSS can't render in a sandbox — preview with `npm run dev`.
"""
import os, sys, re, shutil

BASE = sys.argv[1] if len(sys.argv) > 1 else "."
CSS = os.path.join(BASE, "app", "globals.css")
RELEASES = os.path.join(BASE, "lib", "releases.ts")
LABELS = os.path.join(BASE, "lib", "sportLabels.ts")
PAGES = [os.path.join(BASE, "app", "teams", lg, "[slug]", "page.tsx") for lg in ("nfl", "nba", "mlb")]

CSS_ANCHOR = (
    ".leaflet-container {\n"
    "  isolation: isolate;\n"
    "  z-index: 0 !important;\n"
    "}"
)
CSS_RULE = CSS_ANCHOR + (
    "\n\n"
    "/* === Sticky table headers — site-wide standard ===\n"
    "   Any wrapper that directly holds a <table> becomes a height-capped scroll\n"
    "   box so the header can stick within it. The top nav is fixed, so sticking\n"
    "   to the viewport would hide the header behind it; sticking within an\n"
    "   in-flow scroll box avoids that. Tables that already opt in with their own\n"
    "   max-height + [&_thead_th] utilities keep working (their classes win). */\n"
    ".overflow-x-auto:has(> table),\n"
    ".overflow-auto:has(> table),\n"
    ".overflow-hidden:has(> table) {\n"
    "  max-height: 80vh;\n"
    "  overflow: auto;\n"
    "}\n"
    "table thead th {\n"
    "  position: sticky;\n"
    "  top: 0;\n"
    "  z-index: 20;\n"
    "  background: var(--bg-card);\n"
    "}\n"
)

# Season-by-season <details> opening tags (the accent-left-border ones).
DETAILS_RE = re.compile(
    r'<details\b[^>]*?className="group mt-[46] border-l-4 border-y border-r rounded-xl shadow-sm"[^>]*?>'
)

RELEASE_CANDIDATES = [
    '      "Metro pages now list former major programs (no longer FBS or FCS) in the Defunct Teams section, and pre-1900 games finally show their dates.",',
    '      "Metro team cards now carry a per-sport icon; metro pages list former major programs (no longer FBS or FCS) under Defunct Teams; pre-1900 games show dates.",',
]
RELEASE_NEW = '      "Season tables now have sticky headers site-wide and open by default on NFL, NBA and MLB; metro cards gain a per-sport icon, former FBS programs appear under Defunct Teams, and pre-1900 games show dates.",'

def write(path, s):
    shutil.copyfile(path, path + ".sticky.bak")
    open(path, "w", encoding="utf-8", newline="\n").write(s)

def main():
    # 1) global CSS
    if os.path.isfile(CSS):
        s = open(CSS, encoding="utf-8").read()
        if "Sticky table headers" in s:
            print("globals.css already patched")
        elif s.count(CSS_ANCHOR) == 1:
            write(CSS, s.replace(CSS_ANCHOR, CSS_RULE, 1)); print("Patched " + CSS)
        else:
            print("ABORTED: globals.css anchor matched %d times." % s.count(CSS_ANCHOR)); raise SystemExit(1)
    else:
        print("ABORTED: missing " + CSS); raise SystemExit(1)

    # 2) open NFL/NBA/MLB season details that lack `open`
    for path in PAGES:
        if not os.path.isfile(path):
            print("ABORTED: missing " + path); raise SystemExit(1)
        s = open(path, encoding="utf-8").read()
        changed = [0]
        def repl(m):
            tag = m.group(0)
            if re.search(r'\bopen\b', tag):
                return tag
            changed[0] += 1
            return tag.replace("<details", "<details open", 1)
        ns = DETAILS_RE.sub(repl, s)
        if changed[0]:
            write(path, ns); print("Opened %d season block(s) in %s" % (changed[0], path))
        else:
            print("No closed season blocks to open in " + path)

    # 3) release note (soft, tries both prior wordings)
    if os.path.isfile(RELEASES):
        s = open(RELEASES, encoding="utf-8").read()
        if "sticky headers site-wide" in s:
            print("releases.ts already noted")
        else:
            hit = [c for c in RELEASE_CANDIDATES if s.count(c) == 1]
            if len(hit) == 1:
                write(RELEASES, s.replace(hit[0], RELEASE_NEW, 1)); print("Amended " + RELEASES)
            else:
                print("SKIP release note (no single matching bullet found); add one by hand if you like.")

    # 4) defensive: correct Netball icon if an earlier icons run set the net glyph
    if os.path.isfile(LABELS):
        s = open(LABELS, encoding="utf-8").read()
        if '"Netball": "\U0001F945"' in s:
            write(LABELS, s.replace('"Netball": "\U0001F945"', '"Netball": "\U0001F3D0"', 1))
            print("Corrected Netball icon -> volleyball in " + LABELS)

if __name__ == "__main__":
    main()
