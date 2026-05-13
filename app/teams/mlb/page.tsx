import type { Metadata } from "next";
import Link from "next/link";
import {
  getAllFranchises,
  getTopGamesAllTime,
  getTopGamesByDecade,
  getAllFranchiseSlugs,
  logoUrlFor,
  monogramFor,
  TITLE_COLORS,
} from "@/lib/mlb";
import TopGamesTable from "./TopGamesTable";
import FranchiseTable from "./FranchiseTable";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;

const PAGE_PATH = "/teams/mlb";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "MLB franchises";
const PAGE_DESCRIPTION =
  "All 30 active Major League Baseball franchises, ranked by World Series titles across the pre-1903 cup era and the modern World Series era. Founded year, current city, host metro, and all-time record per franchise.";

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

// Resolve winner_slug / loser_slug on top-games rows so the client renderer
// can wire active-franchise names to /teams/mlb/[slug]. Defunct and pre-WS
// franchises fall back to plain text. Stays server-side so the slug index
// is built once per request.
function withTeamSlugs<T extends { winner_canonical: string; loser_canonical: string }>(
  rows: T[],
  slugByCanonical: Map<string, string>,
): (T & { winner_slug: string | null; loser_slug: string | null })[] {
  return rows.map((r) => ({
    ...r,
    winner_slug: slugByCanonical.get(r.winner_canonical) ?? null,
    loser_slug: slugByCanonical.get(r.loser_canonical) ?? null,
  }));
}

export default function MlbIndexPage() {
  const franchises = getAllFranchises();
  const totalWS = franchises.reduce((s, f) => s + f.championships, 0);
  const totalPreWS = franchises.reduce((s, f) => s + f.pre_ws_championships, 0);
  const withChamps = franchises.filter(f => f.championships > 0).length;
  const slugByCanonical = new Map(franchises.map(f => [f.canonical, f.slug]));

  const allTimeRows = withTeamSlugs(getTopGamesAllTime(), slugByCanonical);
  const byDecadeEnriched = Object.fromEntries(
    Object.entries(getTopGamesByDecade()).map(([k, v]) => [k, withTeamSlugs(v, slugByCanonical)])
  );

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <header className="mb-8">
        <div className="text-xs uppercase tracking-widest text-[var(--text-dim)] mb-2">Major League Baseball</div>
        <h1 className="text-4xl font-bold tracking-tight mb-2">MLB franchises</h1>
        <p className="text-[var(--text-muted)] max-w-3xl text-sm sm:text-base">
          All 30 active franchises, sorted by World Series titles across the National League (1876+), American League (1901+), and the modern World Series era (1903+).
          Click any franchise for full history, stadium timeline, and award winners.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-[var(--text-muted)] mt-4">
          <div><strong className="text-[var(--text)] text-sm">{franchises.length}</strong> active franchises</div>
          <div><strong className="text-[var(--text)] text-sm">{withChamps}</strong> with at least one World Series</div>
          <div><strong className="text-[var(--text)] text-sm">{totalWS}</strong> World Series titles awarded (1903+)</div>
          <div><strong className="text-[var(--text)] text-sm">{totalPreWS}</strong> pre-1903 cup wins (Temple Cup, World's Series, NL pennants)</div>
          <div>
            Defunct franchises: <Link href="/teams/mlb/historical" className="text-[var(--accent)] hover:underline">/teams/mlb/historical</Link>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap gap-4 text-xs text-[var(--text-muted)] mb-6">
        <span className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: TITLE_COLORS.pre_ws.bg }} />
          Pre-1903 cup era (Temple Cup, World's Series, etc.)
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: TITLE_COLORS.ws.bg }} />
          World Series era (1903-present)
        </span>
      </div>

      <FranchiseTable
        franchises={franchises}
        logoMap={Object.fromEntries(franchises.map(f => [f.slug, logoUrlFor(f.slug)]))}
        monoMap={Object.fromEntries(franchises.map(f => [f.slug, monogramFor(f.slug)]))}
      />

      <TopGamesTable
        allTime={allTimeRows}
        byDecade={byDecadeEnriched}
      />

      <p className="text-xs text-[var(--text-dim)] mt-8">
        Source: <a href="/methodology" className="hover:text-[var(--text-muted)]">methodology</a>.
        Franchise totals from the MLB workbook (Year by Year + Totals sheets).
      </p>
    </main>
  );
}
