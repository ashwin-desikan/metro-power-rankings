// Sort keys for the NBA season standings table.
//
// Split out of SeasonStandings.tsx so they can be TESTED. The component is a
// client component that pulls in SortableBoard; these are four lines of pure
// arithmetic, and the ordering they produce is the kind of thing that looks
// right in a screenshot and is wrong in 1953.

export type Record2 = [number, number] | null | undefined;

/** Regular-season winning percentage, or null when there is no record. */
export function winPct(r: Record2): number | null {
  if (!r) return null;
  const g = r[0] + r[1];
  return g > 0 ? r[0] / g : null;
}

/**
 * 🔴 GROUPING IS NOT AN ORDERING. Sorting by conference or division answers
 * "which group is this team in" and leaves the teams inside each group in
 * whatever order they happened to be, which is not a standings table. Every
 * grouped sort carries the regular-season record as its tie-break, best first.
 * (Ashwin, 2026-09-17.)
 *
 * SortableBoard sorts ONE value per column and flips the whole thing on
 * direction, so the tie-break has to live inside the key. Win percentage is
 * INVERTED and zero-padded for that reason: ascending on
 * "Eastern|Atlantic|0219" puts the best record first inside the group, and
 * clicking again reverses group and record together, which is the coherent
 * reading of "reverse this".
 *
 * PERCENTAGE, NOT WINS: a 1953 team played 70 games and a modern one plays 82,
 * so wins alone ranks eras against each other rather than teams.
 */
export function pctKey(r: Record2): string {
  const p = winPct(r);
  // 9999 sorts last, which is where a team with no record belongs.
  if (p == null) return "9999";
  return String(Math.round((1 - p) * 1000)).padStart(4, "0");
}

/** Conference, then record. */
export function confKey(conf: string | null, reg: Record2): string {
  return `${conf ?? "zz"}|${pctKey(reg)}`;
}

/** Conference, then division, then record. */
export function divKey(conf: string | null, div: string | null, reg: Record2): string {
  return `${conf ?? "zz"}|${div ?? "zz"}|${pctKey(reg)}`;
}

/** The NBA Cup final as the standings need it: when it was played, and what it did
 *  to this team's record. */
export type CupFinal = { date: string; result: [number, number] };

/**
 * The three records a season standings row shows, AS THEY STOOD after a scrubbed
 * week. Split out here so it can be tested.
 *
 * `reg` and `post` are season outcomes from NBA.xlsx Year by Year and never move as
 * the reader scrubs. The weekly `rec` is a CUMULATIVE [wins, losses] over EVERY
 * game the team played.
 *
 * Until 2026-09-19 the table showed `reg`, `post` and their sum whatever the scrub
 * said, so only the Elo column moved and every record read as the season's final
 * one (Ashwin: "the standings table only displays the final regular
 * season/postseason w-l not the current state of the teams on that week").
 *
 * 🔴 THE NBA CUP FINAL IS IN `rec` AND IN NEITHER SEASON COLUMN. Ashwin identified
 * this: the In-Season Tournament final counts toward neither the regular season nor
 * the playoffs in the workbook, so for the two finalists `rec` carries one extra
 * game. It is why a naive `rec - reg` inflated their playoff record. Confirmed
 * against the data: the six teams it explains are exactly the three finals in
 * public/data/nba/cup-finals.json (2024 Lakers beat Pacers, 2025 Bucks beat
 * Thunder, 2026 Knicks beat Spurs), each winner a win up and each loser a loss up.
 *
 * His ruling, 2026-09-19: "you can consider the final a playoff game for the
 * standings tracking purposes... after those dates you would show the regular
 * season totals as expected and the extra cup final games in the playoffs section".
 * So the Cup date does the work an inferred residual used to:
 *   - Before the Cup final (or for a team that never played one): the week's `rec`
 *     IS the running regular-season record, and the playoff cell reads blank, not
 *     0-0, which would claim they played and lost everything.
 *   - From the Cup final until the regular season ends: the regular-season record
 *     is `rec` MINUS the Cup result, and the playoff cell carries the Cup result.
 *   - Once the regular season is complete: the regular column is fixed at `reg` and
 *     the playoff column is `rec - reg`, which includes the Cup game by design.
 *
 * Worked example, the 2026 Spurs (Cup final 2025-12-16, lost): week 8 ending 12-14
 * reads 18-7 with no playoff cell; week 9 ending 12-21 reads 21-7 and 0-1; the
 * final week reads 62-20 and 13-11, being the workbook's 13-10 plus the Cup loss.
 *
 * The 2024 pair that this did NOT explain is now FIXED AT SOURCE (2026-09-19).
 * The Mavericks were a loss down and the Clippers a loss up, which no single extra
 * game can produce, and the cause was the workbook: their first-round series went
 * six games, Dallas 4-2, but the bracket recorded 4-3 and Year by Year carried the
 * resulting 13-10 for Dallas plus an unrelated 2-3 for the Clippers. Corrected in
 * scripts/build-nba-elo.py, which now also reconciles reg + post against the final
 * weekly record on every build so the next one cannot pass unnoticed.
 *
 * The fallback below still stands, because a source can always disagree again: two
 * 1953 team-seasons remain unreconciled and are listed as known there.
 */
export function recordsAtWeek(
  reg: Record2,
  post: Record2,
  rec: [number, number] | null | undefined,
  opts: { weekDate?: string | null; cup?: CupFinal | null } = {},
): { reg: Record2; post: Record2; total: Record2 } {
  const seasonTotal: Record2 =
    reg && post ? [reg[0] + post[0], reg[1] + post[1]] : reg ?? null;
  // No weekly record to scrub to (an upcoming shell, or a season with no weeks):
  // the season row exactly as it renders today.
  if (!rec) return { reg, post, total: seasonTotal };
  // No season regular-season total to measure against: the week's record is all
  // there is, and calling any of it postseason would be a guess.
  if (!reg) return { reg: rec, post: null, total: rec };

  // ISO dates, so a string compare is a date compare. A week whose end date is on
  // or after the final has the Cup game inside it.
  const { weekDate, cup } = opts;
  const cupPlayed = Boolean(cup && weekDate && weekDate >= cup.date);
  const cupRes: [number, number] = cupPlayed && cup ? cup.result : [0, 0];

  const regNow: [number, number] = [rec[0] - cupRes[0], rec[1] - cupRes[1]];
  if (regNow[0] + regNow[1] < reg[0] + reg[1]) {
    return { reg: regNow, post: cupPlayed ? cupRes : null, total: rec };
  }

  const p: [number, number] = [rec[0] - reg[0], rec[1] - reg[1]];
  // Nothing beyond the regular season yet, or a week the split cannot support
  // (2024's unexplained pair): blank rather than 0-0 or a negative record.
  if (p[0] < 0 || p[1] < 0 || p[0] + p[1] === 0) {
    return { reg, post: p[0] < 0 || p[1] < 0 ? post : null, total: rec };
  }
  return { reg, post: p, total: rec };
}

/**
 * The first week by which EVERY team has played its whole regular season, or null
 * when that cannot be told (an upcoming season, a team with no `reg`).
 *
 * The stored `seed` is the final playoff seed, which is only a fact from this week
 * on. The week that closes the regular season usually also holds the first playoff
 * games (2001: week 25 ends 04-22, the season ended 04-18), so the test is "at
 * least the regular-season total", not "exactly".
 */
export function regularSeasonEndWeek(
  teams: { reg?: Record2; weeks: { w: number; rec?: [number, number] | null }[] }[],
): number | null {
  let end: number | null = null;
  for (const t of teams) {
    if (!t.reg) return null;
    const games = t.reg[0] + t.reg[1];
    const hit = t.weeks.find((w) => w.rec && w.rec[0] + w.rec[1] >= games);
    if (!hit) return null;
    if (end == null || hit.w > end) end = hit.w;
  }
  return end;
}
