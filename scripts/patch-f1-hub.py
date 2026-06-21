#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Wire the F1 hub into the site. Run NATIVELY on Windows from the repo root:
      python scripts/patch-f1-hub.py
Edits three existing files. ATOMIC: every anchor is verified before anything is
written, so a missing/ambiguous anchor aborts with NO partial writes. Idempotent.
  1) lib/sportsCatalog.ts          -> Motorsport family + F1 catalog entry
  2) lib/releases.ts               -> fold an F1 line into today's release block
  3) app/rankings/[slug]/page.tsx  -> make the existing "F1 Races" cards in Major
     Sporting Events link to their circuit page and show the race winner
     (reverts the earlier standalone-card approach if a prior run added it).
"""
import os, io

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def path(*p): return os.path.join(ROOT, *p)
def read(fp):
    with io.open(fp, encoding="utf-8") as f: return f.read()
def replace_once(s, old, new, label):
    n = s.count(old)
    if n != 1:
        raise SystemExit(f"ABORT [{label}]: expected exactly 1 anchor match, found {n}. No files written.")
    return s.replace(old, new)

pending = {}   # fp -> new content (written only if ALL transforms succeed)

# ── 1) lib/sportsCatalog.ts ──────────────────────────────────────────────────
fp = path("lib", "sportsCatalog.ts"); s = read(fp)
if '"/teams/f1"' in s:
    print("skip sportsCatalog.ts (already has F1)")
else:
    s = replace_once(s, '  | "Tennis";', '  | "Tennis"\n  | "Motorsport";', "SportFamily union")
    s = replace_once(s, '  "Tennis",\n];', '  "Tennis",\n  "Motorsport",\n];', "FAMILY_ORDER")
    cfl = '  { href: "/teams/cfl", label: "CFL", sport: "Canadian Football", family: "Gridiron", scope: "club", hint: "Every CFL franchise, live standings, season records, and Grey Cup history since 1909" },'
    f1 = ('\n\n  // Motorsport\n'
          '  { href: "/teams/f1", label: "Formula 1", sport: "Formula 1", family: "Motorsport", scope: "international", marquee: true, status: "live", '
          'hint: "Live drivers\' and constructors\' standings, World Champions since 1950, all-time wins, and the metros that host every Grand Prix" },')
    s = replace_once(s, cfl, cfl + f1, "F1 catalog entry")
    pending[fp] = s

# ── 2) lib/releases.ts (fold F1 into today's block; keep 4 bullets) ───────────
fp = path("lib", "releases.ts"); s = read(fp)
if "New Formula 1 hub:" in s:
    print("skip releases.ts (already has F1 note)")
else:
    old = (
'    headline: "Domestic Leagues Worldwide, World Cup tiebreaker, and card upgrades",\n'
'    items: [\n'
'      "New Domestic Leagues Worldwide hub: every club that has ever played a tracked first division across 76 countries, with titles, cups and continental pedigree split by country era, and links to club pages.",\n'
'      "Metro team cards add football-club honours, defunct NASL clubs, NFL/NBA/NHL title and finals appearances, college bowl-game and tournament counts, and co-equal top teams now lead their metro.",\n'
'      "World Cup group tables and projections now apply FIFA\'s 2026 head-to-head tiebreaker, correctly eliminating sides like Türkiye and Haiti.",\n'
'      "Zone Zero Cup: a Netball World Cup pillar, Great Britain football and Athletics weighted up, and strongest sports that blend international and national sports.",\n'
'    ],'
    )
    new = (
'    headline: "Domestic Leagues Worldwide, a Formula 1 hub, and card upgrades",\n'
'    items: [\n'
'      "New Domestic Leagues Worldwide hub: every club that has ever played a tracked first division across 76 countries, with titles, cups and continental pedigree split by country era, and links to club pages.",\n'
'      "Metro team cards add football-club honours, defunct NASL clubs, NFL/NBA/NHL title and finals appearances, college bowl-game and tournament counts, and co-equal top teams now lead their metro.",\n'
'      "New Formula 1 hub: live drivers\' and constructors\' standings, every World Champion since 1950, all-time win leaders, per-circuit race history, and host-metro links from every Grand Prix card.",\n'
'      "World Cup group tables now apply FIFA\'s 2026 head-to-head tiebreaker; the Zone Zero Cup adds a Netball World Cup pillar and reweights Great Britain football and Athletics.",\n'
'    ],'
    )
    pending[fp] = replace_once(s, old, new, "releases.ts today-block")

# ── 3) app/rankings/[slug]/page.tsx : enrich F1 Races cards in Major Sporting Events ──
fp = path("app", "rankings", "[slug]", "page.tsx"); s = read(fp); before = s
# 3a) revert earlier standalone-card approach if present
standalone = (
'              )}\n'
'              {(() => { const f1 = getF1RecentWinnerForMetro(slug); return f1 ? (\n'
'                <Link href="/teams/f1" className="block mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 hover:border-[var(--text-dim)] transition-colors">\n'
'                  <div className="flex items-center justify-between gap-3">\n'
'                    <div>\n'
'                      <div className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">Motorsport · Formula 1</div>\n'
'                      <div className="font-semibold text-[var(--text)]">{f1.race_name}</div>\n'
'                      <div className="text-sm text-[var(--text-muted)]">Latest winner: <span className="text-[var(--text)]">{f1.winner ?? "—"}</span>{f1.constructor ? ` · ${f1.constructor}` : ""}</div>\n'
'                    </div>\n'
'                    <div className="text-right">\n'
'                      <div className="text-lg font-bold text-[var(--text)]">{f1.races}</div>\n'
'                      <div className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">Grands Prix</div>\n'
'                    </div>\n'
'                  </div>\n'
'                </Link>\n'
'              ) : null; })()}\n'
'              {((detail.events && detail.events.length > 0) || mergedSportingEvents.length > 0) && (')
restore = ('              )}\n'
           '              {((detail.events && detail.events.length > 0) || mergedSportingEvents.length > 0) && (')
if standalone in s:
    s = s.replace(standalone, restore)
s = s.replace('import { getCflFranchiseByTeamName } from "@/lib/cfl";\nimport { getF1RecentWinnerForMetro } from "@/lib/f1";',
              'import { getCflFranchiseByTeamName } from "@/lib/cfl";')
# 3b) import the race-result lookup
if "getF1RaceResultByName" not in s:
    s = replace_once(s, 'import { getCflFranchiseByTeamName } from "@/lib/cfl";',
                     'import { getCflFranchiseByTeamName } from "@/lib/cfl";\nimport { getF1RaceResultByName } from "@/lib/f1";',
                     "rankings F1 import")
# 3c) enrich EventsSection card render
if "getF1RaceResultByName(ev.event" not in s:
    old_render = (
'              {grouped[category].map((ev, idx) => {\n'
'                const olySlug =\n'
'                  category === "Multi-Sport Events"\n'
'                    ? olympicEditionSlugFromName(ev.event)\n'
'                    : null;\n'
'                const inner = (\n'
'                  <>\n'
'                    <p className="font-medium text-[var(--text)]">{ev.event}</p>\n'
'                    {ev.type && (\n'
'                      <p className="text-xs text-[var(--accent)]">{ev.type}</p>\n'
'                    )}\n'
'                    <p className="text-xs text-[var(--text-muted)]">\n'
'                      {ev.year} {"\\u2022"} {ev.venue}\n'
'                    </p>\n'
'                  </>\n'
'                );\n'
'                return olySlug ? (\n'
'                  <Link\n'
'                    key={idx}\n'
'                    href={`/teams/olympics/games/${olySlug}`}\n'
'                    className="block py-2 rounded-md transition hover:bg-[var(--bg-card-hover)] hover:text-[var(--accent)]"\n'
'                  >\n'
'                    {inner}\n'
'                  </Link>\n'
'                ) : (\n'
'                  <div key={idx} className="py-2">\n'
'                    {inner}\n'
'                  </div>\n'
'                );\n'
'              })}')
    new_render = (
'              {grouped[category].map((ev, idx) => {\n'
'                const olySlug =\n'
'                  category === "Multi-Sport Events"\n'
'                    ? olympicEditionSlugFromName(ev.event)\n'
'                    : null;\n'
'                const f1r =\n'
'                  ev.type === "F1 Race" || category === "F1 Races"\n'
'                    ? getF1RaceResultByName(ev.event, ev.year)\n'
'                    : null;\n'
'                const inner = (\n'
'                  <>\n'
'                    <p className="font-medium text-[var(--text)]">{ev.event}</p>\n'
'                    {ev.type && (\n'
'                      <p className="text-xs text-[var(--accent)]">{ev.type}</p>\n'
'                    )}\n'
'                    <p className="text-xs text-[var(--text-muted)]">\n'
'                      {ev.year} {"\\u2022"} {ev.venue}\n'
'                    </p>\n'
'                    {f1r && f1r.winner && (\n'
'                      <p className="text-xs text-[var(--text-muted)]">\n'
'                        Won by <span className="text-[var(--text)]">{f1r.winner}</span>\n'
'                        {f1r.constructor ? ` (${f1r.constructor})` : ""}\n'
'                      </p>\n'
'                    )}\n'
'                  </>\n'
'                );\n'
'                return olySlug ? (\n'
'                  <Link\n'
'                    key={idx}\n'
'                    href={`/teams/olympics/games/${olySlug}`}\n'
'                    className="block py-2 rounded-md transition hover:bg-[var(--bg-card-hover)] hover:text-[var(--accent)]"\n'
'                  >\n'
'                    {inner}\n'
'                  </Link>\n'
'                ) : f1r ? (\n'
'                  <Link\n'
'                    key={idx}\n'
'                    href={`/teams/f1/${f1r.circuit_id}`}\n'
'                    className="block py-2 rounded-md transition hover:bg-[var(--bg-card-hover)] hover:text-[var(--accent)]"\n'
'                  >\n'
'                    {inner}\n'
'                  </Link>\n'
'                ) : (\n'
'                  <div key={idx} className="py-2">\n'
'                    {inner}\n'
'                  </div>\n'
'                );\n'
'              })}')
    s = replace_once(s, old_render, new_render, "EventsSection F1 enrichment")
if s != before:
    pending[fp] = s
else:
    print("skip rankings/[slug]/page.tsx (already enriched)")

# ── all anchors verified — write everything now ──────────────────────────────
def relname(fp): return os.path.relpath(fp, ROOT).replace("\\", "/")
for fp, content in pending.items():
    with io.open(fp, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)
print("PATCH OK. Files changed:", [relname(fp) for fp in pending] if pending else "none (all already applied)")
