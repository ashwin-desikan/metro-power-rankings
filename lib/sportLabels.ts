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
  // Labels the live standings page uses for its sport groups (liveData.tsx). Added
  // 2026-09-13 so /sports/standings, the three strips and the homepage ticker all
  // resolve an icon from this one map.
  "Gridiron": "🏈", "Motorsport": "🏎️",
  "International Football": "⚽", "Women's Football": "⚽",
  // No natural emoji; closest-guess (pending review):
  "Netball": "🏐", "Kabaddi": "🤼", "Irish Sports": "☘️",
  "Japanese Sports": "🥋", "Rifle": "🎯", "Hall of Fame": "🏆",
};
export function sportIcon(sport: string | undefined): string {
  if (!sport) return "";
  let s = sport.trim();
  if (s.startsWith("W ")) s = s.slice(2).trim();
  if (SPORT_ICONS[s]) return SPORT_ICONS[s];
  // "Women's Rugby Union" and friends fall back to the base sport.
  if (s.startsWith("Women's ")) s = s.slice(8).trim();
  if (s === "Soccer" || s === "Football") return "⚽";
  return SPORT_ICONS[s] ?? "";
}

// Icon for a league code (used by defunct/relocated cards keyed on league).
// Extended 2026-09-24 for the Fan Attention Index's league/group chips and
// League column (app/fans/FanTable.tsx): those pass either a fan-index
// GROUP name ("NFL", "College football", "EuroLeague", "Women's football",
// "Top 14", ...) or, for Football and Women's football, a specific LEAGUE
// display name ("Premier League", "NWSL", ...). Both are handled here so
// the site keeps one sport-icon source of truth rather than a second map.
export function leagueIcon(league: string | undefined): string {
  switch ((league || "").toLowerCase()) {
    case "nfl": case "cfl": case "cfb": case "college football": return "🏈";
    case "nba": case "wnba": case "college basketball": case "euroleague": return "🏀";
    case "nhl": return "🏒";
    case "mlb": case "npb": return "⚾";
    case "afl": return "🦘";
    case "nrl": case "rugby-union": case "rugby union": case "top 14": return "🏉";
    case "cricket-t20": return "🏏";
    case "f1": return "🏎️";
    case "handball-bundesliga": return "🤾";
    case "superlega": return "🏐";
    case "ipl": return "🏏";
    case "football": case "mls": case "women's football":
    case "premier league": case "championship": case "la liga": case "bundesliga":
    case "serie a": case "ligue 1": case "primeira liga": case "eredivisie":
    case "scottish premiership": case "süper lig": case "liga mx":
    case "brasileirão": case "liga profesional": case "nwsl": case "wsl":
      return "⚽";
    default: return "";
  }
}


// ---------------------------------------------------------------------
// Fan Attention Index: sport -> league mapping (app/fans/FanTable.tsx's
// "Build your own" tab, 2026-09-24). One entry per FAN-INDEX LEAGUE string
// exactly as it appears in data/fans/fan-attention.json (checked against
// that file directly, not the group field -- Football and Women's football
// are single GROUPs with many LEAGUEs each, while every other group here
// has exactly one league sharing the group's own name). Every one of the
// dataset's 33 leagues appears in exactly one sport below.
export const FAN_INDEX_SPORTS = [
  "Football", "Gridiron", "Basketball", "Baseball", "Hockey", "Rugby",
  "Aussie rules", "Cricket", "Motorsport", "Handball", "Volleyball",
] as const;
export type FanIndexSport = (typeof FAN_INDEX_SPORTS)[number];

export const FAN_INDEX_SPORT_LEAGUES: Record<FanIndexSport, string[]> = {
  Football: [
    "Premier League", "Championship", "La Liga", "Bundesliga", "Serie A",
    "Ligue 1", "Primeira Liga", "Eredivisie", "Scottish Premiership", "Süper Lig",
    "MLS", "Liga MX", "Brasileirão", "Liga Profesional", "NWSL", "WSL",
  ],
  Gridiron: ["NFL", "College football", "CFL"],
  Basketball: ["NBA", "WNBA", "College basketball", "EuroLeague"],
  Baseball: ["MLB", "NPB"],
  Hockey: ["NHL"],
  Rugby: ["Top 14", "NRL"],
  "Aussie rules": ["AFL"],
  Cricket: ["IPL"],
  Motorsport: ["F1"],
  Handball: ["Handball-Bundesliga"],
  Volleyball: ["SuperLega"],
};

// Which sport a given fan-index league belongs to, the inverse of
// FAN_INDEX_SPORT_LEAGUES above, built from it so the two can never drift.
export const FAN_INDEX_SPORT_BY_LEAGUE: Record<string, FanIndexSport> = Object.fromEntries(
  FAN_INDEX_SPORTS.flatMap((sport) => FAN_INDEX_SPORT_LEAGUES[sport].map((league) => [league, sport])),
);

// Icon for a sport chip: reuses leagueIcon() on that sport's first league,
// so the Build-your-own sport row can never show an icon that disagrees
// with the League column's own icon for the same league -- one source of
// truth (leagueIcon's switch above), not a second emoji table to keep in
// sync by hand.
export function fanIndexSportIcon(sport: FanIndexSport): string {
  const first = FAN_INDEX_SPORT_LEAGUES[sport]?.[0];
  return first ? leagueIcon(first) : "";
}
