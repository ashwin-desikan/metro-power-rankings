import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// Policy interest rate spines (/business/economy/rates). One JSON per central
// bank plus an index.json, contract documented in scripts/macro/RATES-CONTRACT.md.
// Deliberately NOT one loader that globs and imports all 60 files: this
// directory is 6.5 MB, and the site's function-size gate fails a route around
// 245 MB (check:function-size in CLAUDE.md). getBank() reads exactly one file.
//
// GitHub-raw-first ISR, same idiom as lib/nflElo.ts and lib/footyFinals.ts:
// scripts/macro/rates/refresh.py commits a weekly data update with
// `[vercel skip]`, so no production build follows it. Without this the
// commit would sit unread until the next real build - the site's 2-builds-a-
// day budget forbids using a build to surface a weekly data refresh. Prefer
// the GitHub raw copy when its `built` date is newer than the local
// build-time copy; fall back to local (offline, or raw fetch failing) so the
// page never goes blank.

const DIR = join(process.cwd(), "public", "data", "business", "economy", "rates");
const GH_BASE =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data/business/economy/rates";

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
  // Whether this file is one of the 49 index-listed banks (true) or a
  // BIS-derived duplicate of an own-spine bank kept on disk but dropped from
  // index.json (false) - see superseded_by for which listed code replaces it.
  // getBank() already refuses unlisted codes, so callers rarely see false.
  listed: boolean;
  superseded_by: string | null;
  // Non-null for a bank whose own currency/mandate ended (the ten euro
  // joiners: AT, BE, ES, FR, GR, HR, IT, NL, PT, plus the Bundesbank).
  ended: string | null;
  ended_note: string | null;
};

export type RatesIndexEntry = {
  code: string;
  name: string;
  short: string;
  country: string;
  iso2: string;
  founded: string | null;
  series_from: string;
  last_change: string;
  spine: "own" | "bis" | "mixed";
  // Rank by /countries' scoreRank; null only for the ECB, which has no single
  // country. Ascending = more powerful.
  power_rank: number | null;
  ended: string | null;
  ended_note: string | null;
  level: number;
  changes: number;
  changes_12m: number;
  hold_days: number | null;
  direction_12m: "cutting" | "hiking" | "hold" | "mixed" | "market" | "ended";
};

export type RatesIndex = {
  built: string;
  banks: RatesIndexEntry[];
};

// readLocal is a literal per-file readFileSync (never a helper taking a
// dynamic filename) so the Vercel file tracer scopes each route to just the
// file(s) it reads - see scripts/DATA-READS-RECIPE.md. Mirrors lib/nflElo.ts's
// load() helper: local copy first (so a build always has a fallback), then a
// tagged GitHub-raw fetch preferred only when it is actually newer.
async function load<T extends { built: string }>(
  file: string,
  readLocal: () => T,
): Promise<T | null> {
  let local: T | null = null;
  try {
    local = readLocal();
  } catch {
    /* no build-time copy */
  }
  try {
    const res = await fetch(`${GH_BASE}/${file}`, {
      next: { revalidate: 3600, tags: ["economy-rates"] },
    });
    if (res.ok) {
      const remote = (await res.json()) as T;
      if (remote && remote.built && (!local || remote.built > local.built)) {
        return remote;
      }
    }
  } catch {
    /* offline: local only */
  }
  return local;
}

export async function getRatesIndex(): Promise<RatesIndex | null> {
  return load<RatesIndex>("index.json", () =>
    JSON.parse(readFileSync(join(DIR, "index.json"), "utf-8")) as RatesIndex,
  );
}

// Reads exactly ONE bank file, validated against the index first so a bad
// code (or a code with no file) returns null rather than throwing.
export async function getBank(code: string): Promise<BankFile | null> {
  const index = await getRatesIndex();
  if (!index || !index.banks.some((b) => b.code === code)) return null;
  return load<BankFile>(`${code}.json`, () =>
    JSON.parse(readFileSync(join(DIR, `${code}.json`), "utf-8")) as BankFile,
  );
}

export function bankHref(code: string): string {
  return `/business/economy/rates/${code}`;
}
