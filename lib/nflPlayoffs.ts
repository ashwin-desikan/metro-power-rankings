import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// The NFL postseason bracket, built by scripts/nfl/nfl_playoffs.py from ESPN's
// seasontype=3 scoreboard and committed at public/data/nfl/playoffs.json.
//
// Same bundle shape as lib/footyFinals.ts on purpose: the AFL and NRL hubs and
// the NFL hub all render app/teams/_shared/FinalsBracket.tsx, so the two feeds
// have to agree on the payload. The only additions are `neutral` on a game and
// `seed` on a side, both optional and both ignored by the codes that have
// neither.
//
// 🔴 THE SAME ISR-FROM-RAW READ AS lib/footyFinals.ts. Prefer the GitHub-raw
// copy so a January refresh lands with a `[vercel skip]` data commit and no
// production build; fall back to the build-time file when offline or when the
// remote is older. If this ever becomes a build-time-only read, the
// [vercel skip] tag in .github/workflows/nfl-live-refresh.yml has to change
// with it.
//
// Scores: ESPN reports 0-0 before kickoff, so a game whose `state` is "pre"
// must render fixtures (date/venue), never "0 - 0". The component owns that
// rule; this reader hands the rows through untouched.

export type NflPlayoffsSide = {
  name: string;
  slug: string | null; // null = a club the map does not know; render unlinked
  score: number | null;
  winner: boolean;
  seed: number | null; // ESPN's playoff seed when it carries one
} | null; // null side = TBC (the fixture shell before the bracket resolves)

export type NflPlayoffsGame = {
  week: number | null;
  code: string | null; // "AFC" / "NFC"; null on the Super Bowl, which is neither
  round: string | null; // "Wild Card", "Divisional Round", "Super Bowl LX", ...
  date: string | null;
  venue: string | null;
  neutral: boolean;
  home: NflPlayoffsSide;
  away: NflPlayoffsSide;
  state: "pre" | "in" | "post";
  completed: boolean;
  winner: "home" | "away" | null;
};

export type NflPlayoffsWeek = { week: number; label: string; games: NflPlayoffsGame[] };

export type NflPlayoffsBundle = {
  meta: { league: string; season: number; generated_at: string; complete: boolean };
  weeks: NflPlayoffsWeek[];
  /** The Super Bowl winner. Named for the shape it shares with the footy feed. */
  premier: { name: string; slug: string | null } | null;
};

const GH_BASE =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data";

export async function getNflPlayoffs(): Promise<NflPlayoffsBundle | null> {
  let local: NflPlayoffsBundle | null = null;
  try {
    local = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "nfl", "playoffs.json"), "utf-8"),
    ) as NflPlayoffsBundle;
  } catch {
    /* no build-time copy yet (expected until the first refresh commits one) */
  }
  try {
    const res = await fetch(`${GH_BASE}/nfl/playoffs.json`, {
      next: { revalidate: 900, tags: ["nfl-playoffs"] },
    });
    if (res.ok) {
      const remote = (await res.json()) as NflPlayoffsBundle;
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
 * The ESPN season year whose postseason is the current one.
 *
 * ESPN stamps a season with the calendar year it kicks off in, and that
 * season's playoffs are played the following January and February, so those
 * two months still belong to the previous season year. Mirrors
 * current_season() in scripts/nfl/nfl_playoffs.py.
 */
export function currentNflSeason(now: Date = new Date()): number {
  const y = now.getUTCFullYear();
  return now.getUTCMonth() >= 2 ? y : y - 1; // month index 2 = March
}

/**
 * Worth showing only while it describes THIS season's playoffs and the feed is
 * alive: it has fixtures, its season is the current one, and it was generated
 * within the last 60 days.
 *
 * 🔴 BEFORE JANUARY THIS IS FALSE AND THE HUB RENDERS NOTHING, not a
 * placeholder. Between March and December the only bracket on disk is the
 * previous season's, whose `meta.season` no longer matches, so the section
 * disappears on its own the moment the new season starts rather than needing a
 * date to be hand-maintained anywhere.
 *
 * The 60-day window is wider than the footy feed's 45 because the refresh job
 * only runs in January and February: a Super Bowl won in early February keeps
 * rendering as the season's record through to about April, then falls away.
 */
export function playoffsIsCurrent(
  p: NflPlayoffsBundle | null,
  now: Date = new Date(),
): p is NflPlayoffsBundle {
  if (!p || p.weeks.length === 0) return false;
  if (!p.weeks.some((w) => w.games.length > 0)) return false;
  if (p.meta.season !== currentNflSeason(now)) return false;
  const age = now.getTime() - new Date(p.meta.generated_at).getTime();
  return Number.isFinite(age) && age < 60 * 24 * 3600 * 1000;
}
