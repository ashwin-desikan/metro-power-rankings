// The abbreviation a team carried IN THAT SEASON, for labels on season pages
// (the towers, What is left). MONOGRAM_BY_SLUG in lib/nfl.ts is
// franchise-level, so the 1999 Rams read LAR on a page where every other
// label said they were in St. Louis (Ashwin, 2026-09-09). Keyed on the era
// name the shard carries (city + team), so the franchise slug never decides
// the label. Codes follow what broadcasts and Pro-Football-Reference used at
// the time; the one shared-city era, the Rams and Raiders both in Los Angeles
// 1982 to 1994, keeps RAI for the Raiders so the two never collide. Crests
// stay franchise-level on purpose (there are no era crests on disk); only the
// text changes. Eras not listed fall through to the franchise monogram the
// caller passes, then to the first three letters of the nickname.
//
// Pure module, no "server-only": lib/nfl.ts is server-only and vitest cannot
// import it, and this table has nothing to hide.

const ERA_ABBR: Record<string, string> = {
  "Baltimore Colts": "BAL",
  "Boston Patriots": "BOS",
  "Boston Redskins": "BOS",
  "Boston Braves": "BOS",
  "Chicago Cardinals": "CRD",
  "Chicago Staleys": "CHI",
  "Cleveland Rams": "CLE",
  "Dallas Texans": "DTX",
  "Decatur Staleys": "DEC",
  "Houston Oilers": "HOU",
  "Los Angeles Raiders": "RAI",
  "New York Titans": "NYT",
  "Oakland Raiders": "OAK",
  "Phoenix Cardinals": "PHX",
  "Pittsburgh Pirates": "PIT",
  "Portsmouth Spartans": "POR",
  "San Diego Chargers": "SD",
  "St. Louis Cardinals": "STL",
  "St. Louis Rams": "STL",
  "Tennessee Oilers": "TEN",
  "Washington Football Team": "WAS",
  "Washington Redskins": "WAS",
};

export function eraAbbr(
  city_: string | null | undefined,
  team: string | null | undefined,
  franchiseMono: string | null | undefined,
): string {
  const era = [city_, team].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  if (era && ERA_ABBR[era]) return ERA_ABBR[era];
  if (franchiseMono) return franchiseMono;
  // A defunct club with no franchise code: the city, which is how the 1920s
  // are remembered (POT for the Pottsville Maroons, CAN for the Canton
  // Bulldogs), rather than three letters of a nickname that two clubs shared.
  const city = (city_ ?? "").trim().replace(/[^A-Za-z]/g, "");
  if (city.length >= 3) return city.slice(0, 3).toUpperCase();
  return (team ?? "").trim().slice(0, 3).toUpperCase() || "NFL";
}
