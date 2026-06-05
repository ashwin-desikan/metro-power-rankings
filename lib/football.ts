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
  cont_trophies?: number;
  mls_cups?: number;
  supporters_shields?: number;
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
  is_mls?: boolean;
  wikidata_qid?: string;
  wikipedia_url?: string;
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
  // EFL promotion playoff flags (England levels 2-5, workbook cols CF/CG).
  playoffs: boolean;
  playoff_final: boolean;
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
  // MLS-only: closed league with conferences and playoff/shield honors.
  is_mls?: boolean;
  conferences?: string[];
};

export type MlsStanding = {
  place: number;
  cur_name: string;
  team: string;
  slug: string | null;
  conference: string | null;
  w: number; d: number; l: number;
  pts: number | null;
  gs: number; ga: number; gd: number;
  supporters_shield: boolean;
  playoffs: boolean;
  playoff_sf: boolean;
  mls_cup_app: boolean;
  mls_cup: boolean;
};

export type MlsLeagueHub = {
  slug: string;
  country: string;
  league: string;
  is_mls: true;
  conferences: string[];
  current_year: number | null;
  current_standings: MlsStanding[];
  all_time_champions: Array<{ year: number | null; champion: string; champion_slug: string | null }>;
  mls_cup_finals: Array<{ year: number | null; champion: string; champion_slug: string | null; runner_up: string | null; runner_up_slug: string | null }>;
  supporters_shield_winners: Array<{ year: number | null; winner: string; winner_slug: string | null }>;
  most_decorated: Array<{ cur_name: string; slug: string | null; mls_cups: number; supporters_shields: number; finals: number; playoffs: number; seasons: number; last_title: number | null }>;
};

// ---------- European tournament hubs ----------

export type EuropeanChampion = {
  year: number;
  season: string | null;
  cur_name: string;
  slug: string | null;
  competition: string | null;
};

export type EuropeanFinalist = EuropeanChampion;

export type EuropeanMostDecorated = {
  cur_name: string;
  slug: string | null;
  champion_count: number;
  // Finals reached total (wins + losses). The page surfaces "15 cups, 18
  // finals" so a reader sees the W/L spread without doing math.
  finals_count: number;
  finals_lost: number;
  last_won: number | null;
  // Most recent year the club reached the final (won or lost). Important for
  // never-won clubs whose last_won is always null but whose last_final is
  // the meaningful "when did they last appear here" anchor.
  last_final: number | null;
};

export type EuropeanCurrentEntry = {
  cur_name: string;
  slug: string | null;
  deepest_rnd: number | null;
  trophy: boolean;
};

export type EuropeanTournamentHub = {
  slug: string;
  label: string;
  short_label: string;
  active: boolean;
  calendar_year?: boolean;
  era_notes: string;
  year_min: number | null;
  year_max: number | null;
  editions: number;
  champions: EuropeanChampion[];
  finalists: EuropeanFinalist[];
  most_decorated: EuropeanMostDecorated[];
  current_season: string | null;
  current_year: number | null;
  current_entries: EuropeanCurrentEntry[];
  // Present only on the "other-continental" hub: finals grouped by confederation.
  grouped_by_confederation?: boolean;
  sections?: ContinentalSection[];
};

export type ContinentalFinal = {
  year: number | null;
  season: string | null;
  competition: string | null;
  champion: string | null;
  champion_slug: string | null;
  runner_up: string | null;
  runner_up_slug: string | null;
};

export type ContinentalSection = {
  continent: string;
  confederation: string;
  competitions: string[];
  finals: ContinentalFinal[];
  most_decorated: EuropeanMostDecorated[];
  editions: number;
  year_min: number | null;
  year_max: number | null;
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
let _europeanTournamentsCache: Record<string, EuropeanTournamentHub> | null = null;

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
  return [
    ...getIndex().clubs.map((c) => c.slug),
    ...getDomesticCups().new_clubs.map((n) => n.slug),
  ];
}

export function getClubBySlug(slug: string): FootballClub | null {
  const c = getIndex().clubs.find((c) => c.slug === slug);
  if (c) return c;
  const n = newClubsBySlug()[slug];
  return n ? synthCupClub(n) : null;
}

export function getSeasonsForClub(slug: string): FootballSeason[] {
  const rows = getSeasonsMap()[slug];
  if (rows && rows.length) return rows;
  const n = newClubsBySlug()[slug];
  return n ? synthCupSeasons(slug, n) : (rows ?? []);
}

export type MlsClubSeason = {
  year: number | null;
  season: string | null;
  conference: string | null;
  overall_pos: number | null;
  conf_pos: number | null;
  w: number; d: number; l: number;
  pts: number | null;
  gs: number; ga: number; gd: number;
  supporters_shield: boolean;
  playoffs: boolean;
  playoff_sf: boolean;
  mls_cup_app: boolean;
  mls_cup: boolean;
  finish: string;
  is_live?: boolean;
};

let _mlsSeasonsCache: Record<string, MlsClubSeason[]> | null = null;
export function getMlsSeasonsForClub(slug: string): MlsClubSeason[] {
  if (!_mlsSeasonsCache) {
    _mlsSeasonsCache = loadJson<Record<string, MlsClubSeason[]>>("mls-seasons.json", {});
  }
  return _mlsSeasonsCache[slug] ?? [];
}

export function getCupsForClub(slug: string): FootballCupFinal[] {
  const c = getCupsMap()[slug];
  if (c && c.length) return c;
  const n = newClubsBySlug()[slug];
  return n ? synthCupFinals(slug, n) : (c ?? []);
}

export function getEuropeForClub(slug: string): FootballEuropeEntry[] {
  return getEuropeMap()[slug] ?? [];
}

// ---------- Domestic cups (FA Cup / League Cup) ----------
// Sourced from domestic-cups.json (built by scripts/build-domestic-cups-data.py
// from the FACup-LgCup SF sheet). Powers the /teams/football/cups hub, the
// per-season semifinal markers in the club season table, and the 14 cup-only
// club pages (Victorian amateurs) that have no canonical index entry.
export type DomesticCupMatch = {
  round: string; date: string | null; team: string; team_slug: string | null;
  opp: string | null; opp_slug: string | null; for: number | null; ag: number | null;
  wdl: string | null; trophy: boolean; note: string | null; venue: string | null; metro: string | null;
};
export type DomesticCupSeason = {
  season: string; year: number | null;
  champion: string | null; champion_slug: string | null;
  runner_up: string | null; runner_up_slug: string | null;
  matches: DomesticCupMatch[];
};
export type DomesticCupCompetition = {
  name: string; kind: "major" | "minor"; first_year: number; last_year: number;
  seasons: DomesticCupSeason[];
};
export type DomesticCupRun = {
  year: number | null; season: string; comp: string; comp_id: string;
  kind: "major" | "minor"; stage: "winner" | "runner_up" | "semifinal";
};
export type DomesticCupNewClub = {
  slug: string; cur_name: string; country: string; metro: string | null;
  county: string | null; continent: string | null;
  first_year: number | null; last_year: number | null;
  fa_titles: number; lg_titles: number;
};
export type DomesticCupAggregateRow = {
  slug: string; cur_name: string;
  fa_sf: number; fa_f: number; fa_cups: number;
  lg_sf: number; lg_f: number; lg_cups: number;
  sf: number; f: number; cups: number;
  fa_sf_last: number | null; fa_f_last: number | null; fa_cups_last: number | null;
  lg_sf_last: number | null; lg_f_last: number | null; lg_cups_last: number | null;
  sf_last: number | null; f_last: number | null; cups_last: number | null;
};
type DomesticCupsFile = {
  competitions: Record<string, DomesticCupCompetition>;
  by_club: Record<string, DomesticCupRun[]>;
  new_clubs: DomesticCupNewClub[];
  aggregate: DomesticCupAggregateRow[];
};
let _domCupsCache: DomesticCupsFile | null = null;
function getDomesticCups(): DomesticCupsFile {
  if (!_domCupsCache) {
    _domCupsCache = loadJson<DomesticCupsFile>("domestic-cups.json", { competitions: {}, by_club: {}, new_clubs: [], aggregate: [] });
  }
  return _domCupsCache;
}
export function getDomesticCupCompetitions(): Record<string, DomesticCupCompetition> {
  return getDomesticCups().competitions;
}
export function getDomesticCupCompetition(id: string): DomesticCupCompetition | null {
  return getDomesticCups().competitions[id] ?? null;
}
export function getDomesticCupAggregate(): DomesticCupAggregateRow[] {
  return getDomesticCups().aggregate;
}
export function getCupRunsForClub(slug: string): DomesticCupRun[] {
  return getDomesticCups().by_club[slug] ?? [];
}
export function getCupSemifinalsForClub(slug: string): { year: number; kind: "major" | "minor" }[] {
  return getCupRunsForClub(slug)
    .filter((r) => r.stage === "semifinal" && r.year !== null)
    .map((r) => ({ year: r.year as number, kind: r.kind }));
}
let _newClubsBySlug: Record<string, DomesticCupNewClub> | null = null;
function newClubsBySlug(): Record<string, DomesticCupNewClub> {
  if (!_newClubsBySlug) {
    _newClubsBySlug = {};
    for (const n of getDomesticCups().new_clubs) _newClubsBySlug[n.slug] = n;
  }
  return _newClubsBySlug;
}
export function isCupOnlyClub(slug: string): boolean {
  return slug in newClubsBySlug();
}
function synthCupClub(n: DomesticCupNewClub): FootballClub {
  const runs = getCupRunsForClub(n.slug);
  const lastTrophy = runs.filter((r) => r.stage === "winner").reduce((m, r) => Math.max(m, r.year ?? 0), 0) || null;
  return {
    slug: n.slug, cur_name: n.cur_name, country: n.country, city: null,
    metro: n.metro, county: n.county, continent: n.continent, lat: null, lng: null,
    tiers: [], first_year: n.first_year, last_year: n.last_year,
    top_flight_seasons: 0, lower_tier_seasons: 0, league_seasons: 0, playoff_appearances: 0,
    totals: { major_cups: n.fa_titles || undefined, minor_cups: n.lg_titles || undefined, last_trophy: lastTrophy },
    tier_by_year: {}, country_by_year: {},
  };
}
function synthCupSeasons(slug: string, n: DomesticCupNewClub): FootballSeason[] {
  const years = Array.from(new Set(getCupRunsForClub(slug).map((r) => r.year).filter((y): y is number => y !== null)));
  years.sort((a, b) => b - a);
  return years.map((y) => ({
    slug, cur_name: n.cur_name, year: y, country: n.country, league: null, division: null,
    level: null, team: n.cur_name, place: null, w: null, d: null, l: null, pts: null,
    gf: null, ga: null, gd: null, matches: null, format: "league" as const, eur_qual: null,
    promoted: false, relegated: false, champion: false, final: false, playoffs: false, playoff_final: false,
  }));
}
function synthCupFinals(slug: string, n: DomesticCupNewClub): FootballCupFinal[] {
  return getCupRunsForClub(slug)
    .filter((r) => r.stage === "winner" || r.stage === "runner_up")
    .map((r) => ({
      slug, cur_name: n.cur_name, year: r.year, country: n.country,
      kind: r.kind, result: (r.stage === "winner" ? "won" : "lost") as "won" | "lost",
    }));
}

// Competitions that count as CL/EC titles. Covers the three naming
// conventions used in the workbook across different eras.
const CL_EC_COMPETITIONS = new Set([
  "Champions League",
  "European Cup",
  "European Cup / Champions League",
]);

// Count CL/European Cup titles won by a club.
export function getClTitlesForClub(slug: string): number {
  return getEuropeForClub(slug).filter(
    (e) => e.trophy_won && e.competition !== null && CL_EC_COMPETITIONS.has(e.competition)
  ).length;
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

// ---------- European tournament hub accessors ----------

// Editorial display order for the European tournament hubs: active majors
// first, then defunct, then the Super Cup and intercontinental sit at the
// end as their own tier.
export const EUROPEAN_TOURNAMENT_HUB_ORDER: string[] = [
  "champions-league",
  "europa-league",
  "conference-league",
  "cup-winners-cup",
  "inter-cities-fairs-cup",
  "uefa-super-cup",
  "club-world-cup",
  "copa-libertadores",
  "other-continental",
];

function getEuropeanTournamentsMap(): Record<string, EuropeanTournamentHub> {
  if (!_europeanTournamentsCache) {
    _europeanTournamentsCache = loadJson<Record<string, EuropeanTournamentHub>>(
      "european-tournaments.json",
      {},
    );
  }
  return _europeanTournamentsCache;
}

export function getAllEuropeanTournamentHubs(): EuropeanTournamentHub[] {
  const map = getEuropeanTournamentsMap();
  // Return in editorial order; any hub not in the order list goes to the end.
  const ordered: EuropeanTournamentHub[] = [];
  const seen = new Set<string>();
  for (const slug of EUROPEAN_TOURNAMENT_HUB_ORDER) {
    if (map[slug]) {
      ordered.push(map[slug]);
      seen.add(slug);
    }
  }
  for (const [slug, hub] of Object.entries(map)) {
    if (!seen.has(slug)) ordered.push(hub);
  }
  return ordered;
}

export function getAllEuropeanTournamentHubSlugs(): string[] {
  return Object.keys(getEuropeanTournamentsMap());
}

export function getEuropeanTournamentHub(slug: string): EuropeanTournamentHub | null {
  return getEuropeanTournamentsMap()[slug] ?? null;
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

// ESPN MLS standings use display names that differ from the workbook's
// canonical club names. Map ESPN displayName -> canonical name so live MLS
// rows resolve to the right club page (slug, colors, link) and display the
// canonical name.
const MLS_ESPN_TO_CANONICAL: Record<string, string> = {
  "Chicago Fire FC": "Chicago Fire",
  "Red Bull New York": "New York Red Bulls",
  "Orlando City SC": "Orlando City",
  "Atlanta United FC": "Atlanta United",
  "LA Galaxy": "Los Angeles Galaxy",
  "Houston Dynamo FC": "Houston Dynamo",
  "Vancouver Whitecaps": "Vancouver Whitecaps FC",
  "Minnesota United FC": "Minnesota United",
  "LAFC": "Los Angeles FC",
};

export function getFootballClubByName(teamName: string): FootballClub | null {
  if (!teamName) return null;
  const canonical = MLS_ESPN_TO_CANONICAL[teamName] ?? teamName;
  const slug = getSlugLookup()[normalizeTeamName(canonical)];
  if (!slug) return null;
  return getClubBySlug(slug);
}

export { monogramForFootball, colorForFootballClub } from "./football-colors";

// Convenience: full readable competition name from the Eur RndbyRnd-style
// short code. Mirrors the alphabet-soup table in the workbook's Claude
// Notes section 2.7. The era-specific codes (EC / UC / ICFC) are
// synthesized at display time by europeanCompDisplayCode() and are not
// present in the raw data, but listed here so tooltips can lift their
// full name from one place.
export const EUROPEAN_COMP_NAMES: Record<string, string> = {
  CL: "Champions League",
  CLB: "Copa Libertadores",
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
  OTHC: "Continental Cup",
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
  if (code === "CL") {
    return endYear <= 1992 ? "EC" : code;
  }
  if (code === "CLB") return "CLB";
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
