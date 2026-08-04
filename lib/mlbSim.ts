import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// MLB 2026 season simulation (built by scripts/predictions/build_mlb_sim.py):
//   public/data/mlb-sim.json - playoff / division / pennant / World Series odds
//
// Same ISR read pattern as lib/nflSim.ts and lib/plSim.ts: prefer the copy on
// GitHub raw so a refresh lands without a Vercel build, fall back to the
// build-time file when offline or when the remote is older.
//
// Rows are keyed by `canonical` (the ESPN team mark: "Yankees", "Dodgers"),
// which is the SAME key lib/mlb-standings.ts uses for `by_canonical` and
// lib/mlb.ts uses for franchises. Join on that, never on a slug.

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
};

export type MlbSimFile = { meta: MlbSimMeta; table: MlbSimRow[] };

const GH_BASE =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data";

export async function getMlbSim(): Promise<MlbSimFile | null> {
  let local: MlbSimFile | null = null;
  try {
    local = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "mlb-sim.json"), "utf-8"),
    ) as MlbSimFile;
  } catch {
    /* no build-time copy */
  }
  try {
    const res = await fetch(`${GH_BASE}/mlb-sim.json`, {
      next: { revalidate: 21600, tags: ["predictions-daily"] }, // 6h backstop
    });
    if (res.ok) {
      const remote = (await res.json()) as MlbSimFile;
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
