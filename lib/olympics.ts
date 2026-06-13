import "server-only";

// Olympics portal data layer (/teams/olympics).
//
// Source: scripts/olympics/build_olympics_data.py parses
// scripts/olympics/olympics.txt (Olympedia medals-by-country tables for all
// 56 editions: every Summer and Winter Games plus the 1906 Intercalated
// Games, which count fully in totals by editorial choice). Historical NOCs
// fold into modern lineages (Soviet Union/Unified Team/ROC -> Russia,
// Yugoslavia/Serbia & Montenegro -> Serbia, Bohemia/Czechoslovakia ->
// Czechia, West Germany -> Germany, UAR -> Egypt); East Germany and the
// combined/special teams stay separate entities.
//
// Server-only. Listed in scripts/check-client-imports.mjs SERVER_ONLY_MODULES.

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { getAllCountries } from "@/lib/countries";

export type MedalLine = {
  g: number; s: number; b: number;
  first: number | null; last: number | null;
};

export type OlympicTeam = {
  slug: string;
  code: string;
  name: string;
  special: boolean;
  lineage: string[] | null;
  apps: number; summer_apps: number; winter_apps: number;
  g: number; s: number; b: number; total: number;
  summer: MedalLine;
  winter: MedalLine;
  best_rank: number;
  alltime_rank: number | null;
  // Times this lineage topped a Games medal table, by golds and by total
  // medals, split Summer (1906 included) / Winter.
  no1: {
    summer_gold: number; summer_total: number;
    winter_gold: number; winter_total: number;
  };
  first: number; last: number;
  related_teams: string[];
  related_countries: string[];
};

export type OlympicEditionRow = {
  year: number; season: string;
  g: number; s: number; b: number; total: number;
  rank: number;
  as: string | null;
};

export type OlympicTeamDetail = {
  slug: string;
  name: string;
  editions: OlympicEditionRow[];
  related_teams: { name: string; slug: string | null }[];
};

export type OlympicsHub = {
  editions: {
    year: number; season: string; nations: number; medals: number;
    top: { name: string; g: number; s: number; b: number }[];
  }[];
  totals: { editions: number; teams: number; first: number; last: number };
  note_1906: string;
};

const DATA_DIR = join(process.cwd(), "public", "data", "olympics");

function loadJson<T>(rel: string): T | null {
  const p = join(DATA_DIR, rel);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8")) as T;
}

let _teams: OlympicTeam[] | null = null;
let _hub: OlympicsHub | null = null;
let _bySlug: Map<string, OlympicTeam> | null = null;

export function getAllOlympicTeams(): OlympicTeam[] {
  if (!_teams) _teams = loadJson<OlympicTeam[]>("teams.json") ?? [];
  return _teams;
}

export function getOlympicsHub(): OlympicsHub | null {
  if (!_hub) _hub = loadJson<OlympicsHub>("hub.json");
  return _hub;
}

export function getOlympicTeamBySlug(slug: string): OlympicTeam | null {
  if (!_bySlug) _bySlug = new Map(getAllOlympicTeams().map((t) => [t.slug, t]));
  return _bySlug.get(slug) ?? null;
}

export function getAllOlympicSlugs(): string[] {
  return getAllOlympicTeams().map((t) => t.slug);
}

export function getOlympicTeamDetail(slug: string): OlympicTeamDetail | null {
  return loadJson<OlympicTeamDetail>(join("team-detail", `${slug}.json`));
}

// ---------- Country-hub join ----------

const COUNTRY_ALIASES: Record<string, string> = {
  "taiwan": "chinese taipei",
  // "united kingdom" stays first among the Great Britain keys so the reverse
  // join (team page -> country) resolves to the UK page.
  "united kingdom": "great britain",
  "england": "great britain",
  "scotland": "great britain",
  "wales": "great britain",
  "northern ireland": "great britain",
  "czech republic": "czechia",
  "united states of america": "united states",
  "turkiye": "turkey",
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

let _byName: Map<string, OlympicTeam> | null = null;

function teamsByName(): Map<string, OlympicTeam> {
  if (_byName) return _byName;
  _byName = new Map();
  for (const t of getAllOlympicTeams()) {
    if (!t.special) _byName.set(norm(t.name), t);
  }
  // Special entities that serve as the card for countries without a modern
  // team of their own (e.g. Netherlands Antilles on Curacao/Aruba/Sint Maarten).
  for (const t of getAllOlympicTeams()) {
    for (const c of t.related_countries) {
      const key = norm(c);
      if (!_byName.has(key)) _byName.set(key, t);
    }
  }
  return _byName;
}

export function getOlympicTeamForCountry(countryName: string): OlympicTeam | null {
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

// Reverse join: the country page a team links back to (null for special teams).
export function getCountrySlugForOlympicTeam(team: OlympicTeam): string | null {
  if (team.special) return null;
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
