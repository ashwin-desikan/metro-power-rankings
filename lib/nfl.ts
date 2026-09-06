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

/**
 * A line colour for a team, legible on --bg-card (#12121A).
 *
 * 🔴 NOT A CATEGORICAL PALETTE. These are real club colours, which is the point,
 * but half of them are near-black (Bears #0B162A, Raiders #000000) and would
 * vanish on a dark card. So each team offers two stored colours and this picks
 * whichever actually reads, falling back to the neutral border token when
 * neither does. A team with no stored colour stays grey rather than being
 * assigned one, because inventing a club colour is worse than not having it.
 */
const CARD_L = 0.012; // approximate relative luminance of --bg-card
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  if (h.length !== 6) return 0;
  const v = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
function contrast(hex: string): number {
  const l = luminance(hex);
  return (Math.max(l, CARD_L) + 0.05) / (Math.min(l, CARD_L) + 0.05);
}
export function nflLineColor(slug: string | null): string | null {
  if (!slug) return null;
  const m = MONOGRAM_BY_SLUG[slug];
  if (!m) return null;
  const cands = [m.bg, m.fg].filter((c) => /^#[0-9a-f]{6}$/i.test(c));
  const best = cands.map((c) => [c, contrast(c)] as const).sort((a, b) => b[1] - a[1])[0];
  // 3:1 is the non-text contrast floor; below it the line is not a line.
  return best && best[1] >= 3 ? best[0] : null;
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
  return rows.map((r) => {
    const out: Record<string, unknown> = { ...r };
    if (typeof r.winner_canonical === "string") {
      out.winner_slug = byCanonical.get(r.winner_canonical)?.slug ?? null;
    }
    if (typeof r.loser_canonical === "string") {
      out.loser_slug = byCanonical.get(r.loser_canonical)?.slug ?? null;
    }
    if (typeof r.opp_canonical === "string") {
      out.opp_slug = byCanonical.get(r.opp_canonical)?.slug ?? null;
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
