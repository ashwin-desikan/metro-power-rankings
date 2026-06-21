import type { Metadata } from "next";
import HubNav from "@/app/teams/HubNav";
import Link from "next/link";
import { getAllClubs, getAllLeagueHubs, getAllEuropeanTournamentHubs } from "@/lib/football";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import FootballIndexClient, { type IndexClub } from "./FootballIndexClient";

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

export default function FootballIndex() {
  const clubs = getAllClubs();
  const hubs = getAllLeagueHubs();
  const tournamentHubs = getAllEuropeanTournamentHubs();
  // One-off finals and the continental aggregate have no in-season/offseason cycle.
  const NO_SEASON_STATE = new Set(["uefa-super-cup", "club-world-cup", "other-continental"]);

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

      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Football</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)] max-w-3xl">
          Three layers of club football on one product surface. UEFA and FIFA tournament hubs
          carry every Champions League, Europa League, Conference League, Cup Winners&apos; Cup,
          Inter-Cities Fairs Cup, UEFA Super Cup, and Club World Cup edition, with a round-by-round
          bracket on the 2025-26 competitions still in flight. League hubs cover the eight top
          flights (England, Spain, Italy, Germany, France, Netherlands, Portugal, Scotland) with
          current standings and all-time champions. And the canonical per-club pages render
          season-by-season standings, cup finals, and European appearances, reaching back to the
          1870s in England, the 1890s in France and Italy, and the 1880s in Scotland.
        </p>
      </header>

      <HubNav
        items={[
          { label: "Tournament Hubs", href: "#tournaments" },
          { label: "League Hubs", href: "#leagues" },
          { label: "Domestic Leagues Worldwide", href: "#domestic" },
        ]}
      />

      <section className="mb-10">
        <h2 id="tournaments" className="text-lg font-semibold mb-3">European & world tournament hubs</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tournamentHubs.map((t) => {
            const topClub = t.most_decorated[0];
            const isLive = t.active && t.current_entries.length > 0;
            return (
              <Link
                key={t.slug}
                href={`/teams/football/tournaments/${t.slug}`}
                className="block rounded-xl border p-4 transition hover:border-[var(--accent)]"
                style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-semibold">{t.short_label}</div>
                  {!t.active && (
                    <span
                      className="inline-block rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide font-semibold"
                      style={{ background: "rgba(120,120,140,0.18)", color: "var(--text-muted)" }}
                    >
                      Defunct
                    </span>
                  )}
                  {isLive && (
                    <span
                      className="inline-block rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide font-semibold"
                      style={{ background: "rgba(16,185,129,0.18)", color: "#10b981" }}
                    >
                      Live
                    </span>
                  )}
                  {t.active && !isLive && !NO_SEASON_STATE.has(t.slug) && (
                    <span
                      className="inline-block rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide font-semibold"
                      style={{ background: "rgba(120,120,140,0.12)", color: "var(--text-dim)" }}
                    >
                      Offseason
                    </span>
                  )}
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-1 tabular-nums">
                  {t.editions} edition{t.editions === 1 ? "" : "s"}
                  {t.year_min && t.year_max ? <> · {t.year_min}–{t.year_max}</> : null}
                </div>
                {topClub && (
                  <div className="text-xs text-[var(--text-muted)] mt-2">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {hubs.map((h) => (
            <Link
              key={h.slug}
              href={`/teams/football/leagues/${h.slug}`}
              className="block rounded-xl border p-4 transition hover:border-[var(--accent)]"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-base font-semibold">{h.league}</div>
                <span className="inline-block rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide font-semibold" style={h.is_mls ? { background: "rgba(16,185,129,0.18)", color: "#10b981" } : { background: "rgba(120,120,140,0.12)", color: "var(--text-dim)" }}>{h.is_mls ? "Live" : "Offseason"}</span>
              </div>
              <div className="text-xs text-[var(--text-muted)] mt-1">{h.country}</div>
              <div className="text-xs text-[var(--text-muted)] mt-2 tabular-nums">
                {h.all_time_champions.length} all-time Level 1 champion entries
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <h2 id="domestic" className="text-lg font-semibold mb-3">Domestic Leagues Worldwide</h2>
        <Link
          href="/teams/football/domestic"
          className="block rounded-xl border p-4 transition hover:border-[var(--accent)]"
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

      <FootballIndexClient clubs={clientClubs} />
    </main>
  );
}
