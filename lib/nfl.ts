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
};

export type TopGameTeamRow = {
  year: number;
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
};

export type TopGameLeagueRow = {
  year: number;
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
};

export type HistoricalFranchise = {
  canonical: string;
  name: string;
  city: string;
  team_historical: string;
  league: string;
  seasons: number;
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
let _hof: Record<string, HallOfFamer[]> | null = null;
let _seasons: Record<string, Season[]> | null = null;
let _historical: HistoricalFranchise[] | null = null;
let _historicalChamps: Record<string, Championship[]> | null = null;
let _proBowlCounts: Record<string, number> | null = null;
let _topGamesByTeam: Record<string, TopGameTeamRow[]> | null = null;
let _topGamesAllTime: TopGameLeagueRow[] | null = null;
let _topGamesByDecade: Record<string, TopGameLeagueRow[]> | null = null;

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
  "houston-texans":         { bg: "#03202F", fg: "#ffffff", mono: "HOU" },
  "carolina-panthers":      { bg: "#0085CA", fg: "#ffffff", mono: "CAR" },
};

export function monogramFor(slug: string): { bg: string; fg: string; mono: string } {
  return MONOGRAM_BY_SLUG[slug] || { bg: "#1E1E2E", fg: "#E8E8ED", mono: "NFL" };
}

// Static path roots so Turbopack's Node File Tracer can scope the
// existsSync calls to `public/data/nfl/logos/` only. Earlier versions
// built the full path with a variable suffix, which Turbopack treated
// as a project-wide glob and traced 13,974 unrelated files into the
// serverless bundle.
const LOGO_DIR = join(process.cwd(), "public", "data", "nfl", "logos");

export function logoUrlFor(slug: string): string | null {
  const svgPath = join(LOGO_DIR, `${slug}.svg`);
  if (existsSync(svgPath)) return `/data/nfl/logos/${slug}.svg`;
  const pngPath = join(LOGO_DIR, `${slug}.png`);
  if (existsSync(pngPath)) return `/data/nfl/logos/${slug}.png`;
  return null;
}
