import type { Metadata } from "next";
import Link from "next/link";
import { getAllFranchises, getChampionshipAppearances, getHistoricalFranchises, getTopGamesAllTime, getTopGamesByDecade, logoUrlFor, monogramFor, withStadiumLocations, withTeamSlugs, defunctSlug } from "@/lib/nfl";
import TopGamesTable from "./TopGamesTable";
import FranchiseTable from "./FranchiseTable";
import LeagueMap from "./LeagueMap";
import NflStandings from "./NflStandings";
import HubNav from "@/app/teams/HubNav";
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
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    type: "website",
  },
  twitter: { images: ["/og-default.png"],
    card: "summary_large_image",
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
  },
};

export default function NflIndexPage() {
  const franchises = getAllFranchises();
  // Pre-sorted by champs desc, then win pct desc, in the ETL.
  const totalChamps = franchises.reduce((s, f) => s + f.championships, 0);
  const withChamps = franchises.filter(f => f.championships > 0).length;
  const champAppMap = Object.fromEntries(
    franchises.map(f => [f.slug, getChampionshipAppearances(f.canonical).length])
  );
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
          <div>
            International: <Link href="/teams/nfl/international" className="text-[var(--accent)] hover:underline">/teams/nfl/international</Link>
          </div>
          <div>
            Against expectation: <Link href="/sports/expectation" className="text-[var(--accent)] hover:underline">/sports/expectation</Link>
          </div>
        </div>
      </header>

      <HubNav
        items={[
          { label: "Current Standings", href: "#standings" },
          { label: "Map", href: "#map" },
          { label: "All-Time Table", href: "#all-time" },
          { label: "Top Games", href: "#top-games" },
          { label: "Against Expectation", href: "/sports/expectation" },
          { label: "International", href: "/teams/nfl/international" },
          { label: "🔮 Predictions", href: "/predictions/nfl" },
        ]}
      />

      <div id="standings">
        <NflStandings />
      </div>

      {/* 32-team sortable table. Logo and monogram maps are computed
          server-side so the client component never has to touch the
          filesystem; sorting state lives entirely in the client. */}
      <div id="map">
        <LeagueMap franchises={franchises} />
      </div>

      <div id="all-time">
        <FranchiseTable
          franchises={franchises}
          historical={getHistoricalFranchises()}
          logoMap={Object.fromEntries(franchises.map(f => [f.slug, logoUrlFor(f.slug)]))}
          monoMap={Object.fromEntries(franchises.map(f => [f.slug, monogramFor(f.slug)]))}
          champAppMap={champAppMap}
          defunctSlugMap={Object.fromEntries(getHistoricalFranchises().map(h => [h.canonical, defunctSlug(h)]))}
        />
      </div>

      <div id="top-games">
        <TopGamesTable
          allTime={withTeamSlugs(withStadiumLocations(getTopGamesAllTime()))}
          byDecade={Object.fromEntries(
            Object.entries(getTopGamesByDecade()).map(([k, v]) => [
              k,
              withTeamSlugs(withStadiumLocations(v)),
            ])
          )}
        />
      </div>

      <p className="text-xs text-[var(--text-dim)] mt-8">
        New: <a href="/play/nfl-rules-lab.html" className="text-[var(--accent)] hover:underline">the NFL Rules Lab &rarr;</a> the Catch Lab, key rules, real calls and how the rules changed (kids and adults modes).
      </p>
      <p className="text-xs text-[var(--text-dim)] mt-2">
        Source: <a href="/methodology" className="hover:text-[var(--text-muted)]">methodology</a>.
        Franchise totals from NFL_all workbook, last refreshed 2026-05-12.
      </p>
    </main>
  );
}
