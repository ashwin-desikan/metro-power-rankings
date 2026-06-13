import "server-only";

// International ice hockey data layer (/teams/hockey).
// Source: scripts/hockey/build_hockey_data.py — Olympic men's podiums
// 1920-2026 (the ultimate trophy), Canada Cup / World Cup of Hockey, and the
// annual IIHF World Championship. Lineages fold into modern nations (Soviet
// Union/Unified Team/ROC/OAR -> Russia, Czechoslovakia/Czechia -> Czech
// Republic, West Germany -> Germany). Olympic gold is the headline honour.
//
// Server-only. Listed in scripts/check-client-imports.mjs SERVER_ONLY_MODULES.

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { getAllCountries } from "@/lib/countries";

export type HockeyNation = {
  slug: string; name: string;
  oly_gold: number; oly_silver: number; oly_bronze: number; oly_medals: number;
  oly_gold_years: number[]; oly_alltime_rank: number | null;
  wc_titles: number; wc_title_years: number[]; wc_ru: number; wc_ru_years: number[];
  worlds_gold: number; worlds_silver: number; worlds_bronze: number;
  worlds_medals: number; worlds_gold_years: number[];
  lineage: string[] | null;
};

export type HockeyDetail = {
  slug: string; name: string;
  oly: { year: number; medal: string }[];
  wc: { year: number; event: string; medal: string }[];
  worlds: { year: number; medal: string }[];
};

export type HockeyHub = {
  olympic_podiums: { year: number; gold: string; silver: string; bronze: string }[];
  world_cup: { year: number; event: string; champion: string; ru: string }[];
  worlds: { year: number; gold: string; silver: string; bronze: string }[];
  totals: { nations: number; oly_editions: number; wc_editions: number; worlds_editions: number };
};

const DATA_DIR = join(process.cwd(), "public", "data", "hockey");

function loadJson<T>(rel: string): T | null {
  const p = join(DATA_DIR, rel);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8")) as T;
}

let _nations: HockeyNation[] | null = null;
let _hub: HockeyHub | null = null;
let _bySlug: Map<string, HockeyNation> | null = null;

export function getAllHockeyTeams(): HockeyNation[] {
  if (!_nations) _nations = loadJson<HockeyNation[]>("nations.json") ?? [];
  return _nations;
}

export function getHockeyHub(): HockeyHub | null {
  if (!_hub) _hub = loadJson<HockeyHub>("hub.json");
  return _hub;
}

export function getHockeyTeamBySlug(slug: string): HockeyNation | null {
  if (!_bySlug) _bySlug = new Map(getAllHockeyTeams().map((t) => [t.slug, t]));
  return _bySlug.get(slug) ?? null;
}

export function getAllHockeySlugs(): string[] {
  return getAllHockeyTeams().map((t) => t.slug);
}

export function getHockeyTeamDetail(slug: string): HockeyDetail | null {
  return loadJson<HockeyDetail>(join("team-detail", `${slug}.json`));
}

// ---------- Country-hub join (same machinery as the other sports) ----------

const COUNTRY_ALIASES: Record<string, string> = {
  // Great Britain (1936 Olympic champions) also surfaces on the home nations.
  "united kingdom": "great britain",
  "england": "great britain",
  "scotland": "great britain",
  "wales": "great britain",
};

function norm(s: string): string {
  let out = "";
  for (const ch of s.normalize("NFKD")) {
    const cp = ch.codePointAt(0);
    if (cp === undefined || cp < 0x0300 || cp > 0x036f) out += ch;
  }
  return out.replace(/&/g, " and ").replace(/\./g, " ").replace(/\s+/g, " ")
    .toLowerCase().trim();
}

let _byName: Map<string, HockeyNation> | null = null;

function nationsByName(): Map<string, HockeyNation> {
  if (_byName) return _byName;
  _byName = new Map();
  for (const t of getAllHockeyTeams()) _byName.set(norm(t.name), t);
  return _byName;
}

export function getHockeyTeamForCountry(countryName: string): HockeyNation | null {
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

export function getCountrySlugForHockeyTeam(team: HockeyNation): string | null {
  const direct = countryByNorm().get(norm(team.name));
  if (direct) return direct;
  for (const [countryName, teamName] of Object.entries(COUNTRY_ALIASES)) {
    if (teamName === norm(team.name)) {
      const s = countryByNorm().get(norm(countryName));
      if (s) return s;
    }
  }
  return null;
}
