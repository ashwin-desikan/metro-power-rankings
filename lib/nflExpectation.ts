import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// The NFL expectation ledger, built by scripts/nfl/build_expectation.py from
// NFL_all.xlsx. The workbook carries a pre-game win probability on all 106
// seasons, so this is every NFL game since 1920 scored against what was
// expected of it.
//
// Field names deliberately mirror lib/nflSim.ts's NflPredictionEntry
// (model.pH, market.pH, result, model_brier, market_brier), so the live week
// and the historical century speak the same vocabulary.
//
// 🔴 ISR READ, NOT A MODULE-LOAD readFileSync OF EVERYTHING. The ledger is
// ~11 MB across 108 files. Only index.json (64 KB) is ever read for the board;
// a season file is fetched on demand. Reading it all at module load would make
// the whole thing build-relevant, which is the trap public/data/f1/
// constructors.json already fell into. Same load() shape as lib/nflSim.ts.

export type ExpectationMeta = {
  generated_at: string;
  source: string;
  seasons: [number, number];
  games: number;
  games_scored: number;
  excluded_probability: number;
  unpaired_game_ids: number;
  market_seasons: number[];
  market_sigma: number;
  market_sigma_fit_rows: number;
  /** Sign genuinely reversed in the source: favourite wins under half the time. */
  market_excluded: { season: number; favourite_win_rate: number; graded: number }[];
  /** Points the right way, sample too thin to confirm. NOT a sign problem. */
  market_unconfirmed: { season: number; favourite_win_rate: number; graded: number }[];
  market_too_sparse: { season: number; graded: number }[];
  head_to_head: {
    games: number;
    model_brier: number | null;
    market_brier: number | null;
    seasons_model_better: number;
    seasons_compared: number;
  };
  tie_scores: number;
  notes: string;
};

export type SeasonSummary = {
  season: number;
  games: number;
  model_brier: number | null;
  market_brier: number | null;
  market_games: number;
};

export type UpsetRow = {
  season: number;
  date: string | null;
  game_id: string;
  winner: string;
  winner_slug: string | null;
  loser: string;
  loser_slug: string | null;
  p_winner: number;
  score: string | null;
  metro: string | null;
  venue: string | null;
  playoff: boolean;
  round?: string | null;
};

export type TeamSeasonRow = {
  season: number;
  key: string;
  /** The ERA name: what the club was called that season (1994 Houston Oilers). */
  team: string;
  /** The franchise that owns the record today (Tennessee Titans). */
  franchise: string;
  slug: string | null;
  /** The ERA metro: where the club actually played that season, not today. */
  metro: string | null;
  metro_slug: string | null;
  games: number;
  wins: number;
  exp_wins: number | null;
  wae: number | null;
  playoff_games: number;
  playoff_wins: number;
};

export type MetroRow = {
  metro: string;
  metro_slug: string | null;
  games: number;
  wins: number;
  exp_wins: number;
  wae: number;
  seasons: number;
};

export type ExpectationIndex = {
  meta: ExpectationMeta;
  seasons: SeasonSummary[];
  upsets: UpsetRow[];
  best_seasons: TeamSeasonRow[];
  worst_seasons: TeamSeasonRow[];
  metros: MetroRow[];
};

export type GameRow = {
  game_id: string;
  season: number;
  week: number | string | null;
  date: string | null;
  playoff: boolean;
  round?: string;
  home: string;
  away: string;
  home_slug: string | null;
  away_slug: string | null;
  home_era: string;
  away_era: string;
  venue: string | null;
  metro: string | null;
  neutral: boolean;
  result?: "H" | "A" | "T";
  score?: string;
  model?: { pH: number };
  model_brier?: number;
  surprise?: number;
  market?: { spread: number; pH: number };
  market_brier?: number;
  elo_shift?: number;
  qb?: { home: string | null; away: string | null };
};

export type SeasonFile = { season: number; games: GameRow[] };

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
      next: { revalidate: 86400, tags: ["nfl-expectation"] },
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

export async function getNflExpectation(): Promise<ExpectationIndex | null> {
  return load<ExpectationIndex>("nfl/expectation/index.json", (remote, local) =>
    Boolean(
      remote?.meta?.generated_at &&
        (!local || remote.meta.generated_at >= local.meta.generated_at),
    ),
  );
}

/** One season's game-level ledger. Fetched on demand, never eagerly. */
export async function getNflExpectationSeason(season: number): Promise<SeasonFile | null> {
  if (!Number.isInteger(season)) return null;
  return load<SeasonFile>(`nfl/expectation/season-${season}.json`, (remote) =>
    Boolean(remote?.games?.length),
  );
}
