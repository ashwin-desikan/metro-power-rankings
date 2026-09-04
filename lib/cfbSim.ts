import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// CFB 2026 prediction data (built by scripts/predictions/build_cfb_sim.py):
//   public/data/cfb-sim.json          - season simulation (conference title
//                                       games, conference titles, the 12-team
//                                       playoff, byes, the national title)
//   public/data/cfb-sim-history.json  - daily snapshots of the same odds, for
//                                       week-over-week deltas and sparklines
//   public/data/cfb-predictions.json  - weekly AP Top 25 game predictions +
//                                       graded ledger (slates publish after
//                                       each AP poll release)
// Same ISR read pattern as lib/nflSim.ts / lib/plSim.ts.

export type CfbBand = "solid" | "likely" | "lean" | "tossup" | "unlikely" | "out";

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
  // points-v3, optional: all absent on the JSON before the upgrade build.
  wins_p10?: number;
  wins_p90?: number;
  rating_stats?: number;
  rating_market?: number | null;
  sigma_team?: number;
  p_bubble?: number;
  band?: CfbBand;
};

export type CfbSimTierRow = {
  exp_wins: number;
  p_ccg: number;
  p_conf: number;
  p_playoff: number;
  p_bye: number;
  p_natty: number;
};

export type CfbSimTiers = {
  lite?: Record<string, CfbSimTierRow>;
  classic?: Record<string, CfbSimTierRow>;
  deluxe?: Record<string, CfbSimTierRow>;
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
  // points-v3, optional
  seed?: number;
  sigma_season_eff?: number;
  corr?: { hfa_sd: number; conf_sd: number; team_sd: number };
  tiers?: ("lite" | "classic" | "deluxe")[];
  market_ratings?: "futures" | "futures+spreads" | "none";
};

export type CfbSimFile = { meta: CfbSimMeta; table: CfbSimRow[]; tiers?: CfbSimTiers };

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
  // points-v3, optional: two extra rating tiers frozen alongside the
  // production `model` (the "deluxe" tier: stats + market + AP poll), and
  // the playoff-probability swing on the game.
  lite?: { pH: number; backfilled?: string };
  classic?: { pH: number; backfilled?: string };
  lite_brier?: number;
  classic_brier?: number;
  leverage?: { home: number; away: number; game: number };
  /** The multi-book consensus frozen with the call (2026-09-04 on). College is
   *  three books, not four — Polymarket carries no college game markets — and
   *  in practice only two POST a price, because ESPN's DraftKings block is
   *  spread-only for most college games and a spread put through Phi is
   *  carried but never votes. `books` is how many voted. */
  meta_market?: {
    pH: number;
    books?: number;
    sd_logodds?: number | null;
    derived_only?: true;
    backfilled?: string;
  };
  meta_brier?: number;
  /** One side is an FCS opponent, so every tier prices it from the one pooled
   *  FCS rating and none of them can separate on it. */
  fcs_opponent?: true;
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
    // points-v3, optional
    tiers?: ("lite" | "classic" | "market" | "meta" | "blend")[];
  };
  record: {
    graded: number;
    pick_correct: number;
    model_brier: number | null;
    blend_brier: number | null;
    market_graded: number;
    market_brier: number | null;
    // points-v3, optional. Each tier reports its OWN graded count, because the
    // sets genuinely differ and a Brier without its denominator invites a
    // comparison the sets cannot support.
    lite_graded?: number;
    lite_brier?: number | null;
    classic_graded?: number;
    classic_brier?: number | null;
    meta_graded?: number;
    meta_brier?: number | null;
    fcs_opponent_games?: number;
  };
  ledger: CfbPredictionEntry[];
};

export type CfbSimHistorySnapshotRow = {
  xw: number;
  po: number;
  conf: number;
  title: number;
};

export type CfbSimHistorySnapshot = {
  date: string;
  games_played: number;
  rows: Record<string, CfbSimHistorySnapshotRow>;
};

export type CfbSimHistoryFile = {
  meta: { league: string; season: number; generated_at: string; keep: number };
  snapshots: CfbSimHistorySnapshot[];
};

// Exported so the "Get the data" link on the CFB hub can point at the raw
// JSON without duplicating the path.
export const CFB_DATA_GH_BASE =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data";
const GH_BASE = CFB_DATA_GH_BASE;

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

export async function getCfbSimHistory(): Promise<CfbSimHistoryFile | null> {
  return load<CfbSimHistoryFile>("cfb-sim-history.json");
}
