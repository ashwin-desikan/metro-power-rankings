import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// UEFA Champions League 2026-27 prediction data (built by
// scripts/predictions/build_ucl_sim.py, ucl-poisson-v1):
//   public/data/ucl-sim.json - league-phase + knockout odds per club, plus
//                              model calls for upcoming fixtures.
// Same read pattern as lib/plSim.ts: GitHub raw via ISR under the
// predictions-daily tag (remote wins on a newer generated_at) with the
// build-time file as fallback, so data-only re-runs appear without a build.
// Club names are the site's canonical Lookup names — resolve links/crests
// via lib/football getFootballClubByName, as the tournament hubs do.

export type UclSimRow = {
  name: string;
  country: string | null;
  exp_pts: number;
  pos: { p5: number; p50: number; p95: number };
  p_top8: number;
  p_top24: number;
  p_r16: number;
  p_qf: number;
  p_sf: number;
  p_final: number;
  p_champion: number;
};

export type UclSimMeta = {
  league: string;
  season: string;
  generated_at: string;
  sims: number;
  model: string;
  mu: number;
  home_adv: number;
  sigma: number;
  k_league: number;
  market: string;
  strength_seasons: string[];
  matches_played: number;
  calendar_placeholder: boolean;
  notes: string;
};

export type UclFixtureCall = {
  date: string;
  home: string;
  away: string;
  model: { pH: number; pD: number; pA: number };
  pick: "H" | "D" | "A";
};

export type UclSimFile = { meta: UclSimMeta; table: UclSimRow[]; fixtures_called: UclFixtureCall[] };

const GH_BASE =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data";

export async function getUclSim(): Promise<UclSimFile | null> {
  let local: UclSimFile | null = null;
  try {
    local = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "ucl-sim.json"), "utf-8"),
    ) as UclSimFile;
  } catch {
    /* no build-time copy */
  }
  try {
    const res = await fetch(`${GH_BASE}/ucl-sim.json`, {
      next: { revalidate: 21600, tags: ["predictions-daily"] },
    });
    if (res.ok) {
      const remote = (await res.json()) as UclSimFile;
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
