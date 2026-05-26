import type { Metadata } from "next";
import Link from "next/link";
import { getAllClubs, getAllLeagueHubs } from "@/lib/football";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import FootballIndexClient, { type IndexClub } from "./FootballIndexClient";

export const metadata: Metadata = {
  title: "Football clubs",
  description:
    "Canonical pages for every club that has played Level 1 football in England, Spain, Italy, " +
    "Germany, France, the Netherlands, Portugal, or Scotland, plus the full English league " +
    "pyramid (Premier League through National League) and the full Scottish league pyramid " +
    "(Scottish Premiership through League Two). Source: the grand Football workbook covering " +
    "1872 to present.",
  alternates: { canonical: "/teams/football" },
  openGraph: {
    title: `Football clubs | ${SITE_NAME}`,
    description: "Canonical pages for the top European football leagues and the English pyramid.",
    url: `${BASE_URL}/teams/football`,
    type: "website",
  },
};

export default function FootballIndex() {
  const clubs = getAllClubs();
  const hubs = getAllLeagueHubs();

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
          Top European top flights across England, Spain, Italy, Germany, France, the Netherlands,
          Portugal, and Scotland. England (down to National League) and Scotland (down to League
          Two) are wired through their full league pyramids; the others are top-flight only. Each
          club has a season-by-season history pulled from the grand football workbook, with
          top-flight rows reaching back to the 1870s in England, the 1890s in France and Italy,
          the 1900s in Spain and Germany, the 1880s in Scotland, and the 1930s in the Netherlands
          and Portugal.
        </p>
      </header>

      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-3">League hubs</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {hubs.map((h) => (
            <Link
              key={h.slug}
              href={`/teams/football/leagues/${h.slug}`}
              className="block rounded-xl border p-4 transition hover:border-[var(--accent)]"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            >
              <div className="text-base font-semibold">{h.league}</div>
              <div className="text-xs text-[var(--text-muted)] mt-1">{h.country}</div>
              <div className="text-xs text-[var(--text-muted)] mt-2 tabular-nums">
                {h.all_time_champions.length} all-time Level 1 champion entries
              </div>
            </Link>
          ))}
        </div>
      </section>

      <FootballIndexClient clubs={clientClubs} />
    </main>
  );
}
