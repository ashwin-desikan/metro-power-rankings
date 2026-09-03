import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// NFL 2026 prediction data (built by scripts/predictions/build_nfl_sim.py):
//   public/data/nfl-sim.json          - season simulation (division/playoffs/
//                                       conference/Super Bowl LXI)
//   public/data/nfl-sim-history.json  - daily snapshots of the same odds, for
//                                       week-over-week deltas and sparklines
//   public/data/nfl-predictions.json  - weekly game predictions + graded ledger
// Same ISR read pattern as lib/plSim.ts / lib/forecast.ts.

export type NflBand = "solid" | "likely" | "lean" | "tossup" | "unlikely" | "out";

export type NflSimRow = {
  slug: string;
  name: string;
  conf: "AFC" | "NFC";
  division: string;
  rating: number;
  exp_wins: number;
  p_division: number;
  p_playoffs: number;
  p_seed1: number;
  p_conf: number;
  p_sb: number;
  // points-v3, optional: all absent on the JSON currently in the repo.
  wins_p10?: number;
  wins_p90?: number;
  rating_stats?: number;
  rating_market?: number | null;
  sigma_team?: number;
  p_bubble?: number;
  band?: NflBand;
};

export type NflSimTierRow = {
  exp_wins: number;
  p_division: number;
  p_playoffs: number;
  p_conf: number;
  p_sb: number;
};

export type NflSimTiers = {
  lite?: Record<string, NflSimTierRow>;
  classic?: Record<string, NflSimTierRow>;
};

export type NflSimMeta = {
  league: string;
  season: number;
  title_game: string;
  generated_at: string;
  sims: number;
  model: string;
  hfa: number;
  sigma_game: number;
  sigma_season: number;
  regress: number;
  strength_seasons: number[];
  market: string;
  market_weight: number;
  schedule_games: number;
  games_played: number;
  source: string;
  notes: string;
  // points-v3, optional
  seed?: number;
  sigma_season_eff?: number;
  corr?: { hfa_sd: number; div_sd: number; team_sd: number };
  tiers?: ("lite" | "classic")[];
  market_ratings?: "futures" | "futures+spreads" | "none";
};

export type NflSimFile = { meta: NflSimMeta; table: NflSimRow[]; tiers?: NflSimTiers };

export type NflPredictionEntry = {
  event_id: string;
  date: string;
  home: string;
  away: string;
  home_slug: string;
  away_slug: string;
  model: { pH: number };
  market?: { pH: number; spread?: number | null };
  blend?: { pH: number };
  pick: "H" | "A";
  predicted_at: string;
  result?: "H" | "A" | "T";
  score?: string;
  graded_at?: string;
  model_brier?: number;
  market_brier?: number;
  blend_brier?: number;
  pick_correct?: boolean;
  // points-v3, optional
  lite?: { pH: number };
  neutral?: true;
  lite_brier?: number;
  leverage?: { home: number; away: number; game: number };
};

export type NflPredictionsFile = {
  meta: {
    season: number;
    generated_at: string;
    match_blend_weight: number;
    horizon_days: number;
    odds_source: string;
    results_source: string;
    // points-v3, optional
    tiers?: ("lite" | "classic" | "market" | "blend")[];
  };
  record: {
    graded: number;
    pick_correct: number;
    model_brier: number | null;
    blend_brier: number | null;
    market_graded: number;
    market_brier: number | null;
    // points-v3, optional
    lite_brier?: number | null;
  };
  ledger: NflPredictionEntry[];
};

export type NflSimHistorySnapshotRow = {
  xw: number;
  div: number;
  po: number;
  conf: number;
  title: number;
};

export type NflSimHistorySnapshot = {
  date: string;
  games_played: number;
  rows: Record<string, NflSimHistorySnapshotRow>;
};

export type SimHistoryFile = {
  meta: { league: string; season: number; generated_at: string; keep: number };
  snapshots: NflSimHistorySnapshot[];
};

// Exported so the "Get the data" link on the NFL hub can point at the raw
// JSON without duplicating the path.
export const NFL_DATA_GH_BASE =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data";
const GH_BASE = NFL_DATA_GH_BASE;

async function load<T extends { meta: { generated_at: string } }>(
  file: string,
): Promise<T | null> {
  let local: T | null = null;
  try {
    local = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", file), "utf-8"),
    ) as T;
  } catch {
    /* no build-time copy */
  }
  try {
    // Same "predictions-daily" tag as lib/plSim.ts: one workflow writes both
    // models, so one flush covers both hubs. 6h window stays as the backstop.
    const res = await fetch(`${GH_BASE}/${file}`, {
      next: { revalidate: 21600, tags: ["predictions-daily"] }, // 6h backstop
    });
    if (res.ok) {
      const remote = (await res.json()) as T;
      if (
        remote?.meta?.generated_at &&
        (!local || remote.meta.generated_at >= local.meta.generated_at)
      )
        return remote;
    }
  } catch {
    /* offline: local only */
  }
  return local;
}

export async function getNflSim(): Promise<NflSimFile | null> {
  return load<NflSimFile>("nfl-sim.json");
}

export async function getNflPredictions(): Promise<NflPredictionsFile | null> {
  return load<NflPredictionsFile>("nfl-predictions.json");
}

export async function getNflSimHistory(): Promise<SimHistoryFile | null> {
  return load<SimHistoryFile>("nfl-sim-history.json");
}
