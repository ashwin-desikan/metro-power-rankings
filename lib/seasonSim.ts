import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// Season simulations for the six non-MLB leagues (built by
// scripts/predictions/build_season_sims.py):
//   public/data/{afl,nrl,wnba,cfl,npb,mls,nwsl}-sim.json
//     - playoff / finals odds and championship odds per team
//
// Same ISR read pattern as lib/mlbSim.ts: prefer the copy on GitHub raw so a
// daily refresh lands without a Vercel build, fall back to the build-time
// file when offline or when the remote is older. Rows are keyed by `key`
// (source-native: afltables team key, ESPN team id, cfl.ca abbreviation,
// SPAIA TeamCD) but joined by `slug` where the site has one and by `name`
// for the ESPN leagues - see each consumer.

export type SeasonSimLeague = "afl" | "nrl" | "wnba" | "cfl" | "npb" | "mls" | "nwsl";

export type SeasonSimRow = {
  key: string;
  name: string;
  slug?: string;
  conf?: string;
  division?: string;
  league?: string;
  gp: number;
  w: number;
  l: number;
  d?: number;
  t?: number;
  pts?: number;
  rating: number;
  exp_pts?: number;
  exp_wins?: number;
  p_playoffs: number;
  p_title: number;
  // League-specific intermediate odds (top-4, pennant, finals, ...) ride
  // along untyped; the two columns every surface shows are typed above.
  [extra: string]: unknown;
};

export type SeasonSimMeta = {
  league: string;
  season: number;
  title_name: string;
  playoff_name: string;
  playoff_spots: number;
  generated_at: string;
  sims: number;
  model: string;
  finals_format: string;
  games_played: number;
  games_remaining: number;
  source: string;
  notes: string;
};

export type SeasonSimFile = { meta: SeasonSimMeta; table: SeasonSimRow[] };

// One formatting rule for every odds surface on the site (never a bare 100%
// or 0.00% - see the rationale in lib/mlbSim.ts).
export { fmtOdds } from "./mlbSim";

const GH_BASE =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data";

export async function getSeasonSim(league: SeasonSimLeague): Promise<SeasonSimFile | null> {
  const file = `${league}-sim.json`;
  let local: SeasonSimFile | null = null;
  try {
    local = JSON.parse(readFileSync(join(process.cwd(), "public", "data", file), "utf-8")) as SeasonSimFile;
  } catch {
    /* no build-time copy (expected until the first refresh commits one) */
  }
  try {
    const res = await fetch(`${GH_BASE}/${file}`, {
      next: { revalidate: 21600, tags: ["predictions-daily"] }, // 6h backstop
    });
    if (res.ok) {
      const remote = (await res.json()) as SeasonSimFile;
      if (remote?.meta?.generated_at && (!local || remote.meta.generated_at >= local.meta.generated_at))
        return remote;
    }
  } catch {
    /* offline: local only */
  }
  return local;
}

/**
 * A sim is only worth SHOWING while its season is under way and the file is
 * fresh enough to trust: games played, games still to play, and generated
 * within the last 10 days (a dead refresh job must fade out, not pin stale
 * odds next to a live table). Mirrors the showOdds gate /teams/mlb uses.
 */
export function simIsCurrent(sim: SeasonSimFile | null): sim is SeasonSimFile {
  if (!sim || sim.table.length === 0) return false;
  if (sim.meta.games_played <= 0 || sim.meta.games_remaining <= 0) return false;
  const age = Date.now() - new Date(`${sim.meta.generated_at}T00:00:00Z`).getTime();
  return Number.isFinite(age) && age < 10 * 24 * 3600 * 1000;
}

/** slug -> row, for the leagues whose tables carry site slugs. */
export function simBySlug(sim: SeasonSimFile | null): Map<string, SeasonSimRow> {
  const out = new Map<string, SeasonSimRow>();
  for (const r of sim?.table ?? []) if (r.slug) out.set(r.slug, r);
  return out;
}

/** ESPN displayName -> row, for the ESPN-keyed leagues (WNBA, MLS). */
export function simByName(sim: SeasonSimFile | null): Map<string, SeasonSimRow> {
  const out = new Map<string, SeasonSimRow>();
  for (const r of sim?.table ?? []) out.set(r.name, r);
  return out;
}

/**
 * ESPN displayName -> row, re-keyed onto site slugs through `resolve`.
 *
 * Used by NWSL, whose sim rows are ESPN-keyed ("Gotham FC") while the live
 * standings rows it must join against are api-football-keyed ("NJ/NY Gotham
 * FC W") and carry a portal slug. Resolution goes through the site's own
 * alias table (getWClubByName), so the naming knowledge stays in one place.
 *
 * FAILS CLOSED, deliberately: if any row does not resolve, or two resolve to
 * the same slug, this returns null and the caller hides the odds columns
 * entirely. A club rebrand upstream is exactly how a partial join would
 * otherwise attach one club's title odds to another's row, which is worse
 * than showing nothing.
 */
export function simBySlugResolved(
  sim: SeasonSimFile | null,
  resolve: (name: string) => string | null | undefined,
): Map<string, SeasonSimRow> | null {
  const rows = sim?.table ?? [];
  if (rows.length === 0) return null;
  const out = new Map<string, SeasonSimRow>();
  for (const r of rows) {
    const slug = resolve(r.name);
    if (!slug || out.has(slug)) return null;
    out.set(slug, r);
  }
  return out;
}
