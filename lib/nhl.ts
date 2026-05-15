import "server-only";
// NHL team-pages data layer.
// Source: public/data/nhl/*.json, emitted by scripts/build-nhl-data.py from
// NHL.xlsx. Server-only — uses fs.readFileSync.

import { existsSync, readFileSync } from "fs";
import { join } from "path";

// ---------- Types ----------

export type Franchise = {
  slug: string;
  canonical: string;
  name: string;
  display_name: string;
  city: string;
  team: string;
  home_city: string;
  metro: string;
  metro_slug: string | null;
  state: string;
  country: string;
  founded: number | null;
  league_history: string;
  team_history: string;
  city_history: string;
  all_time_w: number;
  all_time_l: number;
  all_time_t: number;
  all_time_otl: number;
  all_time_pts: number;
  pts_pct: number;
  seasons: number;
  playoff_appearances: number;
  division_titles: number;
  best_record_seasons: number;       // Presidents' Trophy / Best Reg. Record
  best_main_div_seasons: number;
  sf_appearances: number;
  champ_appearances: number;         // Stanley Cup Final apps
  championships: number;
  last_championship: number | null;
  last_champ_app: number | null;
  last_sf_app: number | null;
  last_best_rec: number | null;
  last_division_title: number | null;
  last_playoff_app: number | null;
  current_arena_canonical: string;
  current_arena_season: string;
  current_main_div: string;
  current_division: string;
  wikidata_qid: string | null;
  wikipedia_url: string | null;
  lat: number | null;
  lng: number | null;
};

export type HistoricalFranchise = {
  slug: string;
  canonical: string;
  name: string;
  last_city: string;
  last_team: string;
  founded: number | null;
  ended: number | null;
  league_history: string;
  team_history: string;
  city_history: string;
  all_time_w: number;
  all_time_l: number;
  all_time_t: number;
  all_time_otl: number;
  all_time_pts: number;
  championships: number;
  champ_appearances: number;
  sf_appearances: number;
  seasons: number;
  last_championship: number | null;
};

export type Championship = {
  year: number;
  league: string;
  era: "stanley" | "avco";
  city: string;
  team: string;
};

export type ChampionshipAppearance = {
  year: number;
  league: string;
  era: "stanley" | "avco";
  result: "Won" | "Lost";
  city: string;
  team: string;
};

export type Season = {
  year: number;
  league: string;
  city: string;
  team: string;
  w: number;
  l: number;
  t: number;
  otl: number;
  pts: number;
  pts_pct: number;
  gf: number;
  ga: number;
  gd: number;
  playoff: boolean;
  div_title: boolean;
  best_main_div: boolean;
  best_rec_leag: boolean;        // Best regular-season record (Presidents' Trophy proxy)
  p_wins: number;
  p_loss: number;
  sf_cf_app: boolean;
  champ_app: boolean;
  champ: boolean;
  playoff_seed: string | null;
  division: string;
  main_div: string;
  place: string;
  home_arena_season: string;
  home_arena_canonical: string;
  home_city: string;
  metro: string;
  home_state: string;
  era: "T_only" | "T_OTL_mix" | "OTL_only";
};

export type ArenaRow = {
  arena: string;
  arena_canonical: string;
  start_year: number;
  end_year: number;
  city: string;
  state: string;
  metro: string;
};

export type AwardWinner = {
  year: number;
  player: string;
  trophy: string;
  position: string;
};

export type AllStarTeamCount = { first: number; second: number };

export type PresidentsTrophyRow = {
  year: number;
  pts: number;
  w: number;
  l: number;
  t: number;
  otl: number;
  league: string;
};

// ---------- Cached reads ----------

let _franchises: Franchise[] | null = null;
let _historical: HistoricalFranchise[] | null = null;
let _bySlug: Map<string, Franchise> | null = null;
let _byCanonical: Map<string, Franchise> | null = null;
let _championships: Record<string, Championship[]> | null = null;
let _champApps: Record<string, ChampionshipAppearance[]> | null = null;
let _stadiumHistory: Record<string, ArenaRow[]> | null = null;
let _awards: Record<string, AwardWinner[]> | null = null;
let _asCounts: Record<string, AllStarTeamCount> | null = null;
let _presTrophies: Record<string, PresidentsTrophyRow[]> | null = null;
let _seasons: Record<string, Season[]> | null = null;
let _historicalSeasons: Record<string, Season[]> | null = null;

function read<T>(filename: string): T {
  const path = join(process.cwd(), "public", "data", "nhl", filename);
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

export function getAllFranchises(): Franchise[] {
  if (!_franchises) _franchises = read<Franchise[]>("franchises.json");
  return _franchises;
}

export function getAllHistorical(): HistoricalFranchise[] {
  if (!_historical) _historical = read<HistoricalFranchise[]>("historical.json");
  return _historical;
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

// Metro-page TeamCard lookup: takes the workbook team string and returns
// the NHL franchise slug if any.
let _byFullName: Map<string, string> | null = null;
export function getNhlSlugByTeamName(teamFullName: string): string | undefined {
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

export function getNhlFranchiseByTeamName(teamFullName: string): Franchise | undefined {
  const slug = getNhlSlugByTeamName(teamFullName);
  return slug ? indices().bySlug.get(slug) : undefined;
}

export function getChampionships(slug: string): Championship[] {
  if (!_championships) _championships = read<Record<string, Championship[]>>("championships.json");
  return _championships[slug] || [];
}

export function getChampionshipAppearances(slug: string): ChampionshipAppearance[] {
  if (!_champApps) _champApps = read<Record<string, ChampionshipAppearance[]>>("championship-appearances.json");
  return _champApps[slug] || [];
}

export function getStadiumHistory(slug: string): ArenaRow[] {
  if (!_stadiumHistory) _stadiumHistory = read<Record<string, ArenaRow[]>>("stadium-history.json");
  return _stadiumHistory[slug] || [];
}

export function getAwards(slug: string): AwardWinner[] {
  if (!_awards) _awards = read<Record<string, AwardWinner[]>>("award-winners.json");
  return _awards[slug] || [];
}

export function getAllStarTeamCount(slug: string): AllStarTeamCount {
  if (!_asCounts) _asCounts = read<Record<string, AllStarTeamCount>>("all-star-team-counts.json");
  return _asCounts[slug] || { first: 0, second: 0 };
}

export function getPresidentsTrophies(slug: string): PresidentsTrophyRow[] {
  if (!_presTrophies) _presTrophies = read<Record<string, PresidentsTrophyRow[]>>("presidents-trophies.json");
  return _presTrophies[slug] || [];
}

export function getSeasons(slug: string): Season[] {
  if (!_seasons) _seasons = read<Record<string, Season[]>>("seasons-by-team.json");
  return _seasons[slug] || [];
}

export function getHistoricalSeasons(): Record<string, Season[]> {
  if (!_historicalSeasons) _historicalSeasons = read<Record<string, Season[]>>("historical-seasons.json");
  return _historicalSeasons;
}

// ---------- Display helpers ----------

// Stanley Cup wins in gold; WHA Avco Cup in slate (rival-league chip,
// parallel to ABA in NBA). Best Reg. Record / Presidents' Trophy in
// silver — visually subordinate to Stanley Cup but distinct from Cup
// Final loss markers.
export const TITLE_COLORS = {
  stanley:    { bg: "#d4af37", text: "#1a1408" },  // gold
  avco:       { bg: "#6e8aa6", text: "#0c1320" },  // slate
  presidents: { bg: "#c0c0c0", text: "#1a1a1a" },  // silver
} as const;

export const TROPHY_LABELS: Record<string, string> = {
  "Hart": "Hart",
  "Norris": "Norris",
  "Vezina": "Vezina",
  "Calder": "Calder",
  "Conn Smythe": "Conn Smythe",
  "Adams": "Adams",
  "Selke": "Selke",
  "Lady Byng": "Lady Byng",
};

export const TROPHY_FULL_NAMES: Record<string, string> = {
  "Hart": "Hart Memorial Trophy (MVP)",
  "Norris": "Norris Trophy (Top Defenseman)",
  "Vezina": "Vezina Trophy (Top Goaltender)",
  "Calder": "Calder Memorial Trophy (Rookie of the Year)",
  "Conn Smythe": "Conn Smythe Trophy (Playoff MVP)",
  "Adams": "Jack Adams Award (Coach of the Year)",
  "Selke": "Frank J. Selke Trophy (Best Defensive Forward)",
  "Lady Byng": "Lady Byng Memorial Trophy (Sportsmanship)",
};

export const ORIGINAL_SIX = new Set([
  "Bruins",
  "Blackhawks",
  "Red Wings",
  "Canadiens",
  "Rangers",
  "Maple Leafs",
]);

// Slug-stable colored monograms for v1. Wikimedia SVGs can replace these
// later at public/data/nhl/logos/{slug}.svg.
export const MONOGRAM_BY_SLUG: Record<string, { bg: string; fg: string; mono: string }> = {
  // Atlantic
  "bruins":        { bg: "#FFB81C", fg: "#000000", mono: "BOS" },
  "sabres":        { bg: "#002654", fg: "#FCB514", mono: "BUF" },
  "red-wings":     { bg: "#CE1126", fg: "#FFFFFF", mono: "DET" },
  "panthers":      { bg: "#041E42", fg: "#C8102E", mono: "FLA" },
  "canadiens":     { bg: "#AF1E2D", fg: "#192168", mono: "MTL" },
  "senators":      { bg: "#C8102E", fg: "#000000", mono: "OTT" },
  "lightning":     { bg: "#002868", fg: "#FFFFFF", mono: "TBL" },
  "maple-leafs":   { bg: "#00205B", fg: "#FFFFFF", mono: "TOR" },
  // Metropolitan
  "hurricanes":    { bg: "#CC0000", fg: "#000000", mono: "CAR" },
  "blue-jackets":  { bg: "#002654", fg: "#CE1126", mono: "CBJ" },
  "devils":        { bg: "#CE1126", fg: "#000000", mono: "NJD" },
  "islanders":     { bg: "#00539B", fg: "#F47D30", mono: "NYI" },
  "rangers":       { bg: "#0038A8", fg: "#CE1126", mono: "NYR" },
  "flyers":        { bg: "#F74902", fg: "#000000", mono: "PHI" },
  "penguins":      { bg: "#000000", fg: "#CFC493", mono: "PIT" },
  "capitals":      { bg: "#C8102E", fg: "#041E42", mono: "WSH" },
  // Central
  "blackhawks":    { bg: "#CF0A2C", fg: "#000000", mono: "CHI" },
  "avalanche":     { bg: "#6F263D", fg: "#236192", mono: "COL" },
  "stars":         { bg: "#006847", fg: "#000000", mono: "DAL" },
  "wild":          { bg: "#A6192E", fg: "#154734", mono: "MIN" },
  "predators":     { bg: "#FFB81C", fg: "#041E42", mono: "NSH" },
  "blues":         { bg: "#002F87", fg: "#FCB514", mono: "STL" },
  "mammoth":       { bg: "#0C2340", fg: "#71AFE5", mono: "UTA" },
  "jets":          { bg: "#041E42", fg: "#AC162C", mono: "WPG" },
  // Pacific
  "ducks":         { bg: "#F47A38", fg: "#000000", mono: "ANA" },
  "flames":        { bg: "#D2122E", fg: "#FAAF19", mono: "CGY" },
  "oilers":        { bg: "#FF4C00", fg: "#041E42", mono: "EDM" },
  "kings":         { bg: "#111111", fg: "#A2AAAD", mono: "LAK" },
  "sharks":        { bg: "#006D75", fg: "#EA7200", mono: "SJS" },
  "kraken":        { bg: "#001628", fg: "#99D9D9", mono: "SEA" },
  "canucks":       { bg: "#00205B", fg: "#00843D", mono: "VAN" },
  "golden-knights":{ bg: "#B4975A", fg: "#000000", mono: "VGK" },
};

export function logoUrlFor(slug: string): string | null {
  // Logos are not bundled yet. Return null and fall through to monogram.
  return null;
}

export function monogramFor(slug: string): { bg: string; fg: string; mono: string } | null {
  return MONOGRAM_BY_SLUG[slug] || null;
}

// ---------- Era helpers ----------

// Decide which loss-type columns to render in season-by-season tables.
// Pre-1999: ties exist, no OTL.
// 1999-2004: both columns exist (OTL introduced 1999-00 lockout, ties
//            eliminated by 2005-06 lockout).
// 2005 onwards: OTL absorbs shootout losses (workbook convention); no T.
export function lossColumnsForYear(year: number): { showT: boolean; showOtl: boolean } {
  if (year <= 1998) return { showT: true, showOtl: false };
  if (year <= 2004) return { showT: true, showOtl: true };
  return { showT: false, showOtl: true };
}

// Postseason result label for the season-by-season table.
// Order of detection matters: Champion > Lost Final > Lost SF/CF > Lost
// earlier round > Made playoffs > Missed. League-aware: WHA seasons get
// the Avco Cup label instead of Stanley Cup.
export function postseasonResult(s: Season): string {
  if (s.champ) return s.league === "WHA" ? "Avco Cup" : "Stanley Cup";
  if (s.champ_app) return s.league === "WHA" ? "Lost Avco Final" : "Lost Final";
  if (s.sf_cf_app) return "Lost CF";
  if (s.playoff) return "Made playoffs";
  return "Missed";
}

export function seasonLabel(year: number): string {
  // 2024 = '2023-24', 2026 = '2025-26'.
  const start = year - 1;
  return `${start}-${String(year).slice(-2)}`;
}
