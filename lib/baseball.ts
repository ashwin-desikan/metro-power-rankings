import "server-only";

// International Baseball portal data layer (/teams/baseball).
//
// Source: scripts/baseball/build_wbc_data.py parses scripts/baseball/wbc.txt
// (Wikipedia text for all six World Baseball Classic editions 2006-2026:
// pool standings, every game, knockouts and finals) into the JSONs under
// public/data/baseball consumed here. WBC-centric by design, with room for
// WBSC rankings or other tournaments later.
//
// Server-only. Listed in scripts/check-client-imports.mjs SERVER_ONLY_MODULES.

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { getAllCountries } from "@/lib/countries";

export type BaseballTeam = {
  slug: string;
  name: string;
  apps: number;
  pld: number; w: number; l: number;
  rf: number; ra: number;
  titles: number; title_years: number[];
  runner_ups: number; ru_years: number[];
  best_finish: string | null;
  first: number; last: number;
};

export type BaseballGame = {
  year: number; date: string | null; round: string; pool: string;
  opp: string; result: string; score: string; home: boolean; venue: string;
};

export type BaseballTeamDetail = {
  slug: string;
  name: string;
  campaigns: { year: number; finish: string; w: number; l: number }[];
  games: BaseballGame[];
};

export type BaseballHub = {
  editions: {
    year: number; teams: number; games: number;
    champion: string; runner_up: string; score: string; venue: string; city: string;
  }[];
  finals: {
    year: number; champion: string; runner_up: string;
    score: string; venue: string; city: string;
  }[];
  total_games: number;
  total_teams: number;
};

const DATA_DIR = join(process.cwd(), "public", "data", "baseball");

function loadJson<T>(rel: string): T | null {
  const p = join(DATA_DIR, rel);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8")) as T;
}

let _teams: BaseballTeam[] | null = null;
let _hub: BaseballHub | null = null;
let _bySlug: Map<string, BaseballTeam> | null = null;

export function getAllBaseballTeams(): BaseballTeam[] {
  if (!_teams) _teams = loadJson<BaseballTeam[]>("teams.json") ?? [];
  return _teams;
}

export function getBaseballHub(): BaseballHub | null {
  if (!_hub) _hub = loadJson<BaseballHub>("hub.json");
  return _hub;
}

export function getBaseballTeamBySlug(slug: string): BaseballTeam | null {
  if (!_bySlug) _bySlug = new Map(getAllBaseballTeams().map((t) => [t.slug, t]));
  return _bySlug.get(slug) ?? null;
}

export function getAllBaseballSlugs(): string[] {
  return getAllBaseballTeams().map((t) => t.slug);
}

export function getBaseballTeamDetail(slug: string): BaseballTeamDetail | null {
  return loadJson<BaseballTeamDetail>(join("team-detail", `${slug}.json`));
}

// ---------- Country-hub join ----------

// Country page name -> team name where they diverge.
const COUNTRY_ALIASES: Record<string, string> = {
  "taiwan": "chinese taipei",
  // Great Britain national teams also surface on the home nations.
  "united kingdom": "great britain",
  "england": "great britain",
  "scotland": "great britain",
  "wales": "great britain",
  "czech republic": "czechia",
  "united states of america": "united states",
};

function norm(s: string): string {
  // Strip combining diacritics (U+0300-U+036F) after NFKD decomposition,
  // then fold "&" and "St." spellings, matching lib/cricket.ts norm().
  let out = "";
  for (const ch of s.normalize("NFKD")) {
    const cp = ch.codePointAt(0);
    if (cp === undefined || cp < 0x0300 || cp > 0x036f) out += ch;
  }
  return out
    .replace(/&/g, " and ")
    .replace(/\./g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

let _byName: Map<string, BaseballTeam> | null = null;

function teamsByName(): Map<string, BaseballTeam> {
  if (_byName) return _byName;
  _byName = new Map();
  for (const t of getAllBaseballTeams()) _byName.set(norm(t.name), t);
  return _byName;
}

export function getBaseballTeamForCountry(countryName: string): BaseballTeam | null {
  const key = COUNTRY_ALIASES[norm(countryName)] ?? norm(countryName);
  return teamsByName().get(key) ?? null;
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

// Reverse join: the country page a team links back to.
export function getCountrySlugForBaseballTeam(team: BaseballTeam): string | null {
  const key = norm(team.name);
  const direct = countryByNorm().get(key);
  if (direct) return direct;
  for (const [countryName, teamName] of Object.entries(COUNTRY_ALIASES)) {
    if (teamName === key) {
      const s = countryByNorm().get(norm(countryName));
      if (s) return s;
    }
  }
  return null;
}
