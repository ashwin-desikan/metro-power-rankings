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
