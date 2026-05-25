import "server-only";

// Football team-pages data layer.
//
// V0 scope: Big 5 Level 1 (England, Spain, Italy, Germany, France) plus
// English Levels 2-5. One canonical page per distinct Cur. Name across the
// in-scope tiers. Source: scripts/build-football-data.py reads from the
// grand Football workbook (Champions League-201516.xlsx) and emits the
// JSONs we consume here.
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
  league_seasons: number;
  playoff_appearances: number;
  totals: FootballClubTotals;
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
  eur_qual: boolean;
  relegated: boolean;
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
  scope: { big5: string[]; country_tiers: Record<string, number[]> };
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
    _indexCache = loadJson<IndexPayload>("index.json", {
      generated_at: "",
      source: "",
      scope: { big5: [], country_tiers: {} },
      clubs: [],
    });
  }
  return _indexCache;
}

function getSeasonsMap(): Record<string, FootballSeason[]> {
  if (!_seasonsCache) _seasonsCache = loadJson("seasons.json", {});
  return _seasonsCache;
}

function getCupsMap(): Record<string, FootballCupFinal[]> {
  if (!_cupsCache) _cupsCache = loadJson("cups.json", {});
  return _cupsCache;
}

function getEuropeMap(): Record<string, FootballEuropeEntry[]> {
  if (!_europeCache) _europeCache = loadJson("europe.json", {});
  return _europeCache;
}

function getLeaguesMap(): Record<string, FootballLeagueHub> {
  if (!_leaguesCache) _leaguesCache = loadJson("leagues.json", {});
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
  // Big 5 order matches the league-hub list for visual consistency.
  const order = ["England", "Spain", "Italy", "Germany", "France"];
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

// Two-letter monogram derived from the canonical name. Green theme matches
// SportsExplorer's Football ring color (#15803d) so the metro-page card
// reads at a glance as a football club.
export function monogramForFootball(name: string): { bg: string; fg: string; mono: string } {
  const cleaned = (name ?? "").replace(/^(FC|AFC|SC|SV|AS|AC|US|SK|VfB|VfL|SSC|RC|CF|UD|Real|Atletico)\s+/i, "").trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  let mono = "";
  if (tokens.length === 0) mono = (name ?? "FC").slice(0, 2).toUpperCase();
  else if (tokens.length === 1) mono = tokens[0].slice(0, 2).toUpperCase();
  else mono = (tokens[0][0] + tokens[1][0]).toUpperCase();
  return { bg: "#15803d", fg: "#ecfdf5", mono };
}

// Convenience: full readable competition name from the Eur RndbyRnd-style
// short code. Mirrors the alphabet-soup table in the workbook's Claude
// Notes section 2.7.
export const EUROPEAN_COMP_NAMES: Record<string, string> = {
  CL: "Champions League",
  CLB: "Champions League",
  EL: "Europa League / UEFA Cup",
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

// Convenience: the canonical name for each Big 5 country's level-1 league
// (used when rendering a club page header summary).
export const COUNTRY_TOP_FLIGHT: Record<string, string> = {
  England: "Premier League",
  Spain: "La Liga",
  Italy: "Serie A",
  Germany: "Bundesliga",
  France: "Ligue 1",
};

// Convenience: which tiers exist per country in our v0 scope.
export const COUNTRY_TIER_LABELS: Record<string, Record<number, string>> = {
  England: {
    1: "Premier League",
    2: "Championship",
    3: "League One",
    4: "League Two",
    5: "National League",
  },
  Spain: { 1: "La Liga" },
  Italy: { 1: "Serie A" },
  Germany: { 1: "Bundesliga" },
  France: { 1: "Ligue 1" },
};
