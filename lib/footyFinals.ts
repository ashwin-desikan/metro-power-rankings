import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// AFL / NRL finals bracket bundles, built by scripts/ingest/footy_finals.py
// from ESPN's post-season scoreboard events and committed at
// public/data/{afl,nrl}/finals.json.
//
// Same ISR read pattern as lib/seasonSim.ts: prefer the GitHub-raw copy so a
// finals-night refresh lands with a `[vercel skip]` data commit and no build,
// fall back to the build-time file when offline or when the remote is older.
//
// Scores: ESPN reports 0-0 before the bounce, so a game whose `state` is
// "pre" must render fixtures (date/venue), never "0 - 0". The component owns
// that rule; this reader hands the rows through untouched.

export type FootyFinalsSide = {
  name: string;
  slug: string | null; // null = club the map does not know; render unlinked
  score: number | null;
  winner: boolean;
} | null; // null side = TBC (fixture listed before the draw resolves)

export type FootyFinalsGame = {
  week: number | null;
  code: string | null; // "WC1", "QF2", "EF1", "SF1", "PF2", "GF" when ESPN labels it
  round: string | null; // "Wildcard", "Qualifying Final", ...
  date: string | null;
  venue: string | null;
  home: FootyFinalsSide;
  away: FootyFinalsSide;
  state: "pre" | "in" | "post";
  completed: boolean;
  winner: "home" | "away" | null;
};

export type FootyFinalsWeek = { week: number; label: string; games: FootyFinalsGame[] };

export type FootyFinalsBundle = {
  meta: { league: string; season: number; generated_at: string; complete: boolean };
  weeks: FootyFinalsWeek[];
  premier: { name: string; slug: string | null } | null;
};

const GH_BASE =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data";

export async function getFootyFinals(league: "afl" | "nrl"): Promise<FootyFinalsBundle | null> {
  const rel = `${league}/finals.json`;
  let local: FootyFinalsBundle | null = null;
  try {
    local = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", league, "finals.json"), "utf-8"),
    ) as FootyFinalsBundle;
  } catch {
    /* no build-time copy yet (expected until the first refresh commits one) */
  }
  try {
    const res = await fetch(`${GH_BASE}/${rel}`, {
      next: { revalidate: 900, tags: ["footy-finals"] },
    });
    if (res.ok) {
      const remote = (await res.json()) as FootyFinalsBundle;
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

/**
 * Worth showing only while it describes THIS season's finals and the feed is
 * alive: has fixtures, and was generated within the last 45 days. The wide
 * window (vs the sims' 10 days) is deliberate: a completed bracket should
 * keep rendering through October as the season's record, then fall away
 * naturally over the summer rather than vanish the week after the Grand
 * Final. A dead mid-finals feed still shows its last refresh, whose
 * `generated_at` the component surfaces.
 */
export function finalsIsCurrent(f: FootyFinalsBundle | null): f is FootyFinalsBundle {
  if (!f || f.weeks.length === 0) return false;
  const age = Date.now() - new Date(f.meta.generated_at).getTime();
  return Number.isFinite(age) && age < 45 * 24 * 3600 * 1000;
}
