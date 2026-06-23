#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
apply_womens_rivalries.py  (2026-06-23)

Anchor-asserted patch: extends the cross-sport Rivalries feature to Women's
College Basketball (/teams/cbb-w) and Women's Football clubs (/teams/wfootball).
Run once on Windows from anywhere:  python apply_womens_rivalries.py

It edits five source files, appends curated directed rivalry lines to
data/dir-extra.txt, then regenerates public/data/rivalries.json by running
scripts/build-rivalries.py. Every edit asserts its anchor matches exactly once
and is idempotent (a sentinel skips files already patched). Line endings and any
BOM are preserved per file.
"""
import os, sys, subprocess

REPO = os.environ.get("COW_REPO", r"C:\Users\ashwi\Desktop\Projects\Metro Area Project")
SKIP_BUILD = os.environ.get("COW_SKIP_BUILD") == "1"

def patch(relpath, sentinel, edits):
    path = os.path.join(REPO, *relpath.split("/"))
    raw = open(path, "rb").read()
    bom = raw.startswith(b"\xef\xbb\xbf")
    text = raw.decode("utf-8-sig")
    crlf = "\r\n" in text
    norm = text.replace("\r\n", "\n")
    if sentinel in norm:
        print("[skip] already patched: " + relpath)
        return
    for anchor, repl in edits:
        c = norm.count(anchor)
        if c != 1:
            sys.exit("[ABORT] %s: anchor matched %dx (expected 1):\n  %r" % (relpath, c, anchor[:90]))
        norm = norm.replace(anchor, repl, 1)
    out = norm.replace("\n", "\r\n") if crlf else norm
    data = (b"\xef\xbb\xbf" if bom else b"") + out.encode("utf-8")
    open(path, "wb").write(data)
    print("[ok]   patched %s (%s%s)" % (relpath, "CRLF" if crlf else "LF", ", BOM" if bom else ""))

# ---------------------------------------------------------------- build script
BUILD_EDITS = [
 ('           "wnba": "wnba"}',
  '           "wnba": "wnba", "cbb-w": "cbb-w", "wfootball": "wfootball/clubs"}'),
 ('                  "wnba": "United States", "afl": "Australia", "nrl": "Australia", "cfl": "Canada"}',
  '                  "wnba": "United States", "afl": "Australia", "nrl": "Australia", "cfl": "Canada",\n                  "cbb-w": "United States"}'),
 ('               "nrl": "Rugby League", "afl": "Aussie Rules"}',
  '               "nrl": "Rugby League", "afl": "Aussie Rules",\n               "cbb-w": "Women\'s Basketball", "wfootball": "Women\'s Football"}'),
 ('             "St. John\'s": "St. John\'s (NY)", "Ole Miss": "Mississippi"}',
  '             "St. John\'s": "St. John\'s (NY)", "Ole Miss": "Mississippi"}\n\nWCBB_ALIAS = {"UConn": "Connecticut"}'),
 ('RES = {}',
  'def wcbb_resolver():\n'
  '    """Women\'s CBB names carry a " (W)" suffix (slug e.g. connecticut-ncaaw).\n'
  '    Register both the stripped display and the full name so a page passing\n'
  '    either spelling resolves; alias UConn -> Connecticut."""\n'
  '    d = jload("wcbb/data.json")\n'
  '    teams = d.get("teams") if isinstance(d, dict) else d\n'
  '    by = {}\n'
  '    for t in teams:\n'
  '        if t.get("name") and t.get("slug"):\n'
  '            disp = re.sub(r"\\s*\\(W\\)\\s*$", "", t["name"]).strip()\n'
  '            keys = list(dict.fromkeys([disp, t["name"]]))\n'
  '            rec = {"display": disp, "slug": t["slug"], "keys": keys}\n'
  '            for k in keys:\n'
  '                by[norm(k)] = rec\n'
  '    for a, tgt in WCBB_ALIAS.items():\n'
  '        if norm(tgt) in by:\n'
  '            by[norm(a)] = by[norm(tgt)]\n'
  '    return by\n\n\n'
  'def wfootball_resolver():\n'
  '    d = jload("football/womens-football.json")\n'
  '    by = {}\n'
  '    for c in d.get("clubs", []):\n'
  '        if c.get("name") and c.get("slug"):\n'
  '            by[norm(c["name"])] = {"display": c["name"], "slug": c["slug"],\n'
  '                                   "keys": [c["name"]], "country": c.get("country")}\n'
  '    return by\n\n\n'
  'RES = {}'),
 ('                   "wnba": lambda: data_franchise_resolver("wnba"),\n                   "national": national_resolver}[lg]()',
  '                   "wnba": lambda: data_franchise_resolver("wnba"),\n                   "cbb-w": wcbb_resolver, "wfootball": wfootball_resolver,\n                   "national": national_resolver}[lg]()'),
 ('    ("wnba", "New York Liberty", "Las Vegas Aces"),',
  '    ("wnba", "New York Liberty", "Las Vegas Aces"),\n'
  '    ("cbb-w", "Connecticut", "Tennessee"), ("cbb-w", "South Carolina", "Connecticut"),\n'
  '    ("wfootball", "Arsenal Women", "Tottenham Hotspur Women"), ("wfootball", "Arsenal Women", "Chelsea Women"),\n'
  '    ("wfootball", "FC Barcelona Femeni", "Real Madrid Femenino"), ("wfootball", "Portland Thorns FC", "OL Reign"),'),
]
patch("scripts/build-rivalries.py", "def wcbb_resolver()", BUILD_EDITS)

# ---------------------------------------------------------------- loader hints
patch("lib/rivalries.ts", 'WCBB: "cbb-w"', [
 ('  NRL: "nrl", AFL: "afl", CFL: "cfl", WNBA: "wnba",\n};',
  '  NRL: "nrl", AFL: "afl", CFL: "cfl", WNBA: "wnba",\n  WCBB: "cbb-w", NCAAW: "cbb-w", WFOOTBALL: "wfootball",\n};'),
])

# ---------------------------------------------------------------- cbb-w page
patch("app/teams/cbb-w/[slug]/page.tsx", '"Women\'s Basketball", "WCBB"', [
 ('import { getAllWcbbSlugs, getWcbbTeamBySlug, getWcbbTournament, wcbbMonogram, type WcbbTourYear } from "@/lib/wcbb";',
  'import { getAllWcbbSlugs, getWcbbTeamBySlug, getWcbbTournament, wcbbMonogram, type WcbbTourYear } from "@/lib/wcbb";\n'
  'import RivalriesSection from "@/app/teams/_shared/RivalriesSection";\n'
  'import { getRivalries } from "@/lib/rivalries";'),
 ('      </header>\n\n      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">',
  '      </header>\n\n      <RivalriesSection rivals={getRivalries(t.name, "Women\'s Basketball", "WCBB")} />\n\n      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">'),
])

# ---------------------------------------------------------------- wfootball page
patch("app/teams/wfootball/clubs/[slug]/page.tsx", '"Women\'s Football", "WFOOTBALL"', [
 ('import TopTeamChip from "@/app/teams/TopTeamChip";',
  'import TopTeamChip from "@/app/teams/TopTeamChip";\n'
  'import RivalriesSection from "@/app/teams/_shared/RivalriesSection";\n'
  'import { getRivalries } from "@/lib/rivalries";'),
 ('      </header>\n\n      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">',
  '      </header>\n\n      <RivalriesSection rivals={getRivalries(club.name, "Women\'s Football", "WFOOTBALL")} />\n\n      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">'),
])

# ---------------------------------------------------------------- release note
B1 = "Women's College Basketball team pages now carry the Rivalries row, with UConn–Tennessee and UConn–South Carolina flagged Top Rivalry alongside Stanford, Notre Dame and the SEC ties."
B2 = "Women's Football club pages gain rivalries too: the North London Derby, El Clásico, the Manchester, Merseyside and Madrid derbies, and the NWSL's Cascadia rivalry."
B3 = "Both new sports join the /sports/rivalries board, sortable and filterable alongside the existing thirteen."
patch("lib/releases.ts", 'date: "2026-06-23"', [
 ('export const RELEASES: Release[] = [\n  {\n    date: "2026-06-22",',
  'export const RELEASES: Release[] = [\n  {\n    date: "2026-06-23",\n'
  '    headline: "Rivalries reach women\'s basketball and football",\n'
  '    items: [\n'
  '      "%s",\n      "%s",\n      "%s",\n' % (B1, B2, B3) +
  '    ],\n  },\n  {\n    date: "2026-06-22",'),
])

# ---------------------------------------------------------------- dir-extra.txt
WOMENS = [
 "cbb-w|Connecticut>Tennessee:,South Carolina:",
 "cbb-w|Tennessee>Connecticut:,South Carolina:",
 "cbb-w|South Carolina>Connecticut:,Tennessee:",
 "cbb-w|Stanford>Connecticut:",
 "cbb-w|Notre Dame>Connecticut:",
 "wfootball|Portland Thorns FC>OL Reign:Cascadia,North Carolina Courage:",
 "wfootball|OL Reign>Portland Thorns FC:Cascadia",
 "wfootball|North Carolina Courage>Portland Thorns FC:",
 "wfootball|Arsenal Women>Tottenham Hotspur Women:North London Derby,Chelsea Women:",
 "wfootball|Tottenham Hotspur Women>Arsenal Women:North London Derby",
 "wfootball|Chelsea Women>Arsenal Women:",
 "wfootball|Manchester City Women>Manchester United Women:Manchester Derby",
 "wfootball|Manchester United Women>Manchester City Women:Manchester Derby",
 "wfootball|Liverpool Women>Everton Women:Merseyside Derby",
 "wfootball|Everton Women>Liverpool Women:Merseyside Derby",
 "wfootball|FC Barcelona Femeni>Real Madrid Femenino:El Clásico,RCD Espanyol Femeni:Derbi barceloní",
 "wfootball|Real Madrid Femenino>FC Barcelona Femeni:El Clásico,Atlético de Madrid Femenino:Derbi madrileño",
 "wfootball|Atlético de Madrid Femenino>Real Madrid Femenino:Derbi madrileño",
 "wfootball|RCD Espanyol Femeni>FC Barcelona Femeni:Derbi barceloní",
 "wfootball|Athletic Bilbao Femenino>Real Sociedad Femenino:Basque derby",
 "wfootball|Real Sociedad Femenino>Athletic Bilbao Femenino:Basque derby",
]
de = os.path.join(REPO, "data", "dir-extra.txt")
raw = open(de, "rb").read()
if b"cbb-w|Connecticut>Tennessee" in raw:
    print("[skip] women's lines already in data/dir-extra.txt")
else:
    if raw and not raw.endswith(b"\n"):
        raw += b"\n"
    block = ("# --- women's rivalries (added 2026-06-23) ---\n" + "\n".join(WOMENS) + "\n").encode("utf-8")
    open(de, "wb").write(raw + block)
    print("[ok]   appended %d women's rivalry lines to data/dir-extra.txt" % len(WOMENS))

# ---------------------------------------------------------------- rebuild
if SKIP_BUILD:
    print("[dry]  COW_SKIP_BUILD=1 -> not running build-rivalries.py")
else:
    print("[run]  python scripts/build-rivalries.py ...")
    subprocess.check_call([sys.executable, os.path.join("scripts", "build-rivalries.py")], cwd=REPO)
    print("\nDone. Next: npx tsc --noEmit  &&  node scripts/check-client-imports.mjs  (then commit when ready).")
