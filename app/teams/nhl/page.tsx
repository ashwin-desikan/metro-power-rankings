import type { Metadata } from "next";
import Link from "next/link";
import {
  getAllFranchises,
  getAllHistorical,
  logoUrlFor,
  monogramFor,
  ORIGINAL_SIX,
  getCupPresentationGames,
} from "@/lib/nhl";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { getNhlPlayoffState } from "@/lib/nhl-playoffs";
import FranchiseTable from "./FranchiseTable";
import LeagueMap from "./LeagueMap";
import NhlPlayoffBracket from "./NhlPlayoffBracket";
import HubNav from "@/app/teams/HubNav";
import CupPresentationTable from "./CupPresentationTable";

export const dynamicParams = false;

const PAGE_PATH = "/teams/nhl";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "NHL franchises";
const PAGE_DESCRIPTION =
  "All 32 active National Hockey League franchises, ranked by Stanley Cup wins across the NHA (1910-17), PCHA, WCHL, and NHL eras, plus WHA Avco Cup wins for the four franchises that came from the rival league. Founded year, current city and metro, Presidents' Trophy and Stanley Cup Final counts, plus live Stanley Cup playoff bracket state.";

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
    card: "summary_large_image",
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
  },
};

export default function NhlIndexPage() {
  const franchises = getAllFranchises();
  const totalChamps = franchises.reduce((s, f) => s + f.championships, 0);
  const withChamps = franchises.filter(f => f.championships > 0).length;
  const totalPresidents = franchises.reduce((s, f) => s + f.best_record_seasons, 0);
  const playoffBundle = getNhlPlayoffState();
  const cup = getCupPresentationGames();
  const inPlayoffs = Object.values(playoffBundle.by_franchise).filter(
    (st) => st.state.startsWith("active_"),
  ).length;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <header className="mb-8">
        <div className="text-xs uppercase tracking-widest text-[var(--text-dim)] mb-2">
          National Hockey League
        </div>
        <h1 className="text-4xl font-bold tracking-tight mb-2">NHL franchises</h1>
        <p className="text-[var(--text-muted)] max-w-3xl text-sm sm:text-base">
          All 32 active franchises, sorted by Stanley Cup wins from 1910 onwards across the National Hockey Association (NHA),
          Pacific Coast Hockey Association (PCHA), Western Canada Hockey League (WCHL), and the NHL (1917+).
          The four franchises that came from the World Hockey Association also carry their Avco Cup wins as a separate slate-tier chip.
          Click any franchise for full history, arena timeline, trophy rolls, and Presidents' Trophy seasons.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-[var(--text-muted)] mt-4">
          <div><strong className="text-[var(--text)] text-sm">{franchises.length}</strong> active franchises</div>
          <div><strong className="text-[var(--text)] text-sm">{withChamps}</strong> with at least one Cup</div>
          <div><strong className="text-[var(--text)] text-sm">{totalChamps}</strong> Stanley Cups awarded</div>
          <div><strong className="text-[var(--text)] text-sm">{totalPresidents}</strong> Best-Record / Presidents' Trophy seasons</div>
          {playoffBundle.year && inPlayoffs > 0 && (
            <div>
              <strong className="text-[var(--text)] text-sm">{inPlayoffs}</strong> still active in the {playoffBundle.year} playoffs
            </div>
          )}
          <div>
            Defunct franchises: <Link href="/teams/nhl/historical" className="text-[var(--accent)] hover:underline">/teams/nhl/historical</Link>
          </div>
        </div>
      </header>

      <HubNav
        items={[
          { label: "Playoffs", href: "#bracket" },
          { label: "Map", href: "#map" },
          { label: "All-Time Table", href: "#all-time" },
          { label: "Stanley Cup Games", href: "#cup-games" },
        ]}
      />

      <div id="bracket">
        <NhlPlayoffBracket
          franchises={franchises}
          playoffBundle={playoffBundle}
          logoMap={Object.fromEntries(franchises.map((f) => [f.slug, logoUrlFor(f.slug)]))}
        />
      </div>

      <div id="map">
        <LeagueMap franchises={franchises} />
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-[var(--text-muted)] mb-6 mt-8">
        <span className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "#3a2e1a" }} />
          <span style={{ color: "#d4af37" }}>O6</span> Original Six (1942-1967)
        </span>
      </div>

      <div id="all-time">
        <FranchiseTable
          franchises={franchises}
          historical={getAllHistorical()}
          logoMap={Object.fromEntries(franchises.map(f => [f.slug, logoUrlFor(f.slug)]))}
          monoMap={Object.fromEntries(franchises.map(f => [f.slug, monogramFor(f.slug)]))}
          originalSix={ORIGINAL_SIX}
        />
      </div>

      <div id="cup-games">
        <CupPresentationTable allTime={cup.allTime} byDecade={cup.byDecade} />
      </div>

      <p className="text-xs text-[var(--text-dim)] mt-8">
        Source: <Link href="/methodology" className="hover:text-[var(--text-muted)]">methodology</Link>.
        Franchise totals come from the NHL workbook (Year by Year + Totals). Live standings refresh from ESPN every hour and the
        full static build refreshes daily at 08:00 UTC. Playoff bracket visualization queued for v1.1.
      </p>
    </main>
  );
}
