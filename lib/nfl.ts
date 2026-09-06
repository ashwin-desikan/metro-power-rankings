import "server-only";
// NFL team-pages data layer.
// Source: public/data/nfl/*.json, emitted by scripts/build-nfl-data.py from
// NFL_all.xlsx (canonical schema documented in the workbook's Claude Notes
// sheet). Server-only — uses fs.readFileSync.

import { existsSync, readFileSync } from "fs";
import { join } from "path";

// ---------- Types ----------

export type Franchise = {
  slug: string;
  name: string;
  canonical: string;
  city: string;
  team: string;
  league: "NFL";
  conf: string;
  division: string;
  stadium: string;
  stadium_city: string;
  metro: string;
  metro_slug: string | null;
  state: string;
  founding_year: number | null;
  prior_cities: string[];
  wikipedia_url?: string | null;
  wikidata_qid?: string | null;
  championships: number;
  division_titles: number;
  playoff_appearances: number;
  all_time_w: number;
  all_time_l: number;
  all_time_t: number;
  win_pct: number;
  playoff_w: number;
  playoff_l: number;
  playoff_t: number;
  playoff_win_pct: number;
  conf_finals_app: number;
  conf_finals_wins: number;
  seasons: number;
  seasons_500_plus: number;
  last_championship: number | null;
  reg_games: number;
  play_games: number;
  total_games: number;
};

export type Championship = {
  year: number;
  era: "pre_sb" | "sb";
  league?: string;
  record?: string;
  season_city?: string;
  season_team?: string;
  stolen?: boolean;
  stolen_note?: string;
};

export type ChampionshipAppearance = {
  year: number;
  era: "pre_sb" | "sb";
  league?: string;
  is_winner: boolean;
  record?: string;
  season_city?: string;
  season_team?: string;
};

export type StadiumEra = {
  era_name: string;
  first_year: number | null;
  last_year: number | null;
};

export type StadiumBuilding = {
  canonical: string;
  city: string;
  metro: string;
  state: string;
  first_year: number | null;
  last_year: number | null;
  eras: StadiumEra[];
};

export type AwardWinner = {
  year: number;
  player: string;
  position: string;
};

export type HallOfFamer = {
  year: number;
  player: string;
  category: string;
  position: string;
};

export type Season = {
  year: number;
  league: string;
  city: string;
  team: string;
  w: number; l: number; t: number; win_pct: number;
  pf: number; pa: number;
  division: string; place: string;
  playoff: boolean;
  div_title: boolean;
  conf_final: boolean;
  champ_app: boolean;
  champ: boolean;
  stolen?: boolean;  // editorial: title won then revoked (1925 Pottsville Maroons)
};

export type TopGameTeamRow = {
  year: number;
  date: string | null;
  week: number | null;
  round: string;
  team_city: string;
  team: string;
  team_canonical: string;
  opp_city: string;
  opp_team: string;
  opp_canonical: string;
  pf: number;
  pa: number;
  result: "W" | "L" | "T" | "";
  ot: boolean;
  stadium: string;
  is_home: boolean;
  du: number;
  // Resolved at render time via lookupStadiumLocation. Optional so the
  // ETL output stays unchanged; null/undefined means we could not match
  // the stadium name (e.g. neutral-site Rose Bowl pre-extras-map).
  stadium_city?: string | null;
  stadium_state?: string | null;
  // Slug of the opponent franchise if it is one of the 32 current
  // active franchises. Null for any historical/defunct opponent so
  // the renderer can fall back to plain text.
  opp_slug?: string | null;
};

export type TopGameLeagueRow = {
  year: number;
  date: string | null;
  week: number | null;
  round: string;
  winner_city: string;
  winner_team: string;
  winner_canonical: string;
  loser_city: string;
  loser_team: string;
  loser_canonical: string;
  winner_score: number;
  loser_score: number;
  ot: boolean;
  is_tie: boolean;
  stadium: string;
  du: number;
  // Resolved via lookupStadiumLocation; optional so the ETL output is
  // unchanged. Server-side pages enrich these before passing rows to
  // the client TopGamesTable component.
  stadium_city?: string | null;
  stadium_state?: string | null;
  // Slugs of the winner and loser, but ONLY when they map to a
  // currently active franchise. Null for defunct/historical entries
  // so the renderer falls back to plain text rather than a dead link.
  winner_slug?: string | null;
  loser_slug?: string | null;
};

export type HistoricalFranchise = {
  canonical: string;
  name: string;
  // Approved public display name for the defunct franchise (e.g. "Canton
  // Bulldogs" rather than the terse workbook short name "Bulldogs (Canton)").
  // Set in the ETL via DEFUNCT_DISPLAY_NAMES; prefer it at render points.
  display_name?: string;
  metro?: string;
  metro_slug?: string | null;
  city: string;
  team_historical: string;
  league: string;
  seasons: number;
  // Active range, derived in the ETL from the per-team Year-by-Year rows.
  // null when no season data is present (rare).
  first_year: number | null;
  last_year: number | null;
  w: number; l: number; t: number; win_pct: number;
  championships: number;
  // 1 if this franchise has any stolen-title entry in historical-championships
  // (currently only Bulldogs (Boston) 1925). Used as the secondary sort key
  // so a stolen-title row lifts into the champions tier.
  stolen_championships: number;
};

// ---------- Loaders (memoized) ----------

let _franchises: Franchise[] | null = null;
let _bySlug: Map<string, Franchise> | null = null;
let _byCanonical: Map<string, Franchise> | null = null;
let _championships: Record<string, Championship[]> | null = null;
let _champAppearances: Record<string, ChampionshipAppearance[]> | null = null;
let _stadiumHistory: Record<string, StadiumBuilding[]> | null = null;
let _awards: Record<string, Record<string, AwardWinner[]>> | null = null;
let _hof: Record<string, HallOfFamer[]> | null = null;
let _seasons: Record<string, Season[]> | null = null;
let _historical: HistoricalFranchise[] | null = null;
let _historicalChamps: Record<string, Championship[]> | null = null;
let _historicalSeasons: Record<string, Season[]> | null = null;
let _proBowlCounts: Record<string, number> | null = null;
let _topGamesByTeam: Record<string, TopGameTeamRow[]> | null = null;
let _topGamesAllTime: TopGameLeagueRow[] | null = null;
let _topGamesByDecade: Record<string, TopGameLeagueRow[]> | null = null;
let _topGamesByYear: Record<string, TopGameLeagueRow[]> | null = null;

function read<T>(filename: string): T {
  const path = join(process.cwd(), "public", "data", "nfl", filename);
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

export function getAllFranchises(): Franchise[] {
  if (!_franchises) _franchises = read<Franchise[]>("franchises.json");
  return _franchises;
}

function indices() {
  if (_bySlug && _byCanonical) return { bySlug: _bySlug, byCanonical: _byCanonical };
  const bySlug = new Map<string, Franchise>();
  const byCanonical = new Map<string, Franchise>();
  for (const f of getAllFranchises()) {
    bySlug.set(f.slug, f);
    byCanonical.set(f.canonical, f);
  }
  _bySlug = bySlug;
  _byCanonical = byCanonical;
  return { bySlug, byCanonical };
}

export function getFranchiseBySlug(slug: string): Franchise | undefined {
  return indices().bySlug.get(slug);
}

export function getAllFranchiseSlugs(): string[] {
  return getAllFranchises().map(f => f.slug);
}

// Lookup table built once from franchises.json. The metro-side team data
// labels teams with their full "Kansas City Chiefs" name, so this maps that
// directly to the team-page slug.
let _byFullName: Map<string, string> | null = null;
export function getNflSlugByTeamName(teamFullName: string): string | undefined {
  if (!_byFullName) {
    _byFullName = new Map();
    for (const f of getAllFranchises()) {
      _byFullName.set(f.name, f.slug);
      _byFullName.set(`${f.city} ${f.team}`, f.slug);
    }
  }
  return _byFullName.get(teamFullName);
}

// Returns the full Franchise record for a team-name string, or undefined.
// Used by the metro detail page TeamCard to surface championship and
// win-pct chips for NFL teams alongside the team name.
export function getNflFranchiseByTeamName(teamFullName: string): Franchise | undefined {
  const slug = getNflSlugByTeamName(teamFullName);
  return slug ? indices().bySlug.get(slug) : undefined;
}

export function getChampionships(canonical: string): Championship[] {
  if (!_championships) _championships = read<Record<string, Championship[]>>("championships.json");
  return _championships[canonical] || [];
}

export function getChampionshipAppearances(canonical: string): ChampionshipAppearance[] {
  if (!_champAppearances) _champAppearances = read<Record<string, ChampionshipAppearance[]>>("championship-appearances.json");
  return _champAppearances[canonical] || [];
}

export function getStadiumHistory(canonical: string): StadiumBuilding[] {
  if (!_stadiumHistory) _stadiumHistory = read<Record<string, StadiumBuilding[]>>("stadium-history.json");
  return _stadiumHistory[canonical] || [];
}

export function getAwards(canonical: string): Record<string, AwardWinner[]> {
  if (!_awards) _awards = read<Record<string, Record<string, AwardWinner[]>>>("award-winners.json");
  return _awards[canonical] || {};
}

export function getHallOfFamers(canonical: string): HallOfFamer[] {
  if (!_hof) _hof = read<Record<string, HallOfFamer[]>>("hall-of-fame.json");
  return _hof[canonical] || [];
}

export function getSeasons(slug: string): Season[] {
  if (!_seasons) _seasons = read<Record<string, Season[]>>("seasons-by-team.json");
  return _seasons[slug] || [];
}

export function getTopGamesForTeam(slug: string): TopGameTeamRow[] {
  if (!_topGamesByTeam) _topGamesByTeam = read<Record<string, TopGameTeamRow[]>>("top-games-by-team.json");
  return _topGamesByTeam[slug] || [];
}

export function getTopGamesAllTime(): TopGameLeagueRow[] {
  if (!_topGamesAllTime) _topGamesAllTime = read<TopGameLeagueRow[]>("top-games-all-time.json");
  return _topGamesAllTime;
}

export function getTopGamesByDecade(): Record<string, TopGameLeagueRow[]> {
  if (!_topGamesByDecade) _topGamesByDecade = read<Record<string, TopGameLeagueRow[]>>("top-games-by-decade.json");
  return _topGamesByDecade;
}

/** The ten best games of one season, by Game Score. Empty for a season with
 *  no rateable game: 2026's rows all carry #DIV/0! because the score depends on
 *  pre-game ratings that do not exist until the games are played, so the
 *  builder drops them and the key is simply absent. */
export function getTopGamesForYear(year: number): TopGameLeagueRow[] {
  if (!_topGamesByYear) _topGamesByYear = read<Record<string, TopGameLeagueRow[]>>("top-games-by-year.json");
  return _topGamesByYear[String(year)] ?? [];
}

export function getProBowlCount(canonical: string): number {
  if (!_proBowlCounts) _proBowlCounts = read<Record<string, number>>("pro-bowl-counts.json");
  return _proBowlCounts[canonical] || 0;
}

export function getHistoricalFranchises(): HistoricalFranchise[] {
  if (!_historical) _historical = read<HistoricalFranchise[]>("historical.json");
  return _historical;
}

export function getHistoricalChampionships(): Record<string, Championship[]> {
  if (!_historicalChamps) _historicalChamps = read<Record<string, Championship[]>>("historical-championships.json");
  return _historicalChamps;
}

// Per-defunct-franchise season-by-season records. Keyed on canonical
// name (Year by Year DN). Surfaced on /teams/nfl/historical inside the
// collapsible "+" disclosure next to each franchise row.
export function getHistoricalSeasons(): Record<string, Season[]> {
  if (!_historicalSeasons) _historicalSeasons = read<Record<string, Season[]>>("historical-seasons.json");
  return _historicalSeasons;
}

// ---------- Defunct-franchise routing ----------

// Slugify a defunct franchise's canonical name into a URL-safe token used
// for its detail page at /teams/nfl/{slug}. Lowercase, non-alphanumeric
// runs collapse to single dashes, ends trimmed. If the bare slug would
// collide with one of the 32 active franchise slugs, a "-defunct" token is
// appended so the two never resolve to the same route. The same function is
// used for route params, the page lookup, and the all-time table link, so
// they always agree.
export function defunctSlug(h: HistoricalFranchise): string {
  const base = h.canonical
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const active = indices().bySlug;
  return active.has(base) ? `${base}-defunct` : base;
}

// All defunct slugs (one per historical franchise). Order matches
// getHistoricalFranchises().
export function getHistoricalSlugs(): string[] {
  return getHistoricalFranchises().map(defunctSlug);
}

// Resolve a defunct franchise by its derived slug, or undefined. Built once
// and memoized so repeated lookups (generateMetadata + page render) are cheap.
let _historicalBySlug: Map<string, HistoricalFranchise> | null = null;
export function getHistoricalBySlug(slug: string): HistoricalFranchise | undefined {
  if (!_historicalBySlug) {
    _historicalBySlug = new Map();
    for (const h of getHistoricalFranchises()) {
      _historicalBySlug.set(defunctSlug(h), h);
    }
  }
  return _historicalBySlug.get(slug);
}

// Season-by-season rows for one defunct franchise, keyed by canonical name.
export function getHistoricalSeasonsFor(canonical: string): Season[] {
  return getHistoricalSeasons()[canonical] || [];
}

// Championship rows for one defunct franchise, keyed by canonical name.
export function getHistoricalChampionshipsFor(canonical: string): Championship[] {
  return getHistoricalChampionships()[canonical] || [];
}

// ---------- Display helpers ----------

// Editorial palette per scope memory. Slate for pre-Super Bowl titles
// (1920-1965), warm gold for the Super Bowl era (1966+).
export const TITLE_COLORS = {
  pre_sb: { bg: "#6e8aa6", text: "#0c1320" },
  sb:     { bg: "#d4af37", text: "#1a1408" },
} as const;

// Slug-stable colored monogram used in v1 in place of real logos. Wikimedia
// SVGs replace these once available at public/data/nfl/logos/{slug}.svg.
// Color presets match the mockup.
export const MONOGRAM_BY_SLUG: Record<string, { bg: string; fg: string; mono: string }> = {
  "green-bay-packers":      { bg: "#203731", fg: "#FFB612", mono: "GB" },
  "pittsburgh-steelers":    { bg: "#FFB612", fg: "#000000", mono: "PIT" },
  "new-england-patriots":   { bg: "#002244", fg: "#ffffff", mono: "NE" },
  "dallas-cowboys":         { bg: "#003594", fg: "#ffffff", mono: "DAL" },
  "san-francisco-49ers":    { bg: "#AA0000", fg: "#ffffff", mono: "SF" },
  "new-york-giants":        { bg: "#0B2265", fg: "#ffffff", mono: "NYG" },
  "chicago-bears":          { bg: "#0B162A", fg: "#C83803", mono: "CHI" },
  "washington-commanders":  { bg: "#5A1414", fg: "#FFB612", mono: "WAS" },
  "las-vegas-raiders":      { bg: "#000000", fg: "#A5ACAF", mono: "LV" },
  "denver-broncos":         { bg: "#FB4F14", fg: "#ffffff", mono: "DEN" },
  "kansas-city-chiefs":     { bg: "#E31837", fg: "#ffffff", mono: "KC" },
  "philadelphia-eagles":    { bg: "#004C54", fg: "#ffffff", mono: "PHI" },
  "los-angeles-rams":       { bg: "#003594", fg: "#FFA300", mono: "LAR" },
  "indianapolis-colts":     { bg: "#002C5F", fg: "#ffffff", mono: "IND" },
  "miami-dolphins":         { bg: "#008E97", fg: "#ffffff", mono: "MIA" },
  "baltimore-ravens":       { bg: "#241773", fg: "#9E7C0C", mono: "BAL" },
  "new-orleans-saints":     { bg: "#101820", fg: "#D3BC8D", mono: "NO" },
  "seattle-seahawks":       { bg: "#002244", fg: "#69BE28", mono: "SEA" },
  "tampa-bay-buccaneers":   { bg: "#D50A0A", fg: "#ffffff", mono: "TB" },
  "minnesota-vikings":      { bg: "#4F2683", fg: "#FFC62F", mono: "MIN" },
  "buffalo-bills":          { bg: "#00338D", fg: "#ffffff", mono: "BUF" },
  "cincinnati-bengals":     { bg: "#FB4F14", fg: "#000000", mono: "CIN" },
  "new-york-jets":          { bg: "#125740", fg: "#ffffff", mono: "NYJ" },
  "cleveland-browns":       { bg: "#311D00", fg: "#FF3C00", mono: "CLE" },
  "tennessee-titans":       { bg: "#0C2340", fg: "#4B92DB", mono: "TEN" },
  "atlanta-falcons":        { bg: "#A71930", fg: "#ffffff", mono: "ATL" },
  "arizona-cardinals":      { bg: "#97233F", fg: "#ffffff", mono: "ARI" },
  "los-angeles-chargers":   { bg: "#0080C6", fg: "#FFC20E", mono: "LAC" },
  "detroit-lions":          { bg: "#0076B6", fg: "#B0B7BC", mono: "DET" },
  "jacksonville-jaguars":   { bg: "#006778", fg: "#D7A22A", mono: "JAX" },
  "carolina-panthers":      { bg: "#0085CA", fg: "#ffffff", mono: "CAR" },
};

export function monogramFor(slug: string): { bg: string; fg: string; mono: string } {
  return MONOGRAM_BY_SLUG[slug] || { bg: "#1E1E2E", fg: "#E8E8ED", mono: "NFL" };
}

const LOGO_DIR = join(process.cwd(), "public", "data", "nfl", "logos");

// US state abbreviation map. Used to compress "San Diego, California"
// down to "San Diego, CA" for the stadium subtitle on game-score tables.
// Non-US or unknown states pass through unchanged.
const US_STATE_ABBR: Record<string, string> = {
  "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR",
  "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE",
  "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID",
  "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
  "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
  "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS",
  "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
  "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT",
  "Vermont": "VT", "Virginia": "VA", "Washington": "WA", "West Virginia": "WV",
  "Wisconsin": "WI", "Wyoming": "WY", "District of Columbia": "DC",
};

export function abbreviateState(state: string | null | undefined): string {
  if (!state) return "";
  return US_STATE_ABBR[state] || state;
}

// Stadium locations that never appear in any franchise's stadium-history
// block, typically because they are neutral-site venues (Rose Bowl, etc.)
// that no NFL team ever called home. Lookup falls back to this map when
// the stadium-history index returns nothing.
const EXTRA_STADIUM_LOCATIONS: Record<string, { city: string; state: string }> = {
  "rose bowl": { city: "Pasadena", state: "California" },
  "tulane stadium": { city: "New Orleans", state: "Louisiana" },
  "los angeles memorial coliseum": { city: "Los Angeles", state: "California" },
  "memorial coliseum": { city: "Los Angeles", state: "California" },
  "wembley stadium": { city: "London", state: "England" },
  "tottenham hotspur stadium": { city: "London", state: "England" },
  "estadio azteca": { city: "Mexico City", state: "Mexico" },
  "deutsche bank park": { city: "Frankfurt", state: "Germany" },
  "allianz arena": { city: "Munich", state: "Germany" },
  "neo química arena": { city: "São Paulo", state: "Brazil" },
};

// Built once from stadium-history.json, then reused for every render.
// Keys are lowercased stadium names. Both the canonical building name
// (e.g. "San Diego Stadium") and every era name (e.g. "Qualcomm Stadium",
// "Jack Murphy Stadium") map to the same location. Per-game stadium
// names in top-games-* rows are the contemporaneous era name, so the
// era-keyed entries are what matters here.
let _stadiumIndex: Map<string, { city: string; state: string }> | null = null;

function buildStadiumIndex(): Map<string, { city: string; state: string }> {
  const idx = new Map<string, { city: string; state: string }>();
  const data = getStadiumHistoryRaw();
  for (const buildings of Object.values(data)) {
    for (const b of buildings) {
      if (!b.city) continue;
      const loc = { city: b.city, state: b.state || "" };
      if (b.canonical) {
        const k = b.canonical.toLowerCase();
        if (!idx.has(k)) idx.set(k, loc);
      }
      for (const era of b.eras || []) {
        if (era.era_name) {
          const k = era.era_name.toLowerCase();
          if (!idx.has(k)) idx.set(k, loc);
        }
      }
    }
  }
  return idx;
}

function getStadiumHistoryRaw(): Record<string, StadiumBuilding[]> {
  if (!_stadiumHistory) _stadiumHistory = read<Record<string, StadiumBuilding[]>>("stadium-history.json");
  return _stadiumHistory;
}

export function lookupStadiumLocation(name: string | null | undefined):
  { city: string; state: string } | null {
  if (!name) return null;
  if (!_stadiumIndex) _stadiumIndex = buildStadiumIndex();
  const k = name.toLowerCase();
  return _stadiumIndex.get(k) || EXTRA_STADIUM_LOCATIONS[k] || null;
}

// ---------------------------------------------------------------------------
// Canonical name -> site identity. The Elo spine keys everything on the
// workbook's canonical franchise name; the site keys everything on a slug.
// This is the one bridge, and it covers defunct franchises as well as the 32,
// because /teams/nfl/[slug] serves both.
let _canonMap: Record<string, string> | null = null;
function canonMap(): Record<string, string> {
  if (_canonMap) return _canonMap;
  const m: Record<string, string> = {};
  for (const f of getAllFranchises()) m[f.canonical] = f.slug;
  for (const h of getHistoricalFranchises()) if (!m[h.canonical]) m[h.canonical] = defunctSlug(h);
  _canonMap = m;
  return m;
}

/** The site slug for a workbook canonical name, or null when it has no page. */
export function nflSlugForCanonical(canonical: string): string | null {
  if (!canonical) return null;
  return canonMap()[canonical] ?? null;
}

// ---------------------------------------------------------------------------
// Era name -> site identity.
//
// 🔴 A GAME LOG IS WRITTEN IN THE NAMES OF ITS OWN ERA. "San Diego Chargers"
// beat somebody in 1994 and no franchise is called that today, so the current-
// name lookup returned nothing and the row rendered as plain text with no crest.
// The team has a page; the row just could not find it. Every moved franchise had
// the same problem, and so did every defunct one, whose pages have existed under
// /teams/nfl/[slug] since the historical hub shipped.
//
// Resolution order, most specific first:
//   1. the current full name, for a club that never moved
//   2. the workbook canonical, which is the nickname for the 32 and a
//      disambiguated form ("Bulldogs (Canton)") for the defunct
//   3. nickname plus a city the club used to play in (prior_cities)
//   4. nickname alone, when exactly one franchise in history owns it
// A nickname owned by two franchises with no city match resolves to neither,
// because linking the wrong Bulldogs is worse than linking none.
// 🔴 A RENAME IS NOT DERIVABLE, SO IT IS WRITTEN DOWN. Nickname plus city gets
// a relocated club (San Diego Chargers) and the display names get most of the
// pre-war ones, but a club that changed its NAME where it stood leaves no trace
// either can follow. These eight are the ones the game log actually contains,
// each one a documented continuation of the same franchise:
//
//   Washington/Boston Redskins  the Commanders, renamed 2020, in Boston to 1936
//   Houston Oilers              the Titans, moved 1997 and renamed 1999
//   Portsmouth Spartans         the Lions, moved to Detroit in 1934
//   Chicago/Decatur Staleys     the Bears, renamed 1922
//   Buffalo All-Americans       the Bisons, renamed 1924
//   Racine Legion               the Racine Tornadoes, renamed 1926
//
// The Cleveland Bulldogs are deliberately absent. Whether that club is the
// Canton franchise relocated or a separate one is contested, the workbook takes
// no position, and linking the wrong Bulldogs is worse than linking none.
const ERA_ALIASES: Record<string, string> = {
  "washington|redskins": "washington-commanders",
  "boston|redskins": "washington-commanders",
  "houston|oilers": "tennessee-titans",
  "portsmouth|spartans": "detroit-lions",
  "chicago|staleys": "chicago-bears",
  "decatur|staleys": "chicago-bears",
};
/** Era names that map to a DEFUNCT franchise, by that franchise's canonical. */
const ERA_ALIASES_HISTORICAL: Record<string, string> = {
  "buffalo|all-americans": "Bisons",
  "racine|legion": "Tornadoes",
};

let _eraIndex: {
  byNickCity: Map<string, string>;
  byNick: Map<string, string[]>;
} | null = null;

function eraIndex() {
  if (_eraIndex) return _eraIndex;
  const byNickCity = new Map<string, string>();
  const byNick = new Map<string, string[]>();
  const add = (nick: string | null | undefined, cities: (string | null | undefined)[], slug: string) => {
    if (!nick) return;
    const n = nick.trim().toLowerCase();
    if (!n) return;
    for (const c of cities) {
      // A historical "city" can be a slash-joined move list: "Pottsville/Boston".
      for (const part of String(c ?? "").split("/")) {
        const city = part.trim().toLowerCase();
        if (city) byNickCity.set(`${city}|${n}`, slug);
      }
    }
    const seen = byNick.get(n) ?? [];
    if (!seen.includes(slug)) byNick.set(n, [...seen, slug]);
  };
  for (const f of getAllFranchises()) {
    add(f.team, [f.city, ...(f.prior_cities ?? [])], f.slug);
  }
  for (const h of getHistoricalFranchises()) {
    // The historical rows carry no `team`, so the nickname is the canonical
    // with any "(Qualifier)" or " (D)" stripped: "Bulldogs (Canton)" -> Bulldogs.
    const nick = String(h.canonical ?? "").replace(/\s*\([^)]*\)\s*$/, "").trim();
    add(nick, [h.city], defunctSlug(h));
    // `display_name` is the club as the era wrote it ("Dayton Triangles"),
    // which is exactly the form a game log carries and is often nothing like
    // the workbook's canonical ("Tigers"). Index the last word as the nickname
    // and everything before it as the city.
    const disp = String(h.display_name ?? "").replace(/\s*\([^)]*\)\s*$/, "").trim();
    const parts = disp.split(/\s+/);
    if (parts.length >= 2) {
      add(parts[parts.length - 1], [parts.slice(0, -1).join(" ")], defunctSlug(h));
    }
  }
  for (const [key, canonical] of Object.entries(ERA_ALIASES_HISTORICAL)) {
    const h = getHistoricalFranchises().find((x) => x.canonical === canonical);
    if (h) byNickCity.set(key, defunctSlug(h));
  }
  for (const [key, slug] of Object.entries(ERA_ALIASES)) byNickCity.set(key, slug);
  _eraIndex = { byNickCity, byNick };
  return _eraIndex;
}

/**
 * The site slug for a team as a game log names it, moved and defunct included.
 * Pass the era city and the era nickname, e.g. ("San Diego", "Chargers").
 */
export function nflSlugForEraTeam(
  city: string | null | undefined,
  team: string | null | undefined,
): string | null {
  const nick = (team ?? "").trim();
  if (!nick) return null;
  const full = [city, nick].filter(Boolean).join(" ").trim();
  const current = full ? getNflSlugByTeamName(full) : undefined;
  if (current) return current;
  const canon = nflSlugForCanonical(nick);
  if (canon) return canon;
  const { byNickCity, byNick } = eraIndex();
  const c = (city ?? "").trim().toLowerCase();
  const n = nick.toLowerCase();
  if (c) {
    for (const part of c.split("/")) {
      const hit = byNickCity.get(`${part.trim()}|${n}`);
      if (hit) return hit;
    }
  }
  const owners = byNick.get(n) ?? [];
  return owners.length === 1 ? owners[0] : null;
}

/**
 * A line colour for a team, legible on --bg-card (#12121A).
 *
 * 🔴 NEVER WHITE. The first version scored both stored colours against the card
 * and took whichever contrasted MOST, which is white every single time it is one
 * of the two: 15 of the 31 franchises came out white, including six whose own
 * primary already cleared the floor comfortably (Broncos 5.0, Dolphins 4.3,
 * Panthers 4.2, Chiefs 3.6, Bucs 3.1, Bengals 5.0). Fifteen identical white
 * lines on a chart of club colours is worse than no colours at all.
 *
 * The order is therefore identity first, legibility second:
 *
 *   1. The primary, if it clears 3:1 against the card. Six teams land here that
 *      the old rule threw away.
 *   2. The secondary, if it clears and is not white or near-white. This is what
 *      gives the Packers their gold and the Bears their orange, which is right:
 *      both are real club colours and both are the one that reads on black.
 *   3. Otherwise the primary, lightened along its own hue until it clears. A
 *      lifted Cowboys navy is still a Cowboys blue; white is nobody's.
 *
 * 3:1 is the non-text contrast floor. A franchise with no stored colour at all
 * still returns null: inventing a club colour is worse than not having one.
 */
const CARD_L = 0.012; // approximate relative luminance of --bg-card
const MIN_CONTRAST = 3;

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function rgbOf(hex: string): [number, number, number] | null {
  const h = hex.replace("#", "");
  if (h.length !== 6) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}
function luminance(hex: string): number {
  const rgb = rgbOf(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(hex: string): number {
  const l = luminance(hex);
  return (Math.max(l, CARD_L) + 0.05) / (Math.min(l, CARD_L) + 0.05);
}

function toHsl(hex: string): { h: number; s: number; l: number } | null {
  const rgb = rgbOf(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}
function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(Math.min(Math.max(v, 0), 1) * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Lift a colour along its own hue until it clears the contrast floor. */
function liftToContrast(hex: string): string | null {
  const hsl = toHsl(hex);
  if (!hsl) return null;
  // A pure black primary (the Raiders) has no hue to lift, so it stays a
  // neutral rather than becoming an arbitrary grey pretending to be a colour.
  if (hsl.s < 0.05) return null;
  for (let l = hsl.l; l <= 0.9; l += 0.02) {
    const c = hslToHex(hsl.h, Math.max(hsl.s, 0.45), l);
    if (contrast(c) >= MIN_CONTRAST) return c;
  }
  return null;
}

const NEAR_WHITE = 0.75; // luminance above which a colour is "white enough"

export function nflLineColor(slug: string | null): string | null {
  if (!slug) return null;
  const m = MONOGRAM_BY_SLUG[slug];
  if (!m) return null;
  const valid = (c: string) => /^#[0-9a-f]{6}$/i.test(c);
  const primary = valid(m.bg) ? m.bg : null;
  const secondary = valid(m.fg) ? m.fg : null;

  if (primary && contrast(primary) >= MIN_CONTRAST) return primary;
  if (secondary && luminance(secondary) < NEAR_WHITE && contrast(secondary) >= MIN_CONTRAST) {
    return secondary;
  }
  if (primary) {
    const lifted = liftToContrast(primary);
    if (lifted) return lifted;
  }
  if (secondary && contrast(secondary) >= MIN_CONTRAST) return secondary;
  return null;
}

export function getFranchiseByCanonical(canonical: string): Franchise | undefined {
  return indices().byCanonical.get(canonical);
}

// Server-only enrichment: attaches `winner_slug`/`loser_slug` (league
// game rows) or `opp_slug` (per-team rows) to each row when the canonical
// maps to a currently active franchise. Defunct/historical opponents are
// intentionally left null so the client renderer doesn't link to a 404.
export function withTeamSlugs<T extends Record<string, unknown>>(rows: T[]): T[] {
  const { byCanonical } = indices();
  // 🔴 DEFUNCT AND MOVED CLUBS GET LINKS NOW. This used to resolve only the 32
  // active franchises, on the stated reasoning that a defunct opponent would
  // link to a 404. That stopped being true when /teams/nfl/[slug] started
  // serving all 78, so the rule was quietly costing every pre-war game row its
  // link and its crest. `nflSlugForEraTeam` covers both, and still returns null
  // where a nickname is genuinely ambiguous.
  const resolve = (canonical: unknown, city: unknown, team: unknown): string | null => {
    if (typeof canonical === "string") {
      const active = byCanonical.get(canonical)?.slug;
      if (active) return active;
      const canon = nflSlugForCanonical(canonical);
      if (canon) return canon;
    }
    return nflSlugForEraTeam(
      typeof city === "string" ? city : null,
      typeof team === "string" ? team : null,
    );
  };
  return rows.map((r) => {
    const out: Record<string, unknown> = { ...r };
    if ("winner_canonical" in r || "winner_team" in r) {
      out.winner_slug = resolve(r.winner_canonical, r.winner_city, r.winner_team);
    }
    if ("loser_canonical" in r || "loser_team" in r) {
      out.loser_slug = resolve(r.loser_canonical, r.loser_city, r.loser_team);
    }
    if ("opp_canonical" in r || "opp_team" in r) {
      out.opp_slug = resolve(r.opp_canonical, r.opp_city, r.opp_team);
    }
    return out as T;
  });
}

// Mutating helper for server pages: enriches every game row with
// resolved stadium_city / stadium_state. Returns a NEW array; callers
// can pass the result straight into the client TopGamesTable.
export function withStadiumLocations<T extends { stadium: string }>(rows: T[]): T[] {
  return rows.map((g) => {
    const loc = lookupStadiumLocation(g.stadium);
    return loc
      ? { ...g, stadium_city: loc.city, stadium_state: loc.state }
      : { ...g, stadium_city: null, stadium_state: null };
  });
}

export function logoUrlFor(slug: string): string | null {
  const svgPath = join(LOGO_DIR, `${slug}.svg`);
  if (existsSync(svgPath)) return `/data/nfl/logos/${slug}.svg`;
  const pngPath = join(LOGO_DIR, `${slug}.png`);
  if (existsSync(pngPath)) return `/data/nfl/logos/${slug}.png`;
  return null;
}
