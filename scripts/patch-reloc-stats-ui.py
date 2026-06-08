#!/usr/bin/env python3
"""Host-side (Windows) patch: add per-stint stat chips to the Defunct/Relocated
team tiles. Edits lib/data.ts (RelocationCard.stats) and app/rankings/[slug]/page.tsx
(the chip block). Run on Windows so the real file is edited (the sandbox bindfs view
of page.tsx is truncated). Idempotent and newline-preserving. Run from repo root:

    python scripts/patch-reloc-stats-ui.py
"""
import os, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def patch(rel, marker, old_lines, new_lines):
    path = os.path.join(ROOT, rel)
    with open(path, "r", encoding="utf-8", newline="") as f:
        content = f.read()
    nl = "\r\n" if "\r\n" in content else "\n"
    if marker in content:
        print(f"SKIP {rel}: already patched"); return
    old = nl.join(old_lines)
    new = nl.join(new_lines)
    n = content.count(old)
    if n != 1:
        sys.exit(f"FAIL {rel}: anchor matched {n} times (need exactly 1). Aborting.")
    before = len(content)
    content2 = content.replace(old, new, 1)
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

# ---- lib/data.ts : add stats to the RelocationCard type ----
patch(
    "lib/data.ts",
    "  stats?:",
    [
        "  relocated?: boolean;",
        "  defunct?: boolean;",
        "};",
    ],
    [
        "  relocated?: boolean;",
        "  defunct?: boolean;",
        "  // Per-stint stats, summed only over the franchise's years in THIS metro.",
        "  // Populated for BIG4 tiles by scripts/build-relocations.py. pct is win%",
        "  // for NFL/NBA/MLB and points% for NHL. finals = WS appearances (MLB pennants).",
        "  stats?: { champ: number; div: number; finals: number; pct: number };",
        "};",
    ],
)

# ---- app/rankings/[slug]/page.tsx : add the chip row under the years line ----
patch(
    os.path.join("app", "rankings", "[slug]", "page.tsx"),
    "r.stats &&",
    [
        '                      <p className="text-xs text-[var(--text-dim)]">{r.years}</p>',
    ],
    [
        '                      <p className="text-xs text-[var(--text-dim)]">{r.years}</p>',
        '                      {r.stats && (r.league === "nfl" || r.league === "nba" || r.league === "nhl" || r.league === "mlb") && (',
        '                        <div className="flex gap-1.5 mt-2 flex-wrap">',
        '                          <span',
        '                            className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide"',
        '                            style={{',
        '                              background: r.stats.champ > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)",',
        '                              color: r.stats.champ > 0 ? "#d4af37" : "var(--text-dim)",',
        '                            }}',
        '                            title="Titles won during the years this franchise played in this metro"',
        '                          >',
        '                            {r.league === "mlb"',
        '                              ? (r.stats.champ === 0 ? "No WS" : r.stats.champ === 1 ? "1 WS" : `${r.stats.champ} WS`)',
        '                              : r.league === "nhl"',
        '                              ? (r.stats.champ === 0 ? "No Cups" : r.stats.champ === 1 ? "1 Cup" : `${r.stats.champ} Cups`)',
        '                              : (r.stats.champ === 0 ? "No titles" : r.stats.champ === 1 ? "1 title" : `${r.stats.champ} titles`)}',
        '                          </span>',
        '                          <span',
        '                            className="text-[10px] px-1.5 py-0.5 rounded"',
        '                            style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }}',
        '                            title={r.league === "nhl" ? "Points percentage during the years in this metro" : "Regular-season win percentage during the years in this metro"}',
        '                          >',
        '                            {r.stats.pct.toFixed(3)} {r.league === "nhl" ? "Pts%" : "W%"}',
        '                          </span>',
        '                          {r.league === "mlb" && r.stats.finals > 0 && (',
        '                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(110,138,166,0.18)", color: "#a9b8cc" }} title="Pennants (World Series appearances) won in this metro">',
        '                              {r.stats.finals} pennant{r.stats.finals === 1 ? "" : "s"}',
        '                            </span>',
        '                          )}',
        '                          {r.league !== "mlb" && r.stats.div > 0 && (',
        '                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }} title="Division titles won in this metro">',
        '                              {r.stats.div} div',
        '                            </span>',
        '                          )}',
        '                        </div>',
        '                      )}',
    ],
)
# ---- page.tsx : show the Sports section / TeamsSection for metros that have ONLY
# defunct-or-relocated teams (e.g. Pottsville: 0 current teams, 1 Maroons tile). ----
patch(
    os.path.join("app", "rankings", "[slug]", "page.tsx"),
    "|| getRelocationsForMetro(slug).length > 0) && (() => {",
    [
        '        {((detail.teams && detail.teams.length > 0) || (detail.events && detail.events.length > 0) || (detail.culture && detail.culture[sportsEventType])) && (() => {',
    ],
    [
        '        {((detail.teams && detail.teams.length > 0) || (detail.events && detail.events.length > 0) || (detail.culture && detail.culture[sportsEventType]) || getRelocationsForMetro(slug).length > 0) && (() => {',
    ],
)
patch(
    os.path.join("app", "rankings", "[slug]", "page.tsx"),
    "teams={detail.teams || []}",
    [
        '              {detail.teams && detail.teams.length > 0 && (',
        '                <TeamsSection teams={detail.teams} topTeamPick={topTeamPick} relocations={getRelocationsForMetro(slug)} />',
        '              )}',
    ],
    [
        '              {((detail.teams && detail.teams.length > 0) || getRelocationsForMetro(slug).length > 0) && (',
        '                <TeamsSection teams={detail.teams || []} topTeamPick={topTeamPick} relocations={getRelocationsForMetro(slug)} />',
        '              )}',
    ],
)
print("Done. Now run:  python scripts/build-relocations.py   then  npx tsc --noEmit")
