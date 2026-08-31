import type { Metadata } from "next";
import HubNav from "@/app/teams/HubNav";
import FootballHubNav from "@/app/teams/FootballHubNav";
import Link from "next/link";
import { getAllClubs, getAllLeagueHubs, getAllEuropeanTournamentHubs } from "@/lib/football";
import { getClubStandings } from "@/lib/clubFootballLive";
import { liveMembershipBySlug, LIVE_MAP_COUNTRIES, LIVE_SEASON_END_YEAR } from "@/lib/footballLiveMembership";
import { leagueStatusFor } from "@/lib/leagueStatus";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { FootballHero } from "@/app/teams/_shared/FootballHero";
import { Badge } from "@/app/teams/_shared/Badge";
import FootballIndexClient, { type IndexClub } from "./FootballIndexClient";
import ClubGreatestGames from "./ClubGreatestGames";
import { getClubGames } from "@/lib/clubGames";
import { getPastSeasons } from "@/lib/footballSeasons";

// Re-render hourly so the auto month-window league/competition statuses
// (leagueStatusFor) flip in and out of season without a manual deploy.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Club Football",
  description:
    "Club football in four layers: every UEFA and FIFA tournament (Champions League to Club World Cup) " +
    "with a live 2026-27 season hub; the great top-flight leagues; every first division worldwide; and " +
    "per-club pages with season-by-season history back to the 1870s.",
  alternates: { canonical: "/teams/football" },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    title: `Club Football | ${SITE_NAME}`,
    description: "European and world club football: tournaments, leagues, and per-club history from the 1870s on.",
    url: `${BASE_URL}/teams/football`,
    type: "website",
  },
};

// Completed-season hubs, shown as a collapsible list under the live-season hero.
// Derived from the hub data via lib/footballSeasons (same source as the full
// seasons page), so a new hub-YYYY-YY.json + trends rebuild extends this
// automatically. (2026-27 is the hero itself.)

export default async function FootballIndex() {
  const PAST_SEASONS = getPastSeasons();
  const clubGames = getClubGames();
  const clubs = getAllClubs();
  const hubs = getAllLeagueHubs();
  const tournamentHubs = getAllEuropeanTournamentHubs();

  // 2026-27 map membership comes from the LIVE api feed (the SAME source as each league-hub
  // map, via liveMembershipBySlug), not the OneDrive workbook whose 2027 rows are still
  // pre-season placeholders — so all the maps update together. Workbook-sourced club tables
  // stay clamped at MAX_DISPLAYED_YEAR until season end.
  let live2027 = new Map<string, { level: number; country: string }>();
  try {
    live2027 = liveMembershipBySlug(await getClubStandings(), LIVE_MAP_COUNTRIES);
  } catch { /* live feed optional; the map falls back to workbook years */ }
  // One-off finals and the continental aggregate have no in-season/offseason cycle.
  const NO_SEASON_STATE = new Set(["uefa-super-cup", "club-world-cup", "other-continental"]);

  // Headline stats for the hero. Cheap to compute from data already in hand.
  const countryCount = new Set(clubs.map((c) => c.country)).size;
  let earliestYear = 9999;
  for (const c of clubs) if (c.first_year && c.first_year < earliestYear) earliestYear = c.first_year;
  const yearsOfHistory = earliestYear === 9999 ? null : new Date().getFullYear() - earliestYear;

  // Trim to the fields the client component needs (keeps the bundle compact).
  const clientClubs: IndexClub[] = clubs.map((c) => {
    const inj = live2027.get(c.slug);
    return {
      slug: c.slug,
      cur_name: c.cur_name,
      country: c.country,
      metro: c.metro,
      lat: c.lat,
      lng: c.lng,
      tiers: c.tiers,
      first_year: c.first_year,
      // Extend last_year to the live season so the map's season slider reaches 2026-27.
      last_year: inj ? LIVE_SEASON_END_YEAR : c.last_year,
      league_seasons: c.league_seasons,
      tier_by_year: inj ? { ...(c.tier_by_year ?? {}), [String(LIVE_SEASON_END_YEAR)]: inj.level } : (c.tier_by_year ?? {}),
      country_by_year: inj ? { ...(c.country_by_year ?? {}), [String(LIVE_SEASON_END_YEAR)]: inj.country } : (c.country_by_year ?? {}),
    };
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <span>Football clubs</span>
      </nav>

      <FootballHubNav current="overview" backHref="/sports" backLabel="All Sports" />

      <FootballHero
        eyebrow="Club Football"
        title={<h1 className="text-3xl font-semibold tracking-tight">Football</h1>}
        subtitle={
          <>Every European trophy, the great leagues, and every club&apos;s story — back to the 1870s.</>
        }
        cta={
          <a
            href="/play/rules-lab.html"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)] flex-shrink-0"
            style={{ background: "var(--bg-card-hover)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            New to football? Rules →
          </a>
        }
      >
        <Link
          href="/teams/football/2026-27"
          className="block rounded-xl border-2 p-4 transition hover:brightness-110"
          style={{ background: "var(--bg-card-hover)", borderColor: "var(--accent)" }}
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="live" dot>Live</Badge>
                <span className="text-lg font-semibold">2026-27 Club Football Hub</span>
              </div>
              <p className="text-sm text-[var(--text-muted)] mt-1 max-w-2xl">
                Every tracked league table, live — plus the European cups and the Libertadores.
              </p>
            </div>
            <span className="text-sm text-[var(--accent)] font-medium whitespace-nowrap">Open the season hub →</span>
          </div>
        </Link>

        {/* Season archive: the past-seasons library is a first-class destination,
            not a footer link buried inside the collapsed accordion below. */}
        <Link
          href="/teams/football/seasons"
          className="block rounded-xl border p-3 transition hover:border-[var(--accent)] hover:bg-[var(--bg-card-hover)]"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sm font-semibold">
              Season archive
              <span className="font-normal text-[var(--text-muted)]"> · every campaign since 1959-60, with trends and all-time champions</span>
            </span>
            <span className="text-sm text-[var(--accent)] font-medium whitespace-nowrap">Browse all seasons →</span>
          </div>
        </Link>

        {/* The four layers, as stat-cards that double as section nav — the numbers ARE the pitch. */}
        <div className="grid gap-2.5 grid-cols-2 lg:grid-cols-4">
          {[
            { href: "#tournaments", emoji: "🏆", stat: String(tournamentHubs.length), label: "tournament hubs", blurb: "Champions League to Club World Cup — every edition, every final." },
            { href: "#leagues", emoji: "🏟️", stat: String(hubs.length), label: "league hubs", blurb: "The great top flights: live tables, all-time champions." },
            { href: "#domestic", emoji: "🌍", stat: String(countryCount), label: "countries", blurb: "Domestic leagues worldwide — one master table of top-flight clubs." },
            { href: "#clubs", emoji: "🗺️", stat: clubs.length.toLocaleString("en-US"), label: "clubs", blurb: `Pinned on the interactive world map, ${yearsOfHistory ? `${yearsOfHistory}+ years` : "150 years"} of history each.` },
          ].map((c) => (
            <a
              key={c.href}
              href={c.href}
              className="rounded-xl border p-3.5 transition hover:border-[var(--accent)] hover:bg-[var(--bg-card-hover)]"
              style={{ background: "var(--bg)", borderColor: "var(--border)" }}
            >
              <div className="flex items-baseline gap-2">
                <span className="text-lg leading-none" aria-hidden>{c.emoji}</span>
                <span className="text-2xl font-bold tabular-nums tracking-tight">{c.stat}</span>
                <span className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">{c.label}</span>
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-1.5 leading-snug">{c.blurb}</p>
            </a>
          ))}
        </div>
      </FootballHero>

      <details className="group mb-8 rounded-xl border" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden px-5 py-3.5 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold">
            Past seasons
            <span className="font-normal text-[var(--text-muted)]">
              {" "}· {PAST_SEASONS[PAST_SEASONS.length - 1]?.slug} to {PAST_SEASONS[0]?.slug}, each a full season hub
            </span>
          </span>
          <span className="text-xs text-[var(--text-muted)] transition-transform group-open:rotate-180">▾</span>
        </summary>
        <div className="border-t px-5 py-4" style={{ borderColor: "var(--border)" }}>
          <div className="space-y-2.5">
            {Array.from(new Set(PAST_SEASONS.map((s) => Math.floor((+s.slug.slice(0, 4) + 1) / 10) * 10)))
              .sort((a, b) => b - a)
              .map((dec) => (
                <div key={dec} className="flex items-baseline gap-3">
                  <div className="text-xs font-semibold text-[var(--text-dim)] w-11 flex-shrink-0 tabular-nums pt-0.5">{dec}s</div>
                  <div className="flex flex-wrap gap-1.5">
                    {PAST_SEASONS.filter((s) => Math.floor((+s.slug.slice(0, 4) + 1) / 10) * 10 === dec).map((s) => (
                      <Link
                        key={s.slug}
                        href={`/teams/football/${s.slug}`}
                        title={s.note}
                        className="text-xs px-2.5 py-1 rounded-md border transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
                      >
                        {s.slug}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
          </div>
          <div className="mt-4 pt-3 border-t text-right" style={{ borderColor: "var(--border)" }}>
            <Link href="/teams/football/seasons" className="text-xs text-[var(--accent)] font-medium hover:underline">
              All seasons, trends &amp; champions →
            </Link>
          </div>
        </div>
      </details>

      <HubNav
        items={[
          { label: "Tournament Hubs", href: "#tournaments" },
          { label: "League Hubs", href: "#leagues" },
          { label: "Greatest Games", href: "#greatest" },
          { label: "Domestic Leagues Worldwide", href: "#domestic" },
        ]}
      />

      <section className="mb-10">
        <h2 id="tournaments" className="text-lg font-semibold mb-3">European & world tournament hubs</h2>
        {/* 2-up tiles on phones (home-page Explore pattern); the most-titled
            line is desktop-only so the mobile tile stays scannable. */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
          {tournamentHubs.map((t) => {
            const topClub = t.most_decorated[0];
            // Prefer the auto month-window status (CL/EL/ECL/Libertadores are "live"
            // from July qualifying on); fall back to the live-bracket entry count.
            const seasonal = leagueStatusFor(`/teams/football/tournaments/${t.slug}`);
            const isLive = (seasonal != null && seasonal.tone !== "offseason") || (t.active && t.current_entries.length > 0);
            return (
              <Link
                key={t.slug}
                href={`/teams/football/tournaments/${t.slug}`}
                className="block rounded-xl border p-3 sm:p-4 transition hover:border-[var(--accent)] hover:bg-[var(--bg-card-hover)]"
                style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
              >
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <div className="font-semibold text-sm sm:text-base leading-snug">{t.short_label}</div>
                  {!t.active && <Badge variant="defunct">Defunct</Badge>}
                  {isLive && <Badge variant="live" dot>Live</Badge>}
                  {t.active && !isLive && !NO_SEASON_STATE.has(t.slug) && (
                    <Badge variant="offseason">Offseason</Badge>
                  )}
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-1 tabular-nums">
                  {t.editions} edition{t.editions === 1 ? "" : "s"}
                  {t.year_min && t.year_max ? <> · {t.year_min}–{t.year_max}</> : null}
                </div>
                {topClub && (
                  <div className="text-xs text-[var(--text-muted)] mt-2 hidden sm:block">
                    Most titled: <span className="font-medium text-[var(--text)]">{topClub.cur_name}</span> ({topClub.champion_count})
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mb-10">
        <h2 id="leagues" className="text-lg font-semibold mb-3">League hubs</h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
          {hubs.map((h) => {
            const s = leagueStatusFor(`/teams/football/leagues/${h.slug}`);
            const live = s ? s.tone !== "offseason" : h.is_mls;
            return (
            <Link
              key={h.slug}
              href={`/teams/football/leagues/${h.slug}`}
              className="block rounded-xl border p-3 sm:p-4 transition hover:border-[var(--accent)] hover:bg-[var(--bg-card-hover)]"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            >
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <div className="text-sm sm:text-base font-semibold leading-snug">{h.league}</div>
                <Badge variant={live ? "live" : "offseason"} dot={live}>{live ? "Live" : "Offseason"}</Badge>
              </div>
              <div className="text-xs text-[var(--text-muted)] mt-1">{h.country}</div>
              <div className="text-xs text-[var(--text-muted)] mt-2 tabular-nums hidden sm:block">
                {h.all_time_champions.length} all-time Level 1 champion entries
              </div>
            </Link>
            );
          })}
        </div>
      </section>

      <section className="mb-10">
        <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
          <h2 id="greatest" className="text-lg font-semibold scroll-mt-20">Greatest games</h2>
          <Link href="/sports/games#clubfb" className="text-xs text-[var(--accent)] font-medium hover:underline whitespace-nowrap">
            Full board on the Greatest Games page →
          </Link>
        </div>
        <p className="text-sm text-[var(--text-muted)] max-w-3xl mb-3">
          Every top-flight league match, every UEFA competition match and the ten major domestic cups
          since 1871, ranked by one Game Score of closeness, stakes, quality and upset. Starred rows are curated all-time classics;
          hover any score for its components. The home side is listed first; neutral venues and
          two-legged ties are marked on each row.
        </p>
        <ClubGreatestGames top={clubGames.top} europe={clubGames.europe} league={clubGames.league} cups={clubGames.cups} decades={clubGames.by_decade} limit={10} />
      </section>

      <section className="mb-10">
        <h2 id="domestic" className="text-lg font-semibold mb-3">Domestic Leagues Worldwide</h2>
        <Link
          href="/teams/football/domestic"
          className="block rounded-xl border p-4 transition hover:border-[var(--accent)] hover:bg-[var(--bg-card-hover)]"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <div className="text-base font-semibold">Every first-division club, all leagues together</div>
          <div className="text-sm text-[var(--text-muted)] mt-1 max-w-3xl">
            One master table of clubs that have ever played a tracked top flight, the marquee leagues
            above and the long tail beyond them, across 76 countries, with league titles, domestic cups,
            continental and Champions League pedigree, current standing and home metro. Filter by
            confederation, country or league.
          </div>
          <div className="text-xs text-[var(--accent)] mt-2">Open the master table →</div>
        </Link>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-3">How club football works</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          {[
            ["Promotion & relegation", "Most leagues on this site are open pyramids: the bottom few clubs in a division swap places with the top few from the tier below each season. England's is the deepest tracked here, five levels from the Premier League down to the National League."],
            ["Qualifying for Europe", "A club's league finish (and sometimes a domestic cup win) earns a spot in next season's Champions League, Europa League, or Conference League — UEFA's three continental club competitions, seeded by a country's five-year coefficient."],
            ["Country coefficients", "UEFA ranks each of its 55 member associations by how their clubs perform in Europe over a rolling five years. A higher coefficient means more Champions League places and a easier route through qualifying — it's why a mid-table team in a strong country can outrank a champion elsewhere."],
            ["Reading a club page", "Every club page stacks the same layers: honors and footprint at the top, a rank-history chart, then season-by-season league results, domestic cup runs, and European appearances — the full record in one scroll."],
          ].map(([h, b]) => (
            <div key={h} className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
              <p className="font-semibold text-[var(--text)] mb-1">{h}</p>
              <p className="text-xs text-[var(--text-muted)]">{b}</p>
            </div>
          ))}
        </div>
      </section>

      <div id="clubs" className="scroll-mt-20">
        <FootballIndexClient clubs={clientClubs} />
      </div>
    </main>
  );
}
