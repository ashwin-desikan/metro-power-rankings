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
// within the revalidate window and never costs a Vercel build. Sizes measured
// 2026-09-13 for a four-day range: eng.1 107 KB, NFL 168 KB, college football
// (groups=80, the FBS slate) 1.43 MB, all under Next's 2 MB data-cache limit;
// the results window never spans two Saturdays, so college football stays there.
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

async function feed(f: (typeof FEEDS)[number], from: string, to: string): Promise<EspnFinal[]> {
  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/${f.path}/scoreboard?dates=${from}-${to}${f.extra}`,
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
  const from = ymd(fromMs);
  const to = ymd(toMs);
  const all = await Promise.all(FEEDS.map((f) => feed(f, from, to)));
  return all.flat();
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
