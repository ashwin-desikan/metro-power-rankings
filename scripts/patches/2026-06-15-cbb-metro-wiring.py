# Task 27 - wire CBB (men's college basketball) into the metro layer.
# Anchor-asserted patches to lib/teamLinks.ts, lib/leagueHubs.ts, and
# app/rankings/[slug]/page.tsx. Run from repo root: python scripts/patches/2026-06-15-cbb-metro-wiring.py
import io, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def rd(rel):
    with io.open(os.path.join(ROOT, rel), "r", encoding="utf-8") as f:
        return f.read()

def wr(rel, s):
    with io.open(os.path.join(ROOT, rel), "w", encoding="utf-8") as f:
        f.write(s)

def sub(content, old, new, rel, n=1):
    c = content.count(old)
    if c != n:
        sys.exit("ANCHOR FAIL in %s: expected %d, found %d for:\n%r" % (rel, n, c, old[:80]))
    return content.replace(old, new)

BB = "\U0001F3C0"  # basketball emoji

# ===================== lib/teamLinks.ts =====================
tl = "lib/teamLinks.ts"
c = rd(tl)
c = sub(c,
    'import { getCfbTeamForName, cfbMonogram } from "./cfb";',
    'import { getCfbTeamForName, cfbMonogram } from "./cfb";\n'
    'import { getCbbTeamForName } from "./cbb";\n'
    'import { cbbMonogram } from "./cbbShared";',
    tl)
c = sub(c, '"cfb" | "npb";', '"cfb" | "npb" | "cbb";', tl)
c = sub(c,
    '  return CFB_SPORT_LABELS.has(sport) || leagueHint === "CFB" || leagueHint === "FBS";\n}',
    '  return CFB_SPORT_LABELS.has(sport) || leagueHint === "CFB" || leagueHint === "FBS";\n}\n'
    '\n'
    '// Men\'s college basketball is tagged sport "Basketball" + league "NCAA" in\n'
    '// the metro Team List (women\'s college is "NCAA W"; the NBA is "NBA"). The\n'
    '// NBA matcher keys on the bare "Basketball" sport, so isCbb must be\n'
    '// league-gated and checked before the NBA branch in resolveTeamLink.\n'
    'const CBB_LEAGUE_LABELS = new Set(["NCAA", "NCAAM", "CBB"]);\n'
    'function isCbb(sport: string, leagueHint: string): boolean {\n'
    '  return (sport === "Basketball" || sport === "College Basketball") && CBB_LEAGUE_LABELS.has(leagueHint);\n'
    '}',
    tl)
c = sub(c,
    '  const cleanName = teamName.trim();\n\n  if (isNfl(sport, leagueHint)) {',
    '  const cleanName = teamName.trim();\n'
    '\n'
    '  // College basketball is checked before the NBA, which matches the bare\n'
    '  // "Basketball" sport label, so NCAA men\'s teams route to their -ncaam pages.\n'
    '  if (isCbb(sport, leagueHint)) {\n'
    '    const f = getCbbTeamForName(cleanName);\n'
    '    if (!f) return null;\n'
    '    return {\n'
    '      slug: f.slug,\n'
    '      league: "cbb",\n'
    '      href: `/teams/cbb/${f.slug}`,\n'
    '      logoUrl: null,\n'
    '      monogram: { bg: f.color || "#444", fg: "#ffffff", mono: cbbMonogram(f.name) },\n'
    '      displayName: f.name,\n'
    '    };\n'
    '  }\n'
    '\n'
    '  if (isNfl(sport, leagueHint)) {',
    tl)
wr(tl, c)
print("OK teamLinks.ts")

# ===================== lib/leagueHubs.ts =====================
lh = "lib/leagueHubs.ts"
c = rd(lh)
c = sub(c,
    'href: "/teams/wnba", countrySlugs: ["united-states"] },',
    'href: "/teams/wnba", countrySlugs: ["united-states"] },\n'
    '  { key: "cbb", label: "College Basketball (NCAA D-I)", short: "CBB", icon: "%s", sport: "Basketball", href: "/teams/cbb", countrySlugs: ["united-states"] },' % BB,
    lh)
c = sub(c,
    '["nfl", "cfb", "nba", "mlb", "nhl", "mls", "wnba", "nwsl"]',
    '["nfl", "cfb", "nba", "cbb", "mlb", "nhl", "mls", "wnba", "nwsl"]',
    lh)
wr(lh, c)
print("OK leagueHubs.ts")

# ===================== app/rankings/[slug]/page.tsx =====================
pg = "app/rankings/[slug]/page.tsx"
c = rd(pg)
# import
c = sub(c,
    'import { getCfbTeamForName, cfbMonogram, getFormerMajorCfbForMetro, type FormerCfbCard } from "@/lib/cfb";',
    'import { getCfbTeamForName, cfbMonogram, getFormerMajorCfbForMetro, type FormerCfbCard } from "@/lib/cfb";\n'
    'import { getFormerMajorCbbForMetro, type FormerCbbCard } from "@/lib/cbb";',
    pg)
# pass prop at usage
c = sub(c,
    'formerCfb={getFormerMajorCfbForMetro(slug)} />',
    'formerCfb={getFormerMajorCfbForMetro(slug)} formerCbb={getFormerMajorCbbForMetro(slug)} />',
    pg)
# destructure default
c = sub(c,
    '  relocations = [],\n  formerCfb = [],\n}: {',
    '  relocations = [],\n  formerCfb = [],\n  formerCbb = [],\n}: {',
    pg)
# props type
c = sub(c,
    '  formerCfb?: FormerCfbCard[];\n}) {',
    '  formerCfb?: FormerCfbCard[];\n  formerCbb?: FormerCbbCard[];\n}) {',
    pg)
# outer "Other Teams" visibility
c = sub(c,
    '(otherFbs.length > 0 || otherFootball.length > 0 || otherCollege.length > 0 || otherMen.length > 0 || otherWomen.length > 0 || relocations.length > 0 || formerCfb.length > 0)',
    '(otherFbs.length > 0 || otherFootball.length > 0 || otherCollege.length > 0 || otherMen.length > 0 || otherWomen.length > 0 || relocations.length > 0 || formerCfb.length > 0 || formerCbb.length > 0)',
    pg)
# details visibility
c = sub(c,
    '{(relocations.length > 0 || formerCfb.length > 0) && (',
    '{(relocations.length > 0 || formerCfb.length > 0 || formerCbb.length > 0) && (',
    pg)
# count + pluralization
c = sub(c,
    '{relocations.length + formerCfb.length} team{relocations.length + formerCfb.length !== 1 ? "s" : ""}',
    '{relocations.length + formerCfb.length + formerCbb.length} team{relocations.length + formerCfb.length + formerCbb.length !== 1 ? "s" : ""}',
    pg)
wr(pg, c)
print("OK page.tsx (part 1)")

# CBB former-program cards, mirroring the formerCfb map (titles/Final4/NCAA app/W%)
c = rd(pg)
block = (
    '                    ...formerCbb.map((f) => ({ y: f.lastYear, el: (\n'
    '                    <Link key={f.slug} href={f.href} className="border rounded-lg p-4 hover:border-[var(--accent)] transition bg-[var(--bg-card)] border-[var(--border)] block">\n'
    '                      <p className="text-xs text-[var(--text-muted)] mb-1"><span aria-hidden className="mr-1">' + BB + '</span>College Basketball &bull; Former D-I</p>\n'
    '                      <div className="flex items-center gap-2">\n'
    '                        <span className="rounded-md grid place-items-center font-bold text-white text-[10px] flex-shrink-0" style={{ background: f.color, width: 24, height: 24 }} aria-hidden>{f.mono}</span>\n'
    '                        <p className="font-semibold text-[var(--text)]">{f.name}</p>\n'
    '                      </div>\n'
    '                      {f.years && <p className="text-xs text-[var(--text-dim)] mt-1">{f.years}</p>}\n'
    '                      <div className="flex gap-1.5 mt-2 flex-wrap">\n'
    '                        <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide" style={{ background: f.titles > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)", color: f.titles > 0 ? "#d4af37" : "var(--text-dim)" }} title="NCAA championships won">\n'
    '                          {f.titles === 0 ? "No titles" : `${f.titles} Title${f.titles === 1 ? "" : "s"}`}\n'
    '                        </span>\n'
    '                        {f.final4 > 0 && (\n'
    '                          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }} title="Final Four appearances">\n'
    '                            {f.final4} Final Four{f.final4 === 1 ? "" : "s"}\n'
    '                          </span>\n'
    '                        )}\n'
    '                        {f.tour_app > 0 && (\n'
    '                          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }} title="NCAA Tournament appearances">\n'
    '                            {f.tour_app} NCAA app{f.tour_app === 1 ? "" : "s"}\n'
    '                          </span>\n'
    '                        )}\n'
    '                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(85,85,106,0.16)", color: "var(--text-dim)" }} title="All-time win percentage as a Division I program">\n'
    '                          {f.pct.toFixed(3)} W%\n'
    '                        </span>\n'
    '                      </div>\n'
    '                    </Link>\n'
    '                    ) })),\n'
)
anchor = ') })),\n                  ].sort((a, b) => b.y - a.y).map((e) => e.el)}'
c = sub(c, anchor, ') })),\n' + block + '                  ].sort((a, b) => b.y - a.y).map((e) => e.el)}', pg)
wr(pg, c)
print("OK page.tsx (part 2 - cards)")
print("ALL PATCHES APPLIED")
