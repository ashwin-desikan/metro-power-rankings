#!/usr/bin/env python3
"""Wire the International Cricket and Rugby Union portals into the site.

Anchor-asserted, idempotent. Touches:
  scripts/check-client-imports.mjs        (register server-only libs)
  lib/leagueStatus.tsx                    (status tags for the two hubs)
  app/DesktopNav.tsx                      (Other Sports dropdown)
  app/MobileMenu.tsx                      (Sports group)
  app/sports/page.tsx                     (league cards + hub order)
  app/countries/[slug]/NationalTeamsSection.tsx  (cricket + rugby cards; full rewrite)
  lib/releases.ts                         (amend the 2026-06-11 entry)

Run from the repo root:  python scripts/patches/2026-06-11-cricket-rugby-wiring.py
"""
import io
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
changed = []
skipped = []


def read(path):
    with io.open(os.path.join(ROOT, path), "r", encoding="utf-8") as f:
        return f.read()


def write(path, content):
    with io.open(os.path.join(ROOT, path), "w", encoding="utf-8", newline="") as f:
        f.write(content)


def patch(path, old, new, label):
    src = read(path)
    if new in src:
        skipped.append(label + " (already applied)")
        return
    n = src.count(old)
    assert n == 1, f"ANCHOR FAIL [{label}] in {path}: expected 1 occurrence, found {n}"
    write(path, src.replace(old, new))
    changed.append(label)


# ---------------- 1. check-client-imports ----------------
patch(
    "scripts/check-client-imports.mjs",
    '  "@/lib/nhl-standings",\n];',
    '  "@/lib/nhl-standings",\n  "@/lib/cricket",\n  "@/lib/rugbyUnion",\n];',
    "check-client-imports: register libs",
)

# ---------------- 2. leagueStatus ----------------
patch(
    "lib/leagueStatus.tsx",
    '  "/teams/nrl":        { label: "Live - Regular Season", tone: "regular" },',
    '  "/teams/nrl":        { label: "Live - Regular Season", tone: "regular" },\n'
    '  "/teams/cricket":    { label: "Year-round", tone: "regular" },\n'
    '  "/teams/rugby-union": { label: "July tests ahead", tone: "offseason" },',
    "leagueStatus: cricket + rugby-union tags",
)

# ---------------- 3. DesktopNav ----------------
patch(
    "app/DesktopNav.tsx",
    '  { href: "/teams/cfl", name: "CFL", sport: "Canadian Football" },\n];',
    '  { href: "/teams/cfl", name: "CFL", sport: "Canadian Football" },\n'
    '  { href: "/teams/cricket", name: "Cricket", sport: "Cricket" },\n'
    '  { href: "/teams/rugby-union", name: "Rugby Union", sport: "Rugby Union" },\n];',
    "DesktopNav: OTHER_SPORTS entries",
)
patch(
    "app/DesktopNav.tsx",
    "IPL &middot; AFL &middot; NRL &middot; CFL</span>",
    "IPL &middot; AFL &middot; NRL &middot; CFL &middot; Cricket &middot; Rugby</span>",
    "DesktopNav: Other Sports subtitle",
)

# ---------------- 4. MobileMenu ----------------
patch(
    "app/MobileMenu.tsx",
    "  { href: '/teams/cfl', label: 'CFL', hint: 'Every CFL franchise, live standings, season records, and Grey Cup history since 1909', group: 'Sports' },",
    "  { href: '/teams/cfl', label: 'CFL', hint: 'Every CFL franchise, live standings, season records, and Grey Cup history since 1909', group: 'Sports' },\n"
    "  { href: '/teams/cricket', label: 'Cricket', hint: 'Every cricket international since 1877: ICC rankings, number-one reigns, honours, and all 110 nations', group: 'Sports' },\n"
    "  { href: '/teams/rugby-union', label: 'Rugby Union', hint: 'Test rugby since 1871: Six Nations, Rugby Championship, World Cup finals, and world rankings since 2003', group: 'Sports' },",
    "MobileMenu: cricket + rugby items",
)

# ---------------- 5. sports page ----------------
NRL_CARD = (
    "  {\n"
    '    league: "NRL",\n'
    '    label: "NRL",\n'
    '    sport: "Rugby League",\n'
    '    status: "live",\n'
    '    page: "/teams/nrl",\n'
    "    team_count: 0,\n"
    "  },"
)
NEW_CARDS = (
    NRL_CARD + "\n"
    "  {\n"
    '    league: "CRICKET",\n'
    '    label: "International Cricket",\n'
    '    sport: "Cricket",\n'
    '    status: "live",\n'
    '    page: "/teams/cricket",\n'
    "    team_count: 0,\n"
    "  },\n"
    "  {\n"
    '    league: "RUGBY",\n'
    '    label: "Rugby Union",\n'
    '    sport: "Rugby Union",\n'
    '    status: "live",\n'
    '    page: "/teams/rugby-union",\n'
    "    team_count: 0,\n"
    "  },"
)
patch("app/sports/page.tsx", NRL_CARD, NEW_CARDS, "sports page: league cards")

patch(
    "app/sports/page.tsx",
    '"/teams/nba", "/teams/nhl", "/teams/ipl", "/teams/afl", "/teams/nrl", "/teams/cfl",',
    '"/teams/nba", "/teams/nhl", "/teams/ipl", "/teams/afl", "/teams/nrl", "/teams/cfl",\n'
    '    "/teams/cricket", "/teams/rugby-union",',
    "sports page: HUB_ORDER",
)

# ---------------- 6. NationalTeamsSection (full rewrite) ----------------
SECTION_PATH = "app/countries/[slug]/NationalTeamsSection.tsx"
OLD_MARKER = "women's football (WWC nations)"
NEW_MARKER = "cricket and rugby union cards"

NEW_SECTION = '''import Link from "next/link";
import { getNationalTeamsForCountry } from "@/lib/nationalTeamsForCountry";
import { getCricketTeamForCountry, CRICKET_FORMATS } from "@/lib/cricket";
import { getRugbyTeamForCountry } from "@/lib/rugbyUnion";

// "National Teams" section on country hub pages: men's football, women's
// football (WWC nations), plus cricket and rugby union cards joined by name
// (West Indies resolves for every member country of the combined Caribbean
// side). Server component; renders nothing when the country has no teams.

const chipStyle = {
  backgroundColor: "var(--bg-card)",
  borderColor: "var(--border)",
  fontFamily: "'JetBrains Mono', monospace",
} as const;

const cardStyle = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-xs">
      <span className="text-[var(--text-dim)]">{label} </span>
      <span className="font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{value}</span>
    </div>
  );
}

function Card({
  href, chip, tag, name, note, children,
}: {
  href: string; chip: string; tag?: string | null; name: string;
  note?: string | null; children: React.ReactNode;
}) {
  return (
    <Link href={href}
          className="block border rounded-lg p-4 transition-colors hover:border-[var(--accent)]"
          style={cardStyle}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border" style={chipStyle}>
          {chip}
        </span>
        {tag ? (
          <span className="text-[10px] text-[var(--text-dim)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {tag}
          </span>
        ) : null}
      </div>
      <div className="font-semibold mb-2">{name}</div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">{children}</div>
      {note ? <div className="text-[10px] text-[var(--text-dim)] mt-2">{note}</div> : null}
    </Link>
  );
}

export default function NationalTeamsSection({ countryName }: { countryName: string }) {
  const { men, women } = getNationalTeamsForCountry(countryName);
  const cricket = getCricketTeamForCountry(countryName);
  const rugby = getRugbyTeamForCountry(countryName);
  if (!men && !women && !cricket && !rugby) return null;

  const cricketMajors = cricket && cricket.honours
    ? cricket.honours.wc.titles + cricket.honours.t20wc.titles + cricket.honours.ct.titles +
      cricket.honours.wtc.titles + cricket.honours.asia.titles
    : 0;

  return (
    <section className="mb-12" id="national-teams">
      <h2 className="text-xl font-bold mb-3">National Teams</h2>
      <p className="text-sm text-[var(--text-muted)] mb-4">
        {countryName} on the international stage. Click a card for the full record.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        {men ? (
          <Card href={`/teams/national/${men.slug}`} chip="Men's Football"
                tag={men.federation} name={men.cur_name || men.name}>
            {men.fifa_rank != null ? <Stat label="FIFA" value={`#${men.fifa_rank}`} /> : null}
            {men.elo_rank != null ? <Stat label="ELO" value={`#${men.elo_rank}`} /> : null}
            <Stat label="WC apps" value={`${men.world_cup.app}`} />
            {men.totals.major_trophies > 0 ? (
              <Stat label="Major trophies" value={`${men.totals.major_trophies}`} />
            ) : null}
          </Card>
        ) : null}
        {women ? (
          <Card href={`/teams/national/womens-world-cup/${women.slug}`} chip="Women's Football"
                name={women.name}>
            <Stat label="WWC apps" value={`${women.appearances}`} />
            {women.titles > 0 ? <Stat label="Titles" value={`${women.titles}`} /> : null}
            {women.best_finish ? <Stat label="Best" value={women.best_finish} /> : null}
          </Card>
        ) : null}
        {cricket ? (
          <Card href={`/teams/cricket/${cricket.slug}`} chip="Cricket"
                tag={cricket.full_member ? "Full Member" : "Associate"} name={cricket.name}
                note={cricket.name === "West Indies" && countryName !== "West Indies"
                  ? "Combined side of the cricket-playing Caribbean" : null}>
            {CRICKET_FORMATS.map((f) => {
              const rk = cricket.rankings[f];
              return rk && rk.current_rank != null
                ? <Stat key={f} label={f} value={`#${rk.current_rank}`} />
                : null;
            })}
            {cricketMajors > 0 ? <Stat label="Major titles" value={`${cricketMajors}`} /> : null}
            <Stat label="Matches" value={cricket.overall.m.toLocaleString()} />
          </Card>
        ) : null}
        {rugby ? (
          <Card href={`/teams/rugby-union/${rugby.slug}`} chip="Rugby Union"
                tag={rugby.six_nations ? "Six Nations" : rugby.sanzaar ? "SANZAAR" : null}
                name={rugby.name}>
            {rugby.ranking && rugby.ranking.current != null ? (
              <Stat label="World" value={`#${rugby.ranking.current}`} />
            ) : null}
            {rugby.rwc && rugby.rwc.titles > 0 ? (
              <Stat label="RWC titles" value={`${rugby.rwc.titles}`} />
            ) : null}
            {rugby.championships && rugby.championships.five_six_titles > 0 ? (
              <Stat label="6N titles" value={`${rugby.championships.five_six_titles}`} />
            ) : null}
            {rugby.championships && rugby.championships.trc_titles > 0 ? (
              <Stat label="TRC titles" value={`${rugby.championships.trc_titles}`} />
            ) : null}
            {rugby.record ? <Stat label="Tests" value={rugby.record.m.toLocaleString()} /> : null}
          </Card>
        ) : null}
      </div>
    </section>
  );
}
'''

src = read(SECTION_PATH)
if NEW_MARKER in src:
    skipped.append("NationalTeamsSection (already applied)")
else:
    assert OLD_MARKER in src, "ANCHOR FAIL [NationalTeamsSection]: v1 marker not found"
    write(SECTION_PATH, NEW_SECTION)
    changed.append("NationalTeamsSection: cricket + rugby cards")

# ---------------- 7. releases.ts (amend 2026-06-11) ----------------
OLD_RELEASE = '''  {
    date: "2026-06-11",
    headline: "National Teams arrive on country hubs",
    items: [
      "Every country page now has a National Teams section: a men's football card with federation, FIFA and ELO ranks, World Cup appearances and major trophies, plus a women's card with World Cup history.",
      "Cards link straight to each team's full tournament record, covering 230 men's national teams and all 44 Women's World Cup nations.",
    ],
  },'''
NEW_RELEASE = '''  {
    date: "2026-06-11",
    headline: "National teams: football, cricket, rugby union",
    items: [
      "Every country page now has a National Teams section: a men's football card with federation, FIFA and ELO ranks, World Cup appearances and major trophies, plus a women's card with World Cup history.",
      "Cards link straight to each team's full tournament record, covering 230 men's national teams and all 44 Women's World Cup nations.",
      "New International Cricket portal: every men's international since 1877 for all 110 nations, with recomputed monthly ICC rankings, number-one reigns, major honours, and the named series trophies.",
      "New Rugby Union portal: test rugby since 1871, every Six Nations and Rugby Championship season, all ten World Cup finals, and weekly world rankings since 2003; both sports join the country-hub cards.",
    ],
  },'''
patch("lib/releases.ts", OLD_RELEASE, NEW_RELEASE, "releases: amend 2026-06-11 entry")

print("CHANGED:")
for c in changed:
    print("  +", c)
if skipped:
    print("SKIPPED:")
    for s in skipped:
        print("  =", s)
print("OK" if changed or skipped else "NO-OP")
