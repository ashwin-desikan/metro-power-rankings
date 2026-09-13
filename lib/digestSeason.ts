import { currentMajorFor, leagueStatusFor, type LeagueStatusTone } from "./leagueStatus";
import { SEASON_WINDOWS, type SeasonKey } from "./seasonWindows";
import { COMPETITIONS, SPORT_GROUPS, GROUP_BY_SLUG, type Competition } from "./sportHubs";

// "What's on" for the top of the digest.
//
// Ashwin, 2026-09-13: "what I'd want isn't so much the live event data that we have on
// live standings. It's more like what sports are in season, which ones are in the
// playoffs, and which ones are coming towards the end of the year ... that's what the
// stories will tend to be about, rather than the individual games happening today."
// And: "in season, it should include any league that has a listing in live standings ...
// whether it has a hub or not."
//
// THREE SOURCES, IN ORDER, AND NO FOURTH:
//   1. lib/leagueStatus, the hand-checked state the nav and /sports already render.
//   2. lib/seasonWindows, the start/end dates the standings board already uses.
//   3. the `months` / `playoffMonths` on the competition itself, for the boards that
//      neither of the other two covers (the KHL, the club rugby leagues, SuperLega).
//
// The order matters: a competition the rest of the site already tracks must read the same
// here, or the digest and the nav will disagree about whether the NFL is on. Writing a
// fresh calendar for everything would have been quicker and would have drifted by
// Christmas.
//
// No fetches, no bundles, no ISR cost. It is arithmetic on today's date.

export type SeasonEntry = {
  /** The competition's own id. Several share a hub, so this is the only unique key. */
  slug: string;
  label: string;
  /** The sport group it sits under, e.g. "Club Football". */
  group: string;
  /** The sport's emoji. Ashwin, 2026-09-13: "always show the icon or emoji for the sport". */
  icon: string;
  /** The hub for this competition. Undefined when we have no page for it. */
  href?: string;
  /** The state, e.g. "Regular Season", "Finals", "In 18 days". */
  state: string;
  tone: LeagueStatusTone;
  /** Days until the season opens. Only set on startingSoon entries. */
  daysAway?: number;
};

export type SeasonSnapshot = {
  /** Actual end-of-season playoff stages: the AFL and NRL finals, a postseason. */
  playoffs: SeasonEntry[];
  /**
   * Season-long knockout competitions, at whatever stage they are at.
   *
   * Ashwin, 2026-09-13, on why this is its own bucket: "that list for football especially
   * gets very long". Moving the six continental cups and the two English cups out of
   * in-season takes club football there from fifteen rows to nine, and groups things a
   * reader thinks of together anyway.
   */
  knockouts: SeasonEntry[];
  inSeason: SeasonEntry[];
  startingSoon: SeasonEntry[];
};

/** Competition slug -> the seasonWindows key, where the two vocabularies overlap. */
const SEASON_KEY: Record<string, SeasonKey> = {
  nfl: "nfl", nba: "nba", nhl: "nhl", mlb: "mlb", wnba: "wnba", npb: "npb",
  cfl: "cfl", afl: "afl", nrl: "nrl", mls: "mls", euroleague: "euroleague",
  "formula-1": "f1", "top-14": "top14", "premiership-rugby": "premrugby",
  "champions-cup": "championscup",
};

/** Days from today (UTC) to the next occurrence of a month/day start. */
function daysUntil(start: [number, number], now: Date): number {
  const [m, d] = start;
  const y = now.getUTCFullYear();
  const today = Date.UTC(y, now.getUTCMonth(), now.getUTCDate());
  let at = Date.UTC(y, m - 1, d);
  if (at < today) at = Date.UTC(y + 1, m - 1, d);
  return Math.round((at - today) / 86_400_000);
}

/** Strip the curated "Live - " prefix; the bucket heading already says it is live. */
function stateLabel(s: string): string {
  return s.replace(/^Live\s*-\s*/i, "");
}

const STARTING_SOON_DAYS = 60;

// Hubs that stand for a whole group of competitions rather than one of them. A curated
// status on these describes the portal, not the individual board (all three club rugby
// leagues point at /teams/rugby-union/clubs), so the competition's own months decide.
const SHARED_HUBS = new Set<string>([
  "/teams/rugby-union/clubs", "/teams/rugby-union", "/teams/cricket",
  "/teams/cricket/t20", "/teams/cricket/county", "/teams/volleyball/domestic",
  "/teams/handball/domestic", "/teams/hockey/domestic", "/teams/basketball/domestic",
  "/teams/national", "/teams/wfootball", "/teams/football",
]);

/**
 * Golf and tennis: the major being played, and how far through it we are.
 *
 * Ashwin, 2026-09-13: "put what round they're in if they do show up." What we honestly
 * have is the tournament's start and end dates, so this says the name plus the closing
 * day, and nothing more. Round-by-round detail is NOT derived from the date: a slam's
 * draw halves play on different days and rain moves everything, so "quarter-finals on day
 * 10" would be a guess dressed as a fact. A golf major is the one exception, because a
 * 72-hole stroke-play major really is one round a day from a fixed Thursday.
 */
function majorState(c: Competition, at: number): string | null {
  if (c.slug !== "tennis-slams" && c.slug !== "golf-majors") return null;
  const major = currentMajorFor(c.href, at);
  if (!major) return null;
  const DAY = 86_400_000;
  // `end` is 23:59:59 on the last day, so the span is a whisker under a whole number of
  // days: floor, not round, or a 15-day slam reads as 16 and the final day reads as a
  // semi-final. Caught on 2026-09-13, the day of the US Open final.
  const day = Math.floor((at - major.start) / DAY) + 1;
  const total = Math.floor((major.end - major.start) / DAY) + 1;
  if (c.slug === "golf-majors") {
    const round = Math.min(Math.max(day, 1), 4);
    return `${major.label}, R${round}`;
  }
  if (day >= total) return `${major.label}, final`;
  if (day >= total - 2) return `${major.label}, semi-finals`;
  return major.label;
}

/** Source 2 and 3: the state for a competition leagueStatus knows nothing about. */
function fallbackState(c: Competition, now: Date): { state: string; tone: LeagueStatusTone } | null {
  const month = now.getUTCMonth() + 1;
  // A named stage beats both of the coarser answers: "League phase" says more than
  // "In season", and for a knockout competition it is the whole point of the row.
  const stage = c.stages?.find((st) => st.months.includes(month));
  if (stage) {
    return { state: stage.label, tone: c.playoffMonths?.includes(month) ? "playoffs" : "regular" };
  }
  if (c.playoffMonths?.includes(month)) return { state: "Playoffs", tone: "playoffs" };
  if (c.months?.includes(month)) return { state: "In season", tone: "regular" };
  const key = SEASON_KEY[c.slug];
  if (key && SEASON_WINDOWS[key]) {
    const w = SEASON_WINDOWS[key];
    const ord = (m: number, d: number) => m * 100 + d;
    const today = ord(month, now.getUTCDate());
    const start = ord(w.start[0], w.start[1]);
    const end = ord(w.end[0], w.end[1]);
    const on = w.wraps ? today >= start || today <= end : today >= start && today <= end;
    if (on) return { state: "In season", tone: "regular" };
  }
  return null;
}

/** The opening date we can quote for a competition that is currently off. */
function startFor(c: Competition): [number, number] | null {
  if (c.startsOn) return c.startsOn;
  const key = SEASON_KEY[c.slug];
  return key && SEASON_WINDOWS[key] ? SEASON_WINDOWS[key].start : null;
}

export function seasonSnapshot(now: Date = new Date()): SeasonSnapshot {
  const playoffs: SeasonEntry[] = [];
  const knockouts: SeasonEntry[] = [];
  const inSeason: SeasonEntry[] = [];
  const startingSoon: SeasonEntry[] = [];
  const at = now.getTime();

  for (const c of COMPETITIONS) {
    const g = GROUP_BY_SLUG.get(c.group);
    const group = g?.label ?? c.group;
    const icon = g?.icon ?? "";
    // leagueStatus is keyed by hub page, and several competitions share one hub (the
    // three club rugby leagues all point at /teams/rugby-union/clubs), so a curated
    // status is only trusted when the hub is THIS competition's own page.
    const curated = c.href && !SHARED_HUBS.has(c.href) ? leagueStatusFor(c.href, at) : null;
    const resolved = curated && curated.tone !== "offseason"
      ? { state: majorState(c, at) ?? stateLabel(curated.label), tone: curated.tone }
      : fallbackState(c, now);

    if (resolved) {
      const entry: SeasonEntry = { slug: c.slug, label: c.label, group, icon, href: c.href, state: resolved.state, tone: resolved.tone };
      // A knockout competition goes to its own bucket whatever stage it is at: the
      // Champions League league phase is still the Champions League.
      if (c.knockout) knockouts.push(entry);
      else if (resolved.tone === "playoffs") playoffs.push(entry);
      else inSeason.push(entry);
      continue;
    }
    // Off: worth listing only if it opens soon enough to be why a story about it is in
    // the feed. Anything further out is noise on a daily page.
    const start = startFor(c);
    if (!start) continue;
    const away = daysUntil(start, now);
    if (away >= 0 && away <= STARTING_SOON_DAYS) {
      startingSoon.push({
        slug: c.slug, label: c.label, group, icon, href: c.href, tone: "offseason", daysAway: away,
        state: away === 0 ? "Opens today" : `In ${away} days`,
      });
    }
  }

  // COMPETITIONS is already in prominence order, and the group list is too, so the only
  // sort needed is grouping the entries by sport without disturbing either.
  const groupRank = new Map(SPORT_GROUPS.map((g, i) => [g.label, i]));
  const byProminence = (a: SeasonEntry, b: SeasonEntry) =>
    (groupRank.get(a.group) ?? 99) - (groupRank.get(b.group) ?? 99);
  playoffs.sort(byProminence);
  knockouts.sort(byProminence);
  inSeason.sort(byProminence);
  startingSoon.sort((a, b) => (a.daysAway ?? 0) - (b.daysAway ?? 0) || byProminence(a, b));
  return { playoffs, knockouts, inSeason, startingSoon };
}
