// Gold Standard = the apex top-flight competition in each sport. Shared
// between the /sports filter explorer (chip badges, preset gate) and the
// metro page TeamCards (badge next to each team in the metro's roster).
//
// Renamed from 'Crown Jewels' in 2026-05-16's polish round. The 👑 crown
// emoji is reserved elsewhere for the Top Team designation per metro;
// 🥇 marks Gold Standard, 🥈 marks non-Gold Major League.
//
// Sport-scoped so the country-named men's Football leagues (England /
// Spain / Italy / France / Germany == Premier League / La Liga / Serie A
// / Bundesliga / Ligue 1) do not bleed into W Football, where the
// country-named workbook entries are the women's domestic leagues and
// WSL / NWSL are the actual top flight.

export const GOLD_STANDARD_LEAGUES_BY_SPORT: Record<string, ReadonlySet<string>> = {
  "Football":          new Set(["England", "Spain", "Italy", "France", "Germany"]),
  "American Football": new Set(["NFL"]),
  "Baseball":          new Set(["MLB"]),
  "Basketball":        new Set(["NBA"]),
  "Hockey":            new Set(["NHL"]),
  // Canadian Football intentionally omitted: CFL is Major League but does
  // not represent the apex of its sport globally (NFL is the higher tier
  // of gridiron football). Renders with 🥈 silver instead of 🥇 gold.
  "Rugby Union":       new Set(["Top 14"]),
  "W Football":        new Set(["WSL", "NWSL"]),
  "Volleyball":        new Set(["Superlega"]),
  "Rugby League":      new Set(["NRL"]),
  "Aussie Rules":      new Set(["AFL"]),
  "Handball":          new Set(["Handball-Bundesliga"]),
  "W Basketball":      new Set(["WNBA"]),
  "T20 Cricket":       new Set(["IPL"]),
  "Auto Racing":       new Set(["F1"]),
};

export function isGoldStandardLeague(sport: string, league: string): boolean {
  // The workbook stores football as 'Football' in Team List but as 'Soccer'
  // when the FootballClub_Data sheet is merged in scripts/extract.py for
  // metro detail pages. Normalize both to the Football set.
  const s = sport === "Soccer" ? "Football" : sport;
  return GOLD_STANDARD_LEAGUES_BY_SPORT[s]?.has(league) ?? false;
}
