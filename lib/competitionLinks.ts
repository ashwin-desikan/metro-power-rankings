// Maps a champions-history competition slug to a richer, dedicated hub page
// where one exists, so the All-Time champions list, metro Championship History
// and country Championship History link to the real tournament hub instead of
// the generic /sports/champions/[comp] honour roll. Competitions with no hub
// (e.g. Mitropa Cup, Latin Cup, the US majors, NCAA, etc.) fall through to the
// honour roll. Client-safe: pure data + a string function, no server imports.

// champions-history compSlug -> absolute hub path.
const COMP_TO_HUB: Record<string, string> = {
  // Club football — Club Football hubs (/teams/football/tournaments/[slug]).
  // NB: the hub slug differs from the champions-history slug in a few cases.
  "champions-league": "/teams/football/tournaments/champions-league",
  "europa-league": "/teams/football/tournaments/europa-league",
  "europa-conference-league": "/teams/football/tournaments/conference-league",
  "cup-winners-cup": "/teams/football/tournaments/cup-winners-cup",
  "inter-cities-fairs-cup": "/teams/football/tournaments/inter-cities-fairs-cup",
  "copa-libertadores": "/teams/football/tournaments/copa-libertadores",
  "club-world-cup": "/teams/football/tournaments/club-world-cup",

  // International football — national-team tournament hubs
  // (/teams/national/tournaments/[slug]).
  "fifa-world-cup": "/teams/national/tournaments/world-cup",
  "uefa-european-championship": "/teams/national/tournaments/euros",
  "copa-am-rica": "/teams/national/tournaments/copa-america",
  "africa-cup-of-nations": "/teams/national/tournaments/afcon",
  "afc-asian-cup": "/teams/national/tournaments/asian-cup",
  "concacaf-championship-gold-cup": "/teams/national/tournaments/gold-cup",
  "ofc-nations-cup": "/teams/national/tournaments/ofc-nations-cup",
};

// Returns the dedicated hub path for a competition if one exists, otherwise the
// generic honour-roll path.
export function competitionHref(compSlug: string): string {
  return COMP_TO_HUB[compSlug] ?? `/sports/champions/${compSlug}`;
}

// True when the competition has a dedicated hub (i.e. competitionHref points
// away from the generic honour roll).
export function competitionHasHub(compSlug: string): boolean {
  return compSlug in COMP_TO_HUB;
}
