// Weekly (mid-regular-season) playoff/play-in seeds for the NBA standings table.
//
// The season shard only stores the FINAL playoff seed per team. Showing that
// number on an earlier week would claim a fact that is not yet true, so the
// table withheld seeds entirely until the regular season ended. The owner's
// ruling (Ashwin, 2026-09-19): "record and division-winner rules only; ties
// go to the better final seed; only teams in a playoff or play-in position
// that week get a number, everyone else stays blank." This module is that
// engine: it re-derives the seed order AT A GIVEN WEEK from win percentage
// and (in some eras) division leadership, never from anything the playoffs
// themselves produced (a head-to-head game, a play-in result).
//
// 🔴 THIS IS A SIMPLIFIED MODEL, NOT A REPLAY OF THE NBA RULEBOOK. Real NBA
// tie-breaks used head-to-head record, division record and conference record
// in an order that changed across decades, none of which this dataset
// carries. The owner's ruling papers over that gap with a single tie-break
// (the team's eventual final seed), which is honest about being an
// approximation rather than a reconstruction.

export type SeedRecord = [number, number] | null | undefined;

/** The fields this module needs from a team. `reg` is the FINAL regular
 *  season record (used only for the tie-break below), `seed` the FINAL
 *  playoff seed (used for the tie-break, and to size each conference's
 *  playoff/play-in field). Neither is the AT-WEEK record; that comes from
 *  `recAt`, so a component can pass whatever it has already scrubbed to a
 *  week without this module knowing about weeks at all. */
export type SeedTeam = {
  name: string;
  conf: string | null;
  div: string | null;
  seed: number | null;
  reg: SeedRecord;
};

function pct(r: SeedRecord): number | null {
  if (!r) return null;
  const g = r[0] + r[1];
  return g > 0 ? r[0] / g : null;
}

/**
 * Order key, shared by every era's rule: winning percentage AT THE WEEK,
 * descending, with 0-game teams sorting last (a percentage of nothing is not
 * a fact). Ties: the owner's ruling ("ties go to the better final seed")
 * first; then final regular-season percentage, so two teams who also tie on
 * final seed (both null, i.e. neither made the field) still resolve; then
 * name, so the order is always deterministic and testable.
 */
function cmp<T extends SeedTeam>(a: T, b: T, recAt: (t: T) => SeedRecord): number {
  const pa = pct(recAt(a));
  const pb = pct(recAt(b));
  if (pa == null && pb == null) {
    // fall through to the tie-break below
  } else if (pa == null) {
    return 1;
  } else if (pb == null) {
    return -1;
  } else if (pa !== pb) {
    return pb - pa;
  }
  const sa = a.seed;
  const sb = b.seed;
  if (sa != null && sb != null && sa !== sb) return sa - sb;
  if (sa != null && sb == null) return -1;
  if (sa == null && sb != null) return 1;
  const fa = pct(a.reg);
  const fb = pct(b.reg);
  if (fa == null && fb == null) {
    // fall through to the name tie-break
  } else if (fa == null) {
    return 1;
  } else if (fb == null) {
    return -1;
  } else if (fa !== fb) {
    return fb - fa;
  }
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

function orderByRecord<T extends SeedTeam>(teams: T[], recAt: (t: T) => SeedRecord): T[] {
  return [...teams].sort((a, b) => cmp(a, b, recAt));
}

/** The top team of each division under the shared order key, one per
 *  division. A division with one team is its own leader. */
function divisionLeaders<T extends SeedTeam>(teams: T[], recAt: (t: T) => SeedRecord): T[] {
  const byDiv = new Map<string, T[]>();
  for (const t of teams) {
    const d = t.div ?? "";
    const list = byDiv.get(d);
    if (list) list.push(t);
    else byDiv.set(d, [t]);
  }
  const leaders: T[] = [];
  for (const ts of byDiv.values()) leaders.push(orderByRecord(ts, recAt)[0]);
  return leaders;
}

/** ERA "divTop": the division leaders take the top seeds, ordered among
 *  themselves by the key; everyone else follows, also ordered by the key. */
function orderDivTop<T extends SeedTeam>(teams: T[], recAt: (t: T) => SeedRecord): T[] {
  const leaders = divisionLeaders(teams, recAt);
  const leaderNames = new Set(leaders.map((t) => t.name));
  const rest = teams.filter((t) => !leaderNames.has(t.name));
  return [...orderByRecord(leaders, recAt), ...orderByRecord(rest, recAt)];
}

/** ERA "divTop4": the division leaders plus the single best non-leader form
 *  the top four (or top-however-many-divisions-there-are-plus-one), ordered
 *  among themselves by the key; everyone else follows by the key. */
function orderDivTop4<T extends SeedTeam>(teams: T[], recAt: (t: T) => SeedRecord): T[] {
  const leaders = divisionLeaders(teams, recAt);
  const leaderNames = new Set(leaders.map((t) => t.name));
  const nonLeaders = orderByRecord(
    teams.filter((t) => !leaderNames.has(t.name)),
    recAt,
  );
  const bestNonLeader = nonLeaders[0];
  const topPool = bestNonLeader ? [...leaders, bestNonLeader] : leaders;
  const topNames = new Set(topPool.map((t) => t.name));
  const top = orderByRecord(topPool, recAt);
  const rest = orderByRecord(
    teams.filter((t) => !topNames.has(t.name)),
    recAt,
  );
  return [...top, ...rest];
}

type Rule = "record" | "divTop" | "divTop4";

/**
 * 🔴 THE ERA TABLE. CONFIRMED, NOT ASSUMED, against every stored FINAL seed in
 * public/data/nba/elo/seasons/*.json (2026-09-19): for each season and
 * conference, each of the three rules above was applied to the FINAL regular
 * season record (`reg`) and checked against the FINAL stored `seed`. The
 * ranges below are the ones where a single rule reproduces every
 * season-conference in range, with the exceptions in KNOWN_SEED_MISMATCHES.
 *
 * Result: 152 of 157 season-conferences with at least one final seed
 * reproduce exactly (96.8%); the other 5 are genuine tie-breaks or a
 * play-in-game result that this record-only model cannot see, and are
 * listed below rather than forced.
 *
 *   1947-1970  "record"   conference IS division in this era (one division
 *              per conference on most rosters, or the two are identical in
 *              practice), so "record" and both division rules agree everywhere
 *              they are not a known mismatch.
 *   1973-1977  "record"   two divisions per conference, but the seeds run
 *              straight down the CONFERENCE'S win percentage; division
 *              leadership was not itself a seeding boost yet (a division
 *              runner-up with a better record outranks the other division's
 *              leader, e.g. 1973 East: Knicks, an Atlantic runner-up, seed 2
 *              ahead of Wizards, the Central leader, seed 3).
 *   1978-2006  "divTop"   division leaders guaranteed the top seeds in their
 *              conference (three divisions from 2005), ordered among
 *              themselves by record; everyone else fills in by record.
 *   2007-2015  "divTop4"  the "no worse than 4" reform: division leaders plus
 *              the single best non-leader make the top four, ordered by
 *              record; everyone else fills in by record.
 *              🔴 2016 AND 2017 REPRODUCE UNDER BOTH "divTop4" AND "record", so
 *              the stored seeds cannot place this boundary. It is set from the
 *              rule change itself: from 2015-16 the NBA seeds each conference
 *              by record alone. On a scrubbed week the two rules differ, so
 *              the boundary matters even though the final seeds agree.
 *   2016-       "record"  seeding runs on
 *              conference record alone; division no longer boosts a seed at
 *              all.
 *
 * 1971 and 1972 hand zero final seeds to every team in the shard (an NBA/ABA
 * data gap in this source), so both conferences fall out at the "zero slots"
 * check below regardless of which rule a table like this one would assign
 * them; they are not listed as mismatches because there is nothing to
 * mismatch against.
 */
function eraRule(season: number | undefined): Rule {
  if (season == null) return "record";
  if (season >= 1947 && season <= 1970) return "record";
  if (season >= 1973 && season <= 1977) return "record";
  if (season >= 1978 && season <= 2006) return "divTop";
  if (season >= 2007 && season <= 2015) return "divTop4";
  return "record";
}

/**
 * Season-conferences where NO rule above reproduces the stored final seeds,
 * each a genuine case this record-only, division-only model cannot see
 * (confirmed by inspecting the actual records involved, not assumed).
 */
export const KNOWN_SEED_MISMATCHES: { season: number; conf: string; reason: string }[] = [
  {
    season: 1948,
    conf: "Western",
    reason:
      "The Stags' seed (4th) does not follow from win percentage or division " +
      "standing alone; the workbook's own tie-break (likely head-to-head, not " +
      "carried in this dataset) put them ahead of a team this model ranks equal or better.",
  },
  {
    season: 1956,
    conf: "Eastern",
    reason:
      "The Knicks' seed (4th) is one place off every rule's prediction, the " +
      "same shape as 1948: a tie this simplified key cannot see.",
  },
  {
    season: 1969,
    conf: "Western",
    reason:
      "The Kings and Rockets tie on the inputs available here (record, division, " +
      "final seed), and the workbook resolved it on a criterion (division or " +
      "head-to-head record) this model does not have.",
  },
  {
    season: 1976,
    conf: "Western",
    reason:
      "A four-way scramble (Lakers, Bucks, Suns, Pistons all within a couple of " +
      "games) that neither pure record nor either division rule reproduces; the " +
      "actual seeding mixed criteria (likely division standing plus " +
      "head-to-head) that are not in this dataset.",
  },
  {
    season: 2023,
    conf: "Eastern",
    reason:
      "The Heat (44-38) seeded 8th ABOVE the Hawks (41-41) at 7th: the play-in " +
      "tournament's actual game results, not regular-season record, decided that " +
      "pair, which is exactly what a record-and-division-only model cannot see.",
  },
];

/**
 * The seed EVERY team would hold if the season ended after the games `recAt`
 * reflects, per the owner's ruling: record and division-leader rules only,
 * ties to the better final seed, and a number only for a team inside that
 * conference's playoff/play-in field that week (its size taken from how many
 * teams have a FINAL seed this season, so it is correct in 1960's three-team
 * field and 2021's ten-team one without a hardcoded format table).
 *
 * `season` selects the era rule via eraRule(); pass undefined (no season
 * known) to fall back to "record". `recAt` returns a team's regular-season
 * record AT THE WEEK being shown; the golden test in weeklySeeds.test.ts
 * passes `(t) => t.reg`, i.e. the FINAL record, to check this function
 * against the FINAL stored seeds.
 */
/**
 * Seeds start once EVERY team in the league has played this many games.
 *
 * Ashwin, 2026-09-19: a seed after one or two games is noise ("this isn't the NFL
 * with so many tiebreakers"), and a table where half the league is 1-0 reads as a
 * list of ties. The test is the FEWEST games any team has played, so the seeds
 * switch on for the whole table in one week rather than conference by conference.
 */
export const MIN_GAMES_FOR_SEEDS = 5;

export function seedsAtWeek<T extends SeedTeam>(
  teams: T[],
  season: number | undefined,
  recAt: (t: T) => SeedRecord,
): Map<string, number> {
  const rule = eraRule(season);
  const fewest = teams.reduce((m, t) => {
    const r = recAt(t);
    return Math.min(m, r ? r[0] + r[1] : 0);
  }, Number.POSITIVE_INFINITY);
  if (fewest < MIN_GAMES_FOR_SEEDS) return new Map<string, number>();
  const byConf = new Map<string, T[]>();
  for (const t of teams) {
    const c = t.conf ?? "";
    const list = byConf.get(c);
    if (list) list.push(t);
    else byConf.set(c, [t]);
  }

  const result = new Map<string, number>();
  for (const group of byConf.values()) {
    const slots = group.filter((t) => t.seed != null).length;
    // No team in this conference ever finished with a seed (1971, 1972, an
    // upcoming season): there is no field size to fill, so no one gets a
    // number.
    if (slots === 0) continue;
    // Nobody in this conference has played yet: there is no record to order
    // by, so a week-0 preseason table stays blank rather than leaking the
    // final order through the tie-break.
    const anyGamesPlayed = group.some((t) => pct(recAt(t)) != null);
    if (!anyGamesPlayed) continue;

    const ordered =
      rule === "divTop" ? orderDivTop(group, recAt)
      : rule === "divTop4" ? orderDivTop4(group, recAt)
      : orderByRecord(group, recAt);

    for (let i = 0; i < ordered.length && i < slots; i++) {
      result.set(ordered[i].name, i + 1);
    }
  }
  return result;
}
