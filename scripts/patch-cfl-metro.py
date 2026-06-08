#!/usr/bin/env python3
"""Host-side (Windows) patch: surface CFL data on the metro pages.
  - current CFL Team List cards get Grey Cups / win% / GC-final chips
  - defunct/relocated CFL tiles get a Grey Cups / finals / win% chip
Pairs with lib/teamLinks.ts (CFL resolver) + build-relocations.py (CFL tiles).
Requires patch-other-leagues-stats.py to have run first (anchors on the football
relocation block). Idempotent, newline-preserving. Run from repo root:

    python scripts/patch-cfl-metro.py
"""
import os, sys, tempfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = os.path.join("app", "rankings", "[slug]", "page.tsx")

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
        sys.exit(f"FAIL {rel}: anchor matched {n} times (need 1) for {marker!r}.")
    expect = len(content) + (len(new) - len(old))
    c2 = content.replace(old, new, 1)
    d = os.path.dirname(path); fd, tmp = tempfile.mkstemp(dir=d, prefix=".patch-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as f: f.write(c2)
        os.replace(tmp, path)
    except Exception:
        if os.path.exists(tmp): os.unlink(tmp)
        raise
    with open(path, "r", encoding="utf-8", newline="") as f: v = f.read()
    if marker not in v or len(v) != expect:
        sys.exit(f"FAIL {rel}: post-write verification failed for {marker!r}.")
    print(f"OK {rel}: {marker}")

# 1) import the CFL franchise lookup
patch(PAGE, 'from "@/lib/cfl"',
    ['import { getWnbaFranchiseByTeamName } from "@/lib/wnba";'],
    ['import { getWnbaFranchiseByTeamName } from "@/lib/wnba";',
     'import { getCflFranchiseByTeamName } from "@/lib/cfl";'])

# 2) cflFranchise lookup alongside the other franchise lookups
patch(PAGE, "const cflFranchise =",
    ['  const wnbaFranchise = link?.league === "wnba" ? getWnbaFranchiseByTeamName(team.team) : undefined;'],
    ['  const wnbaFranchise = link?.league === "wnba" ? getWnbaFranchiseByTeamName(team.team) : undefined;',
     '  const cflFranchise = link?.league === "cfl" ? getCflFranchiseByTeamName(team.team) : undefined;'])

# 3) CFL chips on the current-team card (after the WNBA block)
patch(PAGE, "{cflFranchise && (",
    ['          {wnbaFranchise.division_titles > 0 && (',
     '            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }} title="Conference titles">',
     '              {wnbaFranchise.division_titles} div',
     '            </span>',
     '          )}',
     '        </div>',
     '      )}'],
    ['          {wnbaFranchise.division_titles > 0 && (',
     '            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }} title="Conference titles">',
     '              {wnbaFranchise.division_titles} div',
     '            </span>',
     '          )}',
     '        </div>',
     '      )}',
     '      {cflFranchise && (',
     '        <div className="flex gap-1.5 mt-2 flex-wrap">',
     '          <span',
     '            className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide"',
     '            style={{ background: cflFranchise.grey_cups > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)", color: cflFranchise.grey_cups > 0 ? "#d4af37" : "var(--text-dim)" }}',
     '            title="Grey Cup championships"',
     '          >',
     '            {cflFranchise.grey_cups === 0 ? "No Grey Cups" : cflFranchise.grey_cups === 1 ? "1 Grey Cup" : `${cflFranchise.grey_cups} Grey Cups`}',
     '          </span>',
     '          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }} title="All-time regular-season win percentage (1945–)">',
     '            {cflFranchise.win_pct.toFixed(3)} W%',
     '          </span>',
     '          {cflFranchise.gc_finals > 0 && (',
     '            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(110,138,166,0.18)", color: "#a9b8cc" }} title="Grey Cup final appearances (won or lost)">',
     '              {cflFranchise.gc_finals} final{cflFranchise.gc_finals === 1 ? "" : "s"}',
     '            </span>',
     '          )}',
     '        </div>',
     '      )}'])

# 4) CFL chip on defunct/relocated tiles (inserted before the football tile block)
patch(PAGE, 'r.stats && r.league === "cfl"',
    ['                      {r.stats && r.league === "football" && ('],
    ['                      {r.stats && r.league === "cfl" && (',
     '                        <div className="flex gap-1.5 mt-2 flex-wrap">',
     '                          <span',
     '                            className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide"',
     '                            style={{ background: r.stats.champ > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)", color: r.stats.champ > 0 ? "#d4af37" : "var(--text-dim)" }}',
     '                            title="Grey Cup championships won while in this metro"',
     '                          >',
     '                            {r.stats.champ === 0 ? "No Grey Cups" : r.stats.champ === 1 ? "1 Grey Cup" : `${r.stats.champ} Grey Cups`}',
     '                          </span>',
     '                          {r.stats.finals > 0 && (',
     '                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(110,138,166,0.18)", color: "#a9b8cc" }} title="Grey Cup final appearances (won or lost)">',
     '                              {r.stats.finals} final{r.stats.finals === 1 ? "" : "s"}',
     '                            </span>',
     '                          )}',
     '                          {r.stats.pct > 0 && (',
     '                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }} title="Regular-season win percentage (1945–) while in this metro">',
     '                              {r.stats.pct.toFixed(3)} W%',
     '                            </span>',
     '                          )}',
     '                        </div>',
     '                      )}',
     '                      {r.stats && r.league === "football" && ('])

print("Done. Now run:  python scripts/build-relocations.py   then  npx tsc --noEmit")
