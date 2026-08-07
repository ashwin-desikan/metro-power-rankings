import "server-only";

// Enriches the current-champions list (lib/champions) with deep links: the
// reigning champion's team page where one exists, and the competition's league
// hub. Powers /sports/champions. Server-only: it transitively pulls the
// per-league franchise tables (via teamLinks) and the national-team libs.
// Registered in scripts/check-client-imports.mjs.

import { readFileSync } from "fs";
import { join } from "path";
import { getAllChampionships, type Championship } from "./champions";
import { resolveTeamLink } from "./teamLinks";
import { getAllNationalTeams } from "./international";
import { getAllRlNations } from "./rugbyLeagueIntl";
import { getAllHockeyTeams } from "./hockey";
import { getAllHandballTeams } from "./handball";
import { getAllVolleyballTeams } from "./volleyball";
import { getAllBaseballTeams } from "./baseball";
import { getWcbbTeamForName } from "./wcbb";
import { getWnbaFranchiseByTeamName } from "./wnba";
import { getF1Champions } from "./f1";

export type ChampionRow = Championship & {
  teamHref: string | null;
  // For individual sports with no club crest: the F1 champion's constructor
  // (so the board can show the constructor logo). Null otherwise.
  crestName: string | null;
  leagueHref: string | null;
  leagueLabel: string;
  geo: string;
  region: string;
  gold: boolean;
};

// Gold Standard competitions: the apex trophy that earns a 🥇 on the hub. The
// domestic set mirrors public/data/gold-standard-leagues.json (workbook-driven)
// plus the men's-football Big Five top flights; the continental and
// international apexes are the curated set Ashwin selected. Keep in sync when a
// competition is added to the ledger.
const GOLD_COMPETITIONS = new Set<string>([
  // Domestic apex (workbook Gold Standard + football Big Five)
  "NFL",
  "NBA",
  "NHL",
  "AFL",
  "NRL",
  "Top 14",
  "IPL",
  "SuperLega",
  "Handball-Bundesliga",
  "WNBA",
  "NWSL",
  "WSL",
  "Premier League",
  "La Liga",
  "Serie A",
  "Ligue 1",
  "Bundesliga",
  // Continental and international apex (curated)
  "Champions League",
  "UEFA Women's Champions League",
  "FIFA World Cup",
  "FIFA Women's World Cup",
  "UEFA European Championship",
  "Copa América",
  "Olympic men's basketball",
  "Olympic men's hockey",
  "Rugby World Cup",
  "Cricket World Cup",
  // Baseball apex + individual-sport apexes (2026-06-21)
  "MLB",
  "World Drivers' Championship",
  "Masters Tournament",
  "PGA Championship",
  "US Open Championship",
  "The Open Championship",
  "Australian Open Men's",
  "Australian Open Women's",
  "French Open Men's",
  "French Open Women's",
  "Wimbledon Men's",
  "Wimbledon Women's",
  "US Open Men's",
  "US Open Women's",
  "Summer Olympics Top Medalist",
  "Winter Olympics Top Medalist",
]);

// Geographic footprint of each competition: World, a continent, or a country.
// Independent of our scope grouping (e.g. the FIFA Club World Cup sits in the
// Continental block but is World in reach). Keep in sync when a competition is
// added to the ledger.
const COMP_GEO: Record<string, string> = {
  // International — global
  "World Cup of Hockey": "World",
  "Rugby League World Cup": "World",
  "FIFA World Cup": "World",
  "FIFA Women's World Cup": "World",
  "FIBA World Cup": "World",
  "Cricket World Cup": "World",
  "World Test Championship": "World",
  "Rugby World Cup": "World",
  "Olympic women's football": "World",
  "Olympic men's basketball": "World",
  "Olympic men's handball": "World",
  "Olympic men's volleyball": "World",
  "Olympic men's hockey": "World",
  "IHF World Championship": "World",
  "FIVB World Championship": "World",
  "World Baseball Classic": "World",
  "T20 World Cup": "World",
  "Club World Cup": "World",
  // International / continental — confederation
  "AFC Asian Cup": "Asia",
  "Copa América": "South America",
  "OFC Nations Cup": "Oceania",
  "UEFA European Championship": "Europe",
  "UEFA Women's Championship": "Europe",
  "CONCACAF Championship / Gold Cup": "North America",
  "Africa Cup of Nations": "Africa",
  // Continental club
  "Champions League": "Europe",
  "Europa League": "Europe",
  "Conference League": "Europe",
  "Copa Libertadores": "South America",
  "UEFA Women's Champions League": "Europe",
  EuroLeague: "Europe",
  "Champions Cup": "Europe",
  // Domestic
  "Major League Soccer": "United States",
  NWSL: "United States",
  WNBA: "United States",
  "MLB": "United States",
  "Japan Series": "Japan",
  NRL: "Australia",
  AFL: "Australia",
  NFL: "United States",
  "College Football": "United States",
  CFL: "Canada",
  "Premier League": "England",
  "La Liga": "Spain",
  "Serie A": "Italy",
  Bundesliga: "Germany",
  "Ligue 1": "France",
  Eredivisie: "Netherlands",
  "Primeira Liga": "Portugal",
  "Scottish Premiership": "Scotland",
  WSL: "England",
  "Liga F": "Spain",
  NBA: "United States",
  "NCAA Champions": "United States",
  CBA: "China",
  "NCAA W Champions": "United States",
  NHL: "United States & Canada",
  KHL: "Russia",
  IPL: "India",
  "Top 14": "France",
  "Handball-Bundesliga": "Germany",
  SuperLega: "Italy",
  "Liga MX": "Mexico",
  "Brasileiro Série A": "Brazil",
  "Argentina Primera División": "Argentina",
  "College World Series": "United States",
  "Frozen Four": "United States",
  "PREM Rugby": "England",
  // Continental club / national (newly added competitions)
  "AFC Champions League Elite": "Asia",
  "CAF Champions League": "Africa",
  "CONCACAF Champions Cup": "North America",
  "OFC Champions League": "Oceania",
  "Six Nations Tournament": "Europe",
};

function geoFor(c: Championship): string {
  const hit = COMP_GEO[c.competition];
  if (hit) return hit;
  const comp = c.competition.toLowerCase();
  if (comp.includes("world") || comp.includes("olympic")) return "World";
  if (comp.includes("uefa") || comp.includes("europ")) return "Europe";
  if (c.scope && c.scope.trim()) return c.scope.trim(); // workbook Scope column (England, World, Europe, ...)
  return c.scopeType === "International" ? "World" : "—";
}

// Continent-level region for the hub's Region filter. World stays World; a
// continent passes through; a country folds into its continent. Keep the
// country map in step with the country values used in COMP_GEO above.
const REGION_CONTINENTS = new Set([
  "Africa",
  "Asia",
  "Europe",
  "North America",
  "Oceania",
  "South America",
]);

const COUNTRY_CONTINENT: Record<string, string> = {
  "United States": "North America",
  "United States & Canada": "North America",
  Canada: "North America",
  Mexico: "North America",
  Brazil: "South America",
  Argentina: "South America",
  Japan: "Asia",
  China: "Asia",
  India: "Asia",
  Russia: "Europe",
  Australia: "Oceania",
  England: "Europe",
  Scotland: "Europe",
  Spain: "Europe",
  Italy: "Europe",
  Germany: "Europe",
  France: "Europe",
  Netherlands: "Europe",
  Portugal: "Europe",
  Bangladesh: "Asia",
  "Sri Lanka": "Asia",
  Pakistan: "Asia",
  "United Arab Emirates": "Asia",
  "South Africa": "Africa",
  "New Zealand": "Oceania",
  "West Indies": "North America",
};

function regionFor(geo: string): string {
  if (geo === "World") return "World";
  if (REGION_CONTINENTS.has(geo)) return geo;
  return COUNTRY_CONTINENT[geo] ?? "Other";
}

function norm(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Identity-only nation lists for link resolution.
//
// Rugby, cricket and basketball moved to runtime reads (lib/liveData) so their
// weekly refresh ships without a deploy. Their async getters cannot be used
// here: nationHref is sync, reached from the sync exported getChampionsWithLinks
// and championTeamHref, which lib/championsHistory calls from sync helpers that
// in turn feed app/sitemap.ts. Making that chain async would cascade across the
// whole site for no benefit.
//
// It buys nothing because this resolver needs only slug and name. That is
// identity, not the volatile half: a nation appears or disappears when the
// workbook changes, which requires a build regardless. Records, rankings and
// honours -- the parts the weekly job actually rewrites -- are read at runtime
// by the async getters in those libs. So this stays a deliberate build-time
// read, and scripts/check-live-data.mjs still passes because each path is
// loaded through loadLiveJson in its owning lib.
function identityList(rel: string): NationLike[] {
  try {
    const rows = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", ...rel.split("/")), "utf-8"),
    ) as NationLike[];
    return rows.map((t) => ({ slug: t.slug, name: t.name, cur_name: t.cur_name }));
  } catch {
    return [];
  }
}

type NationLike = { slug: string; name: string; cur_name?: string };
function nationHref(name: string, base: string, list: NationLike[]): string | null {
  const n = norm(name);
  const hit = list.find((t) => norm(t.name) === n || (t.cur_name ? norm(t.cur_name) === n : false));
  return hit ? `${base}/${hit.slug}` : null;
}

// International-scope champions are national teams; route by sport to the
// matching nation portal. Women's international football has no per-nation page
// yet, so those return null (rendered as plain text on the hub).
function intlTeamHref(c: Championship): string | null {
  switch (c.sport) {
    case "Football":
      return nationHref(c.team, "/teams/national", getAllNationalTeams());
    case "Basketball":
      return nationHref(c.team, "/teams/basketball", identityList("basketball/nations.json"));
    case "Cricket":
      return nationHref(c.team, "/teams/cricket", identityList("cricket/teams.json"));
    case "Rugby Union":
      return nationHref(c.team, "/teams/rugby-union", identityList("rugby-union/teams.json"));
    case "Rugby League":
      return nationHref(c.team, "/teams/rugby-league", getAllRlNations());
    case "Hockey":
      return nationHref(c.team, "/teams/hockey", getAllHockeyTeams());
    case "Handball":
      return nationHref(c.team, "/teams/handball", getAllHandballTeams());
    case "Volleyball":
      return nationHref(c.team, "/teams/volleyball", getAllVolleyballTeams());
    case "Baseball":
      return nationHref(c.team, "/teams/baseball", getAllBaseballTeams());
    default:
      return null;
  }
}

// Club / domestic / continental champions. resolveTeamLink handles most
// franchise and club leagues; the two it can't route (WNBA, which collides with
// the bare "Basketball" NBA branch, and women's college basketball) are looked
// up directly.
function clubTeamHref(c: Championship): string | null {
  if (c.competition === "WNBA") {
    const f = getWnbaFranchiseByTeamName(c.team);
    return f ? `/teams/wnba/${f.slug}` : null;
  }
  if (c.sport === "W Basketball") {
    const t = getWcbbTeamForName(c.team);
    return t ? `/teams/cbb-w/${t.slug}` : null;
  }
  const hint = c.competition.includes("NCAA")
    ? "NCAA"
    : c.competition === "College Football"
      ? "CFB"
      : "";
  return resolveTeamLink(c.sport, c.team, hint)?.href ?? null;
}

// Competition -> league hub. Explicit entries for the franchise/club leagues;
// everything else falls back to the sport portal by scope.
const DIRECT_HUB: Record<string, [string, string]> = {
  NFL: ["/teams/nfl", "NFL"],
  "MLB": ["/teams/mlb", "MLB"],
  "Japan Series": ["/teams/baseball/npb", "NPB"],
  NBA: ["/teams/nba", "NBA"],
  WNBA: ["/teams/wnba", "WNBA"],
  NHL: ["/teams/nhl", "NHL"],
  CFL: ["/teams/cfl", "CFL"],
  AFL: ["/teams/afl", "AFL"],
  NRL: ["/teams/nrl", "NRL"],
  IPL: ["/teams/ipl", "IPL"],
  "College Football": ["/teams/cfb", "College Football"],
  "NCAA Champions": ["/teams/cbb", "College Basketball"],
  "NCAA W Champions": ["/teams/cbb-w", "Women's College Basketball"],
  "Top 14": ["/teams/rugby-union/clubs", "Domestic Rugby"],
  "Champions Cup": ["/teams/rugby-union/clubs", "Domestic Rugby"],
};

function leagueHub(c: Championship): { href: string | null; label: string } {
  const direct = DIRECT_HUB[c.competition];
  if (direct) return { href: direct[0], label: direct[1] };

  const intl = c.scopeType === "International";
  switch (c.sport) {
    case "Football":
      return intl
        ? { href: "/teams/national", label: "International Football" }
        : { href: "/teams/football", label: "Club Football" };
    case "W Football":
      return intl
        ? { href: "/teams/wnational", label: "Women's International" }
        : { href: "/teams/wfootball", label: "Women's Club Football" };
    case "Basketball":
      return { href: "/teams/basketball", label: "International Basketball" };
    case "Baseball":
      return { href: "/teams/baseball", label: "International Baseball" };
    case "Cricket":
      return { href: "/teams/cricket", label: "International Cricket" };
    case "Hockey":
      return { href: "/teams/hockey", label: "Ice Hockey" };
    case "Rugby Union":
      return { href: "/teams/rugby-union", label: "Rugby Union" };
    case "Rugby League":
      return { href: "/teams/rugby-league", label: "Rugby League" };
    case "Handball":
      return { href: "/teams/handball", label: "Handball" };
    case "Volleyball":
      return { href: "/teams/volleyball", label: "Volleyball" };
    case "Olympics":
      return { href: "/teams/olympics", label: "Olympics" };
    case "F1":
      return { href: "/teams/f1", label: "Formula 1" };
    case "Golf":
      return { href: "/teams/golf", label: "Golf" };
    case "Tennis":
      return { href: "/teams/tennis", label: "Tennis" };
    default:
      return { href: null, label: c.competition };
  }
}

// The F1 Drivers' champion is an individual; surface the constructor they drove
// for that season so the hub can render the constructor crest.
function f1ConstructorFor(c: Championship): string | null {
  if (c.sport !== "F1") return null;
  const champs = getF1Champions();
  const byYear = champs.find((x) => Number(x.season) === Number(c.year) && x.driver === c.team);
  return (byYear ?? champs.find((x) => x.driver === c.team))?.constructor ?? null;
}

let _rows: ChampionRow[] | null = null;
export function getChampionsWithLinks(): ChampionRow[] {
  if (_rows) return _rows;
  _rows = getAllChampionships().map((c) => {
    const teamHref = c.scopeType === "International" ? intlTeamHref(c) : clubTeamHref(c);
    const hub = leagueHub(c);
    return {
      ...c,
      teamHref,
      leagueHref: hub.href,
      leagueLabel: hub.label,
      geo: geoFor(c),
      region: regionFor(geoFor(c)),
      gold: GOLD_COMPETITIONS.has(c.competition),
      crestName: f1ConstructorFor(c),
    };
  });
  return _rows;
}

// Scope ordering for the hub's grouped layout.
export const SCOPE_ORDER: ChampionRow["scopeType"][] = ["International", "Continental", "Domestic"];

// Resolve a champion's team page from minimal fields, reusing the same intl /
// club routing as the current-champions board. Used by lib/championsHistory to
// link every all-time roll row. Pass the CANONICAL team name (it resolves to
// franchise/national pages); the era name often will not.
export function championTeamHref(row: {
  sport: string;
  team: string;
  competition: string;
  scopeType: string | null;
  year: number | null;
}): string | null {
  const c = row as unknown as Championship;
  return row.scopeType === "International" ? intlTeamHref(c) : clubTeamHref(c);
}
