import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// Premier League 2026-27 prediction data (built by
// scripts/predictions/build_pl_sim.py, poisson-v2/v3):
//   public/data/pl-sim.json          - season simulation (title/top5/top7/releg)
//   public/data/pl-sim-history.json  - daily snapshots of the same odds, for
//                                      week-over-week deltas and sparklines
//   public/data/pl-predictions.json  - fixture predictions + graded ledger
// Same read pattern as lib/forecast.ts: GitHub raw via ISR (remote wins on a
// newer generated_at) with the build-time file as fallback, so data-only
// re-runs appear without a Vercel build.

export type PlBand = "solid" | "likely" | "lean" | "tossup" | "unlikely" | "out";

export type PlSimRow = {
  slug: string;
  name: string;
  exp_pts: number;
  p_title: number;
  p_top5: number;
  p_top7: number;
  p_releg: number;
  pos: { p5: number; p25: number; p50: number; p75: number; p95: number };
  // points-v3, optional
  rating_stats?: number;
  sigma_team?: number;
  p_top4?: number;
  pts_p10?: number;
  pts_p90?: number;
  band?: PlBand;
};

export type PlSimMeta = {
  league: string;
  season: string;
  generated_at: string;
  sims: number;
  model: string;
  mu: number;
  home_adv: number;
  sigma: number;
  market: string;
  blend_market_weight: number;
  odds_source: string;
  promoted_calibration: { att: number; def: number; n: number };
  strength_seasons: string[];
  matches_played: number;
  notes: string;
  // points-v3, optional
  seed?: number;
  sigma_season_eff?: number;
  corr?: { home_adv_sd: number; team_sd: number };
};

export type PlSimFile = { meta: PlSimMeta; table: PlSimRow[] };

export type PlOutcomeProbs = { pH: number; pD: number; pA: number };

export type PlPredictionEntry = {
  date: string;
  home: string;
  away: string;
  home_slug: string;
  away_slug: string;
  model: PlOutcomeProbs;
  market?: PlOutcomeProbs;
  blend?: PlOutcomeProbs;
  pick: "H" | "D" | "A";
  predicted_at: string;
  result?: "H" | "D" | "A";
  graded_at?: string;
  model_brier?: number;
  market_brier?: number;
  blend_brier?: number;
  pick_correct?: boolean;
};

export type PlPredictionsFile = {
  meta: {
    season: string;
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
  ledger: PlPredictionEntry[];
};

export type PlSimHistorySnapshotRow = {
  xpts: number;
  title: number;
  top4: number;
  rel: number;
};

export type PlSimHistorySnapshot = {
  date: string;
  games_played: number;
  rows: Record<string, PlSimHistorySnapshotRow>;
};

export type PlSimHistoryFile = {
  meta: { league: string; season: string; generated_at: string; keep: number };
  snapshots: PlSimHistorySnapshot[];
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
    // Tagged so predictions-refresh.yml can flush this the moment it pushes a
    // new model, instead of the hubs showing yesterday's numbers until the 6h
    // window rolls (Friday's 11:40 UTC push would otherwise sit stale until
    // ~17:40). The time-based window stays as the backstop: if the ping is
    // skipped or fails, behaviour is exactly what it was before the tag.
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

export async function getPlSim(): Promise<PlSimFile | null> {
  return load<PlSimFile>("pl-sim.json");
}

export async function getPlPredictions(): Promise<PlPredictionsFile | null> {
  return load<PlPredictionsFile>("pl-predictions.json");
}

export async function getPlSimHistory(): Promise<PlSimHistoryFile | null> {
  return load<PlSimHistoryFile>("pl-sim-history.json");
}
