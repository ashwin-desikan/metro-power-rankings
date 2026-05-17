import type { Metadata } from "next";
import Link from "next/link";
import { getAllFranchises, getTopGamesAllTime, getTopGamesByDecade, logoUrlFor, monogramFor, withStadiumLocations, withTeamSlugs } from "@/lib/nfl";
import TopGamesTable from "./TopGamesTable";
import FranchiseTable from "./FranchiseTable";
import LeagueMap from "./LeagueMap";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;

const PAGE_PATH = "/teams/nfl";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "NFL franchises";
const PAGE_DESCRIPTION =
  "All 32 active NFL franchises, ranked by championships won across the NFL, AAFC, AFL, and Super Bowl era. Founded year, current city, host metro, and all-time record per franchise.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: {
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
  },
};

export default function NflIndexPage() {
  const franchises = getAllFranchises();
  // Pre-sorted by champs desc, then win pct desc, in the ETL.
  const totalChamps = franchises.reduce((s, f) => s + f.championships, 0);
  const withChamps = franchises.filter(f => f.championships > 0).length;
  const sbEra = totalChamps; // approximate; the page is for context, not stat-checking

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <header className="mb-8">
        <div className="text-xs uppercase tracking-widest text-[var(--text-dim)] mb-2">National Football League</div>
        <h1 className="text-4xl font-bold tracking-tight mb-2">NFL franchises</h1>
        <p className="text-[var(--text-muted)] max-w-3xl text-sm sm:text-base">
          All 32 active franchises, sorted by championships won across the NFL, AAFC, AFL, and Super Bowl era.
          Click any franchise for full history, stadium timeline, and award winners.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-[var(--text-muted)] mt-4">
          <div><strong className="text-[var(--text)] text-sm">{franchises.length}</strong> active franchises</div>
          <div><strong className="text-[var(--text)] text-sm">{withChamps}</strong> with at least one championship</div>
          <div><strong className="text-[var(--text)] text-sm">{totalChamps}</strong> combined titles (pre-Super Bowl + Super Bowl era)</div>
          <div>
            Defunct franchises: <Link href="/teams/nfl/historical" className="text-[var(--accent)] hover:underline">/teams/nfl/historical</Link>
          </div>
        </div>
      </header>

      {/* 32-team sortable table. Logo and monogram maps are computed
          server-side so the client component never has to touch the
          filesystem; sorting state lives entirely in the client. */}
      <LeagueMap franchises={franchises} />

      <FranchiseTable
        franchises={franchises}
        logoMap={Object.fromEntries(franchises.map(f => [f.slug, logoUrlFor(f.slug)]))}
        monoMap={Object.fromEntries(franchises.map(f => [f.slug, monogramFor(f.slug)]))}
      />

      <TopGamesTable
        allTime={withTeamSlugs(withStadiumLocations(getTopGamesAllTime()))}
        byDecade={Object.fromEntries(
          Object.entries(getTopGamesByDecade()).map(([k, v]) => [
            k,
            withTeamSlugs(withStadiumLocations(v)),
          ])
        )}
      />

      <p className="text-xs text-[var(--text-dim)] mt-8">
        Source: <a href="/methodology" className="hover:text-[var(--text-muted)]">methodology</a>.
        Franchise totals from NFL_all workbook, last refreshed 2026-05-12.
      </p>
    </main>
  );
}
