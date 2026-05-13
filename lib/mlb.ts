import "server-only";
// MLB team-pages data layer.
// Source: public/data/mlb/*.json, emitted by scripts/build-mlb-data.py from
// MLB.xlsx (canonical schema documented in the workbook's Claude Notes
// sheet). Server-only — uses fs.readFileSync.

import { existsSync, readFileSync } from "fs";
import { join } from "path";

// ---------- Types ----------

export type Franchise = {
  slug: string;
  name: string;          // just the team mark (e.g., "Yankees")
  display_name: string;  // city + team (e.g., "New York Yankees")
  canonical: string;
  key: string;
  city: string;
  team: string;
  league: string;        // "AL/MLB" / "NL/MLB" / etc.
  conf: string;          // "AL" / "NL" / etc.
  division: string;
  metro: string;
  metro_slug: string | null;
  state: string;
  stadium: string;
  stadium_season_name: string;
  founding_year: number;
  prior_cities: string[];
  championships: number;          // WS titles only
  pre_ws_championships: number;   // pre-1903 cups
  total_championships: number;    // sum
  ws_appearances: number;
  lcs_appearances: number;
  division_titles: number;
  playoff_appearances: number;
  playoff_w: number;
  playoff_l: number;
  all_time_w: number;
  all_time_l: number;
  all_time_t: number;
  win_pct: number;
  seasons: number;
  five_hundred_seasons: number;
  best_rec_seasons: number;
  last_championship_year: number | null;
  last_ws_app: number | null;
  last_lcs_app: number | null;
  last_division_title: number | null;
  last_playoff_app: number | null;
};

export type Championship = {
  year: number;
  era: "pre_ws" | "ws";
  league?: string;
  city?: string;
  team?: string;
};

export type ChampionshipAppearance = {
  year: number;
  era: "pre_ws" | "ws";
  won: boolean;
  city?: string;
  team?: string;
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
  team_at_time: string;
  league: string;
};

export type Season = {
  year: number;
  league: string;
  city: string;
  team: string;
  w: number; l: number; t: number; win_pct: number;
  rs: number; ra: number; run_diff: number;
  division: string; main_div: string; place: string;
  playoff: boolean;
  div_title: boolean;
  best_rec_leag: boolean;
  lcs_app: boolean;
  ws_app: boolean;
  champ: boolean;
  champ_app: boolean;
  oth_chmp_app: boolean;
  oth_chmp: boolean;
  conf_final: boolean;
  tiebreaker?: boolean;   // played in a one-game tiebreaker that year
};

export type TopGameTeamRow = {
  year: number;
  date: string | null;
  round: string;
  game_num: number | null;
  team_city: string;
  team: string;
  team_canonical: string;
  opp_city: string;
  opp_team: string;
  opp_canonical: string;
  rf: number;
  ra: number;
  result: "W" | "L" | "T" | "";
  fin_inn: number | null;
  extra_innings: boolean;
  stadium: string;                 // the name the venue went by that season
  stadium_canonical?: string;      // current canonical (for cross-reference / hovers)
  stadium_city?: string;
  stadium_state?: string;
  is_home: boolean;
  game_score: number;
  opp_slug?: string | null;
};

export type TopGameLeagueRow = {
  year: number;
  date: string | null;
  round: string;
  game_num: number | null;
  winner_city: string;
  winner_team: string;
  winner_canonical: string;
  loser_city: string;
  loser_team: string;
  loser_canonical: string;
  winner_score: number;
  loser_score: number;
  fin_inn: number | null;
  extra_innings: boolean;
  is_tie: boolean;
  stadium: string;                 // season-name (what the venue was called that year)
  stadium_canonical?: string;
  stadium_city?: string;
  stadium_state?: string;
  game_score: number;
  winner_slug?: string | null;
  loser_slug?: string | null;
};

export type HistoricalFranchise = {
  canonical: string;
  name: string;
  city: string;
  team_historical: string;
  league: string;
  seasons: number;
  first_year: number | null;
  last_year: number | null;
  w: number; l: number; t: number; win_pct: number;
  championships: number;
};

// ---------- Loaders (memoized) ----------

let _franchises: Franchise[] | null = null;
let _bySlug: Map<string, Franchise> | null = null;
let _byCanonical: Map<string, Franchise> | null = null;
let _championships: Record<string, Championship[]> | null = null;
let _champAppearances: Record<string, ChampionshipAppearance[]> | null = null;
let _stadiumHistory: Record<string, StadiumBuilding[]> | null = null;
let _awards: Record<string, Record<string, AwardWinner[]>> | null = null;
let _seasons: Record<string, Season[]> | null = null;
let _historical: HistoricalFranchise[] | null = null;
let _historicalSeasons: Record<string, Season[]> | null = null;
let _topGamesByTeam: Record<string, TopGameTeamRow[]> | null = null;
let _topGamesAllTime: TopGameLeagueRow[] | null = null;
let _topGamesByDecade: Record<string, TopGameLeagueRow[]> | null = null;

function read<T>(filename: string): T {
  const path = join(process.cwd(), "public", "data", "mlb", filename);
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

export function getFranchiseByCanonical(canonical: string): Franchise | undefined {
  return indices().byCanonical.get(canonical);
}

export function getAllFranchiseSlugs(): string[] {
  return getAllFranchises().map(f => f.slug);
}

// Used by the metro-side TeamCard to surface MLB chips next to team names.
let _byFullName: Map<string, string> | null = null;
export function getMlbSlugByTeamName(teamFullName: string): string | undefined {
  if (!_byFullName) {
    _byFullName = new Map();
    for (const f of getAllFranchises()) {
      _byFullName.set(f.name, f.slug);
      _byFullName.set(f.display_name, f.slug);
      _byFullName.set(`${f.city} ${f.team}`, f.slug);
    }
  }
  return _byFullName.get(teamFullName);
}

export function getMlbFranchiseByTeamName(teamFullName: string): Franchise | undefined {
  const slug = getMlbSlugByTeamName(teamFullName);
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

export function getHistoricalFranchises(): HistoricalFranchise[] {
  if (!_historical) _historical = read<HistoricalFranchise[]>("historical.json");
  return _historical;
}

// Per-defunct-franchise season-by-season records. Keyed on canonical name.
// Surfaced on /teams/mlb/historical inside the +/- disclosure next to each
// franchise row.
export function getHistoricalSeasons(): Record<string, Season[]> {
  if (!_historicalSeasons) _historicalSeasons = read<Record<string, Season[]>>("historical-seasons.json");
  return _historicalSeasons;
}

// ---------- Display helpers ----------

// Editorial palette mirroring NFL. Slate/bronze for pre-1903 cup wins
// (Temple Cup, Chronicle-Telegraph, World's Series, NL pennants), warm
// gold for the World Series proper (1903+).
export const TITLE_COLORS = {
  pre_ws: { bg: "#6e8aa6", text: "#0c1320" },
  ws:     { bg: "#d4af37", text: "#1a1408" },
} as const;

// Slug-stable colored monogram for v1. Wikimedia/MLB SVGs replace these
// once available at public/data/mlb/logos/{slug}.svg.
export const MONOGRAM_BY_SLUG: Record<string, { bg: string; fg: string; mono: string }> = {
  "yankees":       { bg: "#003087", fg: "#ffffff", mono: "NYY" },
  "red-sox":       { bg: "#BD3039", fg: "#0C2340", mono: "BOS" },
  "blue-jays":     { bg: "#134A8E", fg: "#ffffff", mono: "TOR" },
  "rays":          { bg: "#092C5C", fg: "#8FBCE6", mono: "TBR" },
  "orioles":       { bg: "#DF4601", fg: "#000000", mono: "BAL" },
  "guardians":     { bg: "#00385D", fg: "#E50022", mono: "CLE" },
  "tigers":        { bg: "#0C2340", fg: "#FA4616", mono: "DET" },
  "white-sox":     { bg: "#27251F", fg: "#C4CED4", mono: "CHW" },
  "twins":         { bg: "#002B5C", fg: "#D31145", mono: "MIN" },
  "royals":        { bg: "#004687", fg: "#BD9B60", mono: "KCR" },
  "astros":        { bg: "#002D62", fg: "#EB6E1F", mono: "HOU" },
  "angels":        { bg: "#BA0021", fg: "#003263", mono: "LAA" },
  "athletics":     { bg: "#003831", fg: "#EFB21E", mono: "ATH" },
  "mariners":      { bg: "#0C2C56", fg: "#005C5C", mono: "SEA" },
  "rangers":       { bg: "#003278", fg: "#C0111F", mono: "TEX" },
  "mets":          { bg: "#002D72", fg: "#FF5910", mono: "NYM" },
  "phillies":      { bg: "#E81828", fg: "#002D72", mono: "PHI" },
  "braves":        { bg: "#13274F", fg: "#CE1141", mono: "ATL" },
  "nationals":     { bg: "#AB0003", fg: "#14225A", mono: "WSH" },
  "marlins":       { bg: "#00A3E0", fg: "#EF3340", mono: "MIA" },
  "cubs":          { bg: "#0E3386", fg: "#CC3433", mono: "CHC" },
  "cardinals":     { bg: "#C41E3A", fg: "#FEDB00", mono: "STL" },
  "reds":          { bg: "#C6011F", fg: "#000000", mono: "CIN" },
  "brewers":       { bg: "#12284B", fg: "#FFC52F", mono: "MIL" },
  "pirates":       { bg: "#27251F", fg: "#FDB827", mono: "PIT" },
  "dodgers":       { bg: "#005A9C", fg: "#EF3E42", mono: "LAD" },
  "giants":        { bg: "#FD5A1E", fg: "#27251F", mono: "SF" },
  "padres":        { bg: "#2F241D", fg: "#FFC425", mono: "SD" },
  "diamondbacks":  { bg: "#A71930", fg: "#E3D4AD", mono: "ARI" },
  "rockies":       { bg: "#33006F", fg: "#C4CED4", mono: "COL" },
};

const DEFAULT_MONO = { bg: "#222", fg: "#fff", mono: "MLB" };

export function monogramFor(slug: string): { bg: string; fg: string; mono: string } {
  return MONOGRAM_BY_SLUG[slug] ?? DEFAULT_MONO;
}

// Logo URL resolver. Mirrors lib/nfl.ts pattern. Set up to read from
// public/data/mlb/logos/{slug}.svg once we ship the fetch script; until
// then returns null so the page falls back to the colored monogram.
export function logoUrlFor(slug: string): string | null {
  const localPath = join(process.cwd(), "public", "data", "mlb", "logos", `${slug}.svg`);
  if (existsSync(localPath)) return `/data/mlb/logos/${slug}.svg`;
  return null;
}

// Pro Football Reference equivalent for MLB: Baseball-Reference. League is
// always MLB so the URL is uniform per year.
export function brefYearUrl(year: number): string {
  return `https://www.baseball-reference.com/leagues/majors/${year}.shtml`;
}

// US state abbreviation helper. Mirrors the NFL helper signature so the
// shared SeasonsByTeamTable can use it identically.
const US_STATE_ABBR: Record<string, string> = {
  "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR",
  "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE",
  "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID",
  "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
  "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
  "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN",
  "Mississippi": "MS", "Missouri": "MO", "Montana": "MT", "Nebraska": "NE",
  "Nevada": "NV", "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM",
  "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH",
  "Oklahoma": "OK", "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI",
  "South Carolina": "SC", "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX",
  "Utah": "UT", "Vermont": "VT", "Virginia": "VA", "Washington": "WA",
  "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY",
  "District of Columbia": "DC",
  "Ontario": "ON", "Quebec": "QC", "British Columbia": "BC", "Alberta": "AB",
};
export function abbreviateState(state: string): string {
  return US_STATE_ABBR[state] || state;
}
