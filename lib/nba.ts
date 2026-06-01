import "server-only";
// NBA team-pages data layer.
// Source: public/data/nba/*.json, emitted by scripts/build-nba-data.py
// from NBA.xlsx (canonical schema documented in the workbook's Claude
// Notes sheet). Server-only — uses fs.readFileSync.

import { existsSync, readFileSync } from "fs";
import { join } from "path";

// ---------- Types ----------

export type Franchise = {
  slug: string;
  name: string;
  display_name: string;
  canonical: string;
  city: string;
  team: string;
  league: string;          // "NBA"
  conf: string;            // "Eastern" / "Western"
  division: string;
  metro: string;
  metro_slug: string | null;
  state: string;
  arena: string;
  arena_season_name: string;
  lat: number | null;
  lng: number | null;
  founding_year: number | null;
  prior_cities: string[];
  wikipedia_url?: string | null;
  wikidata_qid?: string | null;
  championships: number;
  championship_appearances: number;
  cf_appearances: number;
  division_titles: number;
  playoff_appearances: number;
  playoff_w: number;
  playoff_l: number;
  all_time_w: number;
  all_time_l: number;
  win_pct: number;
  seasons: number;
  five_hundred_seasons: number;
  best_rec_seasons: number;
  last_championship_year: number | null;
  last_champ_app: number | null;
  last_cf_app: number | null;
  last_division_title: number | null;
  last_playoff_app: number | null;
  all_star_count: number;
  league_history: string;
};

export type ChampionshipEra = "baa" | "nba" | "aba";

export type Championship = {
  year: number;
  era: ChampionshipEra;
  league?: string;
  city?: string;
  team?: string;
};

export type ChampionshipAppearance = {
  year: number;
  era: ChampionshipEra;
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
};

export type AllNbaSelection = {
  year: number;
  player: string;
  tier: "1st" | "2nd" | "3rd";
};

export type Season = {
  year: number;
  league: string;
  city: string;
  team: string;
  w: number;
  l: number;
  win_pct: number;
  pf: number;
  pa: number;
  pf_g: number;
  pa_g: number;
  point_diff: number;
  playoff: boolean;
  div_title: boolean;
  best_conf: boolean;
  best_rec_leag: boolean;
  p_wins: number;
  p_loss: number;
  cf_app: boolean;
  champ_app: boolean;
  champ: boolean;
  playoff_seed: number | null;
  division: string;
  main_div: string;
  place: string;
  home_arena_season: string;
  home_arena_canonical: string;
  num_all_stars: number;
  num_all_nba: number;
};

export type TopGameTeamRow = {
  year: number;
  date: string | null;
  round: string;
  round_num: number | null;
  game_num: number | null;
  team_city: string;
  team_team: string;
  team_canonical: string;
  opp_city: string;
  opp_team: string;
  opp_canonical: string;
  result: "W" | "L" | "" | string;
  team_pts: number;
  opp_pts: number;
  ot: boolean;
  arena_as_of: string;
  arena_canonical: string;
  arena_metro: string;
  arena_state: string;
  league: string;
  game_score: number | null; // null while user finishes the formula
  opp_slug?: string | null;
};

export type TopGameLeagueRow = {
  year: number;
  date: string | null;
  round: string;
  round_num: number | null;
  game_num: number | null;
  winner_canonical: string;
  loser_canonical: string;
  winner_city: string;
  winner_team: string;
  loser_city: string;
  loser_team: string;
  winner_pts: number;
  loser_pts: number;
  ot: boolean;
  arena_as_of: string;
  arena_canonical: string;
  arena_metro: string;
  arena_state: string;
  league: string;
  game_score: number | null;
  winner_slug?: string | null;
  loser_slug?: string | null;
};

export type HistoricalFranchise = {
  slug: string;
  canonical: string;
  display_name: string;
  city_history: string;
  team_history: string;
  league_history: string;
  seasons: number;
  first_year: number | null;
  last_year: number | null;
  championships: number;
  championship_appearances: number;
  cf_appearances: number;
  playoff_appearances: number;
  all_time_w: number;
  all_time_l: number;
  win_pct: number;
  aba_only: boolean;
  leagues: string[];
};

export type PlayoffStateRecord = {
  state:
    | "champion"
    | "lost_finals"
    | "eliminated_cf"
    | "eliminated_semis"
    | "eliminated_qf"
    | "eliminated_play_in"
    | "active_finals"
    | "active_cf"
    | "active_semis"
    | "active_qf"
    | "active_play_in";
  last_round: string;
  year: number;
};

export type PlayoffStateBundle = {
  year: number | null;
  is_postseason_complete: boolean;
  by_franchise: Record<string, PlayoffStateRecord>;
};

// ---------- Loaders (memoized) ----------

let _franchises: Franchise[] | null = null;
let _bySlug: Map<string, Franchise> | null = null;
let _byCanonical: Map<string, Franchise> | null = null;
let _championships: Record<string, Championship[]> | null = null;
let _champAppearances: Record<string, ChampionshipAppearance[]> | null = null;
let _stadiumHistory: Record<string, StadiumBuilding[]> | null = null;
let _awards: Record<string, Record<string, AwardWinner[]>> | null = null;
let _allNba: Record<string, AllNbaSelection[]> | null = null;
let _allStarCounts: Record<string, number> | null = null;
let _seasons: Record<string, Season[]> | null = null;
let _historical: HistoricalFranchise[] | null = null;
let _historicalSeasons: Record<string, Season[]> | null = null;
let _topGamesByTeam: Record<string, TopGameTeamRow[]> | null = null;
let _topGamesAllTime: TopGameLeagueRow[] | null = null;
let _topGamesByDecade: Record<string, TopGameLeagueRow[]> | null = null;
let _playoffState: PlayoffStateBundle | null = null;

function read<T>(filename: string): T {
  const path = join(process.cwd(), "public", "data", "nba", filename);
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

// Metro-side TeamCard hook: surface NBA chips next to team names.
let _byFullName: Map<string, string> | null = null;
export function getNbaSlugByTeamName(teamFullName: string): string | undefined {
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

export function getNbaFranchiseByTeamName(teamFullName: string): Franchise | undefined {
  const slug = getNbaSlugByTeamName(teamFullName);
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

export function getAllNbaSelections(canonical: string): AllNbaSelection[] {
  if (!_allNba) _allNba = read<Record<string, AllNbaSelection[]>>("all-nba-selections.json");
  return _allNba[canonical] || [];
}

export function getAllStarCount(canonical: string): number {
  if (!_allStarCounts) _allStarCounts = read<Record<string, number>>("all-star-counts.json");
  return _allStarCounts[canonical] || 0;
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

export function getHistoricalSeasons(): Record<string, Season[]> {
  if (!_historicalSeasons) _historicalSeasons = read<Record<string, Season[]>>("historical-seasons.json");
  return _historicalSeasons;
}

export function getPlayoffState(): PlayoffStateBundle {
  if (!_playoffState) _playoffState = read<PlayoffStateBundle>("playoff-state.json");
  return _playoffState;
}

export function getPlayoffStateForCanonical(canonical: string): PlayoffStateRecord | null {
  const bundle = getPlayoffState();
  return bundle.by_franchise[canonical] || null;
}

// ---------- Display helpers ----------

// Championship chip palette. Gold for BAA + NBA (continuous league lineage),
// slate for ABA (distinct rival league 1968-76, merged 1976). Matches the
// scope-conversation decision in project_nba_team_pages_v1_scope.md.
export const TITLE_COLORS = {
  aba: { bg: "#6e8aa6", text: "#0c1320" },
  baa: { bg: "#d4af37", text: "#1a1408" },
  nba: { bg: "#d4af37", text: "#1a1408" },
} as const;

export function championshipChipStyle(era: ChampionshipEra) {
  return TITLE_COLORS[era] || TITLE_COLORS.nba;
}

// Playoff-state chip palette. Gold for champion, slate gradient for active
// rounds (light = early round, dark = late round), neutral for eliminated.
export const PLAYOFF_STATE_COLORS: Record<PlayoffStateRecord["state"], { bg: string; text: string; label: string }> = {
  champion:           { bg: "#d4af37", text: "#1a1408", label: "NBA Champion" },
  lost_finals:        { bg: "#a07a30", text: "#fff", label: "Lost Finals" },
  eliminated_cf:      { bg: "#5b5b5b", text: "#fff", label: "Eliminated Conf. Finals" },
  eliminated_semis:   { bg: "#5b5b5b", text: "#fff", label: "Eliminated Semifinals" },
  eliminated_qf:      { bg: "#5b5b5b", text: "#fff", label: "Eliminated First Round" },
  eliminated_play_in: { bg: "#5b5b5b", text: "#fff", label: "Eliminated Play-In" },
  active_finals:      { bg: "#d4af37", text: "#1a1408", label: "In the Finals" },
  active_cf:          { bg: "#3a5a8a", text: "#fff", label: "Conference Finals" },
  active_semis:       { bg: "#5b7aa8", text: "#fff", label: "Conference Semifinals" },
  active_qf:          { bg: "#6e8aa6", text: "#0c1320", label: "First Round" },
  active_play_in:     { bg: "#8aa1bd", text: "#0c1320", label: "Play-In" },
};

// Slug-stable colored monogram. Wikimedia/NBA SVGs replace these once
// available at public/data/nba/logos/{slug}.svg.
export const MONOGRAM_BY_SLUG: Record<string, { bg: string; fg: string; mono: string }> = {
  "celtics":         { bg: "#007A33", fg: "#BA9653", mono: "BOS" },
  "nets":            { bg: "#000000", fg: "#ffffff", mono: "BKN" },
  "knicks":          { bg: "#006BB6", fg: "#F58426", mono: "NYK" },
  "76ers":           { bg: "#006BB6", fg: "#ED174C", mono: "PHI" },
  "raptors":         { bg: "#CE1141", fg: "#000000", mono: "TOR" },
  "bulls":           { bg: "#CE1141", fg: "#000000", mono: "CHI" },
  "cavaliers":       { bg: "#860038", fg: "#FDBB30", mono: "CLE" },
  "pistons":         { bg: "#1d428a", fg: "#C8102E", mono: "DET" },
  "pacers":          { bg: "#002D62", fg: "#FDBB30", mono: "IND" },
  "bucks":           { bg: "#00471B", fg: "#EEE1C6", mono: "MIL" },
  "hawks":           { bg: "#E03A3E", fg: "#C1D32F", mono: "ATL" },
  "hornets":         { bg: "#1d1160", fg: "#00788C", mono: "CHA" },
  "heat":            { bg: "#98002E", fg: "#F9A01B", mono: "MIA" },
  "magic":           { bg: "#0077C0", fg: "#C4CED4", mono: "ORL" },
  "wizards":         { bg: "#002B5C", fg: "#E31837", mono: "WAS" },
  "nuggets":         { bg: "#0E2240", fg: "#FEC524", mono: "DEN" },
  "timberwolves":    { bg: "#0C2340", fg: "#236192", mono: "MIN" },
  "thunder":         { bg: "#007AC1", fg: "#EF3B24", mono: "OKC" },
  "trail-blazers":   { bg: "#E03A3E", fg: "#000000", mono: "POR" },
  "jazz":            { bg: "#002B5C", fg: "#F9A01B", mono: "UTA" },
  "warriors":        { bg: "#1D428A", fg: "#FFC72C", mono: "GSW" },
  "clippers":        { bg: "#C8102E", fg: "#1d428a", mono: "LAC" },
  "lakers":          { bg: "#552583", fg: "#FDB927", mono: "LAL" },
  "suns":            { bg: "#1d1160", fg: "#E56020", mono: "PHX" },
  "kings":           { bg: "#5a2d81", fg: "#63727A", mono: "SAC" },
  "mavericks":       { bg: "#00538C", fg: "#002B5E", mono: "DAL" },
  "rockets":         { bg: "#CE1141", fg: "#000000", mono: "HOU" },
  "grizzlies":       { bg: "#5D76A9", fg: "#12173F", mono: "MEM" },
  "pelicans":        { bg: "#0C2340", fg: "#C8102E", mono: "NOP" },
  "spurs":           { bg: "#C4CED4", fg: "#000000", mono: "SAS" },
};

const DEFAULT_MONO = { bg: "#222", fg: "#fff", mono: "NBA" };

export function monogramFor(slug: string): { bg: string; fg: string; mono: string } {
  return MONOGRAM_BY_SLUG[slug] ?? DEFAULT_MONO;
}

export function logoUrlFor(slug: string): string | null {
  const localPath = join(process.cwd(), "public", "data", "nba", "logos", `${slug}.svg`);
  if (existsSync(localPath)) return `/data/nba/logos/${slug}.svg`;
  return null;
}

// Basketball-Reference. League-aware: NBA, ABA, BAA each have separate URL roots.
export function brefYearUrl(year: number, league: string = "NBA"): string {
  const lg = (league || "NBA").toUpperCase();
  if (lg === "ABA") return `https://www.basketball-reference.com/leagues/ABA_${year}.html`;
  if (lg === "BAA") return `https://www.basketball-reference.com/leagues/BAA_${year}.html`;
  return `https://www.basketball-reference.com/leagues/NBA_${year}.html`;
}

// Render-friendly season label. NBA workbook stores END year of split-season
// (e.g., 2026 = 2025-26 season). Common display: "2025-26".
export function seasonLabel(endYear: number): string {
  if (!endYear) return "";
  const endYY = (endYear % 100).toString().padStart(2, "0");
  return `${endYear - 1}-${endYY}`;
}

// Round-num to display label (used by Top Games table).
export const NBA_ROUND_LABELS: Record<string, string> = {
  "1":   "NBA Finals",
  "2":   "Conf. Finals",
  "3":   "Conf. Semifinals",
  "4":   "First Round",
  "4.5": "Play-In",
  "5":   "Play-In",
};

export function nbaRoundLabel(round_num: number | null, fallback: string = ""): string {
  if (round_num == null) return fallback;
  const key = String(round_num);
  return NBA_ROUND_LABELS[key] || fallback;
}

// US/Canadian state abbreviation helper. Mirrors lib/mlb.ts.
const STATE_ABBR: Record<string, string> = {
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
  "District of Columbia": "DC", "D.C.": "DC",
  "Ontario": "ON", "Quebec": "QC", "British Columbia": "BC", "Alberta": "AB",
};
export function abbreviateState(state: string): string {
  return STATE_ABBR[state] || state;
}
