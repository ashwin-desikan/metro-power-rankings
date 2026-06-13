import "server-only";

// International Rugby League portal data layer (/teams/rugby-league).
//
// Source: scripts/intl_sport/build_rugby_league_wc.py parses
// scripts/intl_sport/rugby_league_wc.txt (the 16 Rugby League World Cup
// editions, 1954-2021: champion, runner-up and the two losing semi-finalists
// of each) into the JSONs under public/data/rugby-league-intl consumed here.
// World-Cup-centric by design. Mirrors lib/baseball.ts (the WBC portal).
//
// Great Britain (1954-1992) is kept as its own national entity, the way West
// Indies is in cricket, rather than reassigning its titles to England.
//
// Server-only. Listed in scripts/check-client-imports.mjs SERVER_ONLY_MODULES.

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { getAllCountries } from "@/lib/countries";

export type RlNation = {
  slug: string;
  name: string;
  apps: number;
  titles: number; title_years: string[];
  runner_ups: number; ru_years: string[];
  semis: number; semi_years: string[];
  best_finish: string;
  first: number; last: number;
};

export type RlEdition = {
  ed: number; year: string; host: string; teams: number;
  champion: string; runner_up: string; score: string; semifinalists: string[];
};

export type RlFinal = {
  year: string; champion: string; runner_up: string; score: string; host: string;
};

export type RlHub = {
  editions: RlEdition[];
  finals: RlFinal[];
  total_editions: number;
  total_nations: number;
};

export type RlNationDetail = {
  slug: string;
  name: string;
  results: { year: string; finish: string; host: string }[];
};

const DATA_DIR = join(process.cwd(), "public", "data", "rugby-league-intl");

function loadJson<T>(rel: string): T | null {
  const p = join(DATA_DIR, rel);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8")) as T;
}

let _teams: RlNation[] | null = null;
let _hub: RlHub | null = null;
let _bySlug: Map<string, RlNation> | null = null;

export function getAllRlNations(): RlNation[] {
  if (!_teams) _teams = loadJson<RlNation[]>("teams.json") ?? [];
  return _teams;
}

export function getRlHub(): RlHub | null {
  if (!_hub) _hub = loadJson<RlHub>("hub.json");
  return _hub;
}

export function getRlNationBySlug(slug: string): RlNation | null {
  if (!_bySlug) _bySlug = new Map(getAllRlNations().map((t) => [t.slug, t]));
  return _bySlug.get(slug) ?? null;
}

export function getAllRlSlugs(): string[] {
  return getAllRlNations().map((t) => t.slug);
}

export function getRlNationDetail(slug: string): RlNationDetail | null {
  return loadJson<RlNationDetail>(join("team-detail", `${slug}.json`));
}

// ---------- Country-hub join ----------

// Great Britain competed as a single side; it surfaces on the United Kingdom
// page. England, Wales (and Scotland) have their own World Cup records, so they
// are NOT folded into Great Britain.
const COUNTRY_ALIASES: Record<string, string> = {
  "united kingdom": "great britain",
};

function norm(s: string): string {
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

let _byName: Map<string, RlNation> | null = null;

function nationsByName(): Map<string, RlNation> {
  if (_byName) return _byName;
  _byName = new Map();
  for (const t of getAllRlNations()) _byName.set(norm(t.name), t);
  return _byName;
}

export function getRlTeamForCountry(countryName: string): RlNation | null {
  const key = COUNTRY_ALIASES[norm(countryName)] ?? norm(countryName);
  return nationsByName().get(key) ?? null;
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

export function getCountrySlugForRlNation(team: RlNation): string | null {
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
