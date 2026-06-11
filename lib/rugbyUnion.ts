import "server-only";

// International Rugby Union portal data layer (/teams/rugby-union).
//
// Source: scripts/rugby/build_rugby_union_data.py reads the two Rugby Union
// sheets in OtherLeagues.xlsx (Intl Results 1871->2026 and Intl Tables with
// champion / Grand Slam / Triple Crown / RWC knockout flags) plus the weekly
// Men's World Rugby rankings since 2003 (Wikimedia Commons
// Data:Men's_World_Rugby_rankings.tab), and emits the JSONs under
// public/data/rugby-union consumed here.
//
// Server-only. Listed in scripts/check-client-imports.mjs SERVER_ONLY_MODULES.

import { existsSync, readFileSync } from "fs";
import { join } from "path";

export type RugbyRecord = {
  m: number; w: number; l: number; d: number; pf: number; pa: number;
  first: string | null; last: string | null;
};

export type RugbyTeam = {
  slug: string;
  name: string;
  six_nations: boolean;
  sanzaar: boolean;
  record: RugbyRecord | null;
  rwc: {
    apps: number; titles: number; title_years: number[];
    finals: number; sf: number; qf: number;
  } | null;
  championships: {
    five_six_titles: number; five_six_years: number[];
    grand_slams: number; triple_crowns: number;
    trc_titles: number; trc_years: number[];
  } | null;
  ranking: {
    current: number | null;
    peak: number | null;
    peak_first: string | null;
    weeks_at_1: number;
  } | null;
};

export type RugbyMatch = {
  date: string | null; opp: string | null; result: string; score: string;
  comp: string; stage: string; venue: string; city: string; country: string;
};

export type RugbySeasonRow = {
  season: number; comp: string; pool: string; place: number | null;
  rwc_qf?: boolean; rwc_sf?: boolean; rwc_f?: boolean;
  trophy?: boolean; triple_crown?: boolean; grand_slam?: boolean;
};

export type RugbyTeamDetail = {
  slug: string;
  name: string;
  recent: RugbyMatch[];
  seasons: RugbySeasonRow[];
  h2h: Record<string, { m: number; w: number; l: number; d: number }>;
};

export type RugbyNumberOneReign = {
  team: string; weeks: number; reigns: number; longest: number; last: string | null;
};

export type RugbyHub = {
  as_of: string;
  rankings_as_of: string;
  totals: { matches: number; teams: number; first: string; last: string; scheduled: number };
  world_rankings: { team: string; rank: number }[];
  number_ones: RugbyNumberOneReign[];
  six_nations_roll: {
    season: number; comp: string; champions: string[];
    grand_slam: string | null; triple_crown: string | null;
  }[];
  trc_roll: { season: number; comp: string; champions: string[] }[];
  rwc_finals: {
    year: number; winner: string; runner_up: string | null;
    score: string; venue: string; city: string;
  }[];
};

const DATA_DIR = join(process.cwd(), "public", "data", "rugby-union");

function loadJson<T>(rel: string): T | null {
  const p = join(DATA_DIR, rel);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8")) as T;
}

let _teams: RugbyTeam[] | null = null;
let _hub: RugbyHub | null = null;
let _bySlug: Map<string, RugbyTeam> | null = null;

export function getAllRugbyTeams(): RugbyTeam[] {
  if (!_teams) _teams = loadJson<RugbyTeam[]>("teams.json") ?? [];
  return _teams;
}

export function getRugbyHub(): RugbyHub | null {
  if (!_hub) _hub = loadJson<RugbyHub>("hub.json");
  return _hub;
}

export function getRugbyTeamBySlug(slug: string): RugbyTeam | null {
  if (!_bySlug) _bySlug = new Map(getAllRugbyTeams().map((t) => [t.slug, t]));
  return _bySlug.get(slug) ?? null;
}

export function getAllRugbySlugs(): string[] {
  return getAllRugbyTeams().map((t) => t.slug);
}

export function getRugbyTeamDetail(slug: string): RugbyTeamDetail | null {
  return loadJson<RugbyTeamDetail>(join("team-detail", `${slug}.json`));
}

// ---------- Country-hub join ----------

const COUNTRY_ALIASES: Record<string, string> = {
  "united states of america": "united states",
  "ivory coast": "ivory coast",
  "cote d'ivoire": "ivory coast",
};

function norm(s: string): string {
  // Strip combining diacritics (U+0300-U+036F) after NFKD decomposition.
  // Code-point filter instead of a regex so the source stays pure ASCII.
  let out = "";
  for (const ch of s.normalize("NFKD")) {
    const cp = ch.codePointAt(0);
    if (cp === undefined || cp < 0x0300 || cp > 0x036f) out += ch;
  }
  return out.toLowerCase().trim();
}

let _byName: Map<string, RugbyTeam> | null = null;

function teamsByName(): Map<string, RugbyTeam> {
  if (_byName) return _byName;
  _byName = new Map();
  for (const t of getAllRugbyTeams()) _byName.set(norm(t.name), t);
  return _byName;
}

export function getRugbyTeamForCountry(countryName: string): RugbyTeam | null {
  const key = COUNTRY_ALIASES[norm(countryName)] ?? norm(countryName);
  return teamsByName().get(key) ?? null;
}

export function rugbyWinPct(rec: RugbyRecord): number | null {
  if (rec.m <= 0) return null;
  return Math.round((rec.w / rec.m) * 1000) / 10;
}
