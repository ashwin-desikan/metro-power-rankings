import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// MLB / WNBA playoff series bundles, built by scripts/ingest/playoff_series.py
// from ESPN's postseason scoreboard + standings playoffSeed. Contract:
// _scratch/playoffs-contract.md. Committed at public/data/{mlb,wnba}/playoffs.json.
//
// 🔴 STUB, written by a sibling session ahead of scripts/ingest/playoff_series.py
// landing (2026-09-26). Keep the export names and shapes exactly as the
// contract states -- the producer's own lib/playoffSeries.ts will overwrite
// this file once it ships; do not diverge the shape in the meantime.
//
// Same ISR read pattern as lib/footyFinals.ts: prefer the GitHub-raw copy so a
// playoff-night refresh lands with a `[vercel skip]` data commit and no
// build, fall back to the build-time file when offline or when the remote is
// older.

export type PlayoffSide = {
  name: string;
  abbr: string;
  slug: string | null;
  seed: number | null;
  wins: number;
};

export type PlayoffGame = {
  num: number;
  espn_id: string;
  date: string;
  home: string;
  away: string;
  home_score: number | null;
  away_score: number | null;
  state: "pre" | "in" | "post";
  venue: string | null;
};

export type PlayoffSeries = {
  id: string;
  bracket: "AL" | "NL" | null;
  best_of: number;
  state: "pre" | "in" | "post";
  high: PlayoffSide;
  low: PlayoffSide;
  winner: "high" | "low" | null;
  summary: string | null;
  games: PlayoffGame[];
};

export type PlayoffRound = {
  key: string;
  name: string;
  order: number;
  best_of: number;
  series: PlayoffSeries[];
};

export type PlayoffBundle = {
  meta: {
    league: "mlb" | "wnba";
    season: number;
    generated_at: string;
    complete: boolean;
    source: string;
    games: number;
    unassigned_games: number;
  };
  rounds: PlayoffRound[];
  unassigned: (PlayoffGame & { headline: string | null })[];
  champion: { name: string; abbr: string; slug: string | null } | null;
};

const GH_BASE =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data";

export async function getPlayoffSeries(league: "mlb" | "wnba"): Promise<PlayoffBundle | null> {
  const rel = `${league}/playoffs.json`;
  let local: PlayoffBundle | null = null;
  try {
    // Literal directory segments per league, not a dynamic `league` path
    // segment: the Vercel file tracer cannot scope a dynamic segment and
    // globs all of public/data instead (scripts/DATA-READS-RECIPE.md).
    const p =
      league === "mlb"
        ? join(process.cwd(), "public", "data", "mlb", "playoffs.json")
        : join(process.cwd(), "public", "data", "wnba", "playoffs.json");
    local = JSON.parse(readFileSync(p, "utf-8")) as PlayoffBundle;
  } catch {
    /* no build-time copy yet (expected until the first refresh commits one) */
  }
  try {
    const res = await fetch(`${GH_BASE}/${rel}`, {
      next: { revalidate: 900, tags: ["playoff-series"] },
    });
    if (res.ok) {
      const remote = (await res.json()) as PlayoffBundle;
      const remoteHasSeries = (remote?.rounds ?? []).some((r) => r.series.length > 0);
      const localHasSeries = (local?.rounds ?? []).some((r) => r.series.length > 0);
      if (
        remote?.meta?.generated_at &&
        (!local || remote.meta.generated_at >= local.meta.generated_at) &&
        (remoteHasSeries || !localHasSeries)
      )
        return remote;
    }
  } catch {
    /* offline: local only */
  }
  return local;
}

/**
 * Worth showing only while it describes a real bracket and the feed is
 * alive: at least one series on file, generated within the last 45 days
 * (the finals-bracket convention, lib/footyFinals.ts's finalsIsCurrent).
 */
export function playoffsIsCurrent(b: PlayoffBundle | null): b is PlayoffBundle {
  if (!b) return false;
  const hasSeries = b.rounds.some((r) => r.series.length > 0);
  if (!hasSeries) return false;
  const age = Date.now() - new Date(b.meta.generated_at).getTime();
  return Number.isFinite(age) && age < 45 * 24 * 3600 * 1000;
}
