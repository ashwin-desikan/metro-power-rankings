import type { Metadata } from "next";
import Link from "next/link";
import { getAllClubs, getAllLeagueHubs } from "@/lib/football";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import FootballIndexClient, { type IndexClub } from "./FootballIndexClient";

export const metadata: Metadata = {
  title: "Football clubs",
  description:
    "Canonical pages for every club that has played top-flight football in England, Spain, " +
    "Italy, Germany, or France, plus all five English league pyramid tiers. Source: the grand " +
    "Football workbook covering 1872 to present.",
  alternates: { canonical: "/teams/football" },
  openGraph: {
    title: `Football clubs | ${SITE_NAME}`,
    description: "Canonical pages for the Big 5 European leagues and the English pyramid.",
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
    tiers: c.tiers,
    first_year: c.first_year,
    last_year: c.last_year,
    league_seasons: c.league_seasons,
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
          Big 5 European top flights plus the full English pyramid through National League.
          Each club has a season-by-season history pulled from the grand football workbook
          (top-flight rows back to the 1870s for England, 1890s for France and Italy, 1900s for
          Spain and Germany).
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
                {h.all_time_champions.length} all-time top-flight champion entries
              </div>
            </Link>
          ))}
        </div>
      </section>

      <h2 className="text-lg font-semibold mb-3">All clubs</h2>
      <FootballIndexClient clubs={clientClubs} />
    </main>
  );
}
