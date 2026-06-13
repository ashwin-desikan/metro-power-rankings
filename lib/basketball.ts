import "server-only";

// International Basketball (+ EuroLeague) data layer (/teams/basketball).
// Source: scripts/basketball/build_intl_basketball.py — FIBA World Cup
// editions on file (1990-2023, finals from a reviewed canonical table),
// all 21 Olympic podiums, and the OtherLeagues EuroLeague Table sheet.
// Lineages per the user's Olympic rules (USSR/Unified -> Russia,
// Yugoslavia/SCG -> Serbia). Olympic gold is the ultimate-trophy chip.
//
// Server-only. Listed in scripts/check-client-imports.mjs SERVER_ONLY_MODULES.

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { getAllCountries } from "@/lib/countries";

export type BasketballNation = {
  slug: string; name: string;
  wc_apps: number;
  wc_titles: number; wc_title_years: number[];
  wc_ru: number; wc_ru_years: number[];
  gold: number; gold_years: number[];
  silver: number; bronze: number; medals: number;
  lineage: string[] | null;
  fiba_rank?: number; fiba_pts?: number; fiba_zone?: string;
  fiba_zone_rank?: number; fiba_delta?: number;
};

export type FibaTeam = {
  rank: number; country: string; ioc: string; zone: string | null;
  zoneRank: number; pts: number; delta: number;
  slug: string | null; country_slug: string | null;
};

export type FibaRanking = {
  date: string; label: string; source: string; teams: FibaTeam[];
};

export type BasketballNationDetail = {
  slug: string; name: string;
  campaigns: { year: number; w: number; l: number; finish: string | null; as: string | null }[];
  podium_years: { gold: number[]; silver: number[]; bronze: number[] };
  fiba?: FibaTeam | null;
};

export type BasketballHub = {
  wc_finals: { year: number; champion: string; ru: string; score: string }[];
  wc_editions_on_file: number[];
  podiums: { year: number; gold: string; silver?: string; bronze?: string }[];
  totals: { nations: number; podium_editions: number };
};

export type EuroleagueData = {
  roll: { season: string; champion: string; ru: string; f4_others: string[] }[];
  clubs: {
    name: string; country: string; w: number; l: number; seasons: number;
    f4: number; finals: number; titles: number; title_years: string[];
    in_team_list: boolean; metro: string | null; metro_slug: string | null;
  }[];
  most_titled: { name: string; titles: number }[];
  seasons: number;
};

const DATA_DIR = join(process.cwd(), "public", "data", "basketball");

function loadJson<T>(rel: string): T | null {
  const p = join(DATA_DIR, rel);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8")) as T;
}

let _nations: BasketballNation[] | null = null;
let _hub: BasketballHub | null = null;
let _el: EuroleagueData | null = null;
let _bySlug: Map<string, BasketballNation> | null = null;

export function getAllBasketballNations(): BasketballNation[] {
  if (!_nations) _nations = loadJson<BasketballNation[]>("nations.json") ?? [];
  return _nations;
}

export function getBasketballHub(): BasketballHub | null {
  if (!_hub) _hub = loadJson<BasketballHub>("hub.json");
  return _hub;
}

export function getEuroleague(): EuroleagueData | null {
  if (!_el) _el = loadJson<EuroleagueData>("euroleague.json");
  return _el;
}

let _fiba: FibaRanking | null = null;

export function getFibaRanking(): FibaRanking | null {
  if (!_fiba) _fiba = loadJson<FibaRanking>("fiba_ranking.json");
  return _fiba;
}

export function getBasketballNationBySlug(slug: string): BasketballNation | null {
  if (!_bySlug) _bySlug = new Map(getAllBasketballNations().map((t) => [t.slug, t]));
  return _bySlug.get(slug) ?? null;
}

export function getAllBasketballSlugs(): string[] {
  return getAllBasketballNations().map((t) => t.slug);
}

export function getBasketballNationDetail(slug: string): BasketballNationDetail | null {
  return loadJson<BasketballNationDetail>(join("nation-detail", `${slug}.json`));
}

// ---------- Country join (same norm/alias machinery as the other sports) ----------

const COUNTRY_ALIASES: Record<string, string> = {
  "united states of america": "united states",
  "taiwan": "chinese taipei",
  // Great Britain national teams also surface on the home nations.
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

let _byName: Map<string, BasketballNation> | null = null;

function nationsByName(): Map<string, BasketballNation> {
  if (_byName) return _byName;
  _byName = new Map();
  for (const t of getAllBasketballNations()) _byName.set(norm(t.name), t);
  return _byName;
}

export function getBasketballTeamForCountry(countryName: string): BasketballNation | null {
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

export function getCountrySlugForBasketballNation(team: BasketballNation): string | null {
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

// Metro-card chips: EuroLeague titles by club name.
let _elByName: Map<string, { titles: number; years: string[]; f4: number }> | null = null;

export function getEuroleagueHonours(name: string): { titles: number; years: string[]; f4: number } | null {
  if (!_elByName) {
    _elByName = new Map();
    for (const c of getEuroleague()?.clubs ?? []) {
      if (c.titles > 0 || c.f4 > 0)
        _elByName.set(c.name, { titles: c.titles, years: c.title_years, f4: c.f4 });
    }
  }
  return _elByName.get(name) ?? null;
}
