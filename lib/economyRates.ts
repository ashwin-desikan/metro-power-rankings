import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// Policy interest rate spines (/business/economy/rates). One JSON per central
// bank plus an index.json, contract documented in scripts/macro/RATES-CONTRACT.md.
// Deliberately NOT one loader that globs and imports all 60 files: this
// directory is 6.5 MB, and the site's function-size gate fails a route around
// 245 MB (check:function-size in CLAUDE.md). getBank() reads exactly one file.

const DIR = join(process.cwd(), "public", "data", "business", "economy", "rates");

export type RateInstrument = {
  from: string;
  to: string | null;
  name: string;
  text: string;
  kind: "policy" | "market";
};

export type RateChange = {
  date: string;
  level?: number;
  lower?: number;
  upper?: number;
  change?: number | null;
  era: number;
  break?: boolean;
  note?: string;
};

export type RateMarketEra = {
  era: number;
  from: string;
  to: string;
  observations: number;
  first: number;
  last: number;
  min: number;
  max: number;
};

export type RateSource = { label: string; url: string; licence?: string };

export type BankFile = {
  code: string;
  name: string;
  short: string;
  country: string;
  iso2: string;
  currency: string;
  founded: string | null;
  first_change: string;
  last_change: string;
  built: string;
  instruments: RateInstrument[];
  changes: RateChange[];
  market: RateMarketEra[];
  path: [string, number][];
  coverage: { spine: "own" | "bis" | "mixed"; note: string };
  sources: RateSource[];
};

export type RatesIndexEntry = {
  code: string;
  name: string;
  short: string;
  iso2: string;
  founded: string | null;
  series_from: string;
  last_change: string;
  level: number;
  changes: number;
  changes_12m: number;
  spine: "own" | "bis" | "mixed";
  hold_days: number | null;
  direction_12m: "cutting" | "hiking" | "hold" | "mixed" | "market";
};

export type RatesIndex = {
  built: string;
  banks: RatesIndexEntry[];
};

let indexCache: RatesIndex | null | undefined;

export function getRatesIndex(): RatesIndex | null {
  if (indexCache !== undefined) return indexCache;
  try {
    indexCache = JSON.parse(readFileSync(join(DIR, "index.json"), "utf-8")) as RatesIndex;
  } catch {
    indexCache = null;
  }
  return indexCache;
}

// Reads exactly ONE bank file, validated against the index first so a bad
// code (or a code with no file) returns null rather than throwing.
export function getBank(code: string): BankFile | null {
  const index = getRatesIndex();
  if (!index || !index.banks.some((b) => b.code === code)) return null;
  try {
    return JSON.parse(readFileSync(join(DIR, `${code}.json`), "utf-8")) as BankFile;
  } catch {
    return null;
  }
}

export function bankHref(code: string): string {
  return `/business/economy/rates/${code}`;
}
