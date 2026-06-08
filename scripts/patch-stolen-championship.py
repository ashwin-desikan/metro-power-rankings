#!/usr/bin/env python3
"""Host-side (Windows) patch: surface the 1925 Pottsville Maroons "stolen
championship". Touches lib/data.ts, lib/nfl.ts, the metro page relocations chip,
the NFL defunct team page, and the season table. Idempotent, newline-preserving.
Run from repo root AFTER patch-reloc-stats-ui.py:

    python scripts/patch-stolen-championship.py
"""
import os, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def patch(rel, marker, old_lines, new_lines):
    path = os.path.join(ROOT, rel)
    with open(path, "r", encoding="utf-8", newline="") as f:
        content = f.read()
    nl = "\r\n" if "\r\n" in content else "\n"
    if marker in content:
        print(f"SKIP {rel}: already patched ({marker!r})"); return
    old = nl.join(old_lines); new = nl.join(new_lines)
    n = content.count(old)
    if n != 1:
        sys.exit(f"FAIL {rel}: anchor matched {n} times (need 1).")
    before = len(content); content2 = content.replace(old, new, 1)
    expect = before + (len(new) - len(old))
    if len(content2) != expect:
        sys.exit(f"FAIL {rel}: length check ({len(content2)} != {expect}).")
    d = os.path.dirname(path)
    fd, tmp = tempfile.mkstemp(dir=d, prefix=".patch-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
            f.write(content2)
        os.replace(tmp, path)
    except Exception:
        if os.path.exists(tmp): os.unlink(tmp)
        raise
    with open(path, "r", encoding="utf-8", newline="") as f:
        v = f.read()
    if marker not in v or len(v) != expect:
        sys.exit(f"FAIL {rel}: post-write verification failed.")
    print(f"OK {rel} ({before} -> {len(v)} bytes)")

PAGE = os.path.join("app", "rankings", "[slug]", "page.tsx")
NFLPAGE = os.path.join("app", "teams", "nfl", "[slug]", "page.tsx")
SEASONS = os.path.join("app", "teams", "nfl", "[slug]", "SeasonsByTeamTable.tsx")

# 1) RelocationCard.stats gains optional stolen count
patch("lib/data.ts", "pct: number; stolen?: number",
    ["  stats?: { champ: number; div: number; finals: number; pct: number };"],
    ["  stats?: { champ: number; div: number; finals: number; pct: number; stolen?: number };"])

# 2) metro relocations chip: stolen-aware tooltip
patch(PAGE, 'stolen ? "Pro football',
    ['                            title="Titles won during the years this franchise played in this metro"'],
    ['                            title={r.stats.stolen ? "Pro football’s “stolen championship”: Pottsville won the 1925 NFL title on the field, then was stripped and the league awarded it to the Chicago Cardinals." : "Titles won during the years this franchise played in this metro"}'])

# 3) metro relocations chip: stolen-aware label
patch(PAGE, 'stolen title${r.stats.champ',
    ['                            {r.league === "mlb"',
     '                              ? (r.stats.champ === 0 ? "No WS" : r.stats.champ === 1 ? "1 WS" : `${r.stats.champ} WS`)'],
    ['                            {r.stats.stolen',
     '                              ? `${r.stats.champ} stolen title${r.stats.champ === 1 ? "" : "s"}`',
     '                              : r.league === "mlb"',
     '                              ? (r.stats.champ === 0 ? "No WS" : r.stats.champ === 1 ? "1 WS" : `${r.stats.champ} WS`)'])

# 4) Season type gains optional stolen flag
patch("lib/nfl.ts", "editorial: title won then revoked",
    ["  conf_final: boolean;", "  champ_app: boolean;", "  champ: boolean;", "};"],
    ["  conf_final: boolean;", "  champ_app: boolean;", "  champ: boolean;",
     "  stolen?: boolean;  // editorial: title won then revoked (1925 Pottsville Maroons)", "};"])

# 5) defunct NFL page: mark season rows whose year matches a stolen championship
patch(NFLPAGE, "_stolenYears",
    ["  const seasonRows: Season[] = [...seasons].sort((a, b) => b.year - a.year);"],
    ["  const _stolenYears = new Set(champs.filter((c) => c.stolen).map((c) => c.year));",
     "  const seasonRows: Season[] = [...seasons]",
     "    .sort((a, b) => b.year - a.year)",
     "    .map((s) => (_stolenYears.has(s.year) ? { ...s, stolen: true } : s));"])

# 6) season table: pass stolen into the badge set
patch(SEASONS, "stolen={s.stolen === true}",
    ["                        champ={s.champ}", "                        year={s.year}"],
    ["                        champ={s.champ}", "                        stolen={s.stolen === true}", "                        year={s.year}"])

# 7) SeasonBadges signature: accept stolen
patch(SEASONS, "stolen?: boolean;",
    ["  champ,", "  year,", "}: {", "  playoff: boolean;", "  divTitle: boolean;",
     "  confFinal: boolean;", "  champApp: boolean;", "  champ: boolean;", "  year: number;", "}) {"],
    ["  champ,", "  stolen,", "  year,", "}: {", "  playoff: boolean;", "  divTitle: boolean;",
     "  confFinal: boolean;", "  champApp: boolean;", "  champ: boolean;", "  stolen?: boolean;", "  year: number;", "}) {"])

# 8) SeasonBadges: gold "Stolen Championship" badge, priority over champ/champApp
patch(SEASONS, "if (stolen) {",
    ["  const badges: React.ReactNode[] = [];", "  if (champ) {"],
    ["  const badges: React.ReactNode[] = [];",
     "  if (stolen) {",
     "    badges.push(",
     "      <span",
     '        key="stolen"',
     '        className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"',
     '        style={{ background: TITLE_GOLD, color: "#1a1a1a" }}',
     '        title="Won the 1925 NFL title on the field, then stripped by the league — pro football’s ‘stolen championship.’"',
     "      >",
     "        Stolen Championship",
     "      </span>,",
     "    );",
     "  } else if (champ) {"])

# 9) season table: don't also show a bare "Playoffs" badge on the stolen row
patch(SEASONS, "!champ && !stolen",
    ["  if (playoff && !divTitle && !confFinal && !champApp && !champ) {"],
    ["  if (playoff && !divTitle && !confFinal && !champApp && !champ && !stolen) {"])

print("Done. Now run:  python scripts/build-relocations.py   then  npx tsc --noEmit")
