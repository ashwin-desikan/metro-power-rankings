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

// Emoji icon per sport for team-card meta lines. Women's ("W ...") variants
// reuse the base sport. Returns "" when there is no good match.
const SPORT_ICONS: Record<string, string> = {
  "Basketball": "🏀", "Hockey": "🏒", "Ice Hockey": "🏒", "American Football": "🏈",
  "Canadian Football": "🏈", "Baseball": "⚾", "Football": "⚽", "Soccer": "⚽",
  "Rugby Union": "🏉", "Rugby League": "🏉", "Rugby": "🏉",
  "Aussie Rules": "🦘", "T20 Cricket": "🏏", "Test Cricket": "🏏", "Cricket": "🏏",
  "Volleyball": "🏐", "Auto Racing": "🏎️", "Motor Racing": "🏎️", "Speedway": "🏁",
  "Powerboat Racing": "🚤", "Handball": "🤾", "Golf": "⛳", "Field Hockey": "🏑",
  "Tennis": "🎾", "Table Tennis": "🏓", "Badminton": "🏸",
  "Athletics": "🏃", "Olympics/Athletics": "🏃", "Track & Field": "🏃",
  "Horse Racing": "🐇", "Lacrosse": "🥍", "Combat Sports": "🥊",
  "Wrestling": "🤼", "Sailing": "⛵", "Surfing": "🏄", "Esports": "🎮",
  "Swimming": "🏊", "Cycling": "🚴", "Skiing": "⛷️", "Softball": "🥎",
  "Gymnastics": "🤸", "Water Polo": "🤽", "Olympics": "🏅",
  // No natural emoji; closest-guess (pending review):
  "Netball": "🏐", "Kabaddi": "🤼", "Irish Sports": "☘️",
  "Japanese Sports": "🥋", "Rifle": "🎯", "Hall of Fame": "🏆",
};
export function sportIcon(sport: string | undefined): string {
  if (!sport) return "";
  let s = sport.trim();
  if (s.startsWith("W ")) s = s.slice(2).trim();
  if (s === "Soccer" || s === "Football") return "⚽";
  return SPORT_ICONS[s] ?? "";
}

// Icon for a league code (used by defunct/relocated cards keyed on league).
export function leagueIcon(league: string | undefined): string {
  switch ((league || "").toLowerCase()) {
    case "nfl": case "cfl": case "cfb": return "🏈";
    case "nba": case "wnba": return "🏀";
    case "nhl": return "🏒";
    case "mlb": return "⚾";
    case "afl": return "🦘";
    case "nrl": case "rugby-union": return "🏉";
    case "cricket-t20": return "🏏";
    case "football": case "mls": return "⚽";
    default: return "";
  }
}
