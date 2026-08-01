import fs from "fs";
import path from "path";
import type { Metadata } from "next";
import Link from "next/link";
import CrestIcon from "@/app/teams/_shared/CrestIcon";
import HubNav from "@/app/teams/HubNav";
import FootballHubNav from "@/app/teams/FootballHubNav";
import RankingTable, { type CoefCountry } from "../2025-26/RankingTable";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { getFootballClubByName } from "@/lib/football";
import { getClubStandings, getClubCompetitions, getSuperCups, getDomesticCups, type LiveRow, type LiveComp } from "@/lib/clubFootballLive";
import Hub2027Client, { type HubConf, type HubLeague, type HubGroup, type HubRow } from "./Hub2027Client";
import { SuperCupsSection, DomesticCupsSection } from "./LiveCups";
import { FootballHero } from "@/app/teams/_shared/FootballHero";
import { StatTile, StatGrid } from "@/app/teams/_shared/StatTile";
import { Badge } from "@/app/teams/_shared/Badge";
import { ResponsiveTable, RankRow } from "@/app/teams/_shared/ResponsiveTable";

export const revalidate = 300;

const PATH = "/teams/football/2026-27";
const TITLE = "2026-27 Club Football";
const DESC =
  "The 2026-27 club season in one place: live league tables for every domestic competition tracked, grouped by confederation and tier, plus the European club competitions and Copa Libertadores.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { card: "summary", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const cardStyle = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const CONF_ORDER = ["UEFA · Primary", "UEFA · Secondary", "UEFA · Spring-Summer", "CONMEBOL", "CONCACAF", "AFC", "CAF"];
const COMP_ORDER = [2, 3, 848, 13]; // CL, EL, ECL, Libertadores (Super Cup lives in the Super Cups section)

// api-football league_id -> the nine domestic leagues that have a dedicated hub page.
// Standings rows for these link through to /teams/football/leagues/<slug>.
const LEAGUE_HUB_BY_ID: Record<number, string> = {
  39: "premier-league", 140: "la-liga", 135: "serie-a", 78: "bundesliga", 61: "ligue-1",
  88: "eredivisie", 94: "primeira-liga", 179: "scottish-premiership", 253: "mls",
};

// UEFA association-coefficient tiers. `tier` decides which of the three UEFA tabs a country's
// leagues sit under; `rank` orders countries within a tab (ascending = strongest coefficient
// first) and orders the three tabs themselves. Countries absent here fall through to Secondary.
type UefaTier = "Primary" | "Secondary" | "Spring-Summer";
const UEFA_TIERS: Record<string, { tier: UefaTier; rank: number }> = {
  England: { tier: "Primary", rank: 1 }, Italy: { tier: "Primary", rank: 2 }, Spain: { tier: "Primary", rank: 3 },
  Germany: { tier: "Primary", rank: 4 }, France: { tier: "Primary", rank: 5 }, Portugal: { tier: "Primary", rank: 6 },
  Netherlands: { tier: "Primary", rank: 8 }, Scotland: { tier: "Primary", rank: 19 },
  Belgium: { tier: "Secondary", rank: 7 }, Turkey: { tier: "Secondary", rank: 9 }, "Czech Republic": { tier: "Secondary", rank: 10 },
  Poland: { tier: "Secondary", rank: 11 }, Greece: { tier: "Secondary", rank: 12 }, Denmark: { tier: "Secondary", rank: 13 },
  Cyprus: { tier: "Secondary", rank: 15 }, Switzerland: { tier: "Secondary", rank: 16 }, Hungary: { tier: "Secondary", rank: 17 },
  Austria: { tier: "Secondary", rank: 20 }, Romania: { tier: "Secondary", rank: 21 }, Ukraine: { tier: "Secondary", rank: 22 },
  Croatia: { tier: "Secondary", rank: 23 }, Slovenia: { tier: "Secondary", rank: 24 }, Israel: { tier: "Secondary", rank: 25 },
  Azerbaijan: { tier: "Secondary", rank: 26 }, Slovakia: { tier: "Secondary", rank: 27 }, Bulgaria: { tier: "Secondary", rank: 28 },
  Russia: { tier: "Secondary", rank: 29 }, Serbia: { tier: "Secondary", rank: 30 }, Armenia: { tier: "Secondary", rank: 33 },
  "Bosnia-Herzegovina": { tier: "Secondary", rank: 34 }, Kosovo: { tier: "Secondary", rank: 35 }, Moldova: { tier: "Secondary", rank: 39 },
  "North Macedonia": { tier: "Secondary", rank: 42 }, Albania: { tier: "Secondary", rank: 44 }, Malta: { tier: "Secondary", rank: 45 },
  Andorra: { tier: "Secondary", rank: 47 }, Gibraltar: { tier: "Secondary", rank: 49 }, "Northern Ireland": { tier: "Secondary", rank: 50 },
  Luxembourg: { tier: "Secondary", rank: 51 }, Montenegro: { tier: "Secondary", rank: 53 }, Wales: { tier: "Secondary", rank: 54 },
  "San Marino": { tier: "Secondary", rank: 55 },
  Norway: { tier: "Spring-Summer", rank: 14 }, Sweden: { tier: "Spring-Summer", rank: 18 }, Iceland: { tier: "Spring-Summer", rank: 31 },
  Ireland: { tier: "Spring-Summer", rank: 32 }, Latvia: { tier: "Spring-Summer", rank: 36 }, Kazakhstan: { tier: "Spring-Summer", rank: 37 },
  Finland: { tier: "Spring-Summer", rank: 38 }, "Faroe Islands": { tier: "Spring-Summer", rank: 41 }, Belarus: { tier: "Spring-Summer", rank: 43 },
  Lithuania: { tier: "Spring-Summer", rank: 46 }, Estonia: { tier: "Spring-Summer", rank: 48 }, Georgia: { tier: "Spring-Summer", rank: 52 },
};
const DASH = "—";

// Country coefficients that seed 2026-27 (2026 UEFA ranking, five-year window 2021/22–2025/26).
// Shown in the Club power ranking section until the live club ranking publishes in September.
const COEF_2027 = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "public", "data", "football", "country-coeff-2026-27.json"), "utf-8"),
) as { clubSeasons: string[]; window: string; countries: CoefCountry[] };

const num = (v: number | null | undefined): number | string => (v === null || v === undefined ? DASH : v);
const byPtsGd = (a: LiveRow, b: LiveRow) => (b.points ?? 0) - (a.points ?? 0) || (b.gd ?? 0) - (a.gd ?? 0);

function resolveClub(r: { name: string | null; lookup: string | null }): { name: string; slug: string | null } {
  const c = getFootballClubByName(r.lookup ?? "") ?? getFootballClubByName(r.name ?? "");
  return { name: c?.cur_name ?? r.name ?? r.lookup ?? DASH, slug: c?.slug ?? null };
}

const isFinished = (s: string | null) => !!s && ["FT", "AET", "PEN"].includes(s);
const fmtDate = (d: string | null): string => {
  if (!d) return DASH;
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? DASH : dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
};

// Calendar-year / spring-summer top flights whose 2026-27 season ends in 2026, not 2027.
// (Regular autumn-spring leagues fall through to 2027.) J-League moves to an autumn-spring
// calendar in 2026-27, so Japan is intentionally NOT listed here.
const FIRST_YEAR_ENDERS = new Set([
  "Argentina", "Belarus", "Brazil", "China", "Estonia", "Faroe Islands", "Finland", "Georgia",
  "Iceland", "Ireland", "Kazakhstan", "Latvia", "Lithuania", "Norway", "South Korea", "Sweden",
  "United States", "Uruguay",
]);

// ---- domestic: build confederation -> country -> leagues (resolved) -----
function buildConfs(standings: Awaited<ReturnType<typeof getClubStandings>>): HubConf[] {
  const confMap = new Map<string, Map<string, HubLeague[]>>();
  for (const lg of standings) {
    const groups: HubGroup[] = lg.groups
      .map((g): HubGroup => ({
        label: lg.groups.length > 1 ? g.group_label : null,
        rows: g.rows.slice().sort(byPtsGd).map((r): HubRow => {
          const c = resolveClub(r);
          return { rank: r.rank, name: c.name, slug: c.slug,
            cells: [num(r.played), num(r.win), num(r.draw), num(r.lose), num(r.gf), num(r.ga), num(r.gd), num(r.points)] };
        }),
      }))
      .filter((g) => g.rows.length > 0);
    if (groups.length === 0) continue;
    const uefaTier = lg.confederation === "UEFA" ? (UEFA_TIERS[lg.country ?? ""]?.tier ?? "Secondary") : null;
    const conf = uefaTier ? `UEFA · ${uefaTier}` : (lg.confederation ?? "Other");
    const country = lg.country ?? DASH;
    if (!confMap.has(conf)) confMap.set(conf, new Map());
    const byCountry = confMap.get(conf)!;
    if (!byCountry.has(country)) byCountry.set(country, []);
    byCountry.get(country)!.push({ id: lg.league_id, name: lg.name ?? DASH, level: lg.level, groups, end_year: FIRST_YEAR_ENDERS.has(lg.country ?? "") ? 2026 : 2027, hubSlug: LEAGUE_HUB_BY_ID[lg.league_id] ?? null });
  }
  const order = (c: string) => { const i = CONF_ORDER.indexOf(c); return i === -1 ? CONF_ORDER.length : i; };
  return [...confMap.entries()]
    .sort((a, b) => order(a[0]) - order(b[0]))
    .map(([confederation, byCountry]) => ({
      confederation,
      countries: [...byCountry.entries()]
        .sort((a, b) => {
          // UEFA countries order by coefficient rank (ascending); everything else alphabetical.
          const ra = UEFA_TIERS[a[0]]?.rank, rb = UEFA_TIERS[b[0]]?.rank;
          if (ra != null && rb != null) return ra - rb;
          if (ra != null) return -1;
          if (rb != null) return 1;
          return a[0].localeCompare(b[0]);
        })
        .map(([country, leagues]) => ({ country, leagues: leagues.sort((x, y) => (x.level ?? 99) - (y.level ?? 99) || x.name.localeCompare(y.name)) })),
    }));
}

// ---- continental competitions band --------------------------------------
function CompGroupTable({ rows }: { rows: LiveRow[] }) {
  const cols = ["P", "W", "D", "L", "GD", "Pts"];
  const sorted = rows.slice().sort(byPtsGd);
  return (
    <ResponsiveTable
      compact
      variant="list"
      className="rounded-lg border"
      style={cardStyle}
      mobileRows={sorted.map((r, i) => {
        const c = resolveClub(r);
        return (
          <RankRow
            key={i}
            rank={r.rank ?? i + 1}
            name={
              <>
                <CrestIcon name={c.name} size={14} className="flex-shrink-0" />
                {c.slug ? <Link href={`/teams/football/${c.slug}`} className="hover:text-[var(--accent)] truncate">{c.name}</Link> : <span className="truncate">{c.name}</span>}
              </>
            }
            sub={<>{num(r.played)} P · {num(r.win)}-{num(r.draw)}-{num(r.lose)} · {typeof r.gd === "number" && r.gd > 0 ? `+${r.gd}` : num(r.gd)} GD</>}
            right={num(r.points)}
            rightSub="pts"
          />
        );
      })}
    >
      <table className="w-full text-xs min-w-[300px]">
        <thead>
          <tr className="text-left text-[var(--text-muted)]">
            <th className="py-1 px-1.5 font-medium text-right">#</th>
            <th className="py-1 px-1.5 font-medium">Club</th>
            {cols.map((c) => <th key={c} className="py-1 px-1.5 font-medium text-right tabular-nums">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            const c = resolveClub(r);
            return (
              <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-1 px-1.5 text-right tabular-nums text-[var(--text-dim)]" style={mono}>{r.rank ?? i + 1}</td>
                <td className="py-1 px-1.5 font-medium whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    <CrestIcon name={c.name} size={14} className="flex-shrink-0" />
                    {c.slug ? <Link href={`/teams/football/${c.slug}`} className="hover:text-[var(--accent)]">{c.name}</Link> : <span>{c.name}</span>}
                  </span>
                </td>
                {[num(r.played), num(r.win), num(r.draw), num(r.lose), num(r.gd), num(r.points)].map((v, j) => (
                  <td key={j} className="py-1 px-1.5 text-right tabular-nums" style={mono}>{v}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </ResponsiveTable>
  );
}

function CompCard({ comp }: { comp: LiveComp }) {
  const upcoming = comp.fixtures.filter((f) => !isFinished(f.status)).sort((a, b) => (a.kickoff ?? "").localeCompare(b.kickoff ?? "")).slice(0, 5);
  const recent = comp.fixtures.filter((f) => isFinished(f.status)).sort((a, b) => (b.kickoff ?? "").localeCompare(a.kickoff ?? "")).slice(0, 5);
  const fxLine = (f: LiveComp["fixtures"][number]) => {
    const h = resolveClub(f.home).name, a = resolveClub(f.away).name;
    const res = isFinished(f.status) && f.home_goals !== null && f.away_goals !== null ? `${f.home_goals}–${f.away_goals}` : fmtDate(f.kickoff);
    return { key: f.fixture_id, text: `${h} v ${a}`, res };
  };
  const isLibertadores = comp.league_id === 13;
  const name = isLibertadores ? "Copa Libertadores" : (comp.name ?? "").replace(/^UEFA |^CONMEBOL /, "");
  return (
    <details className="rounded-xl border overflow-hidden" style={cardStyle} open={comp.groups.length > 0 && !isLibertadores}>
      <summary className="cursor-pointer select-none px-4 py-2.5 font-semibold text-sm">{name}</summary>
      <div className="border-t px-3 py-3 space-y-3" style={{ borderColor: "var(--border)" }}>
        {comp.groups.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {comp.groups.slice().sort((a, b) => a.group_label.localeCompare(b.group_label)).map((g) => (
              <div key={g.group_label}>
                <div className="text-[11px] font-semibold text-[var(--text-muted)] mb-1">{g.group_label}</div>
                <CompGroupTable rows={g.rows} />
              </div>
            ))}
          </div>
        )}
        {(upcoming.length > 0 || recent.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {recent.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold text-[var(--text-muted)] mb-1">Recent</div>
                {recent.map(fxLine).map((f) => (
                  <div key={f.key} className="flex justify-between gap-2 py-0.5"><span className="truncate">{f.text}</span><span className="tabular-nums text-[var(--text-dim)]" style={mono}>{f.res}</span></div>
                ))}
              </div>
            )}
            {upcoming.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold text-[var(--text-muted)] mb-1">Upcoming</div>
                {upcoming.map(fxLine).map((f) => (
                  <div key={f.key} className="flex justify-between gap-2 py-0.5"><span className="truncate">{f.text}</span><span className="tabular-nums text-[var(--text-dim)]" style={mono}>{f.res}</span></div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </details>
  );
}

export default async function ClubFootball2027Page() {
  const [standings, comps, superCups, domesticCups] = await Promise.all([
    getClubStandings(), getClubCompetitions(), getSuperCups(), getDomesticCups(),
  ]);
  const confs = buildConfs(standings);
  const compById = new Map(comps.map((c) => [c.league_id, c]));
  const orderedComps = COMP_ORDER.map((id) => compById.get(id)).filter((c): c is LiveComp => !!c && (c.groups.length > 0 || c.fixtures.length > 0));
  const totalLeagues = confs.reduce((a, c) => a + c.countries.reduce((b, k) => b + k.leagues.length, 0), 0);

  const nav = [
    { label: "Power Ranking", href: "#ranking" },
    ...(orderedComps.length > 0 ? [{ label: "Competitions", href: "#competitions" }] : []),
    { label: "Leagues", href: "#domestic" },
    ...(domesticCups.some((c) => c.fixtures.length > 0) ? [{ label: "Domestic Cups", href: "#domestic-cups" }] : []),
    ...(superCups.some((c) => c.fixtures.length > 0) ? [{ label: "Super Cups", href: "#supercups" }] : []),
  ];

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <Link href="/teams/football" className="hover:underline">Football</Link>{" / "}
        <span>2026-27</span>
      </nav>

      <FootballHubNav current="season" />

      <FootballHero
        eyebrow={<span className="inline-flex items-center gap-1.5"><Badge variant="live" dot>Live</Badge> 2026-27 Season</span>}
        title={<h1 className="text-3xl font-semibold tracking-tight">2026-27 Club Football</h1>}
        subtitle={
          <>
            Every domestic league and level the site tracks, live, grouped by confederation and tier, alongside
            the European club competitions and Copa Libertadores. Tables refresh daily; leagues appear here once
            their season is under way.
          </>
        }
        cta={
          <div className="flex items-center gap-3 text-xs flex-shrink-0">
            <Link href="/teams/football/2025-26" className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 hover:text-[var(--accent)] transition-colors" style={{ background: "var(--bg-card-hover)", borderColor: "var(--border)" }}><span className="text-[var(--text-dim)]">←</span> 2025-26</Link>
            <Link href="/teams/football/seasons" className="text-[var(--text-muted)] hover:text-[var(--accent)]">All seasons</Link>
          </div>
        }
        stats={
          <StatGrid className="sm:grid-cols-3">
            <StatTile label="Live leagues" value={totalLeagues} />
            <StatTile label="Continental competitions" value={orderedComps.length} />
            <StatTile label="Confederations" value={confs.length} />
          </StatGrid>
        }
      />

      <HubNav items={nav} />

      <section id="ranking" className="scroll-mt-24 mb-10">
        <h2 className="text-lg font-semibold mb-1">Club power ranking</h2>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          The 2026-27 club power ranking publishes around the first September international break, once the
          season has been played in enough. Until then, these are the 2026 UEFA country coefficients (five-year
          window {COEF_2027.window}) that seed this season&rsquo;s European competitions.
        </p>
        <RankingTable clubs={[]} countries={COEF_2027.countries} clubSeasons={COEF_2027.clubSeasons} />
      </section>

      {orderedComps.length > 0 && (
        <section id="competitions" className="scroll-mt-24 mb-10">
          <h2 className="text-lg font-semibold mb-3">Continental competitions</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
            {orderedComps.map((c) => <CompCard key={c.league_id} comp={c} />)}
          </div>
        </section>
      )}

      <section id="domestic" className="scroll-mt-24 mb-10">
        <h2 className="text-lg font-semibold mb-3">Domestic leagues</h2>
        {confs.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] italic">No live league tables right now. Most European seasons begin in August.</p>
        ) : (
          <Hub2027Client confs={confs} season="2026-27" />
        )}
      </section>

      <DomesticCupsSection cups={domesticCups} />
      <SuperCupsSection cups={superCups} />
    </main>
  );
}
