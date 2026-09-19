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

/**
 * The three records a season standings row shows, AS THEY STOOD after a
 * scrubbed week. Split out here so it can be tested.
 *
 * The inputs are of two kinds, which is the whole reason this exists. `reg` is a
 * season outcome from NBA.xlsx Year by Year and never moves as the reader
 * scrubs. The weekly `rec` is a CUMULATIVE [wins, losses] that keeps counting
 * through the playoffs, so the 2026 Spurs run 0-0, 3-0, ... 38-17 at week 17 and
 * finish 75-31 while `reg` is 62-20.
 *
 * Until 2026-09-19 the table showed `reg`, `post` and their sum whatever the
 * scrub said, so only the Elo column moved and every record read as the season's
 * final one (Ashwin: "the standings table only displays the final regular
 * season/postseason w-l not the current state of the teams on that week").
 *
 * The rule, per Ashwin 2026-09-19: the weekly cumulative total is the truth, the
 * regular season is whatever of it precedes the playoffs, and the playoff record
 * is the difference. Play-in games ARE postseason (his ruling), so nothing is
 * carved out of the subtraction.
 *   - Inside the regular season: the week's `rec` IS the regular-season record,
 *     and the playoff cell reads blank, not 0-0, which would claim they played
 *     and lost everything.
 *   - Past the regular-season game count: the regular season is fixed at `reg`
 *     and the playoff record is `rec - reg`.
 *
 * ⚠️ KNOWN ONE-GAME DISAGREEMENT, deliberately not hidden. For 8 of 330 played
 * team-seasons the final weekly `rec` and `reg + post` differ by exactly one
 * game, in BOTH directions: the 2026 Spurs' derived playoffs come out 13-11
 * against `post` 13-10, while the 2024 Mavericks come out 13-9 against 13-10. It
 * is not a play-in artefact (the eight are seeds 1 to 6, not 7 to 10), so the
 * cause is an unreconciled difference between the workbook's season totals and
 * the weekly series. The subtraction is applied anyway, because a special case at
 * the final week would make the same column mean two different things depending
 * on where the scrubber sits. Backlog row filed to reconcile the source.
 */
export function recordsAtWeek(
  reg: Record2,
  post: Record2,
  rec: [number, number] | null | undefined,
): { reg: Record2; post: Record2; total: Record2 } {
  const seasonTotal: Record2 =
    reg && post ? [reg[0] + post[0], reg[1] + post[1]] : reg ?? null;
  // No weekly record to scrub to (an upcoming shell, or a season with no weeks):
  // the season row exactly as it renders today.
  if (!rec) return { reg, post, total: seasonTotal };
  // No season regular-season total to measure against: the week's record is all
  // there is, and calling any of it postseason would be a guess.
  if (!reg) return { reg: rec, post: null, total: rec };
  if (rec[0] + rec[1] < reg[0] + reg[1]) return { reg: rec, post: null, total: rec };
  const p: [number, number] = [rec[0] - reg[0], rec[1] - reg[1]];
  // Nothing played beyond the regular season yet: blank, NOT `post`. Falling back
  // to the season's playoff record here was a real bug, caught by the test for the
  // exact-end-of-regular-season week: at rec == reg it printed 13-10 for a team
  // that had not yet played a playoff game.
  //
  // A negative component means the weekly series and the season totals disagree in
  // the other direction (8 of 330 team-seasons, see above). Blank rather than a
  // negative record, and never `post`, so this column means one thing at every
  // week: what the subtraction can actually support.
  if (p[0] < 0 || p[1] < 0 || p[0] + p[1] === 0) return { reg, post: null, total: rec };
  return { reg, post: p, total: rec };
}
