import type { Metadata } from "next";
import HubNav from "@/app/teams/HubNav";
import FootballHubNav from "@/app/teams/FootballHubNav";
import Link from "next/link";
import { getAllClubs, getAllLeagueHubs, getAllEuropeanTournamentHubs } from "@/lib/football";
import { leagueStatusFor } from "@/lib/leagueStatus";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { FootballHero } from "@/app/teams/_shared/FootballHero";
import { StatTile, StatGrid } from "@/app/teams/_shared/StatTile";
import { Badge } from "@/app/teams/_shared/Badge";
import FootballIndexClient, { type IndexClub } from "./FootballIndexClient";

// Re-render hourly so the auto month-window league/competition statuses
// (leagueStatusFor) flip in and out of season without a manual deploy.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Club Football",
  description:
    "Three layers of club football: UEFA and FIFA tournament hubs (Champions League, Europa League, " +
    "Conference League, Cup Winners' Cup, Fairs Cup, Super Cup, Club World Cup) with a live 2025-26 " +
    "bracket; eight top-flight league hubs; and canonical per-club pages with season-by-season history.",
  alternates: { canonical: "/teams/football" },
  openGraph: {
    title: `Club Football | ${SITE_NAME}`,
    description: "European and world club football: tournaments, leagues, and per-club history from the 1870s on.",
    url: `${BASE_URL}/teams/football`,
    type: "website",
  },
};

// Completed-season hubs, shown as a collapsible list under the live-season hero.
// (2026-27 is the hero itself; the full seasons page adds trends and champions.)
const PAST_SEASONS: { slug: string; note: string }[] = [
  { slug: "2025-26", note: "Champions League: Paris Saint-Germain" },
  { slug: "2024-25", note: "Champions League: Paris Saint-Germain · Club World Cup: Chelsea" },
  { slug: "2023-24", note: "Champions League: Real Madrid" },
  { slug: "2022-23", note: "The treble: Manchester City" },
  { slug: "2021-22", note: "Champions League: Real Madrid" },
  { slug: "2020-21", note: "Champions League: Chelsea · Club World Cup: Bayern Munich" },
  { slug: "2019-20", note: "The treble: Bayern Munich" },
  { slug: "2018-19", note: "Champions League: Liverpool" },
  { slug: "2017-18", note: "Champions League: Real Madrid" },
  { slug: "2016-17", note: "Champions League: Real Madrid" },
  { slug: "2015-16", note: "Champions League: Real Madrid" },
  { slug: "2014-15", note: "The treble: Barcelona" },
  { slug: "2013-14", note: "Champions League: Real Madrid · La Décima" },
];

export default function FootballIndex() {
  const clubs = getAllClubs();
  const hubs = getAllLeagueHubs();
  const tournamentHubs = getAllEuropeanTournamentHubs();
  // One-off finals and the continental aggregate have no in-season/offseason cycle.
  const NO_SEASON_STATE = new Set(["uefa-super-cup", "club-world-cup", "other-continental"]);

  // Headline stats for the hero. Cheap to compute from data already in hand.
  const countryCount = new Set(clubs.map((c) => c.country)).size;
  let earliestYear = 9999;
  for (const c of clubs) if (c.first_year && c.first_year < earliestYear) earliestYear = c.first_year;
  const yearsOfHistory = earliestYear === 9999 ? null : new Date().getFullYear() - earliestYear;

  // Trim to the fields the client component needs (keeps the bundle compact).
  const clientClubs: IndexClub[] = clubs.map((c) => ({
    slug: c.slug,
    cur_name: c.cur_name,
    country: c.country,
    metro: c.metro,
    lat: c.lat,
    lng: c.lng,
    tiers: c.tiers,
    first_year: c.first_year,
    last_year: c.last_year,
    league_seasons: c.league_seasons,
    tier_by_year: c.tier_by_year ?? {},
    country_by_year: c.country_by_year ?? {},
  }));

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
          <>
            Three layers of club football on one product surface, built for football obsessives
            and first-time visitors alike. UEFA and FIFA tournament hubs carry every Champions
            League, Europa League, Conference League, Cup Winners&apos; Cup, Inter-Cities Fairs
            Cup, UEFA Super Cup, and Club World Cup edition, with a round-by-round bracket on
            competitions still in flight. League hubs cover the top flights across eight
            countries with current standings and all-time champions. And the canonical per-club
            pages render season-by-season standings, cup finals, and European appearances,
            reaching back to the 1870s.
          </>
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
        stats={
          <StatGrid>
            <StatTile label="Clubs tracked" value={clubs.length.toLocaleString("en-US")} />
            <StatTile label="Countries" value={countryCount} />
            <StatTile label="Tournament & league hubs" value={tournamentHubs.length + hubs.length} />
            <StatTile label="Years of history" value={yearsOfHistory ? `${yearsOfHistory}+` : "-"} />
          </StatGrid>
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
                Live league tables for every domestic competition and tier tracked, grouped by confederation,
                alongside the European club competitions and Copa Libertadores.
              </p>
            </div>
            <span className="text-sm text-[var(--accent)] font-medium whitespace-nowrap">Open the season hub →</span>
          </div>
        </Link>
      </FootballHero>

      <details className="group mb-8 rounded-xl border" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden px-5 py-3.5 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold">
            Past seasons
            <span className="font-normal text-[var(--text-muted)]"> · 2013-14 to 2025-26, each a full season hub</span>
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

      <FootballIndexClient clubs={clientClubs} />
    </main>
  );
}
