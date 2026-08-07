import "server-only";

// International Cricket portal data layer (/teams/cricket).
//
// Source: scripts/cricket/build_cricket_portal_data.py reads the OneDrive
// InternationalCricket.xlsx workbook (the user-curated source of truth:
// Matches, Other Internationals, Number Ones, the recomputed monthly
// Test/ODI/T20I ranking tables, Honours, Series Trophies) and emits the
// JSONs under public/data/cricket consumed here.
//
// Server-only. Listed in scripts/check-client-imports.mjs SERVER_ONLY_MODULES.

// Runtime reads via lib/liveData: the weekly cricket refresh commits these JSONs
// with the skip marker. Enforced by scripts/check-live-data.mjs.
import { loadLiveJson } from "@/lib/liveData";
import { getAllCountries } from "@/lib/countries";

export type CricketFormat = "Test" | "ODI" | "T20I";
export const CRICKET_FORMATS: CricketFormat[] = ["Test", "ODI", "T20I"];

export type FormatRecord = {
  m: number; w: number; l: number; d: number; t: number; nr: number;
  first: string | null; last: string | null;
};

export type HonourLine = { titles: number; title_years: string; ru: number; ru_years: string };
export type TeamHonours = { wc: HonourLine; t20wc: HonourLine; ct: HonourLine; wtc: HonourLine; asia: HonourLine };

export type FormatRanking = {
  current_rank: number | null;
  current_rating: number | null;
  peak_rank: number;
  peak_rank_first: string;
  peak_rating: number;
};

export type CricketTeam = {
  slug: string;
  name: string;
  full_member: boolean;
  composite: boolean;
  formats: Partial<Record<CricketFormat, FormatRecord>>;
  overall: FormatRecord;
  other_internationals: FormatRecord | null;
  honours: TeamHonours | null;
  rankings: Partial<Record<CricketFormat, FormatRanking>>;
  months_at_1: Record<CricketFormat, number>;
  trophies_held: string[];
  trophies_contested: string[];
};

export type CricketMatch = {
  date: string | null; format: CricketFormat; opp: string | null; result: string;
  detail: string; tournament: string; venue: string; city: string; country: string;
};

export type CricketFinal = {
  year: number | null; date: string | null; major: string; format: CricketFormat;
  tournament: string; opp: string | null; won: boolean;
  // "Won" | "Lost" | "Shared" | "Tied" | "No result" — tie/no-result finals
  // (2019 CWC, CT 2002) are resolved against the Honours title-year lists.
  outcome: string; detail: string;
};

export type CricketTeamDetail = {
  slug: string;
  name: string;
  recent: CricketMatch[];
  finals: CricketFinal[];
  h2h: Record<string, Partial<Record<CricketFormat, FormatRecord>>>;
};

export type RankingTable = {
  month: string;
  rows: { rank: number; team: string; rating: number }[];
};

export type NumberOneReign = {
  team: string; months: number; reigns: number; longest: number; last: string | null;
};

export type SeriesTrophy = {
  trophy: string; contested_by: string; format: string; first: string; last: string;
  holder: string; series: number; notes: string;
};

export type CricketHub = {
  as_of: string;
  totals: { matches: number; teams: number; first: string; last: string; full_members: number };
  current_rankings: Record<CricketFormat, RankingTable>;
  number_ones: Record<CricketFormat, NumberOneReign[]>;
  honours: ({ team: string } & TeamHonours)[];
  honours_note: string;
  series_trophies: SeriesTrophy[];
};

let _teams: CricketTeam[] | null = null;
let _hub: CricketHub | null = null;
let _bySlug: Map<string, CricketTeam> | null = null;

export async function getAllCricketTeams(): Promise<CricketTeam[]> {
  if (!_teams) _teams = (await loadLiveJson<CricketTeam[]>("cricket/teams.json")) ?? [];
  return _teams;
}

export async function getCricketHub(): Promise<CricketHub | null> {
  if (!_hub) _hub = await loadLiveJson<CricketHub>("cricket/hub.json");
  return _hub;
}

export async function getCricketTeamBySlug(slug: string): Promise<CricketTeam | null> {
  if (!_bySlug) {
    _bySlug = new Map((await getAllCricketTeams()).map((t) => [t.slug, t]));
  }
  return _bySlug.get(slug) ?? null;
}

export async function getAllCricketSlugs(): Promise<string[]> {
  return (await getAllCricketTeams()).map((t) => t.slug);
}

export async function getCricketTeamDetail(slug: string): Promise<CricketTeamDetail | null> {
  return loadLiveJson<CricketTeamDetail>(`cricket/team-detail/${slug}.json`);
}

// ---------- Country-hub join ----------

// West Indies is a combined team of the cricket-playing Caribbean. Every
// member country's hub shows the West Indies card (user decision 2026-06-11).
const WEST_INDIES_MEMBERS = new Set([
  "antigua and barbuda", "anguilla", "barbados", "british virgin islands",
  "dominica", "grenada", "guyana", "jamaica", "montserrat",
  "saint kitts and nevis", "st kitts and nevis", "saint lucia", "st lucia",
  "saint vincent and the grenadines", "st vincent and the grenadines",
  "sint maarten", "trinidad and tobago", "us virgin islands",
  "united states virgin islands",
]);

const COUNTRY_ALIASES: Record<string, string> = {
  "united states of america": "united states",
  "czechia": "czech republic",
  // Cricket's Ireland is an all-island team; Northern Ireland's country page
  // shows it too (user decision 2026-06-12).
  "northern ireland": "ireland",
  // The ECB side is the England and Wales team, so Wales shows the England
  // cricket card (user decision 2026-06-20).
  "wales": "england",
};

function norm(s: string): string {
  // Strip combining diacritics (U+0300-U+036F) after NFKD decomposition.
  // Code-point filter instead of a regex so the source stays pure ASCII.
  let out = "";
  for (const ch of s.normalize("NFKD")) {
    const cp = ch.codePointAt(0);
    if (cp === undefined || cp < 0x0300 || cp > 0x036f) out += ch;
  }
  // Workbook country names use "&" and "St." (e.g. "Antigua & Barbuda",
  // "St. Kitts & Nevis"); fold both so the West Indies member join holds.
  return out
    .replace(/&/g, " and ")
    .replace(/\./g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

let _byName: Map<string, CricketTeam> | null = null;

async function teamsByName(): Promise<Map<string, CricketTeam>> {
  if (_byName) return _byName;
  const m = new Map<string, CricketTeam>();
  for (const t of await getAllCricketTeams()) {
    if (!t.composite) m.set(norm(t.name), t);
  }
  _byName = m;
  return _byName;
}

export async function getCricketTeamForCountry(countryName: string): Promise<CricketTeam | null> {
  const key = COUNTRY_ALIASES[norm(countryName)] ?? norm(countryName);
  const byName = await teamsByName();
  if (WEST_INDIES_MEMBERS.has(key)) {
    return byName.get("west indies") ?? null;
  }
  return byName.get(key) ?? null;
}

let _countryByNorm: Map<string, string> | null = null;

function countryByNorm(): Map<string, string> {
  if (_countryByNorm) return _countryByNorm;
  _countryByNorm = new Map();
  for (const c of getAllCountries()) {
    const key = norm(c.name);
    if (key && !_countryByNorm.has(key)) _countryByNorm.set(key, c.slug);
  }
  return _countryByNorm;
}

// Reverse of getCricketTeamForCountry: the country page a team links back to.
// Composite XIs and West Indies (a 15-member combined side) resolve to null.
export function getCountrySlugForCricketTeam(team: CricketTeam): string | null {
  if (team.composite || team.name === "West Indies") return null;
  const key = norm(team.name);
  const direct = countryByNorm().get(key);
  if (direct) return direct;
  // A country whose page name differs from the team name (e.g. Czechia)
  // appears as an alias key pointing at the team name; invert it.
  for (const [countryName, teamName] of Object.entries(COUNTRY_ALIASES)) {
    if (teamName === key) {
      const s = countryByNorm().get(norm(countryName));
      if (s) return s;
    }
  }
  return null;
}

// Display helper shared by hub and team pages: wins over completed matches.
export function winPct(rec: FormatRecord): number | null {
  const decided = rec.m - rec.nr;
  if (decided <= 0) return null;
  return Math.round((rec.w / decided) * 1000) / 10;
}
