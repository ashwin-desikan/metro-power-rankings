import "server-only";
import { unstable_cache } from "next/cache";
import { fetchEspnJson } from "@/lib/espnFetch";

// Live MLB fixtures and finals for the Live Standings event strips.
//
// WHY THIS EXISTS (2026-09-18): mlbBlock fed the strips from the POSTSEASON
// ledger only, on an explicit ruling of Ashwin's from 2026-09-11 ("the playoffs
// must show, fifteen regular-season games a day would make the list too long").
// The ledger is empty until the bracket exists, so through September MLB was
// absent from On today, Recent results and Coming up entirely. Ashwin overruled
// that on 2026-09-18 and asked for the regular season as well.
//
// SHAPE: one request per DAY, like lib/espnScores.ts. ESPN dropped the
// hyphenated `dates=A-B` form on 2026-09-15 (every range 400s now), and the
// month form returns a whole month of a 15-games-a-day league, which is both
// far more than the window needs and large enough to worry the 2 MB data-cache
// item limit. Measured 2026-09-18: a single day is 40 to 440 KB and the eleven
// days this window spans total about 2.4 MB, so the RAW bodies are deliberately
// not cached (noStore) and this module caches the SHAPED result instead, which
// is a few KB. That is the same lesson as getCfbStandings in lib/cfb-live.ts.
//
// WINDOW: three days back covers Recent results (RESULTS_BACK_MS is 72h) and
// seven forward covers Coming up (COMING_DAYS is 7 since 2026-09-18). Both
// numbers live in app/sports/standings/liveData.tsx; this reaches one day wider
// at each end so a timezone edge cannot clip the first or last day.

const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard";
const REVALIDATE_SECONDS = 900; // 15 min, matching lib/espnScores.ts
const DAYS_BACK = 4;
const DAYS_FORWARD = 8;

export type MlbGame = {
  id: string;
  when: string;              // ISO instant of first pitch
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  state: "pre" | "in" | "post";
};

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function asStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** One day's scoreboard, shaped. A failed day contributes nothing and the rest
 *  stand: the same softness lib/espnScores.ts and build_pl_sim.py use, so one
 *  bad day never costs the whole window. */
async function fetchDay(day: string): Promise<MlbGame[]> {
  const raw = await fetchEspnJson(
    `${SCOREBOARD}?dates=${day}&limit=100`,
    `mlb-scoreboard-${day}`,
    REVALIDATE_SECONDS,
    { noStore: true },
  );
  const root = asObj(raw);
  if (!root) return [];
  const out: MlbGame[] = [];
  for (const evRaw of asArr(root.events)) {
    const ev = asObj(evRaw);
    if (!ev) continue;
    const comp = asObj(asArr(ev.competitions)[0]);
    if (!comp) continue;
    const status = asObj(asObj(ev.status)?.type);
    const state = asStr(status?.state);
    if (state !== "pre" && state !== "in" && state !== "post") continue;
    let home: string | null = null, away: string | null = null;
    let homeScore: number | null = null, awayScore: number | null = null;
    for (const cRaw of asArr(comp.competitors)) {
      const c = asObj(cRaw);
      if (!c) continue;
      const name = asStr(asObj(c.team)?.displayName);
      // 🔴 ESPN sends score "0" on a game that has NOT been played, so a score is
      // only meaningful once the game is final. Caught by replaying this shaping
      // against the live feed before shipping: tonight's fixtures came back as
      // 0-0, and collectEvents treats any event carrying a score as a RESULT, so
      // every scheduled game would have rendered as a 0-0 final and dropped out
      // of On today. Gate on state, not on the presence of the field.
      //
      // "0" is still a real score for a finished shutout, so parse rather than
      // test truthiness once state is post.
      const scoreRaw = asStr(c.score);
      const parsed = scoreRaw === "" ? null : Number(scoreRaw);
      const num = state === "post" && Number.isFinite(parsed) ? (parsed as number) : null;
      if (asStr(c.homeAway) === "home") { home = name; homeScore = num; }
      else if (asStr(c.homeAway) === "away") { away = name; awayScore = num; }
    }
    const when = asStr(ev.date);
    if (!home || !away || !when) continue;
    out.push({ id: asStr(ev.id) || `${when}|${home}`, when, home, away, homeScore, awayScore, state });
  }
  return out;
}

async function buildMlbFixtures(): Promise<MlbGame[]> {
  const today = new Date();
  const days: string[] = [];
  for (let off = -DAYS_BACK; off <= DAYS_FORWARD; off++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + off);
    days.push(ymd(d));
  }
  const perDay = await Promise.all(days.map((d) => fetchDay(d)));
  // Dedupe on the event id: a game listed on two adjacent days (a late start
  // crossing UTC midnight) must not appear twice in the strips.
  const seen = new Set<string>();
  const all: MlbGame[] = [];
  for (const g of perDay.flat()) {
    if (seen.has(g.id)) continue;
    seen.add(g.id);
    all.push(g);
  }
  all.sort((a, b) => a.when.localeCompare(b.when));
  return all;
}

/** Cached on the SHAPED result, not the raw bodies: see the note above. Keyed on
 *  a version string so a shaping change invalidates it. */
export const getMlbFixtures = unstable_cache(
  buildMlbFixtures,
  ["mlb-fixtures-shaped-v1"],
  { revalidate: REVALIDATE_SECONDS, tags: ["espn-mlb-fixtures"] },
);
