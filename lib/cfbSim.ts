import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// CFB 2026 prediction data (built by scripts/predictions/build_cfb_sim.py):
//   public/data/cfb-sim.json          - season simulation (conference title
//                                       games, conference titles, the 12-team
//                                       playoff, byes, the national title)
//   public/data/cfb-predictions.json  - weekly AP Top 25 game predictions +
//                                       graded ledger (slates publish after
//                                       each AP poll release)
// Same ISR read pattern as lib/nflSim.ts / lib/plSim.ts.

export type CfbSimRow = {
  espn_id: string;
  name: string;
  slug: string | null; // /teams/cfb/[slug] when the program resolves
  conference: string;
  power4: boolean; // Notre Dame counts as Power 4 (lib/cfb-live convention)
  rating: number;
  exp_wins: number;
  p_ccg: number;
  p_conf: number;
  p_playoff: number;
  p_bye: number;
  p_natty: number;
  ap_rank: number | null;
};

export type CfbSimMeta = {
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
  k_rec: number;
  strength_seasons: number[];
  market: string;
  market_weight: number;
  poll_weight: number;
  poll: { label: string | null; date: string | null };
  conferences: string[];
  teams: number;
  schedule_games: number;
  games_played: number;
  source: string;
  notes: string;
};

export type CfbSimFile = { meta: CfbSimMeta; table: CfbSimRow[] };

export type CfbPredictionEntry = {
  event_id: string;
  date: string;
  home: string;
  away: string;
  home_slug: string | null;
  away_slug: string | null;
  ap: { home: number | null; away: number | null };
  week: string | null;
  neutral?: boolean;
  kickoff?: string;
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

export type CfbPredictionsFile = {
  meta: {
    season: number;
    generated_at: string;
    match_blend_weight: number;
    horizon_days: number;
    scope: string;
    poll: { label: string | null; date: string | null; fresh: boolean };
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
  ledger: CfbPredictionEntry[];
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
    // Same "predictions-daily" tag as lib/nflSim.ts: one workflow flush
    // covers every prediction hub. 6h window stays as the backstop.
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

export async function getCfbSim(): Promise<CfbSimFile | null> {
  return load<CfbSimFile>("cfb-sim.json");
}

export async function getCfbPredictions(): Promise<CfbPredictionsFile | null> {
  return load<CfbPredictionsFile>("cfb-predictions.json");
}
