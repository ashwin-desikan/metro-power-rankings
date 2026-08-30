import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// The English top-flight expectation ledger, built by
// scripts/football/build_expectation.py from AllFootball.xlsx plus
// football-data.co.uk. Every tier-1 match from 1888-89 scored against a
// pre-game probability.
//
// Field names deliberately mirror lib/nflExpectation.ts so the two sports
// speak one vocabulary on any page that shows both — and mirror
// lib/plSim.ts's pH/pD/pA so the live season and the century agree.
//
// 🔴 ISR READ, NOT A MODULE-LOAD readFileSync OF EVERYTHING. index.json is
// 50 KB and serves every board; clubs.json is 375 KB and is fetched only by
// the club page that needs one club out of it. Reading clubs.json at module
// load would make it build-relevant, which is the trap
// public/data/f1/constructors.json already fell into.

export type PlExpectationMeta = {
  generated_at: string;
  model: string;
  source: string;
  /** ["1888-89", "2025-26"] */
  seasons: [string, string];
  season_count: number;
  matches: number;
  clubs: number;
  params: Record<string, number>;
  log_loss: number;
  brier: number;
  /** The same trailing window with no ratings at all: the honest baseline. */
  baseline_log_loss: number;
  skill_vs_era_baseline: number;
  market_matches: number;
  /**
   * Of market_matches, how many carry a TRUE closing price (football-data's
   * C-suffixed columns, 2012-13 on). The rest are pre-match prices, which is
   * all that exists for them. Optional: a ledger built before 2026-08-30 has
   * neither field, and the pages must degrade rather than claim closing.
   */
  market_closing_matches?: number;
  market_opening_matches?: number;
  market_seasons: string[];
  market_closing_seasons?: string[];
  /** Metros with no published page. Rendered unlinked, never guessed. */
  metro_unresolved: string[];
  /** Workbook metro name -> the site's own name for it. */
  metro_site_vocabulary: Record<string, string[]>;
  reconciliation: {
    seasons: number;
    club_seasons: number;
    unmatched_names: number;
    mismatched_cells: number;
    seasons_implicated: string[];
    known_bad_fixtures: number;
  };
  notes: string;
};

export type PlSeasonRow = {
  season: string;
  matches: number;
  home_win_pct: number;
  draw_pct: number;
  away_win_pct: number;
  /** Fitted home advantage in Elo points, from the five seasons BEFORE this one. */
  hfa: number;
  nu: number;
  model_brier: number;
  market_matches: number;
  /** The model's Brier over just the matches the market also priced. */
  market_model_brier: number | null;
  market_brier: number | null;
  /** "closing" | "opening" | "mixed", or null when the season had no price. */
  market_tier?: string | null;
  market_closing_matches?: number;
};

export type PlClubSeason = {
  season: string;
  /** The ERA name: what the club was called that season (Newton Heath). */
  club: string;
  gp: number;
  w: number;
  d: number;
  l: number;
  /** 2 before 1981-82, 3 after. Points are not comparable across that line. */
  win_pts: number;
  pts: number;
  xpts: number;
  diff: number;
  /** Era-neutral: match points (win 1, draw 0.5) earned minus expected. */
  surplus: number;
  /** Points docked that season, when any were. */
  deduction?: number;
};

export type PlClubEntry = {
  slug: string | null;
  /** Every name the club has played under, oldest first. */
  names: string[];
  metro: string | null;
  metro_slug: string | null;
  seasons: PlClubSeason[];
  total_surplus: number;
  club_matches: number;
  best: PlClubSeason;
  worst: PlClubSeason;
};

export type PlUpsetRow = {
  p_winner: number;
  season: string;
  date: string;
  home: string;
  away: string;
  score: string;
  winner: string;
  winner_slug: string | null;
  loser: string;
  loser_slug: string | null;
  at_home: boolean;
  metro: string | null;
  metro_slug: string | null;
};

export type PlMetroRow = {
  metro: string;
  metro_slug: string | null;
  /** Match points earned minus expected, summed over every club-season. */
  surplus: number;
  club_matches: number;
  seasons: number;
  clubs: number;
};

export type PlExpectationIndex = {
  meta: PlExpectationMeta;
  seasons: PlSeasonRow[];
  upsets: PlUpsetRow[];
  best_seasons: (PlClubSeason & { slug: string | null; metro: string | null; metro_slug: string | null })[];
  worst_seasons: (PlClubSeason & { slug: string | null; metro: string | null; metro_slug: string | null })[];
  metros: PlMetroRow[];
  calibration: { bin: string; n: number; predicted: number; actual: number }[];
};

export type PlClubsFile = { meta: { generated_at: string }; clubs: Record<string, PlClubEntry> };

const GH_BASE =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data";

async function load<T>(file: string, isNewer: (remote: T, local: T | null) => boolean): Promise<T | null> {
  let local: T | null = null;
  try {
    local = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", file), "utf-8"),
    ) as T;
  } catch {
    /* no build-time copy */
  }
  try {
    const res = await fetch(`${GH_BASE}/${file}`, {
      next: { revalidate: 86400, tags: ["pl-expectation"] },
    });
    if (res.ok) {
      const remote = (await res.json()) as T;
      if (isNewer(remote, local)) return remote;
    }
  } catch {
    /* offline: local only */
  }
  return local;
}

export async function getPlExpectation(): Promise<PlExpectationIndex | null> {
  return load<PlExpectationIndex>("football/expectation/index.json", (remote, local) =>
    Boolean(
      remote?.meta?.generated_at &&
        (!local || remote.meta.generated_at >= local.meta.generated_at),
    ),
  );
}

// 610 club pages are pre-generated, and each wants one club out of the same
// 375 KB file. Hold the in-flight promise so it is read and parsed once per
// server process instead of 610 times. Lazy, so it stays off the build graph.
let _clubsPromise: Promise<PlClubsFile | null> | null = null;

/** The whole per-club file (375 KB). Fetched on demand, never eagerly. */
export async function getPlExpectationClubs(): Promise<PlClubsFile | null> {
  if (!_clubsPromise) {
    _clubsPromise = load<PlClubsFile>("football/expectation/clubs.json", (remote) =>
      Boolean(remote?.clubs && Object.keys(remote.clubs).length > 0),
    ).catch(() => null);
  }
  return _clubsPromise;
}

/** One club's series, or null when the club has never played tier-1 English
 *  football (the great majority of the 1,460 club pages). */
export async function getPlExpectationClub(slug: string): Promise<PlClubEntry | null> {
  if (!slug) return null;
  const f = await getPlExpectationClubs();
  return f?.clubs?.[slug] ?? null;
}
