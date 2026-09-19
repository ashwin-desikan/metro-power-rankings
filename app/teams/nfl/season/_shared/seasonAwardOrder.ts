// The order individual awards render in on a season's honours section.
//
// 🔴 THE TRAP: an order list that copies a label instead of quoting the
// data's own string silently drops that award. The NBA honours section once
// said "MVP" where the sheet says "Most Valuable Player" and every MVP
// vanished with no error. AWARD_ORDER below must be the literal strings
// public/data/nfl/award-winners.json uses, not a paraphrase of them.
export const AWARD_ORDER: readonly string[] = [
  "AP NFL MVP",
  "Super Bowl MVP",
  "AP Offensive Player",
  "AP Defensive Player",
  "AP Offensive Rookie",
  "AP Defensive Rookie",
  "AP Comeback Player",
  "Walter Payton MOY",
  "Bert Bell Award",
  "AP Coach of the Year",
  "AP AFL Coach of the Year",
  "UPI AFL Player",
  "UPI AFL Rookie",
];

/**
 * Orders award entries by AWARD_ORDER. An entry whose `award` label is not in
 * that list is never dropped: it renders after every named award, in the
 * order it first appeared, so an award the sheet adds later still shows up
 * rather than vanishing the way the NBA MVP once did.
 */
export function orderSeasonAwards<T extends { award: string }>(entries: T[]): T[] {
  const rank = (label: string) => {
    const i = AWARD_ORDER.indexOf(label);
    return i === -1 ? AWARD_ORDER.length : i;
  };
  return entries
    .map((entry, index) => ({ entry, index, rank: rank(entry.award) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((x) => x.entry);
}
