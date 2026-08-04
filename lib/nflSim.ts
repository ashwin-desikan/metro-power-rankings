import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// NFL 2026 prediction data (built by scripts/predictions/build_nfl_sim.py):
//   public/data/nfl-sim.json          - season simulation (division/playoffs/
//                                       conference/Super Bowl LXI)
//   public/data/nfl-predictions.json  - weekly game predictions + graded ledger
// Same ISR read pattern as lib/plSim.ts / lib/forecast.ts.

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
};

export type NflSimFile = { meta: NflSimMeta; table: NflSimRow[] };

export type NflPredictionEntry = {
  event_id: string;
  date: string;
  home: string;
  away: string;
  home_slug: string;
  away_slug: string;
  model: { pH: number };
  market?: { pH: number };
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
};

export type NflPredictionsFile = {
  meta: {
    season: number;
    generated_at: string;
    match_blend_weight: number;
    horizon_days: number;
    odds_source: string;
    results_source: string;
  };
  record: {
    graded: number;
    pick_correct: number;
    model_brier: number | null;
    blend_brier: number | null;
    market_graded: number;
    market_brier: number | null;
  };
  ledger: NflPredictionEntry[];
};

const GH_BASE =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data";

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
