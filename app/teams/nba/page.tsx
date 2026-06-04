import type { Metadata } from "next";
import Link from "next/link";
import {
  getAllFranchises,
  getHistoricalFranchises,
  getPlayoffState,
  getTopGamesAllTime,
  getTopGamesByDecade,
  getFranchiseByCanonical,
  logoUrlFor,
  monogramFor,
  PLAYOFF_STATE_COLORS,
} from "@/lib/nba";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import FranchiseTable from "./FranchiseTable";
import LeagueMap from "./LeagueMap";
import PlayoffBracket from "./PlayoffBracket";
import TopGamesTable from "./TopGamesTable";
import HubNav from "@/app/teams/HubNav";

export const dynamicParams = false;

const PAGE_PATH = "/teams/nba";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "NBA franchises";
const PAGE_DESCRIPTION =
  "All 30 active NBA franchises, sorted by championships across the BAA (1947-49), NBA (1949+), and ABA (1968-76) eras. Founded year, current city and metro, championships, conference-finals appearances, and current postseason status.";

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

// Enrich league-wide top-game rows with current franchise slugs at build time
// so the client component never has to touch server data.
function enrichSlugs<T extends { winner_canonical: string; loser_canonical: string }>(
  rows: T[]
): T[] {
  return rows.map((g) => ({
    ...g,
    winner_slug: getFranchiseByCanonical(g.winner_canonical)?.slug ?? null,
    loser_slug: getFranchiseByCanonical(g.loser_canonical)?.slug ?? null,
  }));
}

export default function NbaIndexPage() {
  const franchises = getAllFranchises();
  const totalChamps = franchises.reduce((s, f) => s + f.championships, 0);
  const withChamps = franchises.filter(f => f.championships > 0).length;
  const playoffState = getPlayoffState();
  const isPostseasonOver = playoffState.is_postseason_complete;
  const inPlayoffs = Object.entries(playoffState.by_franchise).filter(
    ([, st]) => st.state.startsWith("active_")
  ).length;

  const topGamesAllTime = enrichSlugs(getTopGamesAllTime());
  const topGamesByDecade = Object.fromEntries(
    Object.entries(getTopGamesByDecade()).map(([k, v]) => [k, enrichSlugs(v)])
  );

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <header className="mb-8">
        <div className="text-xs uppercase tracking-widest text-[var(--text-dim)] mb-2">
          National Basketball Association
        </div>
        <h1 className="text-4xl font-bold tracking-tight mb-2">NBA franchises</h1>
        <p className="text-[var(--text-muted)] max-w-3xl text-sm sm:text-base">
          All 30 active franchises, sorted by championships across the Basketball Association of America (BAA, 1947-49),
          National Basketball Association (NBA, 1949+), and American Basketball Association (ABA, 1968-76 — merged into NBA in 1976).
          Click any franchise for full history, arena timeline, awards, and All-NBA selections.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-[var(--text-muted)] mt-4">
          <div><strong className="text-[var(--text)] text-sm">{franchises.length}</strong> active franchises</div>
          <div><strong className="text-[var(--text)] text-sm">{withChamps}</strong> with at least one title</div>
          <div><strong className="text-[var(--text)] text-sm">{totalChamps}</strong> total championships</div>
          {playoffState.year && inPlayoffs > 0 && (
            <div>
              <strong className="text-[var(--text)] text-sm">{inPlayoffs}</strong> still active in the {playoffState.year} playoffs
            </div>
          )}
          <div>
            Defunct franchises: <Link href="/teams/nba/historical" className="text-[var(--accent)] hover:underline">/teams/nba/historical</Link>
          </div>
        </div>
      </header>

      <HubNav
        items={[
          { label: "Playoffs", href: "#bracket" },
          { label: "Map", href: "#map" },
          { label: "All-Time Table", href: "#all-time" },
          { label: "Top Games", href: "#top-games" },
        ]}
      />

      <div id="bracket">
        <PlayoffBracket
          franchises={franchises}
          playoffBundle={playoffState}
          logoMap={Object.fromEntries(franchises.map(f => [f.slug, logoUrlFor(f.slug)]))}
        />
      </div>

      <div id="map">
        <LeagueMap franchises={franchises} playoffState={isPostseasonOver ? {} : playoffState.by_franchise} />
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-[var(--text-muted)] mb-6 mt-8">
        {playoffState.year && !isPostseasonOver && (
          <span className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: PLAYOFF_STATE_COLORS.active_cf.bg }} />
            {playoffState.year} playoff status
          </span>
        )}
      </div>

      <div id="all-time">
        <FranchiseTable
          franchises={franchises}
          historical={getHistoricalFranchises()}
          playoffState={isPostseasonOver ? {} : playoffState.by_franchise}
          logoMap={Object.fromEntries(franchises.map(f => [f.slug, logoUrlFor(f.slug)]))}
          monoMap={Object.fromEntries(franchises.map(f => [f.slug, monogramFor(f.slug)]))}
        />
      </div>

      <div id="top-games">
        <TopGamesTable allTime={topGamesAllTime} byDecade={topGamesByDecade} />
      </div>

      <p className="text-xs text-[var(--text-dim)] mt-8">
        Source: <Link href="/methodology" className="hover:text-[var(--text-muted)]">methodology</Link>.
        Franchise totals from the NBA workbook. Game Score is a composite of stakes, quality, and ELO-weighted matchup strength.
      </p>
    </main>
  );
}
