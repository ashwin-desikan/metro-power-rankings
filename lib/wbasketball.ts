import "server-only";

// Women's international basketball data layer (/teams/basketball/women).
// Source: scripts/basketball/build_intl_wbasketball.py, which holds the FIBA Women's
// Basketball World Cup final four of every edition 1953-2022, every Olympic
// podium since Montreal 1976, and the FIBA Women's World Ranking that
// scripts/basketball/fetch_fiba_ranking.py --gender women already refreshes
// weekly. Lineages follow the men's rules (USSR/Unified Team -> Russia,
// Yugoslav lineages -> Serbia, Czechoslovakia -> Czech Republic, East Germany
// -> Germany), attributed per edition.
//
// Server-only. Listed in scripts/check-client-imports.mjs SERVER_ONLY_MODULES.
//
// EVERY read here is a runtime read through lib/liveData (GitHub raw + ISR,
// bundled copy as the fallback). That is deliberate and it is what lets the
// 2026 World Cup tracker commit its result with [vercel skip] and still have
// it reach readers without a production build. There is no build-time
// readFileSync in this file; do not add one without also dropping the skip
// tag from .github/workflows/wwc-2026-tracker.yml.
import { loadLiveJson } from "@/lib/liveData";
import { getAllCountries } from "@/lib/countries";

export type WBasketballNation = {
  slug: string; name: string;
  /** Null on purpose: the World Cup source lists only each edition's final
   *  four, so an appearance count is not derivable. */
  wc_apps: number | null;
  wc_titles: number; wc_title_years: number[];
  wc_ru: number; wc_ru_years: number[];
  wc_final_fours: number;
  gold: number; gold_years: number[];
  silver: number; silver_years: number[];
  bronze: number; bronze_years: number[];
  medals: number;
  lineage: string[] | null;
  fiba_rank?: number; fiba_pts?: number; fiba_zone?: string | null;
  fiba_zone_rank?: number; fiba_delta?: number;
};

export type WFibaTeam = {
  rank: number; country: string; ioc: string; zone: string | null;
  zoneRank: number; pts: number; delta: number;
  slug: string | null; country_slug: string | null;
};

export type WFibaRanking = {
  date: string; label: string; source: string; teams: WFibaTeam[];
};

export type WBasketballNationDetail = {
  slug: string; name: string;
  campaigns: {
    year: number; host: string; finish: string; score: string;
    opponent: string; as: string | null;
  }[];
  olympics: { year: number; host: string | null; medal: string; as: string | null }[];
  podium_years: { gold: number[]; silver: number[]; bronze: number[] };
  fiba?: WFibaTeam | null;
};

export type WBasketballHub = {
  wc_finals: {
    year: number; host: string; champion: string; score: string;
    runner_up: string; third: string; fourth: string; teams: number | null;
  }[];
  wc_editions_on_file: number[];
  wc_scheduled: { year: number; host: string }[];
  podiums: {
    year: number; host: string | null;
    gold: string; silver: string | null; bronze: string | null;
  }[];
  totals: { nations: number; podium_editions: number; wc_editions: number };
  meta: Record<string, string>;
};

let _nations: WBasketballNation[] | null = null;
let _hub: WBasketballHub | null = null;
let _fiba: WFibaRanking | null = null;
let _bySlug: Map<string, WBasketballNation> | null = null;

export async function getAllWBasketballNations(): Promise<WBasketballNation[]> {
  if (!_nations) _nations = (await loadLiveJson<WBasketballNation[]>("wbasketball/nations.json")) ?? [];
  return _nations;
}

export async function getWBasketballHub(): Promise<WBasketballHub | null> {
  if (!_hub) _hub = await loadLiveJson<WBasketballHub>("wbasketball/hub.json");
  return _hub;
}

export async function getWFibaRanking(): Promise<WFibaRanking | null> {
  if (!_fiba) _fiba = await loadLiveJson<WFibaRanking>("wbasketball/fiba_ranking.json");
  return _fiba;
}

export async function getWBasketballNationBySlug(slug: string): Promise<WBasketballNation | null> {
  if (!_bySlug) _bySlug = new Map((await getAllWBasketballNations()).map((t) => [t.slug, t]));
  return _bySlug.get(slug) ?? null;
}

export async function getAllWBasketballSlugs(): Promise<string[]> {
  return (await getAllWBasketballNations()).map((t) => t.slug);
}

export async function getWBasketballNationDetail(slug: string): Promise<WBasketballNationDetail | null> {
  return loadLiveJson<WBasketballNationDetail>(`wbasketball/nation-detail/${slug}.json`);
}

// ---------- Country join (same norm/alias machinery as lib/basketball.ts) ----------

const COUNTRY_ALIASES: Record<string, string> = {
  "united states of america": "united states",
  taiwan: "chinese taipei",
  "united kingdom": "great britain",
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

export function getCountrySlugForWBasketballNation(team: WBasketballNation): string | null {
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
