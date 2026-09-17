import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// NHL 2026-27 season simulation (scripts/predictions/build_nhl_sim.py):
//   public/data/nhl-sim.json         - playoff / division / conference / Cup odds
//   public/data/nhl-sim-history.json - dated snapshots for week-over-week deltas
//
// Same ISR read pattern as lib/mlbSim.ts and lib/nflSim.ts: prefer the copy on
// GitHub raw so a refresh lands without a Vercel build, fall back to the
// build-time file when offline.
//
// Rows are keyed by `canonical` (the workbook mark: "Bruins", "Mammoth"),
// which is the SAME key lib/nhl-standings.ts uses for `by_canonical` and
// lib/nhl.ts uses for franchises. Join on that, never on a slug.
//
// ⚠️ TWO THINGS A READER OF THESE NUMBERS SHOULD KNOW, both recorded in the
// file's own meta rather than left to folklore:
//
//   1. NO MARKET BLEND. The NFL and MLB builders anchor their ratings to
//      de-vigged futures. This one does not, so these are pure model odds
//      with nothing tying them to what anyone is actually betting.
//      `meta.market` is null and says so.
//   2. REGULATION WINS ARE APPROXIMATE for games already played. ESPN's
//      schedule feed gives a final score and no period detail, so a completed
//      game is counted as a regulation win. Points are exact; regulation wins
//      are the SECOND tie-break and only separate teams already level.

export type NhlBand = "solid" | "likely" | "lean" | "tossup" | "unlikely" | "out";

export type NhlSimRow = {
  canonical: string;
  name: string;
  conf: "Eastern" | "Western";
  div: string;
  rating: number;
  /** Expected points over the full 84-game season. */
  points: number;
  points_p10: number;
  points_p50: number;
  points_p90: number;
  p_playoffs: number;
  p_division: number;
  /** Reached the field as one of the conference's two wild cards. */
  p_wildcard: number;
  p_conf: number;
  p_cup: number;
  /** Best regular-season record in the league. */
  p_president: number;
  band: NhlBand;
};

export type NhlSimMeta = {
  league: string;
  season: number;
  generated_at: string;
  sims: number;
  games_played: number;
  games_total: number;
  /** 84 from 2026-27. See GAMES_PER_SEASON in lib/seasonWindows.ts. */
  games_per_team: number;
  p_overtime: number;
  hfa_logit: number;
  ratings_source: string;
  /** Null until a futures blend exists. Not an omission, a statement. */
  market: string | null;
};

export type NhlSimFile = { meta: NhlSimMeta; table: NhlSimRow[] };

export type NhlSimHistorySnapshot = {
  date: string;
  games_played: number;
  rows: { canonical: string; p_playoffs: number; p_cup: number; points: number }[];
};

export type NhlSimHistoryFile = {
  meta: { league: string; season: number; generated_at: string; keep: number };
  snapshots: NhlSimHistorySnapshot[];
};

const GH_BASE =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data";

// readLocal does the actual literal readFileSync per file (never a helper
// taking a dynamic filename) so the Vercel file tracer scopes each route to
// just the file it reads. See scripts/DATA-READS-RECIPE.md.
async function load<T extends { meta: { generated_at: string } }>(
  file: string,
  readLocal: () => T,
): Promise<T | null> {
  let local: T | null = null;
  try {
    local = readLocal();
  } catch {
    /* no build-time copy */
  }
  try {
    const res = await fetch(`${GH_BASE}/${file}`, {
      next: { revalidate: 21600, tags: ["predictions-daily"] },
    });
    if (res.ok) {
      const remote = (await res.json()) as T;
      if (remote?.meta?.generated_at) {
        // Newer wins. A local build-time copy can be fresher than origin when
        // the sim has just run and not yet been committed.
        if (!local || remote.meta.generated_at >= local.meta.generated_at) return remote;
      }
    }
  } catch {
    /* offline: local only */
  }
  return local;
}

export async function getNhlSim(): Promise<NhlSimFile | null> {
  return load<NhlSimFile>("nhl-sim.json", () =>
    JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "nhl-sim.json"), "utf-8"),
    ),
  );
}

export async function getNhlSimHistory(): Promise<NhlSimHistoryFile | null> {
  return load<NhlSimHistoryFile>("nhl-sim-history.json", () =>
    JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "nhl-sim-history.json"), "utf-8"),
    ),
  );
}

/** canonical -> row, for joining onto a standings table. */
export function nhlOddsByCanonical(sim: NhlSimFile | null): Map<string, NhlSimRow> {
  const m = new Map<string, NhlSimRow>();
  for (const r of sim?.table ?? []) m.set(r.canonical, r);
  return m;
}

/**
 * Is this sim describing the season the board is showing, and recently enough
 * to be worth rendering?
 *
 * 🔴 BOTH HALVES ARE LOAD-BEARING. A sim file is a snapshot of a moment: it
 * carries the season it was built for and the day it was built. A stale file
 * renders numbers that look exactly as confident as fresh ones, which is the
 * failure mode every other league's block guards against and the reason the
 * NFL, MLB and CFB blocks each test freshness before showing a column.
 *
 * `season` is the site's end-year convention: 2027 is the 2026-27 season.
 */
export function nhlSimIsCurrent(
  sim: NhlSimFile | null,
  season: number,
  now: Date = new Date(),
  maxAgeDays = 10,
): boolean {
  if (!sim?.meta || !sim.table?.length) return false;
  if (sim.meta.season !== season) return false;
  const built = Date.parse(sim.meta.generated_at);
  if (!Number.isFinite(built)) return false;
  const ageDays = (now.getTime() - built) / 86_400_000;
  return ageDays >= 0 && ageDays <= maxAgeDays;
}
