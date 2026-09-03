import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// MLB 2026 season simulation (built by scripts/predictions/build_mlb_sim.py):
//   public/data/mlb-sim.json         - playoff / division / pennant / World Series odds
//   public/data/mlb-sim-history.json - daily snapshots of the same odds, for
//                                      week-over-week deltas and sparklines
//
// Same ISR read pattern as lib/nflSim.ts and lib/plSim.ts: prefer the copy on
// GitHub raw so a refresh lands without a Vercel build, fall back to the
// build-time file when offline or when the remote is older.
//
// Rows are keyed by `canonical` (the ESPN team mark: "Yankees", "Dodgers"),
// which is the SAME key lib/mlb-standings.ts uses for `by_canonical` and
// lib/mlb.ts uses for franchises. Join on that, never on a slug.
//
// MLB has no tiers and no game ledger by design (app/predictions/scoreboard
// says why: the honest unit of prediction in this sport is the season, not
// the game). points-v3 still adds percentile ranges, adaptive per-team
// sigma, and a playoff-odds band to the season table - all optional.

export type MlbBand = "solid" | "likely" | "lean" | "tossup" | "unlikely" | "out";

export type MlbSimRow = {
  canonical: string;
  name: string;
  league: "AL" | "NL";
  division: string;
  rating: number;
  true_wpct: number;
  wins: number;
  losses: number;
  exp_wins: number;
  p_division: number;
  p_playoffs: number;
  p_bye: number;
  p_pennant: number;
  p_ws: number;
  // points-v3, optional
  rating_stats?: number;
  rating_market?: number | null;
  sigma_team?: number;
  wins_p10?: number;
  wins_p90?: number;
  band?: MlbBand;
};

export type MlbSimMeta = {
  league: string;
  season: number;
  title_game: string;
  generated_at: string;
  sims: number;
  model: string;
  runs_per_win: number;
  hfa_wpct: number;
  sigma_season: number;
  regress: number;
  strength_seasons: number[];
  market: string;
  market_weight: number;
  schedule_games: number;
  games_played: number;
  games_remaining: number;
  wins_check: string;
  source: string;
  notes: string;
  // points-v3, optional
  seed?: number;
  sigma_season_eff?: number;
  corr?: { hfa_sd: number; div_sd: number; team_sd: number };
  market_ratings?: "futures" | "futures+spreads" | "none";
};

export type MlbSimFile = { meta: MlbSimMeta; table: MlbSimRow[] };

export type MlbSimHistorySnapshotRow = {
  xw: number;
  div: number;
  po: number;
  pennant: number;
  title: number;
};

export type MlbSimHistorySnapshot = {
  date: string;
  games_played: number;
  rows: Record<string, MlbSimHistorySnapshotRow>;
};

export type MlbSimHistoryFile = {
  meta: { league: string; season: number; generated_at: string; keep: number };
  snapshots: MlbSimHistorySnapshot[];
};

export const MLB_DATA_GH_BASE =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data";
const GH_BASE = MLB_DATA_GH_BASE;

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

export async function getMlbSim(): Promise<MlbSimFile | null> {
  return load<MlbSimFile>("mlb-sim.json");
}

export async function getMlbSimHistory(): Promise<MlbSimHistoryFile | null> {
  return load<MlbSimHistoryFile>("mlb-sim-history.json");
}

/** canonical -> playoff probability (percent). Empty map when the sim is
 *  unavailable, so callers can render the column only when it has data. */
export function playoffOddsByCanonical(sim: MlbSimFile | null): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of sim?.table ?? []) out.set(r.canonical, r.p_playoffs);
  return out;
}

/**
 * Playoff-odds formatting, shared by every surface that shows them.
 *
 * Never print a bare "100%" or "0.00%": a 20,000-run Monte Carlo cannot tell
 * 99.99% from certainty, and printing certainty is a claim the model does not
 * make. Round to whole percent for the same reason - two decimal places imply
 * a precision that sampling error does not support.
 */
export function fmtOdds(p: number | null | undefined): string {
  if (p == null || Number.isNaN(p)) return "—";
  if (p >= 99.5) return ">99%";
  if (p <= 0) return "0%";
  if (p < 0.5) return "<1%";
  return `${Math.round(p)}%`;
}
