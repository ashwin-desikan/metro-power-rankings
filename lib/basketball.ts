import "server-only";

// International Basketball (+ EuroLeague) data layer (/teams/basketball).
// Source: scripts/basketball/build_intl_basketball.py — FIBA World Cup
// editions on file (1990-2023, finals from a reviewed canonical table),
// all 21 Olympic podiums, and the OtherLeagues EuroLeague Table sheet.
// Lineages per the user's Olympic rules (USSR/Unified -> Russia,
// Yugoslavia/SCG -> Serbia). Olympic gold is the ultimate-trophy chip.
//
// Server-only. Listed in scripts/check-client-imports.mjs SERVER_ONLY_MODULES.

// nations/hub/fiba/nation-detail are runtime reads (weekly FIBA refresh commits
// them with the skip marker). euroleague.json deliberately stays a BUILD-TIME
// read: it is produced by scripts/basketball/build_intl_basketball.py from the
// workbook/Supabase, not by the weekly scraper, and keeping it sync keeps
// getEuroleagueHonours() callable from the synchronous sort callbacks in
// app/rankings/[slug]/page.tsx. Enforced by scripts/check-live-data.mjs.
import { loadLiveJson } from "@/lib/liveData";
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
  rankingOnly?: boolean; // FIBA-ranked but no medal/World-Cup honours (no team page)
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

let _nations: BasketballNation[] | null = null;
let _hub: BasketballHub | null = null;
let _el: EuroleagueData | null = null;
let _bySlug: Map<string, BasketballNation> | null = null;

export async function getAllBasketballNations(): Promise<BasketballNation[]> {
  if (!_nations) _nations = (await loadLiveJson<BasketballNation[]>("basketball/nations.json")) ?? [];
  return _nations;
}

export async function getBasketballHub(): Promise<BasketballHub | null> {
  if (!_hub) _hub = await loadLiveJson<BasketballHub>("basketball/hub.json");
  return _hub;
}

// Deliberately build-time and synchronous, unlike the four readers above.
// euroleague.json comes from scripts/basketball/build_intl_basketball.py
// (workbook + Supabase), not the weekly FIBA scraper, so it only ever changes
// on a run that needs a deploy anyway. Keeping it sync is what lets
// getEuroleagueHonours() stay callable from the synchronous sort callbacks in
// app/rankings/[slug]/page.tsx.
function readEuroleague(): EuroleagueData | null {
  const p = join(process.cwd(), "public", "data", "basketball", "euroleague.json");
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8")) as EuroleagueData;
}

export function getEuroleague(): EuroleagueData | null {
  if (!_el) _el = readEuroleague();
  return _el;
}

let _fiba: FibaRanking | null = null;

export async function getFibaRanking(): Promise<FibaRanking | null> {
  if (!_fiba) _fiba = await loadLiveJson<FibaRanking>("basketball/fiba_ranking.json");
  return _fiba;
}

export async function getBasketballNationBySlug(slug: string): Promise<BasketballNation | null> {
  if (!_bySlug) _bySlug = new Map((await getAllBasketballNations()).map((t) => [t.slug, t]));
  return _bySlug.get(slug) ?? null;
}

export async function getAllBasketballSlugs(): Promise<string[]> {
  return (await getAllBasketballNations()).map((t) => t.slug);
}

export async function getBasketballNationDetail(slug: string): Promise<BasketballNationDetail | null> {
  return loadLiveJson<BasketballNationDetail>(`basketball/nation-detail/${slug}.json`);
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

async function nationsByName(): Promise<Map<string, BasketballNation>> {
  if (_byName) return _byName;
  const m = new Map<string, BasketballNation>();
  for (const t of await getAllBasketballNations()) m.set(norm(t.name), t);
  _byName = m;
  return _byName;
}

let _fibaByName: Map<string, FibaTeam> | null = null;

async function fibaByName(): Promise<Map<string, FibaTeam>> {
  if (_fibaByName) return _fibaByName;
  const m = new Map<string, FibaTeam>();
  for (const t of (await getFibaRanking())?.teams ?? []) m.set(norm(t.country), t);
  _fibaByName = m;
  return _fibaByName;
}

export async function getBasketballTeamForCountry(countryName: string): Promise<BasketballNation | null> {
  const n = norm(countryName);
  const key = COUNTRY_ALIASES[n] ?? n;
  const honoured = (await nationsByName()).get(key);
  if (honoured) return honoured;
  // Fallback: a FIBA-ranked side with no medal/World-Cup honours, built from the
  // full FIBA ranking so the team still appears (with its current rank) even
  // without an honours record or team page. Great Britain competes as one side
  // (FIBA lists it as "United Kingdom"); like Olympics/baseball/hockey it must
  // surface on the UK page AND on each home nation it represents.
  const isGB = key === "great britain";
  const fiba = await fibaByName();
  const ft = isGB
    ? fiba.get("united kingdom")
    : (fiba.get(n) ?? fiba.get(key));
  if (!ft) return null;
  return {
    slug: isGB ? "great-britain" : (ft.country_slug ?? norm(ft.country).replace(/ /g, "-")),
    name: isGB ? "Great Britain" : ft.country,
    wc_apps: 0, wc_titles: 0, wc_title_years: [], wc_ru: 0, wc_ru_years: [],
    gold: 0, gold_years: [], silver: 0, bronze: 0, medals: 0, lineage: null,
    fiba_rank: ft.rank, fiba_pts: ft.pts, fiba_zone: ft.zone ?? undefined,
    fiba_zone_rank: ft.zoneRank, fiba_delta: ft.delta,
    rankingOnly: true,
  };
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
