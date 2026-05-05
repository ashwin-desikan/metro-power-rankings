// Centralized sport-name display rules. Single source of truth so the
// metro detail page, the map markers, the dropdown filter, and any other
// surface render the same label for the same underlying sport.
//
// The workbook uses two distinct labels for the same sport family:
//   - "Football" in Team List: European football venues + select club rows
//     (148 rows as of 2026-05-05)
//   - "Soccer": injected by scripts/extract.py when merging FootballClub_Data
//     entries into the per-metro teams array (~7,300 rows)
// Both surface to readers as "Football/Soccer" so American readers find
// the global sport and international readers see the familiar local term.
//
// "American Football" is intentionally left untouched. Women's football
// rows ("W Football") become "W Football/Soccer" to keep the prefix.

export function normalizeSport(sport: string | undefined): string {
  if (!sport) return "";
  if (sport === "Soccer") return "Football/Soccer";
  if (sport === "Football") return "Football/Soccer";
  if (sport === "W Football") return "W Football/Soccer";
  return sport;
}

// Convenience: dedupe a list of raw sport names into a sorted list of
// display labels. Used by the map filter dropdown so "Football" and
// "Soccer" collapse to one option.
export function uniqueDisplaySports(rawSports: Iterable<string>): string[] {
  const set = new Set<string>();
  for (const s of rawSports) {
    if (s) set.add(normalizeSport(s));
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}
