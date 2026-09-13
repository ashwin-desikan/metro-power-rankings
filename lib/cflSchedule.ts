// No `import "server-only"` here, matching lib/cflStandings.ts beside it: the package is
// not a dependency of this repo, so importing it only breaks the test runner. The
// check:client-imports gate is what actually keeps server modules out of client bundles.
//
// CFL fixtures and results from api.stats.cfl.ca/fixtures/<year>, the JSON the league's
// own schedule page (cfl.ca/schedule) reads. Same source as lib/cflStandings.ts: open,
// unkeyed, one document per season.
//
// Added 2026-09-13. The CFL had never appeared in On today / Recent results / Coming up:
// cflBlock built standings tables and set no `events` at all, unlike the NFL and college
// football blocks beside it. This is the missing half.
//
// The document has five lists: preseason, season, semiFinals, finals, and a
// fixturesByTeam index. We read the three that count and ignore the index, which is the
// same games again grouped differently.

export type CflFixture = {
  fixtureId: number;
  kickoff: string;            // ISO instant, always with an offset (see below)
  week: number | null;
  stage: "regular" | "semi-final" | "final";
  home: { id: number; slug: string; name: string };
  away: { id: number; slug: string; name: string };
  homeScore: number | null;
  awayScore: number | null;
  completed: boolean;
};

// api team_id -> our franchise slug + display name. Read from /teams on 2026-09-13;
// lib/cflSchedule.test.ts pins every id against that payload, so a renumbering upstream
// fails a test rather than silently dropping half the schedule.
const TEAM_BY_ID: Record<number, { slug: string; name: string }> = {
  1: { slug: "bc-lions", name: "BC Lions" },
  6: { slug: "calgary-stampeders", name: "Calgary Stampeders" },
  7: { slug: "edmonton-elks", name: "Edmonton Elks" },
  8: { slug: "hamilton-tiger-cats", name: "Hamilton Tiger-Cats" },
  11: { slug: "montreal-alouettes", name: "Montreal Alouettes" },
  13: { slug: "ottawa-redblacks", name: "Ottawa RedBlacks" },
  17: { slug: "saskatchewan-roughriders", name: "Saskatchewan Roughriders" },
  19: { slug: "toronto-argonauts", name: "Toronto Argonauts" },
  20: { slug: "winnipeg-blue-bombers", name: "Winnipeg Blue Bombers" },
};

/** 🔴 An instant, or nothing. `start_at` carries an offset on every scheduled game
 *  ("2026-09-19T19:00:00+00:00") but the unplayed playoff rows come back NAIVE
 *  ("2026-10-31T15:00:00"), because those slots are placeholders the league has not
 *  fixed yet. Reading a naive string as UTC would put the Eastern Semi-Final on the page
 *  at the wrong hour, and reading it as local would be wrong for every viewer outside
 *  Canada. A fixture with no real instant is not yet a fixture, so it is dropped. */
export function instantOf(raw: unknown): string | null {
  const s = String(raw ?? "");
  if (!/[+-]\d{2}:?\d{2}$|Z$/.test(s)) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

type ApiGame = {
  ID?: unknown; start_at?: unknown; week?: unknown;
  home_team_id?: unknown; away_team_id?: unknown;
  home_team_score?: unknown; away_team_score?: unknown;
};

/** 🔴 The null check is the whole function. `Number(null)` is 0 and 0 is finite, so a
 *  plain Number()/isFinite() pair turns an unplayed game's null score into 0-0 — and
 *  since both scores being present is what marks a game complete, every fixture in the
 *  rest of the season would have rendered in Recent results as a 0-0 that never
 *  happened. Caught by lib/cflSchedule.test.ts before it reached a page. */
const intOr = (v: unknown, fallback: number | null): number | null => {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export function parseGames(list: unknown, stage: CflFixture["stage"]): CflFixture[] {
  if (!Array.isArray(list)) return [];
  const out: CflFixture[] = [];
  for (const g of list as ApiGame[]) {
    const kickoff = instantOf(g?.start_at);
    const home = TEAM_BY_ID[Number(g?.home_team_id)];
    const away = TEAM_BY_ID[Number(g?.away_team_id)];
    // A playoff slot with no team assigned yet is a real, common row; it has no
    // matchup to show, so it waits until the bracket names both sides.
    if (!kickoff || !home || !away) continue;
    const hs = intOr(g.home_team_score, null);
    const as = intOr(g.away_team_score, null);
    out.push({
      fixtureId: Number(g.ID) || 0,
      kickoff,
      week: intOr(g.week, null),
      stage,
      home: { id: Number(g.home_team_id), ...home },
      away: { id: Number(g.away_team_id), ...away },
      homeScore: hs,
      awayScore: as,
      // Both scores present is the completion signal: the feed carries no status field,
      // and a kickoff in the past is not the same thing as a finished game.
      completed: hs !== null && as !== null,
    });
  }
  return out;
}

/** Regular season, semi-finals and finals, in kick-off order. Preseason is deliberately
 *  left out: it is over by June and would only ever add noise to a September page. */
export function parseFixtures(doc: unknown): CflFixture[] {
  const d = (doc ?? {}) as Record<string, unknown>;
  return [
    ...parseGames(d.season, "regular"),
    ...parseGames(d.semiFinals, "semi-final"),
    ...parseGames(d.finals, "final"),
  ].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}

export async function getCflFixtures(year: number): Promise<CflFixture[]> {
  try {
    const res = await fetch(`https://api.stats.cfl.ca/fixtures/${year}`, {
      headers: {
        accept: "application/json",
        "user-agent": "MetroPowerRankings/1.0 (+https://rankings.citizenofnowhere.org)",
      },
      // Ten minutes, matching the standings. Scores move during a game; the schedule
      // itself barely moves at all, and this is one 150 KB document for the whole season.
      next: { revalidate: 600 },
    });
    if (!res.ok) return [];
    return parseFixtures(await res.json());
  } catch {
    return [];
  }
}
