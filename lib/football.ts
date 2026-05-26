import "server-only";

// Football team-pages data layer.
//
// V0 scope: Level 1 across England, Spain, Italy, Germany, France,
// Netherlands, Portugal, and Scotland, plus English Levels 2-5 and
// Scottish Levels 2-4. One canonical page per distinct Cur. Name across
// the in-scope tiers. Source: scripts/build-football-data.py reads from
// the grand Football workbook (Champions League-201516.xlsx) and emits
// the JSONs we consume here.
//
// Server-only — uses fs.readFileSync. Listed in
// scripts/check-client-imports.mjs SERVER_ONLY_MODULES.

import { existsSync, readFileSync } from "fs";
import { join } from "path";

// ---------- Types ----------

export type FootballClubTotals = {
  titles?: number;
  last_title?: number | null;
  league_finals?: number;
  league_t4?: number;
  major_cups?: number;
  minor_cups?: number;
  last_trophy?: number | null;
  career_years?: number;
};

export type FootballClub = {
  slug: string;
  cur_name: string;
  country: string;
  city: string | null;
  metro: string | null;
  county: string | null;
  continent: string | null;
  lat: number | null;
  lng: number | null;
  tiers: number[];
  first_year: number | null;
  last_year: number | null;
  // top_flight_seasons counts only Level 1 league rows; lower_tier_seasons
  // counts Levels 2-5 (England only in the v0 scope). league_seasons is
  // kept for back-compat with the filter UI but is the sum of the two.
  top_flight_seasons: number;
  lower_tier_seasons: number;
  league_seasons: number;
  playoff_appearances: number;
  totals: FootballClubTotals;
  // Compact map { year-as-string: level-number }. Lets the index page
  // filter UI show each club's level for a selected season without
  // pulling the full 7MB seasons.json into the client bundle.
  tier_by_year: Record<string, number>;
  // Per-year country of play. Mulhouse 1941 = Germany (Anschluss-era
  // Alsace) even though the club's mode country is France. Used by the
  // index when a season year is selected so the country grouping +
  // country filter + map color reflect where the club actually played
  // that year, not their canonical federation.
  country_by_year: Record<string, string>;
};

export type FootballSeason = {
  slug: string;
  cur_name: string;
  year: number | null;
  country: string;
  league: string | null;
  division: string | null;
  level: number | null;
  team: string;
  place: number | null;
  w: number | null;
  d: number | null;
  l: number | null;
  pts: number | null;
  gf: number | null;
  ga: number | null;
  gd: number | null;
  matches: number | null;
  format: "league" | "playoff";
  // Competition code awarded for next season's European qualification:
  // 'CL' (Champions League), 'EL' (Europa League), 'EUCL' (Conference
  // League), 'CWC' (legacy Cup Winners' Cup), etc. null when no qualification.
  eur_qual: string | null;
  // promoted / relegated derived from the next season's tier transition
  // (lower next-level = promoted, higher next-level = relegated). The
  // workbook's own Relegated column is ignored in the ETL because it only
  // fires on top-flight relegations and misses lower-tier movement.
  promoted: boolean;
  relegated: boolean;
  // Workbook col BX Champions flag. True iff the club won the national
  // top-flight title that season. Fires for both modern Bundesliga / La
  // Liga / Serie A winners AND for pre-modern playoff champs (e.g. all 7
  // of FC Schalke 04's pre-Bundesliga titles). Does NOT fire for second-
  // division winners, so it cleanly distinguishes Champion from Promoted.
  champion: boolean;
  // Workbook col BW Final flag. True if reached the national-championship
  // final (was champion or runner-up). Currently unused in the UI but
  // emitted for future runner-up tagging.
  final: boolean;
};

export type FootballCupFinal = {
  slug: string;
  cur_name: string;
  year: number | null;
  country: string;
  kind: "major" | "minor" | "super";
  result: "won" | "lost" | "scheduled";
};

export type FootballEuropeEntry = {
  year: number | null;
  season: string | null;
  competition: string | null;
  code: string | null;
  // Deepest round reached this entry. result_label is the human string;
  // deepest_rnd is the numeric round (1=Final, 5=Group, etc.); deepest_bin
  // is the workbook's per-competition stage code (CLF, ELSF, etc.).
  deepest_rnd: number | null;
  deepest_bin: string | null;
  trophy_won: boolean;
  result_label: string;
};

export type FootballLeagueHub = {
  slug: string;
  country: string;
  league: string;
  current_year: number | null;
  current_standings: FootballSeason[];
  all_time_champions: Array<{
    year: number | null;
    champion: string;
    champion_team: string;
    champion_slug: string;
    league_name: string | null;
    format: "league" | "playoff";
  }>;
};

// ---------- File loading ----------

const DATA_DIR = join(process.cwd(), "public", "data", "football");

function loadJson<T>(name: string, fallback: T): T {
  const path = join(DATA_DIR, name);
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (e) {
    console.error(`[lib/football] failed to read ${name}:`, e);
    return fallback;
  }
}

type IndexPayload = {
  generated_at: string;
  source: string;
  scope: { countries: string[]; country_tiers: Record<string, number[]> };
  clubs: FootballClub[];
};

// Module-level caches. Next.js will keep these in memory for the lifetime
// of the server process between rebuilds.
let _indexCache: IndexPayload | null = null;
let _seasonsCache: Record<string, FootballSeason[]> | null = null;
let _cupsCache: Record<string, FootballCupFinal[]> | null = null;
let _europeCache: Record<string, FootballEuropeEntry[]> | null = null;
let _leaguesCache: Record<string, FootballLeagueHub> | null = null;

function getIndex(): IndexPayload {
  if (!_indexCache) {
    const raw = loadJson<IndexPayload>("index.json", {
      generated_at: "",
      source: "",
      scope: { countries: [], country_tiers: {} },
      clubs: [],
    });
    // Clamp last_year to MAX_DISPLAYED_YEAR so the "Most recent season"
    // stat on every club page reflects what the user can actually see.
    _indexCache = {
      ...raw,
      clubs: raw.clubs.map((c) => ({
        ...c,
        last_year: c.last_year && c.last_year > MAX_DISPLAYED_YEAR ? MAX_DISPLAYED_YEAR : c.last_year,
      })),
    };
  }
  return _indexCache;
}

// Editorial: hide future-season placeholder rows from display until the
// 2026 World Cup is in the rear-view mirror. The workbook carries 2027
// (= 2026-27 season) entries with team names but null W/D/L/Pts; showing
// them in user-facing tables is more confusing than helpful. Flip this
// to a higher number (or remove the filter) once the new season starts.
export const MAX_DISPLAYED_YEAR = 2026;

function getSeasonsMap(): Record<string, FootballSeason[]> {
  if (!_seasonsCache) {
    const raw = loadJson<Record<string, FootballSeason[]>>("seasons.json", {});
    _seasonsCache = {};
    for (const [slug, rows] of Object.entries(raw)) {
      _seasonsCache[slug] = rows.filter((r) => r.year === null || r.year <= MAX_DISPLAYED_YEAR);
    }
  }
  return _seasonsCache;
}

function getCupsMap(): Record<string, FootballCupFinal[]> {
  if (!_cupsCache) {
    const raw = loadJson<Record<string, FootballCupFinal[]>>("cups.json", {});
    _cupsCache = {};
    for (const [slug, rows] of Object.entries(raw)) {
      _cupsCache[slug] = rows.filter((r) => r.year === null || r.year <= MAX_DISPLAYED_YEAR);
    }
  }
  return _cupsCache;
}

function getEuropeMap(): Record<string, FootballEuropeEntry[]> {
  if (!_europeCache) {
    const raw = loadJson<Record<string, FootballEuropeEntry[]>>("europe.json", {});
    _europeCache = {};
    for (const [slug, rows] of Object.entries(raw)) {
      _europeCache[slug] = rows.filter((r) => r.year === null || r.year <= MAX_DISPLAYED_YEAR);
    }
  }
  return _europeCache;
}

function getLeaguesMap(): Record<string, FootballLeagueHub> {
  if (!_leaguesCache) {
    const raw = loadJson<Record<string, FootballLeagueHub>>("leagues.json", {});
    _leaguesCache = {};
    for (const [slug, hub] of Object.entries(raw)) {
      // current_standings: drop if every row is the upcoming-season placeholder.
      const filteredStandings = (hub.current_standings ?? []).filter(
        (s) => s.year === null || s.year <= MAX_DISPLAYED_YEAR
      );
      const filteredChamps = (hub.all_time_champions ?? []).filter(
        (c) => c.year === null || c.year <= MAX_DISPLAYED_YEAR
      );
      _leaguesCache[slug] = {
        ...hub,
        current_year: hub.current_year && hub.current_year > MAX_DISPLAYED_YEAR ? MAX_DISPLAYED_YEAR : hub.current_year,
        current_standings: filteredStandings,
        all_time_champions: filteredChamps,
      };
    }
  }
  return _leaguesCache;
}

// ---------- Public accessors ----------

export function getAllClubs(): FootballClub[] {
  return getIndex().clubs;
}

export function getAllClubSlugs(): string[] {
  return getIndex().clubs.map((c) => c.slug);
}

export function getClubBySlug(slug: string): FootballClub | null {
  return getIndex().clubs.find((c) => c.slug === slug) ?? null;
}

export function getSeasonsForClub(slug: string): FootballSeason[] {
  return getSeasonsMap()[slug] ?? [];
}

export function getCupsForClub(slug: string): FootballCupFinal[] {
  return getCupsMap()[slug] ?? [];
}

export function getEuropeForClub(slug: string): FootballEuropeEntry[] {
  return getEuropeMap()[slug] ?? [];
}

export function getAllLeagueHubs(): FootballLeagueHub[] {
  return Object.values(getLeaguesMap());
}

export function getLeagueHub(slug: string): FootballLeagueHub | null {
  return getLeaguesMap()[slug] ?? null;
}

export function getAllLeagueHubSlugs(): string[] {
  return Object.keys(getLeaguesMap());
}

// Group clubs by country for the index page. England gets sub-grouped by
// the club's highest tier reached, since 5-tier coverage there means
// hundreds of pages benefit from tier-banded presentation.
export function getClubsGroupedByCountry(): Array<{
  country: string;
  clubs: FootballClub[];
}> {
  const groups = new Map<string, FootballClub[]>();
  for (const c of getAllClubs()) {
    if (!c.country) continue;
    if (!groups.has(c.country)) groups.set(c.country, []);
    groups.get(c.country)!.push(c);
  }
  // Country order matches the league-hub list for visual consistency.
  const order = ["England", "Spain", "Italy", "Germany", "France",
                 "Netherlands", "Portugal", "Scotland"];
  return order
    .filter((c) => groups.has(c))
    .map((country) => ({
      country,
      clubs: groups.get(country)!.slice().sort((a, b) => {
        // Highest tier first, then alphabetical by Cur. Name.
        const ta = Math.min(...(a.tiers.length ? a.tiers : [99]));
        const tb = Math.min(...(b.tiers.length ? b.tiers : [99]));
        if (ta !== tb) return ta - tb;
        return a.cur_name.localeCompare(b.cur_name);
      }),
    }));
}

// ---------- Cross-data-source resolvers ----------

let _slugLookupCache: Record<string, string> | null = null;
function getSlugLookup(): Record<string, string> {
  if (!_slugLookupCache) _slugLookupCache = loadJson("slug-lookup.json", {});
  return _slugLookupCache;
}

// Mirrors scripts/build-sports-index.py normalize_team_name (lowercase,
// alnum-only, collapsed whitespace). Used for cross-source joins where
// the team name in MetroAreas.xlsx FootballClub_Data / Team List may have
// minor punctuation drift from the workbook's Cur. Name.
function normalizeTeamName(s: string): string {
  if (!s) return "";
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function getFootballClubByName(teamName: string): FootballClub | null {
  if (!teamName) return null;
  const slug = getSlugLookup()[normalizeTeamName(teamName)];
  if (!slug) return null;
  return getClubBySlug(slug);
}

// Curated primary colors for marquee clubs across the in-scope countries.
// Slug keys. Foreground is
// chosen for contrast against the background; in most cases this is
// off-white for dark backgrounds and near-black for light backgrounds.
// If you add a club, follow the workbook's slugified Cur. Name as the key.
const CURATED_CLUB_COLORS: Record<string, { bg: string; fg: string }> = {
  // England - Premier League regulars + historic top-flight clubs
  "arsenal": { bg: "#EF0107", fg: "#FFFFFF" },
  "manchester-united": { bg: "#DA291C", fg: "#FFE500" },
  "manchester-city": { bg: "#6CABDD", fg: "#1C2C5B" },
  "liverpool": { bg: "#C8102E", fg: "#FFFFFF" },
  "chelsea": { bg: "#034694", fg: "#FFFFFF" },
  "tottenham-hotspur": { bg: "#132257", fg: "#FFFFFF" },
  "newcastle-united": { bg: "#241F20", fg: "#FFFFFF" },
  "aston-villa": { bg: "#670E36", fg: "#94BEE5" },
  "everton": { bg: "#003399", fg: "#FFFFFF" },
  "leeds-united": { bg: "#FFCD00", fg: "#1D428A" },
  "west-ham-united": { bg: "#7A263A", fg: "#1BB1E7" },
  "nottingham-forest": { bg: "#DD0000", fg: "#FFFFFF" },
  "brighton-hove-albion": { bg: "#0057B8", fg: "#FFFFFF" },
  "crystal-palace": { bg: "#1B458F", fg: "#C4122E" },
  "wolverhampton-wanderers": { bg: "#FDB913", fg: "#231F20" },
  "southampton": { bg: "#D71920", fg: "#FFFFFF" },
  "leicester-city": { bg: "#003090", fg: "#FDBE11" },
  "sunderland": { bg: "#EB172B", fg: "#FFFFFF" },
  "sheffield-united": { bg: "#EE2737", fg: "#FFFFFF" },
  "sheffield-wednesday": { bg: "#0E4C92", fg: "#FFFFFF" },
  "derby-county": { bg: "#000000", fg: "#FFFFFF" },
  "middlesbrough": { bg: "#E2231A", fg: "#FFFFFF" },
  "preston-north-end": { bg: "#FFFFFF", fg: "#1F4193" },
  "afc-bournemouth": { bg: "#DA291C", fg: "#000000" },
  "fulham": { bg: "#000000", fg: "#FFFFFF" },
  "brentford": { bg: "#E30613", fg: "#FFFFFF" },
  // Spain - La Liga marquees
  "real-madrid": { bg: "#FEBE10", fg: "#00529F" },
  "fc-barcelona": { bg: "#A50044", fg: "#004D98" },
  "atletico-de-madrid": { bg: "#CB3524", fg: "#FFFFFF" },
  "sevilla": { bg: "#D71920", fg: "#FFFFFF" },
  "valencia": { bg: "#FF7F00", fg: "#000000" },
  "real-sociedad": { bg: "#003F87", fg: "#FFFFFF" },
  "athletic-bilbao": { bg: "#EE2523", fg: "#FFFFFF" },
  "villarreal": { bg: "#FFE667", fg: "#005187" },
  "real-betis": { bg: "#00954C", fg: "#FFFFFF" },
  "celta-de-vigo": { bg: "#8AC7E8", fg: "#C81C2C" },
  "deportivo-de-la-coruna": { bg: "#0072CE", fg: "#FFFFFF" },
  "rcd-espanyol": { bg: "#005EB8", fg: "#FFFFFF" },
  "real-zaragoza": { bg: "#FFFFFF", fg: "#003DA5" },
  // Italy - Serie A marquees
  "juventus": { bg: "#000000", fg: "#FFFFFF" },
  "ac-milan": { bg: "#FB090B", fg: "#000000" },
  "internazionale": { bg: "#0068A8", fg: "#000000" },
  "ssc-napoli": { bg: "#12A0D7", fg: "#FFFFFF" },
  "as-roma": { bg: "#8E1F2F", fg: "#F0BC42" },
  "lazio": { bg: "#87CEEB", fg: "#FFFFFF" },
  "atalanta": { bg: "#1C1F4F", fg: "#FFFFFF" },
  "fiorentina": { bg: "#482F92", fg: "#FFFFFF" },
  "torino": { bg: "#8B0000", fg: "#FFFFFF" },
  "sampdoria": { bg: "#1F3A93", fg: "#FFFFFF" },
  "genoa": { bg: "#C8102E", fg: "#003DA5" },
  "bologna": { bg: "#911F2F", fg: "#1B468C" },
  "udinese": { bg: "#000000", fg: "#FFFFFF" },
  // Germany - Bundesliga marquees + pre-Bundesliga giants
  "bayern-munich": { bg: "#DC052D", fg: "#FFFFFF" },
  "borussia-dortmund": { bg: "#FDE100", fg: "#000000" },
  "rb-leipzig": { bg: "#DD0741", fg: "#FFFFFF" },
  "bayer-leverkusen": { bg: "#E32221", fg: "#000000" },
  "eintracht-frankfurt": { bg: "#E1000F", fg: "#000000" },
  "vfb-stuttgart": { bg: "#E32219", fg: "#FFFFFF" },
  "borussia-monchengladbach": { bg: "#000000", fg: "#00B050" },
  "werder-bremen": { bg: "#1D9053", fg: "#FFFFFF" },
  "1-fc-koln": { bg: "#ED1C24", fg: "#FFFFFF" },
  "fc-schalke-04": { bg: "#004D9E", fg: "#FFFFFF" },
  "hertha-bsc": { bg: "#005CA9", fg: "#FFFFFF" },
  "hamburger-sv": { bg: "#003C8F", fg: "#FFFFFF" },
  "1-fc-nurnberg": { bg: "#8B1A1A", fg: "#FFFFFF" },
  "vfl-wolfsburg": { bg: "#65B32E", fg: "#FFFFFF" },
  // France - Ligue 1 marquees
  "paris-saint-germain": { bg: "#004170", fg: "#ED1C24" },
  "olympique-marseille": { bg: "#2FAEE0", fg: "#FFFFFF" },
  "as-monaco": { bg: "#ED1C24", fg: "#FFFFFF" },
  "olympique-lyonnais": { bg: "#DA001A", fg: "#1B449C" },
  "lille-osc": { bg: "#DA291C", fg: "#003DA5" },
  "as-saint-etienne": { bg: "#0F8A3F", fg: "#FFFFFF" },
  "rc-lens": { bg: "#FFCC00", fg: "#DA0023" },
  "ogc-nice": { bg: "#ED1C24", fg: "#000000" },
  "stade-rennais": { bg: "#D90D2E", fg: "#000000" },
  "fc-girondins-de-bordeaux": { bg: "#001489", fg: "#FFFFFF" },
  "fc-nantes": { bg: "#FFCD00", fg: "#008752" },
  "toulouse-fc": { bg: "#5F259F", fg: "#FFFFFF" },
  "montpellier-hsc": { bg: "#F46D1D", fg: "#1F3F88" },
  "strasbourg": { bg: "#005EB8", fg: "#FFFFFF" },
};

// 12-hue fallback palette for the long tail. Picked for distinguishability
// across the wheel; each pairs with a tested foreground for legibility.
const HASH_PALETTE: Array<{ bg: string; fg: string }> = [
  { bg: "#15803d", fg: "#ecfdf5" }, // forest
  { bg: "#7c3aed", fg: "#f5f3ff" }, // violet
  { bg: "#0ea5e9", fg: "#f0f9ff" }, // sky
  { bg: "#ea580c", fg: "#fff7ed" }, // orange
  { bg: "#be185d", fg: "#fdf2f8" }, // pink
  { bg: "#0d9488", fg: "#f0fdfa" }, // teal
  { bg: "#a16207", fg: "#fefce8" }, // amber
  { bg: "#4338ca", fg: "#eef2ff" }, // indigo
  { bg: "#65a30d", fg: "#f7fee7" }, // lime
  { bg: "#9d174d", fg: "#fdf2f8" }, // rose
  { bg: "#1e3a8a", fg: "#dbeafe" }, // deep blue
  { bg: "#525252", fg: "#fafafa" }, // neutral
];

function slugHash(slug: string): number {
  // Stable FNV-1a 32-bit hash. Deterministic across server + client and
  // across rebuilds.
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

// Two-letter monogram derived from the canonical name plus a color from
// either the curated map (marquee clubs) or a deterministic hash-derived
// palette pick (long tail). Same shape as the NFL / NBA / NHL / MLB
// monogram helpers so it slots into the existing TeamCard renderer.
export function monogramForFootball(name: string, slug?: string): { bg: string; fg: string; mono: string } {
  const cleaned = (name ?? "").replace(/^(FC|AFC|SC|SV|AS|AC|US|SK|VfB|VfL|SSC|RC|CF|UD|Real|Atletico)\s+/i, "").trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  let mono = "";
  if (tokens.length === 0) mono = (name ?? "FC").slice(0, 2).toUpperCase();
  else if (tokens.length === 1) mono = tokens[0].slice(0, 2).toUpperCase();
  else mono = (tokens[0][0] + tokens[1][0]).toUpperCase();
  const lookup = slug ? CURATED_CLUB_COLORS[slug] : null;
  if (lookup) return { ...lookup, mono };
  const palette = HASH_PALETTE[slug ? slugHash(slug) % HASH_PALETTE.length : 0];
  return { ...palette, mono };
}

// Lightweight version that only returns the colors (no monogram), useful
// for the small circular indicator on the index list.
export function colorForFootballClub(slug: string): { bg: string; fg: string } {
  const lookup = CURATED_CLUB_COLORS[slug];
  if (lookup) return lookup;
  return HASH_PALETTE[slugHash(slug) % HASH_PALETTE.length];
}

// Convenience: full readable competition name from the Eur RndbyRnd-style
// short code. Mirrors the alphabet-soup table in the workbook's Claude
// Notes section 2.7. The era-specific codes (EC / UC / ICFC) are
// synthesized at display time by europeanCompDisplayCode() and are not
// present in the raw data, but listed here so tooltips can lift their
// full name from one place.
export const EUROPEAN_COMP_NAMES: Record<string, string> = {
  CL: "Champions League",
  CLB: "Champions League",
  EC: "European Cup",
  EL: "Europa League",
  UC: "UEFA Cup",
  ICFC: "Inter-Cities Fairs Cup",
  EUCL: "Conference League",
  CWC: "Cup Winners' Cup",
  OTH: "Inter-Cities Fairs / Inter Toto",
  FCWC: "FIFA Club World Cup",
  IC: "Intercontinental Cup",
  USC: "UEFA Super Cup",
  RCSA: "Recopa Sudamericana",
  CI: "Copa Interamericana",
  OTHC: "Other Champions track",
};

// Era-aware display code for European competitions. The raw workbook code
// stays as the semantic anchor (CL = "Europe's senior knockout", EL =
// "Europe's secondary knockout") but the abbreviation rendered to the
// reader reflects what the competition was actually branded that decade:
//
//   CL / CLB pre-1993 (end year) → EC  (European Cup)
//   CL / CLB 1993 onward        → CL  (Champions League)
//   EL 1956-1971                → ICFC (Inter-Cities Fairs Cup)
//   EL 1972-2009                → UC  (UEFA Cup)
//   EL 2010 onward              → EL  (Europa League)
//   ECL (legacy alias)          → EUCL (Conference League)
//   anything else               → unchanged
//
// Year here is the END year of the season (e.g. 1971 = the 1970-71 season).
// A null year falls through to the raw code, which preserves the current
// behavior for any entry that lacks a year.
export function europeanCompDisplayCode(rawCode: string | null, endYear: number | null): string {
  if (!rawCode) return "";
  const code = rawCode === "ECL" ? "EUCL" : rawCode;
  if (endYear == null) return code;
  if (code === "CL" || code === "CLB") {
    return endYear <= 1992 ? "EC" : code;
  }
  if (code === "EL") {
    if (endYear <= 1971) return "ICFC";
    if (endYear <= 2009) return "UC";
    return "EL";
  }
  return code;
}

// Display-order rank for sorting multiple European competitions within a
// single season. Lower number renders first. Today's hierarchy:
// Champions League (and its European Cup predecessor) → Cup Winners' Cup
// → Europa League / UEFA Cup / Inter-Cities Fairs Cup → Conference League
// → anything else. Cup Winners' Cup is slotted between CL and EL because
// in its 1960-1999 lifespan it sat in roughly that prestige position.
export function europeanCompSortKey(rawCode: string | null): number {
  if (!rawCode) return 99;
  const code = rawCode === "ECL" ? "EUCL" : rawCode;
  switch (code) {
    case "CL":
    case "CLB":
      return 1;
    case "CWC":
      return 2;
    case "EL":
      return 3;
    case "EUCL":
      return 4;
    case "OTH":
    case "OTHC":
      return 5;
    default:
      return 99;
  }
}

// Convenience: the canonical name for each in-scope country's level-1
// league (used when rendering a club page header summary).
export const COUNTRY_TOP_FLIGHT: Record<string, string> = {
  England: "Premier League",
  Spain: "La Liga",
  Italy: "Serie A",
  Germany: "Bundesliga",
  France: "Ligue 1",
  Netherlands: "Eredivisie",
  Portugal: "Primeira Liga",
  Scotland: "Scottish Premiership",
};

// Convenience: which tiers exist per country in our v0 scope. England and
// Scotland are wired down their full league pyramids; every other country
// is Level 1 only.
export const COUNTRY_TIER_LABELS: Record<string, Record<number, string>> = {
  England: {
    1: "Premier League",
    2: "Championship",
    3: "League One",
    4: "League Two",
    5: "National League",
  },
  Scotland: {
    1: "Scottish Premiership",
    2: "Scottish Championship",
    3: "Scottish League One",
    4: "Scottish League Two",
  },
  Spain: { 1: "La Liga" },
  Italy: { 1: "Serie A" },
  Germany: { 1: "Bundesliga" },
  France: { 1: "Ligue 1" },
  Netherlands: { 1: "Eredivisie" },
  Portugal: { 1: "Primeira Liga" },
};
