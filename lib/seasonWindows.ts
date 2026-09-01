// Season windows for the Live Standings board (/sports/standings).
//
// WHY THIS EXISTS
// ---------------
// Blocks used to decide "is this league running?" one of two ways, and both
// leaked:
//
//   1. Hardcoded `open: true` (NPB, CFL, AFL, NRL, F1, MLS). These stayed
//      expanded all winter, showing a finished table as though it were live.
//   2. inSeasonFromGames(gamesPlayed, fullSeason), which reads
//      max(games) > 0 && min(games) < fullSeason. The lower bound is the
//      fragile half: a club that finishes on 161 of 162 (a rained-out game
//      never made up, a cancelled fixture, a feed that stops updating one
//      team) leaves min < fullSeason TRUE for the entire offseason, so the
//      board never closes. It cannot self-correct, because nothing will ever
//      increment that team again until next season.
//
// A calendar window fixes the second failure without depending on the feed
// being tidy, and the two together are strictly better than either: the date
// says the league SHOULD be running, the data says it ACTUALLY is.
//
// WINDOWS ARE DELIBERATELY GENEROUS at both ends. A window that is too tight
// closes a board mid-playoffs, which is the worst possible failure; a window
// that is too loose only means an empty board stays open a few extra days,
// and the games check closes it anyway. When in doubt, widen.
//
// All comparisons are UTC. Windows are month/day only, so they repeat yearly
// and need no maintenance unless a league genuinely moves its calendar.

export type SeasonKey =
  | "nfl" | "nba" | "nhl" | "mlb" | "wnba" | "npb"
  | "cfl" | "afl" | "nrl" | "f1" | "mls"
  | "top14" | "premrugby" | "championscup"
  | "euroleague";

export type SeasonWindow = {
  /** [month, day], 1-indexed month. */
  start: [number, number];
  end: [number, number];
  /** true when the window runs across new year (e.g. NFL Sep -> Feb). */
  wraps: boolean;
  note: string;
};

export const SEASON_WINDOWS: Record<SeasonKey, SeasonWindow> = {
  // Gridiron
  nfl: { start: [9, 1], end: [2, 20], wraps: true, note: "Sep kickoff through the Super Bowl (early Feb)" },
  cfl: { start: [6, 1], end: [12, 1], wraps: false, note: "June through the Grey Cup (mid/late Nov)" },
  // Basketball
  nba: { start: [10, 10], end: [6, 30], wraps: true, note: "Oct tip-off through the Finals (June)" },
  wnba: { start: [5, 1], end: [10, 25], wraps: false, note: "May through the Finals (Oct)" },
  // Hockey
  nhl: { start: [10, 1], end: [6, 30], wraps: true, note: "Oct through the Stanley Cup Final (June)" },
  // Baseball
  mlb: { start: [3, 15], end: [11, 10], wraps: false, note: "late Mar through the World Series (early Nov)" },
  npb: { start: [3, 15], end: [11, 20], wraps: false, note: "late Mar through the Japan Series (Nov)" },
  // Southern-hemisphere football codes
  afl: { start: [3, 1], end: [10, 5], wraps: false, note: "Mar through the Grand Final (late Sep)" },
  nrl: { start: [2, 25], end: [10, 12], wraps: false, note: "late Feb through the Grand Final (early Oct)" },
  // Motorsport
  f1: { start: [2, 20], end: [12, 15], wraps: false, note: "testing/Bahrain through Abu Dhabi (early Dec)" },
  // Football
  mls: { start: [2, 15], end: [12, 15], wraps: false, note: "late Feb through MLS Cup (early Dec)" },
  // Club rugby union. All three wrap the new year. Generous at both ends per
  // the note above: the games check is what actually closes these boards.
  top14: { start: [8, 25], end: [7, 10], wraps: true, note: "early Sep through the final (late June)" },
  premrugby: { start: [9, 10], end: [7, 5], wraps: true, note: "late Sep through the final (late June)" },
  // Pool stage only opens in December, but the knockouts run to a late-May
  // final, so the window has to carry the whole back half of the season.
  championscup: { start: [11, 20], end: [6, 10], wraps: true, note: "Dec pool stage through the final (late May)" },
  // Basketball
  euroleague: { start: [9, 15], end: [6, 5], wraps: true, note: "late Sep through the Final Four (late May)" },
};

/** Day-of-year-ish ordinal that ignores leap days: month * 100 + day. */
function ord(month: number, day: number): number {
  return month * 100 + day;
}

/**
 * Is `now` inside the league's calendar window?
 *
 * Wrapping windows (NFL, NBA, NHL) are true when the date is at or after the
 * start OR at or before the end — the two halves live in different years.
 */
export function inSeasonWindow(key: SeasonKey, now: Date = new Date()): boolean {
  const w = SEASON_WINDOWS[key];
  if (!w) return true; // unknown league: never hide it on our account
  const today = ord(now.getUTCMonth() + 1, now.getUTCDate());
  const start = ord(w.start[0], w.start[1]);
  const end = ord(w.end[0], w.end[1]);
  return w.wraps ? today >= start || today <= end : today >= start && today <= end;
}

/**
 * The data half: has the league started, and not yet finished?
 *
 * Kept separate from the window so each can be reasoned about (and tested)
 * alone. `fullSeason` is the scheduled game count per team.
 */
export function inSeasonFromGames(gamesPlayed: number[], fullSeason: number): boolean {
  if (gamesPlayed.length === 0) return false;
  return Math.max(...gamesPlayed) > 0 && Math.min(...gamesPlayed) < fullSeason;
}

/**
 * Both halves. Use this for any league that has per-team game counts.
 *
 * The window is the authority on "the season is over" (it closes a board the
 * games check would leave open forever on a 161-of-162 team); the games check
 * is the authority on "it has actually started" (it keeps a board shut during
 * the dead weeks inside a generous window).
 */
export function isLeagueLive(
  key: SeasonKey,
  gamesPlayed: number[],
  fullSeason: number,
  now: Date = new Date(),
): boolean {
  return inSeasonWindow(key, now) && inSeasonFromGames(gamesPlayed, fullSeason);
}

/**
 * Is a tournament block worth showing at all?
 *
 * For the International Football section, which is not a season but a series
 * of windows: the AFC Asian Cup's fixtures exist in the bundle from the moment
 * the draw is made, so a purely "do we have data" test left it on the board for
 * five months before a ball was kicked. Show it only when it is actually
 * happening, or close enough either side to be the reason someone visited.
 */
export const TOURNAMENT_LOOKAHEAD_DAYS = 14;
export const TOURNAMENT_LOOKBACK_DAYS = 10;

export function tournamentIsCurrent(
  opts: {
    /** any fixture currently in play */
    hasLive: boolean;
    /** ISO kickoff of the soonest unplayed fixture, if any */
    nextKickoff?: string | null;
    /** ISO kickoff of the most recent finished fixture, if any */
    lastFinished?: string | null;
    /** true once a group table shows played games */
    hasPlayedGroupGames?: boolean;
  },
  now: Date = new Date(),
): boolean {
  if (opts.hasLive) return true;
  if (opts.hasPlayedGroupGames) return true;
  const ms = now.getTime();
  const DAY = 86_400_000;
  if (opts.nextKickoff) {
    const t = Date.parse(opts.nextKickoff);
    if (Number.isFinite(t) && t - ms <= TOURNAMENT_LOOKAHEAD_DAYS * DAY && t >= ms - DAY) return true;
  }
  if (opts.lastFinished) {
    const t = Date.parse(opts.lastFinished);
    if (Number.isFinite(t) && ms - t <= TOURNAMENT_LOOKBACK_DAYS * DAY) return true;
  }
  return false;
}
