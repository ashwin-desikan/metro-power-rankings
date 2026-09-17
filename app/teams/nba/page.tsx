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
import { BASE_URL, SITE_NAME, ogImage } from "@/lib/seo";
import FranchiseTable from "./FranchiseTable";
import LeagueMap from "./LeagueMap";
import PlayoffBracket from "./PlayoffBracket";
import TopGamesTable from "./TopGamesTable";
import HubNav from "@/app/teams/HubNav";
import { getNbaEloIndex } from "@/lib/nbaElo";
import { seasonLabel as nbaSeasonLabel } from "@/lib/nba";
import { SportBadge } from "@/app/teams/_shared/SportIcon";

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
  openGraph: { images: [{ url: ogImage(PAGE_TITLE, PAGE_URL), width: 1200, height: 630 }],
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    type: "website",
  },
  twitter: { images: [ogImage(PAGE_TITLE, PAGE_URL)],
    card: "summary_large_image",
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

export default async function NbaIndexPage() {
  const franchises = getAllFranchises();
  const totalChamps = franchises.reduce((s, f) => s + f.championships, 0);
  const withChamps = franchises.filter(f => f.championships > 0).length;

  // The Elo spine, for the two season cards above the nav. Caught rather than
  // awaited bare: a hub that 500s because a season index is missing is a worse
  // failure than a hub without its season cards.
  const eloIndex = await getNbaEloIndex().catch(() => null);
  const eloSeasons = eloIndex?.seasons ?? [];
  const latestSeason = eloSeasons.length ? eloSeasons[eloSeasons.length - 1] : null;
  // Only a FINISHED season can disagree: a seeded year has a top-rated team
  // and no champion, which is an unplayed season, not a disagreement.
  const eloDisagreements = eloSeasons.filter(
    (r) => r.complete && r.champion && r.top && r.champion.name !== r.top.name,
  ).length;
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
        <div className="flex items-center gap-3 mb-2">
          <SportBadge sport="nba" />
          <h1 className="text-4xl font-bold tracking-tight">NBA franchises</h1>
        </div>
        <p className="text-[var(--text-muted)] max-w-3xl text-sm sm:text-base">
          All 30 active franchises, sorted by championships across the Basketball Association of America (BAA, 1947-49),
          National Basketball Association (NBA, 1949+), and American Basketball Association (ABA, 1968-76, merged into NBA in 1976).
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

      {/* ── Season hubs ────────────────────────────────────────────────────
          The same two cards the NFL hub carries above its nav: the current
          season highlighted, then the archive. Kept deliberately identical in
          shape and wording so a reader moving between the two sports meets one
          idiom rather than two (Ashwin, 2026-09-17). */}
      {latestSeason ? (
        <Link
          href={`/teams/nba/season/${latestSeason.season}`}
          className="block rounded-xl border-2 p-4 mb-3 transition hover:brightness-110"
          style={{ background: "var(--bg-card-hover)", borderColor: "var(--accent)" }}
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className="text-[10px] uppercase tracking-widest font-semibold px-1.5 py-0.5 rounded-full border"
                  style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
                >
                  {latestSeason.status === "upcoming" ? "Upcoming"
                    : latestSeason.status === "final" ? "Final" : "Live"}
                </span>
                <span className="text-lg font-semibold">
                  The {nbaSeasonLabel(latestSeason.season)} season
                </span>
              </div>
              {/* 🔴 THE HUB POINTS FORWARD. Leading with the season that just
                  finished makes the page read as an archive. The card takes
                  the LAST season in the index, and the builder now emits an
                  "upcoming" shell for the season about to start, so this
                  follows the calendar without a date check living here.
                  (Ashwin, 2026-09-17.) */}
              <p className="text-sm text-[var(--text-muted)] mt-1 max-w-2xl">
                {latestSeason.status === "upcoming"
                  ? "The field, by division, before a game has been played. Ratings, the table and the bracket fill in as the season goes."
                  : latestSeason.status === "final"
                    ? "Every team's rating week by week, and the table as it stood after any week of the year."
                    : "Every team's rating week by week as it happens, with the table rewindable to any week."}
                {latestSeason.top ? (
                  <>{" "}Top rated: {[latestSeason.top.city, latestSeason.top.team].filter(Boolean).join(" ") || latestSeason.top.name}.</>
                ) : null}
              </p>
            </div>
            <span className="text-sm text-[var(--accent)] font-medium whitespace-nowrap">
              Open the season hub &rarr;
            </span>
          </div>
        </Link>
      ) : null}

      {eloSeasons.length ? (
        <Link
          href="/teams/nba/season"
          className="block rounded-xl border p-3 mb-6 transition hover:border-[var(--accent)] hover:bg-[var(--bg-card-hover)]"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sm font-semibold">
              Season archive
              <span className="font-normal text-[var(--text-muted)]">
                {" "}&middot; all {eloSeasons.length} seasons since {nbaSeasonLabel(eloSeasons[0].season)},
                and the {eloDisagreements} years the best team did not win
              </span>
            </span>
            <span className="text-sm text-[var(--accent)] font-medium whitespace-nowrap">
              Browse every season &rarr;
            </span>
          </div>
        </Link>
      ) : null}

      <HubNav
        items={[
          { label: "Playoffs", href: "#bracket" },
          ...(eloSeasons.length
            ? [{ label: `Seasons since ${eloSeasons[0].season}`, href: "/teams/nba/season" }]
            : []),
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
