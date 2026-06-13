// Registry of the domestic league hubs we have built, each mapped to the
// country (or countries) it operates in, keyed by countries.json slug. Used to
// render a "League Hubs" section on each country page. This is a pure data
// module (no fs) so it is safe to import from server OR client components.
//
// Domestic top-flight leagues are mapped to the country/countries they play in.
// The EuroLeague is the one continental club competition included here (by
// request): it is assigned to every country that has a CURRENT EuroLeague team
// (in_team_list in euroleague.json). Add new league hubs to this list as they
// ship.

export type LeagueHub = {
  key: string;
  label: string; // full league name
  short: string; // compact badge label
  icon: string; // sport emoji
  sport: string;
  href: string;
  countrySlugs: string[]; // countries.json slugs where this league operates
};

export const LEAGUE_HUBS: LeagueHub[] = [
  // North America
  { key: "nfl", label: "National Football League", short: "NFL", icon: "🏈", sport: "American Football", href: "/teams/nfl", countrySlugs: ["united-states"] },
  { key: "cfb", label: "College Football (FBS)", short: "CFB", icon: "🏈", sport: "College Football", href: "/teams/cfb", countrySlugs: ["united-states"] },
  { key: "mlb", label: "Major League Baseball", short: "MLB", icon: "⚾", sport: "Baseball", href: "/teams/mlb", countrySlugs: ["united-states", "canada"] },
  { key: "nba", label: "National Basketball Association", short: "NBA", icon: "🏀", sport: "Basketball", href: "/teams/nba", countrySlugs: ["united-states", "canada"] },
  { key: "wnba", label: "WNBA", short: "WNBA", icon: "🏀", sport: "Basketball", href: "/teams/wnba", countrySlugs: ["united-states"] },
  { key: "nhl", label: "National Hockey League", short: "NHL", icon: "🏒", sport: "Ice Hockey", href: "/teams/nhl", countrySlugs: ["united-states", "canada"] },
  { key: "mls", label: "Major League Soccer", short: "MLS", icon: "⚽", sport: "Football", href: "/teams/football/leagues/mls", countrySlugs: ["united-states", "canada"] },
  { key: "cfl", label: "Canadian Football League", short: "CFL", icon: "🏈", sport: "Canadian Football", href: "/teams/cfl", countrySlugs: ["canada"] },
  { key: "nwsl", label: "NWSL", short: "NWSL", icon: "⚽", sport: "Women's Football", href: "/teams/wfootball/leagues/united-states", countrySlugs: ["united-states"] },

  // Oceania
  { key: "afl", label: "Australian Football League", short: "AFL", icon: "🏉", sport: "Australian Rules Football", href: "/teams/afl", countrySlugs: ["australia"] },
  { key: "nrl", label: "National Rugby League", short: "NRL", icon: "🏉", sport: "Rugby League", href: "/teams/nrl", countrySlugs: ["australia", "new-zealand"] },

  // Asia
  { key: "ipl", label: "Indian Premier League", short: "IPL", icon: "🏏", sport: "Cricket", href: "/teams/ipl", countrySlugs: ["india"] },
  { key: "npb", label: "Nippon Professional Baseball", short: "NPB", icon: "⚾", sport: "Baseball", href: "/teams/baseball/npb", countrySlugs: ["japan"] },

  // Europe — men's top flights
  { key: "premier-league", label: "Premier League", short: "EPL", icon: "⚽", sport: "Football", href: "/teams/football/leagues/premier-league", countrySlugs: ["england", "wales"] },
  { key: "scottish-premiership", label: "Scottish Premiership", short: "SPFL", icon: "⚽", sport: "Football", href: "/teams/football/leagues/scottish-premiership", countrySlugs: ["scotland"] },
  { key: "la-liga", label: "La Liga", short: "La Liga", icon: "⚽", sport: "Football", href: "/teams/football/leagues/la-liga", countrySlugs: ["spain"] },
  { key: "serie-a", label: "Serie A", short: "Serie A", icon: "⚽", sport: "Football", href: "/teams/football/leagues/serie-a", countrySlugs: ["italy"] },
  { key: "bundesliga", label: "Bundesliga", short: "BL", icon: "⚽", sport: "Football", href: "/teams/football/leagues/bundesliga", countrySlugs: ["germany"] },
  { key: "ligue-1", label: "Ligue 1", short: "Ligue 1", icon: "⚽", sport: "Football", href: "/teams/football/leagues/ligue-1", countrySlugs: ["france", "monaco"] },
  { key: "eredivisie", label: "Eredivisie", short: "Eredivisie", icon: "⚽", sport: "Football", href: "/teams/football/leagues/eredivisie", countrySlugs: ["netherlands"] },
  { key: "primeira-liga", label: "Primeira Liga", short: "Liga PT", icon: "⚽", sport: "Football", href: "/teams/football/leagues/primeira-liga", countrySlugs: ["portugal"] },

  // Continental club competition — assigned to every country with a current
  // EuroLeague team (euroleague.json in_team_list, 2025-26).
  { key: "euroleague", label: "EuroLeague", short: "EuroLeague", icon: "🏀", sport: "Basketball", href: "/teams/basketball/euroleague", countrySlugs: ["spain", "greece", "turkey", "israel", "italy", "france", "germany", "lithuania", "serbia", "monaco", "united-arab-emirates"] },

  // Europe — women's top flights
  { key: "wsl", label: "Women's Super League", short: "WSL", icon: "⚽", sport: "Women's Football", href: "/teams/wfootball/leagues/england", countrySlugs: ["england"] },
  { key: "liga-f", label: "Liga F", short: "Liga F", icon: "⚽", sport: "Women's Football", href: "/teams/wfootball/leagues/spain", countrySlugs: ["spain"] },

  // Cross-league domestic portals (one hub spanning several countries' leagues),
  // assigned to every country whose domestic competition the portal tracks.
  // Cricket Domestic T20 (/teams/cricket/t20): IPL, BBL, BPL, CPL, T20 Blast,
  // The Hundred, PSL, Super Smash, LPL, SA20, ILT20.
  { key: "t20-leagues", label: "Domestic T20 Leagues", short: "T20", icon: "🏏", sport: "Cricket", href: "/teams/cricket/t20", countrySlugs: ["india", "australia", "bangladesh", "pakistan", "sri-lanka", "south-africa", "new-zealand", "england", "wales", "united-arab-emirates", "jamaica", "barbados", "trinidad-tobago", "guyana", "saint-lucia", "st-kitts-nevis", "antigua-barbuda"] },
  // Club Rugby (/teams/rugby-union/clubs): Champions Cup, Top 14, Premiership,
  // URC, Super Rugby, Currie Cup, Japan League One.
  { key: "rugby-clubs", label: "Club Rugby", short: "Club Rugby", icon: "🏉", sport: "Rugby Union", href: "/teams/rugby-union/clubs", countrySlugs: ["france", "england", "wales", "scotland", "ireland", "italy", "south-africa", "new-zealand", "australia", "fiji", "japan"] },

  // Domestic winners-roll portals for the newer sports (handball, volleyball,
  // domestic basketball/hockey, county cricket, British rugby league).
  { key: "handball-domestic", label: "Handball-Bundesliga", short: "HBL", icon: "🤾", sport: "Handball", href: "/teams/handball/domestic", countrySlugs: ["germany"] },
  { key: "volleyball-domestic", label: "Domestic Volleyball", short: "Volley", icon: "🏐", sport: "Volleyball", href: "/teams/volleyball/domestic", countrySlugs: ["italy", "poland", "japan"] },
  { key: "basketball-domestic", label: "Chinese Basketball Association", short: "CBA", icon: "🏀", sport: "Basketball", href: "/teams/basketball/domestic", countrySlugs: ["china"] },
  { key: "hockey-domestic", label: "KHL (Gagarin Cup)", short: "KHL", icon: "🏒", sport: "Ice Hockey", href: "/teams/hockey/domestic", countrySlugs: ["russia"] },
  { key: "county-championship", label: "County Championship", short: "County", icon: "🏏", sport: "Cricket", href: "/teams/cricket/county", countrySlugs: ["england", "wales"] },
  { key: "rugby-league", label: "Rugby League (Super League)", short: "Super League", icon: "🏉", sport: "Rugby League", href: "/teams/rugby-league/british", countrySlugs: ["england", "france"] },
];

// Per-country display order (most popular league first). Only countries with
// more than one hub need an entry; anything unlisted keeps registry order.
// Editorial best guesses; confirmed with the user for the contested calls
// (US NHL after MLB; Canada NHL/CFL/NBA/MLB/MLS; club rugby first in the
// rugby nations NZ/Wales/South Africa).
const LEAGUE_ORDER: Record<string, string[]> = {
  "united-states": ["nfl", "cfb", "nba", "mlb", "nhl", "mls", "wnba", "nwsl"],
  canada: ["nhl", "cfl", "nba", "mlb", "mls"],
  england: ["premier-league", "wsl", "t20-leagues", "county-championship", "rugby-clubs", "rugby-league"],
  wales: ["rugby-clubs", "premier-league", "t20-leagues", "county-championship"],
  scotland: ["scottish-premiership", "rugby-clubs"],
  australia: ["afl", "nrl", "t20-leagues", "rugby-clubs"],
  "new-zealand": ["rugby-clubs", "nrl", "t20-leagues"],
  india: ["ipl", "t20-leagues"],
  japan: ["npb", "rugby-clubs", "volleyball-domestic"],
  france: ["ligue-1", "rugby-clubs", "euroleague", "rugby-league"],
  spain: ["la-liga", "euroleague", "liga-f"],
  italy: ["serie-a", "volleyball-domestic", "euroleague"],
  germany: ["bundesliga", "handball-domestic", "euroleague"],
  monaco: ["ligue-1", "euroleague"],
  "south-africa": ["rugby-clubs", "t20-leagues"],
  "united-arab-emirates": ["t20-leagues", "euroleague"],
};

// League hubs operating in a given country (by countries.json slug), ordered by
// local popularity (LEAGUE_ORDER) when defined, else by registry order.
export function getLeagueHubsForCountry(slug: string): LeagueHub[] {
  const hubs = LEAGUE_HUBS.filter((h) => h.countrySlugs.includes(slug));
  const order = LEAGUE_ORDER[slug];
  if (!order) return hubs;
  const idx = (k: string) => {
    const i = order.indexOf(k);
    return i === -1 ? order.length : i;
  };
  return [...hubs].sort((a, b) => idx(a.key) - idx(b.key));
}
