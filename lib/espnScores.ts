import "server-only";

// Final scores from ESPN's public scoreboards, for the "Recent results" strip on
// /sports/standings (Ashwin, 2026-09-13: Saturday's Premier League and college
// football results should show without waiting for the grading jobs).
//
// The Premier League, NFL and college football fixtures on that page come from
// the predictions ledgers, which only carry a score once a scheduled job grades
// them: the Premier League on Tuesday 06:40 UTC, college football on Sunday 23:40.
// Until then a finished game has no score. This fills that gap at request time:
// the page asks for the scoreboard across its results window, keeps only games
// ESPN marks completed, and lends their score to a ledger game that has none.
//
// Read at REQUEST time with ISR, never at build time, so a new result appears
// within the revalidate window and never costs a Vercel build. One request per
// feed per DAY since 2026-09-16: ESPN dropped the hyphenated `dates=A-B` form on
// 09-15 and every ranged request 400s, which this swallowed with `return []`, so
// the strip silently lost every ESPN-supplied final. Per-day payloads are well
// under Next's 2 MB data-cache limit (a single college-football Saturday with
// groups=80 measured 1.43 MB for four days; one day is a fraction of that).
//
// Completed-ness comes from status.type.completed, never from a score being
// present: ESPN reports 0-0 before kick-off. Any failure returns [] and the page
// behaves exactly as it did without this.

export type EspnFinal = {
  league: "Premier League" | "College Football" | "NFL";
  when: string; // ISO kick-off
  home: string[]; // every name ESPN gives the home side (display, short, location)
  away: string[];
  homeScore: string;
  awayScore: string;
};

const FEEDS: { league: EspnFinal["league"]; path: string; extra: string }[] = [
  { league: "Premier League", path: "soccer/eng.1", extra: "" },
  { league: "College Football", path: "football/college-football", extra: "&groups=80&limit=400" },
  { league: "NFL", path: "football/nfl", extra: "" },
];

const REVALIDATE = 900; // 15 min
// The results window is a few days, and one request per feed per day is the only
// shape ESPN still answers. A guard, not a window: if the caller ever widens the
// window, this caps the fan-out at 8 days x 3 feeds rather than letting it grow.
const DAYS_MAX = 8;

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, "");

type Competitor = {
  homeAway?: string;
  score?: string | number;
  team?: { displayName?: string; shortDisplayName?: string; location?: string; name?: string };
};
type ScoreboardEvent = {
  date?: string;
  status?: { type?: { completed?: boolean } };
  competitions?: { competitors?: Competitor[] }[];
};

function names(c: Competitor | undefined): string[] {
  const t = c?.team ?? {};
  return [t.displayName, t.shortDisplayName, t.location].filter((n): n is string => !!n);
}

async function feed(f: (typeof FEEDS)[number], day: string): Promise<EspnFinal[]> {
  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/${f.path}/scoreboard?dates=${day}${f.extra}`,
      { next: { revalidate: REVALIDATE, tags: ["espn-scores"] } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { events?: ScoreboardEvent[] };
    const out: EspnFinal[] = [];
    for (const e of data.events ?? []) {
      if (!e.status?.type?.completed || !e.date) continue;
      const comp = e.competitions?.[0]?.competitors ?? [];
      const home = comp.find((c) => c.homeAway === "home");
      const away = comp.find((c) => c.homeAway === "away");
      if (home?.score == null || away?.score == null) continue;
      out.push({ league: f.league, when: e.date, home: names(home), away: names(away), homeScore: String(home.score), awayScore: String(away.score) });
    }
    return out;
  } catch {
    return [];
  }
}

/** Completed Premier League, NFL and college football games kicking off between the two instants. */
export async function getEspnFinals(fromMs: number, toMs: number): Promise<EspnFinal[]> {
  // ONE REQUEST PER DAY. ESPN dropped the hyphenated `dates=A-B` form on
  // 2026-09-15 (measured: any range, even a single day, now 400s), which this
  // used and which failed silently here: `if (!res.ok) return []` meant the
  // strip quietly lost every ESPN-supplied final and showed ledger-graded games
  // only. Days are capped at DAYS_MAX so a widened window cannot fan out.
  const days: string[] = [];
  for (let t = fromMs; t <= toMs && days.length < DAYS_MAX; t += 86_400_000) days.push(ymd(t));
  const last = ymd(toMs);
  if (days[days.length - 1] !== last && days.length < DAYS_MAX) days.push(last);
  const all = await Promise.all(FEEDS.flatMap((f) => days.map((d) => feed(f, d))));
  const out = all.flat();
  // ESPN can answer a single date with a neighbouring day's late kick-off, so
  // the same event can arrive twice across two requests.
  const seen = new Set<string>();
  return out.filter((e) => {
    const k = `${e.league}|${e.when}|${e.home[0]}|${e.away[0]}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const norm = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Does a ledger team name refer to one of ESPN's names for a side? Exact match on any
 * of them first ("Georgia" = location, "AFC Bournemouth" = display name), then the
 * ledger name as the leading words of ESPN's display name ("Texas A&M" in "Texas A&M
 * Aggies"). The caller requires BOTH sides to match and the kick-offs to agree, which
 * is what keeps "Miami" from matching "Miami (OH)" on a different afternoon.
 */
export function sameTeam(ledgerName: string, espnNames: string[]): boolean {
  const l = norm(ledgerName);
  if (!l) return false;
  const cands = espnNames.map(norm);
  return cands.some((c) => c === l) || cands.some((c) => c.startsWith(l + " "));
}
