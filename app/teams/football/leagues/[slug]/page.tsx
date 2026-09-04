import type { Metadata } from "next";
import { Fragment } from "react";
import HubNav from "@/app/teams/HubNav";
import FootballHubNav from "@/app/teams/FootballHubNav";
import Link from "next/link";
import TeamCrest from "@/app/teams/_shared/TeamCrest";
import { notFound } from "next/navigation";
import {
  getAllLeagueHubSlugs,
  getLeagueHub,
  getAllClubs,
  getCupsForClub,
  getEuropeForClub,
  getFootballClubByName,
  monogramForFootball,
  europeanCompDisplayCode,
  europeanCompSortKey,
  type FootballLeagueHub,
  type FootballCupFinal,
  type FootballEuropeEntry,
  type MlsLeagueHub,
  type MlsStanding,
} from "@/lib/football";

const SEASON_COMP_INCLUDE = new Set(["CL", "CLB", "EL", "CWC", "EUCL", "OTH", "OTHC"]);
import LeagueHubMap, { type HubClub } from "./LeagueHubMap";
import MlsStandings from "./MlsStandings";
import MlsMostDecorated from "./MlsMostDecorated";
import LiveLeagueTable, { type LiveCompTable } from "./LiveLeagueTable";
import { getClubStandings, getEuropeBadges, getCupAlive, getDomesticCups, type LiveLeague, type LiveRow } from "@/lib/clubFootballLive";
import { liveMembershipBySlug, LIVE_SEASON_END_YEAR } from "@/lib/footballLiveMembership";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { leagueStatusFor } from "@/lib/leagueStatus";
import { FootballHero } from "@/app/teams/_shared/FootballHero";
import { StatTile, StatGrid } from "@/app/teams/_shared/StatTile";
import { Badge } from "@/app/teams/_shared/Badge";
import { ResponsiveTable, RankRow } from "@/app/teams/_shared/ResponsiveTable";
import { DataBar } from "@/app/_shared/DataBar";

// api-football league ids for the hub countries' top flights, so the country
// switcher can default to this hub's own league before falling back to tier 1.
const LEAGUE_ID_BY_SLUG: Record<string, number> = {
  "premier-league": 39, "la-liga": 140, "serie-a": 135, "bundesliga": 78,
  "ligue-1": 61, "eredivisie": 88, "primeira-liga": 94, "scottish-premiership": 179,
};
const numCell = (v: number | null): number | string => (v == null ? "-" : v);
const byPtsGd = (a: LiveRow, b: LiveRow) => (b.points ?? 0) - (a.points ?? 0) || (b.gd ?? 0) - (a.gd ?? 0);

// Resolve every tracked league in a country into serializable tables for the switcher.
function buildCountryTables(clubStandings: LiveLeague[], country: string, badges: Record<string, string>, cupAlive: Record<string, string[]>, cupLabel: (name: string) => "Cup" | "Lg Cup"): LiveCompTable[] {
  return clubStandings
    .filter((l) => l.country === country && l.groups.some((g) => g.rows.length > 0))
    .map((l): LiveCompTable => ({
      id: l.league_id,
      name: l.name ?? "",
      level: l.level,
      groups: l.groups
        .map((g) => ({
          label: l.groups.length > 1 ? g.group_label : null,
          rows: g.rows.slice().sort(byPtsGd).map((r) => {
            const c = getFootballClubByName(r.lookup ?? "") ?? getFootballClubByName(r.name ?? "");
            return {
              rank: r.rank,
              name: c?.cur_name ?? r.name ?? r.lookup ?? "-",
              slug: c?.slug ?? null,
              badge: r.team_id != null ? (badges[String(r.team_id)] ?? null) : null,
              cup: r.team_id != null && cupAlive[String(r.team_id)]?.length
                ? cupAlive[String(r.team_id)].map((n) => ({ label: cupLabel(n), name: n }))
                : null,
              cells: [numCell(r.played), numCell(r.win), numCell(r.draw), numCell(r.lose), numCell(r.gf), numCell(r.ga), numCell(r.gd), numCell(r.points)],
            };
          }),
        }))
        .filter((g) => g.rows.length > 0),
    }))
    .sort((a, b) => (a.level ?? 99) - (b.level ?? 99) || a.name.localeCompare(b.name));
}

// Tally champions by club, most titles first, for hero stats and the
// All-time Champions section (both read from the same shape).
function tallyChampions(champs: FootballLeagueHub["all_time_champions"]) {
  const tally = new Map<string, { name: string; slug: string; count: number; last: number | null }>();
  for (const ch of champs) {
    const k = ch.champion;
    const existing = tally.get(k);
    if (existing) {
      existing.count += 1;
      if (ch.year && (existing.last === null || ch.year > existing.last)) existing.last = ch.year;
    } else {
      tally.set(k, { name: ch.champion, slug: ch.champion_slug, count: 1, last: ch.year });
    }
  }
  return [...tally.values()].sort((a, b) => b.count - a.count || (b.last ?? 0) - (a.last ?? 0));
}

export const dynamicParams = false;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return getAllLeagueHubSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const h = getLeagueHub(slug);
  if (!h) return { title: "League not found" };
  return {
    title: h.league,
    description: `${h.league} (${h.country}): current-season standings and complete all-time Level 1 champions list.`,
    alternates: { canonical: `/teams/football/leagues/${h.slug}` },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }],
      title: `${h.league} | ${SITE_NAME}`,
      description: `${h.league} (${h.country}) current standings and all-time champions.`,
      url: `${BASE_URL}/teams/football/leagues/${h.slug}`,
      type: "website",
    },
  };
}

export default async function FootballLeagueHubPage({ params }: Props) {
  const { slug } = await params;
  const hub = getLeagueHub(slug);
  if (!hub) notFound();

  const [clubStandings, europeBadges, cupAlive, domesticCups] = await Promise.all([getClubStandings(), getEuropeBadges(), getCupAlive(), getDomesticCups()]);

  if (hub.is_mls) {
    return <MlsHubView hub={hub as unknown as MlsLeagueHub} clubStandings={clubStandings} />;
  }

  // Classify each live domestic cup a club is still alive in: a country's primary cup renders
  // "Cup", its league cup renders "Lg Cup". Among the top-8 leagues only England, Scotland and
  // Portugal run a league cup (api-football comp_ids 48 / 185 / 97); everything else is primary.
  const LEAGUE_CUP_COMP_IDS = new Set([48, 185, 97]);
  const leagueCupNames = new Set(
    domesticCups.filter((c) => c.country === hub.country && LEAGUE_CUP_COMP_IDS.has(c.comp_id)).map((c) => c.name),
  );
  const cupLabel = (name: string): "Cup" | "Lg Cup" => (leagueCupNames.has(name) ? "Lg Cup" : "Cup");

  // Live tables for every tracked league in this hub's country, switchable in the UI.
  const countryTables = buildCountryTables(clubStandings, hub.country, europeBadges, cupAlive, cupLabel);
  const defaultLeagueId = countryTables.some((t) => t.id === LEAGUE_ID_BY_SLUG[hub.slug])
    ? LEAGUE_ID_BY_SLUG[hub.slug]
    : (countryTables[0]?.id ?? 0);

  // Hero stats: live/offseason status, most-decorated club, earliest title year.
  const heroStatus = leagueStatusFor(`/teams/football/leagues/${hub.slug}`);
  const isLive = heroStatus ? heroStatus.tone !== "offseason" : countryTables.length > 0;
  const championTally = tallyChampions(hub.all_time_champions);
  const topChampionClub = championTally[0] ?? null;
  const earliestTitleYear = hub.all_time_champions.reduce<number | null>(
    (min, c) => (c.year != null && (min === null || c.year < min) ? c.year : min),
    null
  );

  // All in-scope clubs for this hub's country, slimmed to the fields the
  // map needs. tier_by_year drives the year filter and tier coloring.
  // Inject the current 2026-27 membership from the SAME live feed the standings table uses, so
  // the hub map and the /teams/football index map move together (workbook 2027 rows are still
  // pre-season placeholders). Live-fed clubs get a 2027 tier and their last_year extended so the
  // map's season slider reaches 2026-27.
  const hubLive = liveMembershipBySlug(clubStandings, new Set([hub.country]));
  const hubClubs: HubClub[] = getAllClubs()
    .filter((c) => c.country === hub.country)
    .map((c) => {
      const inj = hubLive.get(c.slug);
      return {
        slug: c.slug,
        cur_name: c.cur_name,
        metro: c.metro,
        lat: c.lat,
        lng: c.lng,
        first_year: c.first_year,
        last_year: inj ? LIVE_SEASON_END_YEAR : c.last_year,
        tier_by_year: inj ? { ...(c.tier_by_year ?? {}), [String(LIVE_SEASON_END_YEAR)]: inj.level } : (c.tier_by_year ?? {}),
      };
    });

  // Build per-club cup and european-competition data for current_year,
  // keyed by club slug, so CurrentStandings can render those columns.
  const currentYear = hub.current_year;
  const cupsBySlug = new Map<string, FootballCupFinal[]>();
  const europeBySlug = new Map<string, FootballEuropeEntry[]>();
  if (currentYear !== null) {
    for (const s of hub.current_standings) {
      const cups = getCupsForClub(s.slug).filter(
        (c) => c.year === currentYear && c.kind !== "super"
      );
      if (cups.length) cupsBySlug.set(s.slug, cups);

      const europe = getEuropeForClub(s.slug)
        .filter((e) => e.year === currentYear && e.code && SEASON_COMP_INCLUDE.has(e.code))
        .sort((a, b) => europeanCompSortKey(a.code) - europeanCompSortKey(b.code));
      if (europe.length) europeBySlug.set(s.slug, europe);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/teams/football" className="hover:underline">Football clubs</Link>
        {" / "}
        <span>{hub.league}</span>
      </nav>

      <FootballHubNav current="leagues" />

      <FootballHero
        eyebrow={hub.country}
        title={
          <>
            <h1 className="text-3xl font-semibold tracking-tight">{hub.league}</h1>
            <Badge variant={isLive ? "live" : "offseason"} dot={isLive}>{isLive ? "Live" : "Offseason"}</Badge>
          </>
        }
        subtitle={`${hub.country} Level 1 (top-flight) history.`}
        stats={
          <StatGrid>
            <StatTile label="All-time champions" value={hub.all_time_champions.length} sub="title entries" />
            <StatTile label="Most titled" value={topChampionClub?.name ?? "-"} sub={topChampionClub ? `${topChampionClub.count} titles` : undefined} />
            <StatTile label="First title" value={earliestTitleYear ?? "-"} />
            <StatTile label="Clubs this season" value={hub.current_standings.length || countryTables.reduce((n, t) => n + t.groups.reduce((m, g) => m + g.rows.length, 0), 0)} />
          </StatGrid>
        }
      />

      <HubNav
        items={[
          ...(hub.country === "England" ? [{ label: "Domestic Cups", href: "#domestic-cups" }] : []),
          { label: "Current Standings", href: "#standings" },
          { label: "Map", href: "#map" },
          { label: "All-Time Champions", href: "#champions" },
        ]}
      />
      {hub.country === "England" && (
        <section id="domestic-cups" className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Domestic cups</h2>
          <Link
            href="/teams/football/cups"
            className="block rounded-xl border p-4 transition hover:border-[var(--accent)] max-w-md"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            <div className="font-semibold">FA Cup &amp; League Cup</div>
            <div className="text-xs text-[var(--text-muted)] mt-1">Every semifinal and final, season by season, plus the all-time SF / final / trophy table.</div>
            <div className="text-xs text-[var(--text-muted)] mt-2 tabular-nums">FA Cup from 1871-72 &middot; League Cup from 1960-61</div>
          </Link>
        </section>
      )}
      <div id="standings">
        {countryTables.length > 0 ? (
          <LiveLeagueTable tables={countryTables} defaultId={defaultLeagueId} season="2026-27" />
        ) : (
          <CurrentStandings hub={hub} cupsBySlug={cupsBySlug} europeBySlug={europeBySlug} />
        )}
      </div>
      <div id="map">
        <LeagueHubMap country={hub.country} clubs={hubClubs} />
      </div>
      <div id="champions">
        <AllTimeChampions hub={hub} />
      </div>
    </main>
  );
}

async function MlsHubView({ hub, clubStandings }: { hub: MlsLeagueHub; clubStandings: LiveLeague[] }) {
  const finals = [...(hub.mls_cup_finals ?? [])].filter((c) => c.year).sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  const shields = [...(hub.supporters_shield_winners ?? [])].filter((s) => s.year).sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  const mlsLeague = clubStandings.find((l) => l.league_id === 253) ?? null;
  const useLive = !!mlsLeague && mlsLeague.groups.some((g) => g.rows.length > 0);
  const liveStandings: MlsStanding[] = useLive
    ? mlsLeague!.groups.flatMap((g) => {
        const conf = /east/i.test(g.group_label) ? "Eastern" : /west/i.test(g.group_label) ? "Western" : null;
        return g.rows.slice().sort((a, b) => (b.points ?? 0) - (a.points ?? 0) || (b.gd ?? 0) - (a.gd ?? 0)).map((r, i) => {
          const lc = getFootballClubByName(r.lookup ?? "") ?? getFootballClubByName(r.name ?? "");
          const nm = lc?.cur_name ?? r.name ?? "";
          return {
            place: i + 1, cur_name: nm, team: nm, slug: lc?.slug ?? null, conference: conf,
            w: r.win ?? 0, d: r.draw ?? 0, l: r.lose ?? 0, pts: r.points ?? 0, gs: r.gf ?? 0, ga: r.ga ?? 0, gd: r.gd ?? 0,
            supporters_shield: false, playoffs: false, playoff_sf: false, mls_cup_app: false, mls_cup: false,
          };
        });
      })
    : [];
  const standings = useLive ? liveStandings : hub.current_standings;
  const conferences = useLive
    ? Array.from(new Set(liveStandings.map((r) => r.conference).filter((c): c is string => !!c))).sort()
    : hub.conferences;
  const standingsYear = useLive ? 2026 : hub.current_year;
  const currentSlugs = new Set(hub.current_standings.map((s) => s.slug).filter((x): x is string => !!x));
  const metroBySlug = new Map(getAllClubs().map((c) => [c.slug, c.metro] as const));
  const allTimeRows = hub.most_decorated.map((r) => ({
    ...r,
    metro: r.slug ? (metroBySlug.get(r.slug) ?? null) : null,
    defunct: r.slug ? !currentSlugs.has(r.slug) : true,
  }));
  const mlsTopClub = [...hub.most_decorated].sort((a, b) => b.mls_cups - a.mls_cups)[0] ?? null;
  const mlsFirstYear = finals.reduce<number | null>(
    (min, c) => (c.year != null && (min === null || c.year < min) ? c.year : min),
    null
  );
  const mlsStatus = leagueStatusFor("/teams/football/leagues/mls");
  const mlsIsLive = mlsStatus ? mlsStatus.tone !== "offseason" : useLive;
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <Link href="/teams/football" className="hover:underline">Football clubs</Link>{" / "}
        <span>{hub.league}</span>
      </nav>
      <FootballHero
        eyebrow={hub.country}
        title={
          <>
            <h1 className="text-3xl font-semibold tracking-tight">{hub.league}</h1>
            <Badge variant={mlsIsLive ? "live" : "offseason"} dot={mlsIsLive}>{mlsIsLive ? "Live" : "Offseason"}</Badge>
          </>
        }
        subtitle={
          <>
            No promotion or relegation: the Supporters&apos; Shield goes to the best regular-season record across both conferences, and the MLS Cup is decided in the playoffs.
            {standingsYear ? (useLive ? <> Live {standingsYear} standings, refreshed daily.</> : <> Standings shown for {standingsYear}.</>) : null}
          </>
        }
        stats={
          <StatGrid>
            <StatTile label="MLS Cups awarded" value={finals.length} />
            <StatTile label="Supporters' Shields" value={shields.length} />
            <StatTile label="Most decorated" value={mlsTopClub?.cur_name ?? "-"} sub={mlsTopClub ? `${mlsTopClub.mls_cups} MLS Cups` : undefined} />
            <StatTile label="First MLS Cup" value={mlsFirstYear ?? "-"} />
          </StatGrid>
        }
      />
      <HubNav
        items={[
          { label: "Current Standings", href: "#standings" },
          { label: "All-time table", href: "#all-time" },
          { label: "Cup & Shield", href: "#honors" },
        ]}
      />
      <div id="standings">
        <MlsStandings standings={standings} conferences={conferences} showHonors={!useLive} />
      </div>
      <div id="all-time">
        <MlsMostDecorated rows={allTimeRows} />
      </div>
      <section id="honors" className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold mb-3">MLS Cup champions</h2>

          <ResponsiveTable
            variant="list"
            className="rounded-xl border overflow-hidden"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            mobileNoun="finals"
            mobileRows={finals.map((c) => (
              <RankRow
                key={`${c.year}-${c.champion}-card`}
                rank={c.year}
                name={
                  <>
                    <TeamCrest name={c.champion} size={16} fallback={<ColorBall slug={c.champion_slug ?? ""} name={c.champion} />} />
                    {c.champion_slug ? (
                      <Link href={`/teams/football/${c.champion_slug}`} className="hover:underline truncate">{c.champion}</Link>
                    ) : (
                      <span className="truncate">{c.champion}</span>
                    )}
                  </>
                }
                sub={c.runner_up ? <>def. {c.runner_up}</> : undefined}
              />
            ))}
          >
            <table className="w-full text-sm" data-sticky-col="2">
              <thead>
                <tr className="border-b text-[11px] uppercase tracking-wide" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                  <th className="text-left py-2 px-3 font-medium w-14">Year</th>
                  <th className="text-left py-2 px-3 font-medium">Champion</th>
                  <th className="text-left py-2 px-3 font-medium">Runner-up</th>
                </tr>
              </thead>
              <tbody>
                {finals.map((c) => (
                  <tr key={`${c.year}-${c.champion}`} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1.5 px-3 tabular-nums text-[var(--text-muted)]">{c.year}</td>
                    <td className="py-1.5 px-3"><span className="inline-flex items-center gap-1.5"><TeamCrest name={c.champion} size={22} fallback={<ColorBall slug={c.champion_slug ?? ""} name={c.champion} />} />{c.champion_slug ? <Link href={`/teams/football/${c.champion_slug}`} className="hover:underline font-medium">{c.champion}</Link> : <span className="font-medium">{c.champion}</span>}</span></td>
                    <td className="py-1.5 px-3 text-[var(--text-muted)]">{c.runner_up ? <span className="inline-flex items-center gap-1.5"><TeamCrest name={c.runner_up} size={22} fallback={<ColorBall slug={c.runner_up_slug ?? ""} name={c.runner_up} />} />{c.runner_up_slug ? <Link href={`/teams/football/${c.runner_up_slug}`} className="hover:underline">{c.runner_up}</Link> : <span>{c.runner_up}</span>}</span> : <span className="text-[var(--text-dim)]">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold mb-3">Supporters&apos; Shield winners</h2>

          <ResponsiveTable
            variant="list"
            className="rounded-xl border overflow-hidden"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            mobileNoun="shields"
            mobileRows={shields.map((s) => (
              <RankRow
                key={`${s.year}-${s.winner}-card`}
                rank={s.year}
                name={
                  s.winner_slug ? (
                    <Link href={`/teams/football/${s.winner_slug}`} className="hover:underline truncate">{s.winner}</Link>
                  ) : (
                    <span className="truncate">{s.winner}</span>
                  )
                }
              />
            ))}
          >
            <table className="w-full text-sm" data-sticky-col="2">
              <tbody>
                {shields.map((s) => (
                  <tr key={`${s.year}-${s.winner}`} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1.5 px-3 tabular-nums text-[var(--text-muted)] w-16">{s.year}</td>
                    <td className="py-1.5 px-3">{s.winner_slug ? <Link href={`/teams/football/${s.winner_slug}`} className="hover:underline font-medium">{s.winner}</Link> : <span className="font-medium">{s.winner}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>
        </div>
      </section>
    </main>
  );
}

function ColorBall({ slug, name }: { slug: string; name: string }) {
  const m = monogramForFootball(name, slug);
  return (
    <span
      className="inline-grid place-items-center rounded-full flex-shrink-0"
      style={{
        background: m.bg,
        color: m.fg,
        width: 22,
        height: 22,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "-0.02em",
      }}
      aria-hidden
    >
      {m.mono}
    </span>
  );
}

// Status pills for a standings row (champion / promoted / relegated /
// playoffs), shared by the mobile card and desktop table cells.
function StandingBadges({ s, isChamp }: { s: FootballLeagueHub["current_standings"][number]; isChamp: boolean }) {
  return (
    <>
      {isChamp && <Badge variant="champion">Champion</Badge>}
      {s.promoted && (
        <Badge color={{ bg: "rgba(34,197,94,0.16)", fg: "#22c55e" }}>
          {s.playoffs ? "Promoted (PO)" : "Promoted"}
        </Badge>
      )}
      {s.relegated && (
        <Badge color={{ bg: "rgba(220,38,38,0.16)", fg: "#dc2626" }}>
          {s.playoffs ? "Relegated (PO)" : "Relegated"}
        </Badge>
      )}
      {s.playoffs && !s.promoted && !s.relegated && (
        <Badge color={{ bg: "rgba(251,191,36,0.16)", fg: "#d97706" }}>
          {s.playoff_final ? "Not Promoted (PO)" : "Playoffs"}
        </Badge>
      )}
    </>
  );
}

// Domestic-cup and European-campaign badge clusters, shared between the
// desktop table cells and the mobile badge strip so neither view forks
// the rendering rules (gold ★ winner, outlined ☆ lost finalist, etc.).
function DomCupBadges({ cups }: { cups: FootballCupFinal[] }) {
  return (
    <>
      {cups.map((c, ci) => {
        const isWin = c.result === "won";
        const shortLabel = c.kind === "major" ? "Cup" : "Lg Cup";
        return (
          <span key={ci} className="inline-block rounded px-1.5 py-0.5 font-semibold mr-1"
                style={{ background: isWin ? "rgba(245,215,110,0.18)" : "transparent", color: isWin ? "#b58900" : "var(--text-muted)", boxShadow: isWin ? undefined : "inset 0 0 0 1px rgba(120,120,140,0.45)" }}>
            {isWin ? "★ " : "☆ "}{shortLabel}
          </span>
        );
      })}
    </>
  );
}
function EurCompBadges({ entries, year }: { entries: FootballEuropeEntry[]; year: number | null }) {
  return (
    <>
      {entries.map((e, ei) => {
        const isWinner = e.trophy_won;
        const isUcl = !!(e.code && (e.code === "CL" || e.code === "CLB"));
        const isFinalistLost = !isWinner && e.deepest_rnd === 1;
        let bg: string, fg: string, boxShadow: string | undefined, symbol: string | null = null;
        if (isWinner && isUcl)        { bg = "rgba(212,175,55,0.22)"; fg = "#d4af37"; symbol = "★"; }
        else if (isWinner)             { bg = "rgba(192,192,192,0.20)"; fg = "#c0c0c0"; symbol = "★"; }
        else if (isFinalistLost && isUcl) { bg = "transparent"; fg = "#d4af37"; boxShadow = "inset 0 0 0 1px rgba(212,175,55,0.55)"; symbol = "☆"; }
        else if (isFinalistLost)        { bg = "transparent"; fg = "#c0c0c0"; boxShadow = "inset 0 0 0 1px rgba(192,192,192,0.55)"; symbol = "☆"; }
        else                            { bg = "rgba(120,120,140,0.16)"; fg = "var(--text-muted)"; }
        const title = isWinner
          ? `${e.competition} winner this season`
          : isFinalistLost
            ? `${e.competition}: reached final, lost`
            : `${e.competition}: ${e.result_label}`;
        return (
          <span key={ei} className="inline-block rounded px-1.5 py-0.5 font-semibold tracking-wide"
                style={{ background: bg, color: fg, boxShadow }} title={title}>
            {symbol && <span aria-hidden className="mr-0.5">{symbol}</span>}
            {europeanCompDisplayCode(e.code, year)}
          </span>
        );
      })}
    </>
  );
}

function CurrentStandings({
  hub,
  cupsBySlug,
  europeBySlug,
}: {
  hub: FootballLeagueHub;
  cupsBySlug: Map<string, FootballCupFinal[]>;
  europeBySlug: Map<string, FootballEuropeEntry[]>;
}) {
  if (hub.current_standings.length === 0) {
    return null;
  }
  // Points is the standings' argument; max is this season's own maximum,
  // computed once over the full row set.
  const ptsMax = Math.max(...hub.current_standings.map((s) => s.pts ?? 0), 1);
  return (
    <section
      className="rounded-xl border p-5 mb-6"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <h2 className="text-base font-semibold">
        Current standings <span className="text-[var(--text-muted)] font-normal text-sm tabular-nums">({hub.current_year ? `season ending ${hub.current_year}` : "latest"})</span>
      </h2>

      <ResponsiveTable
        variant="list"
        mobileNoun="clubs"
        mobileRows={hub.current_standings.map((s) => {
          const isChamp = s.champion === true || s.place === 1;
          const cups = cupsBySlug.get(s.slug) ?? [];
          const eur = europeBySlug.get(s.slug) ?? [];
          const hasStrip = cups.length > 0 || eur.length > 0 || !!s.eur_qual;
          const row = (
            <RankRow
              rank={s.place ?? "-"}
              name={
                <>
                  <TeamCrest name={s.cur_name} size={16} fallback={<ColorBall slug={s.slug} name={s.cur_name} />} />
                  <Link href={`/teams/football/${s.slug}`} className="truncate hover:underline">
                    {s.cur_name}
                  </Link>
                  {isChamp && <span title="Champion" aria-label="Champion" className="flex-shrink-0 leading-none" style={{ color: "#f5b301" }}>★</span>}
                  {s.promoted && (
                    <span className="flex-shrink-0">
                      <Badge color={{ bg: "rgba(34,197,94,0.16)", fg: "#22c55e" }}>{s.playoffs ? "Promoted (PO)" : "Promoted"}</Badge>
                    </span>
                  )}
                  {s.relegated && (
                    <span className="flex-shrink-0">
                      <Badge color={{ bg: "rgba(220,38,38,0.16)", fg: "#dc2626" }}>{s.playoffs ? "Relegated (PO)" : "Relegated"}</Badge>
                    </span>
                  )}
                </>
              }
              sub={<>{s.matches ?? "-"} P · {s.w ?? "-"}-{s.d ?? "-"}-{s.l ?? "-"} · {s.gd != null ? (s.gd > 0 ? `+${s.gd}` : s.gd) : "-"} GD</>}
              right={s.pts ?? "-"}
              rightSub="pts"
              highlight={isChamp}
            />
          );
          if (!hasStrip) return <div key={`${s.slug}-card`}>{row}</div>;
          return (
            <div key={`${s.slug}-card`}>
              {row}
              <div className="px-3 pb-2 -mt-1 flex flex-wrap items-center gap-1 text-[10px]" style={isChamp ? { background: "rgba(78,205,196,0.06)" } : undefined}>
                <DomCupBadges cups={cups} />
                <EurCompBadges entries={eur} year={s.year ?? null} />
                {s.eur_qual && (
                  <span title="Qualified for this European competition next season">
                    <Badge color={{ bg: "rgba(59,130,246,0.18)", fg: "#3b82f6" }}>
                      {europeanCompDisplayCode(s.eur_qual, s.year === null ? null : s.year + 1)}
                    </Badge>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      >
        <table className="w-full text-sm" data-sticky-col="2">
          <thead>
            <tr
              className="text-xs text-[var(--text-muted)] uppercase tracking-wide border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <th className="py-2 text-left font-medium">Pos</th>
              <th className="py-2 text-left font-medium">Club</th>
              <th className="py-2 text-left font-medium">Notes</th>
              <th className="py-2 pl-3 text-left font-medium hidden md:table-cell">Domestic Cup</th>
              <th className="py-2 pl-2 text-left font-medium hidden md:table-cell">Eur Comp</th>
              <th className="py-2 text-right font-medium">P</th>
              <th className="py-2 text-right font-medium">W</th>
              <th className="py-2 text-right font-medium">D</th>
              <th className="py-2 text-right font-medium">L</th>
              <th className="py-2 text-right font-medium">Pts</th>
              <th className="py-2 text-right font-medium hidden sm:table-cell">GF</th>
              <th className="py-2 text-right font-medium hidden sm:table-cell">GA</th>
              <th className="py-2 text-right font-medium">GD</th>
              <th
                className="py-2 pl-3 text-left font-medium whitespace-nowrap hidden sm:table-cell"
                title="European competition the club qualified for next season"
              >
                Eur Qual <span className="text-[var(--text-dim)] normal-case font-normal">(next yr)</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {hub.current_standings.map((s) => {
              const isChamp = s.champion === true || s.place === 1;
              return (
              <tr key={s.slug} className="border-b" style={{ borderColor: "var(--border)" }}>
                <td className="py-1.5 tabular-nums">{s.place ?? "-"}</td>
                <td className="py-1.5">
                  <span className="inline-flex items-center gap-2">
                    <TeamCrest name={s.cur_name} size={22} fallback={<ColorBall slug={s.slug} name={s.cur_name} />} />
                    <Link href={`/teams/football/${s.slug}`} className="hover:underline font-medium">
                      {s.cur_name}
                    </Link>
                  </span>
                </td>
                {/* Notes: status pills */}
                <td className="py-1.5">
                  <span className="inline-flex flex-wrap gap-1">
                    <StandingBadges s={s} isChamp={isChamp} />
                  </span>
                </td>
                {/* Domestic Cup */}
                <td className="py-1.5 pl-3 text-xs hidden md:table-cell">
                  <DomCupBadges cups={cupsBySlug.get(s.slug) ?? []} />
                </td>
                {/* Eur Comp this season — full rendering matching season-by-season */}
                <td className="py-1.5 pl-2 text-xs hidden md:table-cell">
                  <span className="inline-flex flex-wrap gap-1">
                    <EurCompBadges entries={europeBySlug.get(s.slug) ?? []} year={s.year ?? null} />
                  </span>
                </td>
                <td className="py-1.5 text-right tabular-nums text-[var(--text-muted)]">{s.matches ?? "-"}</td>
                <td className="py-1.5 text-right tabular-nums">{s.w ?? "-"}</td>
                <td className="py-1.5 text-right tabular-nums">{s.d ?? "-"}</td>
                <td className="py-1.5 text-right tabular-nums">{s.l ?? "-"}</td>
                <td className="py-1.5 text-right"><DataBar v={s.pts} max={ptsMax} width={80} label="points" /></td>
                <td className="py-1.5 text-right tabular-nums hidden sm:table-cell">{s.gf ?? "-"}</td>
                <td className="py-1.5 text-right tabular-nums hidden sm:table-cell">{s.ga ?? "-"}</td>
                <td className="py-1.5 text-right tabular-nums">{s.gd ?? "-"}</td>
                <td className="py-1.5 pl-3 text-xs whitespace-nowrap hidden sm:table-cell">
                  {s.eur_qual && (
                    <span title="Qualified for this European competition next season">
                      <Badge color={{ bg: "rgba(59,130,246,0.18)", fg: "#3b82f6" }}>
                        {europeanCompDisplayCode(s.eur_qual, s.year === null ? null : s.year + 1)}
                      </Badge>
                    </span>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </ResponsiveTable>
    </section>
  );
}

function AllTimeChampions({ hub }: { hub: FootballLeagueHub }) {
  // Tally champions by club for the summary block, then render the full list.
  const topClubs = tallyChampions(hub.all_time_champions);

  // Era break: Germany 1964 (Bundesliga founding) and Italy 1929 (Serie A founding)
  // and France 1933 (Division 1 founding) get a visual breakpoint inside the
  // chronological list. England has no real break (First Division → Premier League is
  // a rebrand, not a format change), so no marker needed.
  const eraBreakYear: Record<string, number> = {
    bundesliga: 1964,
    "serie-a": 1929,
    "ligue-1": 1933,
  };
  const breakYear = eraBreakYear[hub.slug];
  const sortedChamps = [...hub.all_time_champions].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));

  return (
    <section
      className="rounded-xl border p-5 mb-6"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <h2 className="text-base font-semibold">
        All-time Level 1 champions{" "}
        <span className="text-[var(--text-muted)] font-normal text-sm tabular-nums">
          ({hub.all_time_champions.length})
        </span>
      </h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Every Level-1 championship in {hub.country}, including pre-modern league formats.
        {breakYear && (
          <>
            {" "}A horizontal break marks {breakYear}, when {hub.league} consolidated to its modern format;
            earlier rows include national playoff and regional-knockout eras with multiple finalists per year.
          </>
        )}
      </p>

      {topClubs.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold mb-2">Most decorated</h3>
          <ul className="text-sm grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
            {topClubs.slice(0, 12).map((c) => (
              <li key={c.slug} className="flex items-center justify-between border-b py-1" style={{ borderColor: "var(--border)" }}>
                <span className="inline-flex items-center gap-2">
                  <TeamCrest name={c.name} size={22} fallback={<ColorBall slug={c.slug} name={c.name} />} />
                  <Link href={`/teams/football/${c.slug}`} className="hover:underline">{c.name}</Link>
                </span>
                <span className="text-[var(--text-muted)] tabular-nums">
                  {c.count}
                  {c.last && <span className="text-xs ml-1.5">last {c.last}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6">
        <h3 className="text-sm font-semibold mb-2">Chronological (most recent first)</h3>

        <ResponsiveTable
          variant="list"
          mobileNoun="champions"
          mobileRows={sortedChamps.map((ch, i, arr) => {
            const showBreak = breakYear && ch.year === breakYear &&
              (i === 0 || arr[i - 1].year !== breakYear);
            return (
              <div key={`${ch.year}-${i}-card`}>
                {showBreak && (
                  <div className="px-3 py-1.5 text-center text-[10px] uppercase tracking-wider text-[var(--text-muted)]"
                       style={{ borderBottom: "2px solid var(--border)" }}>
                    {hub.league} era begins
                  </div>
                )}
                <RankRow
                  rank={ch.year ?? "-"}
                  name={
                    <>
                      <TeamCrest name={ch.champion} size={16} fallback={<ColorBall slug={ch.champion_slug} name={ch.champion} />} />
                      <Link href={`/teams/football/${ch.champion_slug}`} className="hover:underline truncate">
                        {ch.champion}
                      </Link>
                    </>
                  }
                  sub={
                    <>
                      {ch.champion_team && ch.champion_team !== ch.champion ? <>as {ch.champion_team} · </> : null}
                      {ch.league_name}
                      {ch.format === "playoff" ? " (playoff)" : ""}
                    </>
                  }
                />
              </div>
            );
          })}
        >
          <table className="w-full text-sm" data-sticky-col="2">
            <thead>
              <tr
                className="text-xs text-[var(--text-muted)] uppercase tracking-wide border-b"
                style={{ borderColor: "var(--border)" }}
              >
                <th className="py-2 text-left font-medium">Year</th>
                <th className="py-2 text-left font-medium">Champion</th>
                <th className="py-2 text-left font-medium">Competition</th>
              </tr>
            </thead>
            <tbody>
              {sortedChamps.map((ch, i, arr) => {
                // Era break marker fires at the boundary between modern
                // and legacy league names, regardless of sort direction.
                const showBreak = breakYear && ch.year === breakYear &&
                  (i === 0 || arr[i - 1].year !== breakYear);
                return (
                  <Fragment key={`${ch.year}-${i}`}>
                    {showBreak && (
                      <tr key={`break-${ch.year}`} >
                        <td colSpan={3} className="py-3 text-center text-xs uppercase tracking-wider text-[var(--text-muted)]"
                            style={{ borderTop: "2px solid var(--border)", background: "var(--bg-subtle, transparent)" }}>
                          {hub.league} era begins
                        </td>
                      </tr>
                    )}
                    <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                      <td className="py-1.5 tabular-nums">{ch.year ?? "-"}</td>
                      <td className="py-1.5">
                        <span className="inline-flex items-center gap-2">
                          <TeamCrest name={ch.champion} size={22} fallback={<ColorBall slug={ch.champion_slug} name={ch.champion} />} />
                          <Link href={`/teams/football/${ch.champion_slug}`} className="hover:underline font-medium">
                            {ch.champion}
                          </Link>
                        </span>
                        {ch.champion_team && ch.champion_team !== ch.champion && (
                          <span className="text-[var(--text-muted)] text-xs ml-2">as {ch.champion_team}</span>
                        )}
                      </td>
                      <td className="py-1.5 text-[var(--text-muted)] text-xs">
                        {ch.league_name}
                        {ch.format === "playoff" && <span className="ml-2 italic">(playoff)</span>}
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </ResponsiveTable>
      </div>
    </section>
  );
}
