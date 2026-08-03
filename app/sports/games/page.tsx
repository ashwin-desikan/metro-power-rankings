import type { Metadata } from "next";
import Link from "next/link";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import HubNav from "@/app/teams/HubNav";

import {
  getTopGamesAllTime as nflTopAll,
  getTopGamesByDecade as nflTopDec,
  withTeamSlugs as nflWithSlugs,
  withStadiumLocations as nflWithStadium,
} from "@/lib/nfl";
import {
  getTopGamesAllTime as nbaTopAll,
  getTopGamesByDecade as nbaTopDec,
  getFranchiseByCanonical as nbaByCanonical,
} from "@/lib/nba";
import {
  getTopGamesAllTime as mlbTopAll,
  getTopGamesByDecade as mlbTopDec,
  getAllFranchises as mlbAllFranchises,
} from "@/lib/mlb";
import { getCupPresentationGames } from "@/lib/nhl";

import NflTopGames from "@/app/teams/nfl/TopGamesTable";
import NbaTopGames from "@/app/teams/nba/TopGamesTable";
import MlbTopGames from "@/app/teams/mlb/TopGamesTable";
import NhlCupGames from "@/app/teams/nhl/CupPresentationTable";
import FeaturedGames from "./FeaturedGames";
import { FEATURED, clipForRow, type FeaturedGame } from "./featured";
import type { GameVideo } from "@/app/teams/_shared/GameVideo";
import { getCfbTopGames, getCfbGamesByDecade, getAllCfbSlugs } from "@/lib/cfb";
import CfbGames from "@/app/teams/cfb/CfbGames";
import { getCbbTopGames, getCbbGamesByDecade, getAllCbbSlugs } from "@/lib/cbb";
import CbbGames from "@/app/teams/cbb/CbbGames";
import { getCricketGames } from "@/lib/cricketGames";
import CricketGreatestGames from "@/app/teams/cricket/CricketGreatestGames";
import { getRugbyGames } from "@/lib/rugbyGames";
import RugbyGreatestGames from "@/app/teams/rugby-union/RugbyGreatestGames";
import {
  getTopGamesAllTime as intlTopAll,
  getTopGamesByDecade as intlTopDec,
} from "@/lib/international";
import NationalTopGames from "@/app/teams/national/TopGamesTable";

export const dynamicParams = false;

const PAGE_PATH = "/sports/games";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "The Greatest Games";
const PAGE_DESCRIPTION =
  "The top games in NFL, NBA and MLB history ranked by Game Score, plus every Stanley Cup presentation game, on one cross-sport board. Filter by decade, then click through to the franchise that played in each one.";

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
  twitter: { card: "summary_large_image", title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION },
};

// --- Per-league slug enrichment, mirroring each league hub exactly so the
// embedded tables behave identically here. NBA and MLB resolve slugs from a
// franchise index; NFL uses its own lib helpers; NHL ships pre-enriched.

function enrichNba<T extends { winner_canonical: string; loser_canonical: string }>(rows: T[]): T[] {
  return rows.map((g) => ({
    ...g,
    winner_slug: nbaByCanonical(g.winner_canonical)?.slug ?? null,
    loser_slug: nbaByCanonical(g.loser_canonical)?.slug ?? null,
  }));
}

function enrichMlb<T extends { winner_canonical: string; loser_canonical: string }>(
  rows: T[],
  slugByCanonical: Map<string, string>,
): (T & { winner_slug: string | null; loser_slug: string | null })[] {
  return rows.map((r) => ({
    ...r,
    winner_slug: slugByCanonical.get(r.winner_canonical) ?? null,
    loser_slug: slugByCanonical.get(r.loser_canonical) ?? null,
  }));
}

type LeagueSection = {
  id: string;
  label: string;
  blurb: string;
  hubHref: string;
  hubLabel: string;
};

const SECTIONS: LeagueSection[] = [
  { id: "nfl", label: "NFL", blurb: "Playoffs and Super Bowls, ranked by Game Score.", hubHref: "/teams/nfl#top-games", hubLabel: "Full NFL hub" },
  { id: "nba", label: "NBA", blurb: "Postseason classics, ranked by Game Score with overtime flagged.", hubHref: "/teams/nba#top-games", hubLabel: "Full NBA hub" },
  { id: "mlb", label: "MLB", blurb: "World Series and postseason games, ranked by Game Score.", hubHref: "/teams/mlb#top-games", hubLabel: "Full MLB hub" },
  { id: "nhl", label: "NHL", blurb: "Every game at which the Stanley Cup was awarded, 1893 to today.", hubHref: "/teams/nhl", hubLabel: "Full NHL hub" },
];

function SectionHeader({ s }: { s: LeagueSection }) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-2">
      <h2 className="text-xl font-bold tracking-tight">
        {s.label}
        <span className="ml-2 text-sm font-normal text-[var(--text-muted)]">{s.blurb}</span>
      </h2>
      <Link
        href={s.hubHref}
        className="text-xs font-semibold text-[var(--accent)] hover:underline whitespace-nowrap"
      >
        {s.hubLabel} &rarr;
      </Link>
    </div>
  );
}

function rankMapOf(rows: { date?: string | null; winner_canonical?: string }[]): Map<string, number> {
  const m = new Map<string, number>();
  rows.forEach((r, i) => {
    if (r.date) m.set(`${r.date}|${r.winner_canonical}`, i + 1);
  });
  return m;
}

function rankedCards(league: string, m: Map<string, number>): FeaturedGame[] {
  return FEATURED.filter((g) => g.leagueTag === league && !g.rowOnly)
    .map((g) => ({
      ...g,
      rank: g.match ? m.get(`${g.match.date}|${g.match.winnerCanonical}`) : undefined,
    }))
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
}

function FeaturedClips({ games }: { games: FeaturedGame[] }) {
  if (games.length === 0) return null;
  return (
    <div className="mb-5">
      <div className="text-xs uppercase tracking-widest text-[var(--text-dim)] mb-2">Featured games</div>
      <FeaturedGames games={games} />
    </div>
  );
}

function attachVideos<T extends { date?: string | null; winner_canonical?: string }>(
  league: string,
  rows: T[],
): (T & { video?: GameVideo })[] {
  return rows.map((r) => {
    const v = clipForRow(league, r);
    return (v ? { ...r, video: v } : r) as T & { video?: GameVideo };
  });
}

export default function GamesHubPage() {
  // NFL
  const nflAllTime = attachVideos("NFL", nflWithSlugs(nflWithStadium(nflTopAll())));
  const nflByDecade = Object.fromEntries(
    Object.entries(nflTopDec()).map(([k, v]) => [k, attachVideos("NFL", nflWithSlugs(nflWithStadium(v)))]),
  );

  // NBA
  const nbaAllTime = attachVideos("NBA", enrichNba(nbaTopAll()));
  const nbaByDecade = Object.fromEntries(
    Object.entries(nbaTopDec()).map(([k, v]) => [k, attachVideos("NBA", enrichNba(v))]),
  );

  // MLB
  const mlbSlugByCanonical = new Map(mlbAllFranchises().map((f) => [f.canonical, f.slug]));
  const mlbAllTime = attachVideos("MLB", enrichMlb(mlbTopAll(), mlbSlugByCanonical));
  const mlbByDecade = Object.fromEntries(
    Object.entries(mlbTopDec()).map(([k, v]) => [k, attachVideos("MLB", enrichMlb(v, mlbSlugByCanonical))]),
  );

  // NHL
  const nhlCup = getCupPresentationGames();

  const nflCards = rankedCards("NFL", rankMapOf(nflAllTime));
  const nbaCards = rankedCards("NBA", rankMapOf(nbaAllTime));
  const mlbCards = rankedCards("MLB", rankMapOf(mlbAllTime));
  const nhlCards = FEATURED.filter((g) => g.leagueTag === "NHL");
  const cfbTop = getCfbTopGames();
  const cfbByDecade = getCfbGamesByDecade();
  const cfbSlugs = getAllCfbSlugs();
  const cfbCards = FEATURED.filter((g) => g.leagueTag === "CFB").sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
  const cbbTop = getCbbTopGames();
  const cbbByDecade = getCbbGamesByDecade();
  const cricketGames = getCricketGames();
  const rugbyGames = getRugbyGames();
  const cricketFeatured: FeaturedGame[] = [
    { videoId: "pQ5xEiZ-5IE", title: "2019 World Cup Final", leagueTag: "ODI", matchup: "New Zealand tie England", note: "Tied, then the super over tied; decided on boundary count.", clipLabel: "Highlights", rank: 1 },
    { videoId: "QiNvL3FfrT8", title: "2005 Ashes, Edgbaston", leagueTag: "TEST", matchup: "England beat Australia by 2 runs", note: "The closest Ashes Test of all time.", clipLabel: "Highlights", rank: 2 },
    { videoId: "vG4ydr_iEwo", title: "2007 T20 World Cup Final", leagueTag: "T20I", matchup: "India beat Pakistan by 5 runs", note: "India's first ICC title in 24 years; lit the T20 fuse.", clipLabel: "Highlights", rank: 3 },
  ];
  const rugbyFeatured: FeaturedGame[] = [
    { videoId: "ETlUWCT2nxo", title: "2023 World Cup Final", leagueTag: "RWC", matchup: "South Africa beat New Zealand 12-11", note: "A record fourth title, won by a single point, with New Zealand a man down after a red card.", clipLabel: "Highlights", rank: 1 },
    { videoId: "ceD7U4JP5Fo", title: "1995 World Cup Final", leagueTag: "RWC", matchup: "South Africa beat New Zealand 15-12 (a.e.t.)", note: "Mandela in the number six jersey; Stransky's drop goal settled extra time.", clipLabel: "Highlights", rank: 2 },
    { videoId: "iLncU_JxyQk", title: "2011 World Cup Final", leagueTag: "RWC", matchup: "New Zealand beat France 8-7", note: "The hosts edged France by a point to end a 24-year wait at home.", clipLabel: "Highlights", rank: 3 },
  ];
  const cbbSlugs = getAllCbbSlugs();
  const cbbCards = FEATURED.filter((g) => g.leagueTag === "CBB").sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
  const intlAllTime = attachVideos("INTFB", intlTopAll().map((r) => ({ ...r, winner_canonical: r.winner_name })));
  const intlByDecade = Object.fromEntries(
    Object.entries(intlTopDec()).map(([k, v]) => [k, attachVideos("INTFB", v.map((r) => ({ ...r, winner_canonical: r.winner_name })))]),
  );
  const intlCards = rankedCards("INTFB", rankMapOf(intlAllTime));

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Hub header */}
      <header className="mb-6">
        <div className="text-xs uppercase tracking-widest text-[var(--text-dim)] mb-2">Sports Deep-Dive</div>
        <h1 className="text-4xl font-bold tracking-tight mb-2">The Greatest Games</h1>
        <p className="text-[var(--text-muted)] max-w-3xl text-sm sm:text-base">
          The best games each sport has produced, gathered in one place. NFL, NBA and MLB games are ranked by
          Game Score, a composite of stakes, quality, competitiveness and matchup strength weighted by round
          and team rating. Hockey joins through every game at which the Stanley Cup was physically awarded.
        </p>
      </header>

      {/* View-mode control: by-sport is live; a unified cross-sport ranking is
          the roadmap, shown as a disabled stub rather than a faked leaderboard. */}
      <div className="mb-2">
        <div
          className="inline-flex rounded-lg border overflow-hidden"
          style={{ borderColor: "var(--border)" }}
          role="group"
          aria-label="View mode"
        >
          <span className="px-3 py-1.5 text-xs font-semibold" style={{ background: "var(--accent-dim)", color: "var(--text)" }}>
            By sport
          </span>
          <span
            className="px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5 cursor-not-allowed border-l"
            style={{ color: "var(--text-dim)", borderColor: "var(--border)" }}
            title="A single cross-sport leaderboard needs a normalization method that puts every sport's Game Score on one scale, and a proxy score for hockey. In progress."
            aria-disabled="true"
          >
            Unified ranking
            <span
              className="text-[9px] uppercase tracking-widest rounded px-1 py-0.5"
              style={{ background: "var(--bg-card-hover)", color: "var(--text-dim)" }}
            >
              Soon
            </span>
          </span>
        </div>
      </div>

      <HubNav
        items={[
          { label: "How it works", href: "#how" },
          { label: "International Football", href: "#intfb" },
          { label: "NFL", href: "#nfl" },
          { label: "NBA", href: "#nba" },
          { label: "MLB", href: "#mlb" },
          { label: "NHL", href: "#nhl" },
          { label: "College Football", href: "#cfb" },
          { label: "College Basketball", href: "#cbb" },
          { label: "Cricket", href: "#cricket" },
          { label: "Rugby Union", href: "#rugby-union" },
          { label: "What's next", href: "#whats-next" },
        ]}
      />

      {/* How it works */}
      <section id="how" className="mb-10">
        <h2 className="text-lg font-semibold mb-2">How Game Score works</h2>
        <p className="text-sm text-[var(--text-muted)] max-w-3xl">
          Within each league, every postseason game earns a Game Score that blends how much was at stake
          (round and seeding), how good the two teams were (rating), and how close and consequential the game
          itself turned out to be. The result is a single number that lets a first-round upset and a Game 7
          classic sit on the same ladder. The catch is that those numbers are calibrated per sport, so a 3.6 in
          baseball is not the same currency as a 3.6 in basketball. Hockey is a different case again: the data
          here is the roll of Stanley Cup presentation games rather than a scored ranking. A unified, normalized
          board that ranks across all four is the next build, not a claim this page makes yet.{" "}
          <Link href="/methodology" className="underline decoration-dotted hover:text-[var(--text)]">
            Methodology
          </Link>
          .
        </p>
      </section>

      {/* International Football */}
      <section id="intfb" className="mb-12 scroll-mt-24">
        <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
          <div>
            <h2 className="text-xl font-bold tracking-tight">International Football</h2>
            <p className="text-sm text-[var(--text-muted)] max-w-3xl">The greatest men&apos;s international tournament matches, ranked by Game Score, with the competition, stage and venue of each. Filter to a decade.</p>
          </div>
          <a href="/teams/national#top-games" className="text-xs text-[var(--accent)] hover:underline whitespace-nowrap">Full International hub &rarr;</a>
        </div>
        <FeaturedClips games={intlCards} />
        <NationalTopGames allTime={intlAllTime} byDecade={intlByDecade} />
      </section>

      {/* NFL */}
      <section id="nfl" className="mb-12 scroll-mt-24">
        <SectionHeader s={SECTIONS[0]} />
        <FeaturedClips games={nflCards} />
        <NflTopGames allTime={nflAllTime} byDecade={nflByDecade} />
      </section>

      {/* NBA */}
      <section id="nba" className="mb-12 scroll-mt-24">
        <SectionHeader s={SECTIONS[1]} />
        <FeaturedClips games={nbaCards} />
        <NbaTopGames allTime={nbaAllTime} byDecade={nbaByDecade} />
      </section>

      {/* MLB */}
      <section id="mlb" className="mb-12 scroll-mt-24">
        <SectionHeader s={SECTIONS[2]} />
        <FeaturedClips games={mlbCards} />
        <MlbTopGames allTime={mlbAllTime} byDecade={mlbByDecade} />
      </section>

      {/* NHL */}
      <section id="nhl" className="mb-12 scroll-mt-24">
        <SectionHeader s={SECTIONS[3]} />
        <FeaturedClips games={nhlCards} />
        <NhlCupGames allTime={nhlCup.allTime} byDecade={nhlCup.byDecade} />
      </section>

      {/* College Football */}
      <section id="cfb" className="mb-12 scroll-mt-24">
        <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
          <div>
            <h2 className="text-xl font-bold tracking-tight">College Football</h2>
            <p className="text-sm text-[var(--text-muted)] max-w-3xl">The greatest games in college football history, ranked by Game Score, with the bowl, stage and rivalry of each. Filter to a decade.</p>
          </div>
          <a href="/teams/cfb#games" className="text-xs text-[var(--accent)] hover:underline whitespace-nowrap">Full College Football hub &rarr;</a>
        </div>
        <FeaturedClips games={cfbCards} />
        <CfbGames topOverall={cfbTop} byDecade={cfbByDecade} linkSlugs={cfbSlugs} />
      </section>

      {/* Men's College Basketball */}
      <section id="cbb" className="mb-12 scroll-mt-24">
        <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Men&apos;s College Basketball</h2>
            <p className="text-sm text-[var(--text-muted)] max-w-3xl">The greatest games in NCAA tournament history, ranked by Game Score, with the round, venue and result of each. Filter to a decade.</p>
          </div>
          <a href="/teams/cbb#games" className="text-xs text-[var(--accent)] hover:underline whitespace-nowrap">Full College Basketball hub &rarr;</a>
        </div>
        <FeaturedClips games={cbbCards} />
        <CbbGames topOverall={cbbTop} byDecade={cbbByDecade} linkSlugs={cbbSlugs} />
      </section>

      {/* Cricket */}
      <section id="cricket" className="mb-12 scroll-mt-24">
        <div className="flex items-baseline justify-between gap-3 mb-1 flex-wrap">
          <h2 className="text-xl font-bold tracking-tight">Cricket</h2>
          <Link href="/teams/cricket#greatest-games" className="text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)" }}>Full cricket hub &rarr;</Link>
        </div>
        <p className="text-sm text-[var(--text-muted)] max-w-3xl mb-4">
          Tests, ODIs and T20Is ranked by a Game Score of closeness, stakes and both sides&apos; strength
          from the recomputed rankings, on one scale under All formats. A &#9733; marks the curated
          all-time classics.
        </p>
        <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] font-semibold mb-2">Featured games</p>
        <FeaturedGames games={cricketFeatured} />
        <div className="mt-6">
          <CricketGreatestGames test={cricketGames.Test} odi={cricketGames.ODI} t20i={cricketGames.T20I} combined={cricketGames.combined} decades={cricketGames.by_decade} limit={12} />
        </div>
      </section>

      {/* Rugby Union */}
      <section id="rugby-union" className="mb-12 scroll-mt-24">
        <div className="flex items-baseline justify-between gap-3 mb-1 flex-wrap">
          <h2 className="text-xl font-bold tracking-tight">Rugby Union</h2>
          <Link href="/teams/rugby-union#greatest-games" className="text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)" }}>Full rugby hub &rarr;</Link>
        </div>
        <p className="text-sm text-[var(--text-muted)] max-w-3xl mb-4">
          Every men&apos;s international since 1871 ranked by a Game Score of closeness, stakes and both
          sides&apos; strength on the day, with team strength from a continuous Elo rating running the whole
          history so eras before the modern rankings are scored on the same scale. A &#9733; marks the
          curated all-time classics.
        </p>
        <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] font-semibold mb-2">Featured games</p>
        <FeaturedGames games={rugbyFeatured} />
        <div className="mt-6">
          <RugbyGreatestGames top={rugbyGames.top} decades={rugbyGames.by_decade} limit={12} />
        </div>
      </section>

      {/* What's next */}
      <section id="whats-next" className="mb-6 scroll-mt-24">
        <h2 className="text-lg font-semibold mb-2">What&apos;s next</h2>
        <p className="text-sm text-[var(--text-muted)] max-w-3xl mb-3">
          This is the v0. The board is meant to grow along two axes:
        </p>
        <ul className="text-sm text-[var(--text-muted)] max-w-3xl space-y-2 list-disc pl-5">
          <li>
            <span className="text-[var(--text)] font-medium">A unified, searchable ranking.</span> One normalized
            Game Score scale across sports, with search and filters, so the single greatest games of all-time can
            be ranked head to head rather than league by league.
          </li>
          <li>
            <span className="text-[var(--text)] font-medium">More sports.</span> Club Football and International
            Football are next; the game data is already in hand
            and slots into the same model.
          </li>
        </ul>
      </section>

      <p className="text-xs text-[var(--text-dim)] mt-8">
        Game Score and game data are maintained per league in the MetroAreas workbook and emitted to each sport&apos;s
        data files at build time. Hockey shows Stanley Cup presentation games rather than a scored ranking.
      </p>
    </main>
  );
}
