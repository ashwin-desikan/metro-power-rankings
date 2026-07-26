import type { Metadata } from "next";
import { Fragment } from "react";
import HubNav from "@/app/teams/HubNav";
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
import { getClubStandings, getEuropeBadges, type LiveLeague, type LiveRow } from "@/lib/clubFootballLive";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

// api-football league ids for the hub countries' top flights, so the country
// switcher can default to this hub's own league before falling back to tier 1.
const LEAGUE_ID_BY_SLUG: Record<string, number> = {
  "premier-league": 39, "la-liga": 140, "serie-a": 135, "bundesliga": 78,
  "ligue-1": 61, "eredivisie": 88, "primeira-liga": 94, "scottish-premiership": 179,
};
const numCell = (v: number | null): number | string => (v == null ? "-" : v);
const byPtsGd = (a: LiveRow, b: LiveRow) => (b.points ?? 0) - (a.points ?? 0) || (b.gd ?? 0) - (a.gd ?? 0);

// Resolve every tracked league in a country into serializable tables for the switcher.
function buildCountryTables(clubStandings: LiveLeague[], country: string, badges: Record<string, string>): LiveCompTable[] {
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
              cells: [numCell(r.played), numCell(r.win), numCell(r.draw), numCell(r.lose), numCell(r.gf), numCell(r.ga), numCell(r.gd), numCell(r.points)],
            };
          }),
        }))
        .filter((g) => g.rows.length > 0),
    }))
    .sort((a, b) => (a.level ?? 99) - (b.level ?? 99) || a.name.localeCompare(b.name));
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
    openGraph: {
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

  const [clubStandings, europeBadges] = await Promise.all([getClubStandings(), getEuropeBadges()]);

  if (hub.is_mls) {
    return <MlsHubView hub={hub as unknown as MlsLeagueHub} clubStandings={clubStandings} />;
  }

  // Live tables for every tracked league in this hub's country, switchable in the UI.
  const countryTables = buildCountryTables(clubStandings, hub.country, europeBadges);
  const defaultLeagueId = countryTables.some((t) => t.id === LEAGUE_ID_BY_SLUG[hub.slug])
    ? LEAGUE_ID_BY_SLUG[hub.slug]
    : (countryTables[0]?.id ?? 0);

  // All in-scope clubs for this hub's country, slimmed to the fields the
  // map needs. tier_by_year drives the year filter and tier coloring.
  const hubClubs: HubClub[] = getAllClubs()
    .filter((c) => c.country === hub.country)
    .map((c) => ({
      slug: c.slug,
      cur_name: c.cur_name,
      metro: c.metro,
      lat: c.lat,
      lng: c.lng,
      first_year: c.first_year,
      last_year: c.last_year,
      tier_by_year: c.tier_by_year ?? {},
    }));

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

      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">{hub.league}</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          {hub.country} Level 1 (top-flight) history.
        </p>
      </header>

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
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <Link href="/teams/football" className="hover:underline">Football clubs</Link>{" / "}
        <span>{hub.league}</span>
      </nav>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">{hub.league}</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">
          {hub.country}. No promotion or relegation: the Supporters&apos; Shield goes to the best regular-season record across both conferences, and the MLS Cup is decided in the playoffs.
          {standingsYear ? (useLive ? <> Live {standingsYear} standings, refreshed daily.</> : <> Standings shown for {standingsYear}.</>) : null}
        </p>
      </header>
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
        <div>
          <h2 className="text-lg font-semibold mb-3">MLS Cup champions</h2>

          {/* Mobile: one stacked card per final instead of a 3-column table. */}
          <div className="grid grid-cols-1 gap-2 sm:hidden">
            {finals.map((c) => (
              <div
                key={`${c.year}-${c.champion}-card`}
                className="rounded-lg border p-3"
                style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <TeamCrest name={c.champion} size={22} fallback={<ColorBall slug={c.champion_slug ?? ""} name={c.champion} />} />
                    {c.champion_slug ? (
                      <Link href={`/teams/football/${c.champion_slug}`} className="hover:underline font-medium truncate">{c.champion}</Link>
                    ) : (
                      <span className="font-medium truncate">{c.champion}</span>
                    )}
                  </span>
                  <span className="flex-shrink-0 text-xs tabular-nums text-[var(--text-muted)]">{c.year}</span>
                </div>
                <div className="mt-1.5 text-xs">
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Runner-up</div>
                  {c.runner_up ? (
                    <span className="inline-flex items-center gap-1.5 mt-0.5">
                      <TeamCrest name={c.runner_up} size={18} fallback={<ColorBall slug={c.runner_up_slug ?? ""} name={c.runner_up} />} />
                      {c.runner_up_slug ? <Link href={`/teams/football/${c.runner_up_slug}`} className="hover:underline">{c.runner_up}</Link> : <span>{c.runner_up}</span>}
                    </span>
                  ) : (
                    <span className="text-[var(--text-dim)]">—</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border overflow-hidden hidden sm:block" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
            <table className="w-full text-sm">
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
          </div>
        </div>
        <div>
          <h2 className="text-lg font-semibold mb-3">Supporters&apos; Shield winners</h2>

          {/* Mobile: stacked cards instead of a 2-column table. */}
          <div className="grid grid-cols-1 gap-2 sm:hidden">
            {shields.map((s) => (
              <div
                key={`${s.year}-${s.winner}-card`}
                className="rounded-lg border p-3 flex items-center justify-between gap-2"
                style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
              >
                {s.winner_slug ? (
                  <Link href={`/teams/football/${s.winner_slug}`} className="hover:underline font-medium truncate">{s.winner}</Link>
                ) : (
                  <span className="font-medium truncate">{s.winner}</span>
                )}
                <span className="flex-shrink-0 text-xs tabular-nums text-[var(--text-muted)]">{s.year}</span>
              </div>
            ))}
          </div>

          <div className="rounded-xl border overflow-hidden hidden sm:block" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
            <table className="w-full text-sm">
              <tbody>
                {shields.map((s) => (
                  <tr key={`${s.year}-${s.winner}`} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1.5 px-3 tabular-nums text-[var(--text-muted)] w-16">{s.year}</td>
                    <td className="py-1.5 px-3">{s.winner_slug ? <Link href={`/teams/football/${s.winner_slug}`} className="hover:underline font-medium">{s.winner}</Link> : <span className="font-medium">{s.winner}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

// Small labeled stat block used inside mobile standings/table cards.
function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">{label}</div>
      <div className="tabular-nums">{value}</div>
    </div>
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
  return (
    <section
      className="rounded-xl border p-5 mb-6"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <h2 className="text-base font-semibold">
        Current standings <span className="text-[var(--text-muted)] font-normal text-sm tabular-nums">({hub.current_year ? `season ending ${hub.current_year}` : "latest"})</span>
      </h2>

      {/* Mobile: one stacked card per club instead of a 13-column table. */}
      <div className="mt-4 grid grid-cols-1 gap-2 sm:hidden">
        {hub.current_standings.map((s) => {
          const isChamp = s.champion === true || s.place === 1;
          const cups = cupsBySlug.get(s.slug) ?? [];
          const euros = europeBySlug.get(s.slug) ?? [];
          return (
            <div
              key={`${s.slug}-card`}
              className="rounded-lg border p-3"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs tabular-nums text-[var(--text-muted)] flex-shrink-0 w-4">{s.place ?? "-"}</span>
                  <TeamCrest name={s.cur_name} size={22} fallback={<ColorBall slug={s.slug} name={s.cur_name} />} />
                  <Link href={`/teams/football/${s.slug}`} className="font-medium truncate hover:underline">
                    {s.cur_name}
                  </Link>
                </div>
                <span className="flex-shrink-0 text-sm font-semibold tabular-nums">{s.pts ?? "-"} pts</span>
              </div>

              <div className="mt-1.5 flex flex-wrap gap-1">
                {isChamp && (
                  <span className="inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-semibold"
                        style={{ background: "rgba(245,215,110,0.18)", color: "#b58900" }}>Champion</span>
                )}
                {s.promoted && (
                  <span className="inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-semibold"
                        style={{ background: "rgba(34,197,94,0.16)", color: "#22c55e" }}>
                    {s.playoffs ? "Promoted (PO)" : "Promoted"}
                  </span>
                )}
                {s.relegated && (
                  <span className="inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-semibold"
                        style={{ background: "rgba(220,38,38,0.16)", color: "#dc2626" }}>
                    {s.playoffs ? "Relegated (PO)" : "Relegated"}
                  </span>
                )}
                {s.playoffs && !s.promoted && !s.relegated && (
                  <span className="inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-semibold"
                        style={{ background: "rgba(251,191,36,0.16)", color: "#d97706" }}>
                    {s.playoff_final ? "Not Promoted (PO)" : "Playoffs"}
                  </span>
                )}
              </div>

              <div className="mt-2 grid grid-cols-4 gap-x-3 gap-y-1.5 text-xs">
                <Stat label="P" value={s.matches ?? "-"} />
                <Stat label="W" value={s.w ?? "-"} />
                <Stat label="D" value={s.d ?? "-"} />
                <Stat label="L" value={s.l ?? "-"} />
                <Stat label="GF" value={s.gf ?? "-"} />
                <Stat label="GA" value={s.ga ?? "-"} />
                <Stat label="GD" value={s.gd ?? "-"} />
              </div>

              {cups.length > 0 && (
                <div className="mt-2">
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Domestic cup</div>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {cups.map((c, ci) => {
                      const isWin = c.result === "won";
                      const shortLabel = c.kind === "major" ? "Cup" : "Lg Cup";
                      return (
                        <span key={ci} className="inline-block rounded px-1.5 py-0.5 text-xs font-semibold"
                              style={{ background: isWin ? "rgba(245,215,110,0.18)" : "transparent", color: isWin ? "#b58900" : "var(--text-muted)", boxShadow: isWin ? undefined : "inset 0 0 0 1px rgba(120,120,140,0.45)" }}>
                          {isWin ? "★ " : "☆ "}{shortLabel}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {euros.length > 0 && (
                <div className="mt-2">
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">European competition</div>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {euros.map((e, ei) => {
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
                        <span key={ei} className="inline-block rounded px-1.5 py-0.5 text-xs font-semibold tracking-wide"
                              style={{ background: bg, color: fg, boxShadow }} title={title}>
                          {symbol && <span aria-hidden className="mr-0.5">{symbol}</span>}
                          {europeanCompDisplayCode(e.code, s.year ?? null)}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {s.eur_qual && (
                <div className="mt-2">
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Eur qual (next yr)</div>
                  <span
                    className="inline-block mt-0.5 rounded px-1.5 py-0.5 text-xs font-semibold tracking-wide"
                    style={{ background: "rgba(59,130,246,0.18)", color: "#3b82f6" }}
                    title="Qualified for this European competition next season"
                  >
                    {europeanCompDisplayCode(s.eur_qual, s.year === null ? null : s.year + 1)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 overflow-x-auto hidden sm:block">
        <table className="w-full text-sm">
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
                    {isChamp && (
                      <span className="inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-semibold"
                            style={{ background: "rgba(245,215,110,0.18)", color: "#b58900" }}>Champion</span>
                    )}
                    {s.promoted && (
                      <span className="inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-semibold"
                            style={{ background: "rgba(34,197,94,0.16)", color: "#22c55e" }}>
                        {s.playoffs ? "Promoted (PO)" : "Promoted"}
                      </span>
                    )}
                    {s.relegated && (
                      <span className="inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-semibold"
                            style={{ background: "rgba(220,38,38,0.16)", color: "#dc2626" }}>
                        {s.playoffs ? "Relegated (PO)" : "Relegated"}
                      </span>
                    )}
                    {s.playoffs && !s.promoted && !s.relegated && (
                      <span className="inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-semibold"
                            style={{ background: "rgba(251,191,36,0.16)", color: "#d97706" }}>
                        {s.playoff_final ? "Not Promoted (PO)" : "Playoffs"}
                      </span>
                    )}
                  </span>
                </td>
                {/* Domestic Cup */}
                <td className="py-1.5 pl-3 text-xs hidden md:table-cell">
                  {(cupsBySlug.get(s.slug) ?? []).map((c, ci) => {
                    const isWin = c.result === "won";
                    const shortLabel = c.kind === "major" ? "Cup" : "Lg Cup";
                    return (
                      <span key={ci} className="inline-block rounded px-1.5 py-0.5 font-semibold mr-1"
                            style={{ background: isWin ? "rgba(245,215,110,0.18)" : "transparent", color: isWin ? "#b58900" : "var(--text-muted)", boxShadow: isWin ? undefined : "inset 0 0 0 1px rgba(120,120,140,0.45)" }}>
                        {isWin ? "★ " : "☆ "}{shortLabel}
                      </span>
                    );
                  })}
                </td>
                {/* Eur Comp this season — full rendering matching season-by-season */}
                <td className="py-1.5 pl-2 text-xs hidden md:table-cell">
                  <span className="inline-flex flex-wrap gap-1">
                    {(europeBySlug.get(s.slug) ?? []).map((e, ei) => {
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
                          {europeanCompDisplayCode(e.code, s.year ?? null)}
                        </span>
                      );
                    })}
                  </span>
                </td>
                <td className="py-1.5 text-right tabular-nums text-[var(--text-muted)]">{s.matches ?? "-"}</td>
                <td className="py-1.5 text-right tabular-nums">{s.w ?? "-"}</td>
                <td className="py-1.5 text-right tabular-nums">{s.d ?? "-"}</td>
                <td className="py-1.5 text-right tabular-nums">{s.l ?? "-"}</td>
                <td className="py-1.5 text-right tabular-nums">{s.pts ?? "-"}</td>
                <td className="py-1.5 text-right tabular-nums hidden sm:table-cell">{s.gf ?? "-"}</td>
                <td className="py-1.5 text-right tabular-nums hidden sm:table-cell">{s.ga ?? "-"}</td>
                <td className="py-1.5 text-right tabular-nums">{s.gd ?? "-"}</td>
                <td className="py-1.5 pl-3 text-xs whitespace-nowrap hidden sm:table-cell">
                  {s.eur_qual && (
                    <span
                      className="inline-block rounded px-1.5 py-0.5 font-semibold tracking-wide"
                      style={{ background: "rgba(59,130,246,0.18)", color: "#3b82f6" }}
                      title="Qualified for this European competition next season"
                    >
                      {europeanCompDisplayCode(s.eur_qual, s.year === null ? null : s.year + 1)}
                    </span>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AllTimeChampions({ hub }: { hub: FootballLeagueHub }) {
  // Tally champions by club for the summary block, then render the full list.
  const tally = new Map<string, { name: string; slug: string; count: number; last: number | null }>();
  for (const ch of hub.all_time_champions) {
    const k = ch.champion;
    const existing = tally.get(k);
    if (existing) {
      existing.count += 1;
      if (ch.year && (existing.last === null || ch.year > existing.last)) existing.last = ch.year;
    } else {
      tally.set(k, { name: ch.champion, slug: ch.champion_slug, count: 1, last: ch.year });
    }
  }
  const topClubs = [...tally.values()].sort((a, b) => b.count - a.count || (b.last ?? 0) - (a.last ?? 0));

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

        {/* Mobile: one stacked card per title instead of a 3-column table. */}
        <div className="grid grid-cols-1 gap-2 sm:hidden">
          {sortedChamps.map((ch, i, arr) => {
            const showBreak = breakYear && ch.year === breakYear &&
              (i === 0 || arr[i - 1].year !== breakYear);
            return (
              <Fragment key={`${ch.year}-${i}-card`}>
                {showBreak && (
                  <div className="py-2 text-center text-xs uppercase tracking-wider text-[var(--text-muted)]"
                       style={{ borderTop: "2px solid var(--border)" }}>
                    {hub.league} era begins
                  </div>
                )}
                <div
                  className="rounded-lg border p-3"
                  style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <TeamCrest name={ch.champion} size={22} fallback={<ColorBall slug={ch.champion_slug} name={ch.champion} />} />
                      <div className="min-w-0">
                        <Link href={`/teams/football/${ch.champion_slug}`} className="hover:underline font-medium truncate block">
                          {ch.champion}
                        </Link>
                        {ch.champion_team && ch.champion_team !== ch.champion && (
                          <span className="text-[var(--text-muted)] text-xs">as {ch.champion_team}</span>
                        )}
                      </div>
                    </div>
                    <span className="flex-shrink-0 text-xs tabular-nums text-[var(--text-muted)]">{ch.year ?? "-"}</span>
                  </div>
                  <div className="mt-1.5 text-xs text-[var(--text-muted)]">
                    {ch.league_name}
                    {ch.format === "playoff" && <span className="ml-1 italic">(playoff)</span>}
                  </div>
                </div>
              </Fragment>
            );
          })}
        </div>

        <div className="overflow-x-auto hidden sm:block">
          <table className="w-full text-sm">
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
        </div>
      </div>
    </section>
  );
}
