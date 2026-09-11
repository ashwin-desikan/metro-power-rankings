import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// Consumer prices (/business/economy/prices). One index.json plus two full
// monthly histories under history/, written by
// scripts/macro/prices/build_prices.py. Same loader shape as
// lib/economyHousing.ts: literal paths (never a root const, never a glob;
// see scripts/DATA-READS-RECIPE.md), GitHub-raw-first ISR so the weekly
// data commit ([vercel skip]) reaches the page without a production build,
// local copy as the fallback so the page never goes blank.

const GH_BASE =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data/business/economy/prices";

export type MonthlySeries = {
  source: string;
  latest_month: string;
  latest_index: number;
  yoy: number | null;
  mom: number | null;
  /** [year, month, index, yoyPct|null], trimmed to the last 30 years. */
  series_30y: [number, number, number, number | null][];
};

export type PricesAnnualRow = {
  slug: string;
  name: string;
  iso2: string;
  iso3: string;
  latest_value: number;
  latest_year: number;
  cagr5: number | null;
  cagr10: number | null;
};

export type PricesIndex = {
  built: string;
  source: string;
  us: MonthlySeries;
  uk: MonthlySeries;
  annual: PricesAnnualRow[];
};

/** [year, month, index] */
export type PricesHistory = [number, number, number][];

async function load<T extends object>(
  file: string,
  readLocal: () => T,
  newer: (remote: T, local: T | null) => boolean,
): Promise<T | null> {
  let local: T | null = null;
  try {
    local = readLocal();
  } catch {
    /* no build-time copy */
  }
  try {
    const res = await fetch(`${GH_BASE}/${file}`, {
      next: { revalidate: 21600, tags: ["economy-prices"] },
    });
    if (res.ok) {
      const remote = (await res.json()) as T;
      if (remote && newer(remote, local)) return remote;
    }
  } catch {
    /* offline: local only */
  }
  return local;
}

export async function getPricesIndex(): Promise<PricesIndex | null> {
  return load<PricesIndex>(
    "index.json",
    () =>
      JSON.parse(
        readFileSync(join(process.cwd(), "public", "data", "business", "economy", "prices", "index.json"), "utf-8"),
      ) as PricesIndex,
    (remote, local) => !local || remote.built > local.built,
  );
}

/** Full monthly history for "us" or "uk"; the index has only the last 30 years. */
export async function getPricesHistory(country: "us" | "uk"): Promise<PricesHistory | null> {
  return load<PricesHistory>(
    `history/${country}.json`,
    () =>
      JSON.parse(
        readFileSync(
          join(process.cwd(), "public", "data", "business", "economy", "prices", "history", `${country}.json`),
          "utf-8",
        ),
      ) as PricesHistory,
    (remote, local) => {
      // The history file carries no built date; prefer the remote only when
      // it reaches a later month than the local copy.
      const last = (f: PricesHistory | null) => (f && f.length ? f[f.length - 1][0] * 12 + f[f.length - 1][1] : 0);
      return last(remote) > last(local);
    },
  );
}
