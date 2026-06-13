import "server-only";

// Women's International portal data layer (/teams/wnational).
//
// Source: scripts/intl_sport/build_womens_intl.py parses the womens_euros.txt
// and womens_olympics.txt edition sources into the JSONs under
// public/data/wintl consumed here, plus a one-off Finalissima record. The
// Women's World Cup keeps its own data (lib/wnational.ts); this hub links to it.
//
// Server-only. Listed in scripts/check-client-imports.mjs SERVER_ONLY_MODULES.

import { existsSync, readFileSync } from "fs";
import { join } from "path";

export type WIntlMeta = {
  label: string; slug: string; editions: number; nations: number;
  year_min: string; year_max: string;
};

export type WKnockoutEdition = {
  year: string; host: string; champion: string; runner_up: string;
  score: string; semifinalists: string[];
};

export type WFinal = {
  year: string; champion: string; runner_up: string; score: string; host: string;
};

export type WKnockoutNation = {
  slug: string; name: string; apps: number;
  titles: number; title_years: string[];
  runner_ups: number; ru_years: string[];
  semis: number; semi_years: string[];
  best_finish: string; first: number; last: number;
  lineage: string[] | null;
  results: { year: string; finish: string; host: string }[];
};

export type WKnockoutComp = {
  meta: WIntlMeta;
  editions: WKnockoutEdition[];
  finals: WFinal[];
  nations: WKnockoutNation[];
};

export type WMedalEdition = {
  year: string; host: string; gold: string; silver: string; bronze: string; fourth: string;
};

export type WMedalNation = {
  slug: string; name: string; apps: number;
  gold: number; gold_years: string[]; silver: number; bronze: number; medals: number;
  best_finish: string; first: number; last: number;
  results: { year: string; medal: string; host: string }[];
};

export type WMedalComp = {
  meta: WIntlMeta;
  editions: WMedalEdition[];
  nations: WMedalNation[];
};

const DATA_DIR = join(process.cwd(), "public", "data", "wintl");

function loadJson<T>(rel: string): T | null {
  const p = join(DATA_DIR, `${rel}.json`);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8")) as T;
}

let _euros: WKnockoutComp | null = null;
let _oly: WMedalComp | null = null;
let _fin: WKnockoutComp | null = null;

export function getWEuros(): WKnockoutComp | null {
  if (!_euros) _euros = loadJson<WKnockoutComp>("euros");
  return _euros;
}

export function getWOlympics(): WMedalComp | null {
  if (!_oly) _oly = loadJson<WMedalComp>("olympics");
  return _oly;
}

// Finalissima is a one-off; it reuses the knockout shape (a single edition).
export function getWFinalissima(): WKnockoutComp | null {
  if (!_fin) _fin = loadJson<WKnockoutComp>("finalissima");
  return _fin;
}
