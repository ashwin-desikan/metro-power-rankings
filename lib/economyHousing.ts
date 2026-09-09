import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// House prices (/business/economy/housing). One index.json plus one file per
// FHFA metropolitan area under msa/, written by
// scripts/macro/housing/build_housing.py. Same shape of loader as
// lib/economyRates.ts: literal paths (never a root const, never a glob; see
// scripts/DATA-READS-RECIPE.md), GitHub-raw-first ISR so the weekly data
// commit ([vercel skip]) reaches the page without a production build, local
// copy as the fallback so the page never goes blank.

const GH_BASE =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data/business/economy/housing";

export type Horizon = "y1" | "y5" | "y10" | "y25" | "since2000";

export type Drawdown = { peak: string; trough: string; pct: number } | null;

export type HousingTerms = {
  y1: number | null;
  y5: number | null;
  y10: number | null;
  y25: number | null;
  since2000: number | null;
  drawdown: Drawdown;
};

export type HousingMsaRow = {
  cbsa: string;
  name: string;
  states: string[];
  /** FHFA publishes the largest metros only as their principal Metropolitan
   *  Division (New York-Jersey City-White Plains, not the whole New York MSA). */
  division: boolean;
  flavor: "purchase-only" | "all-transactions";
  /** Metro slug on this site, or null when the crosswalk found none. */
  metro: string | null;
  first: string;
  latest: string;
  index: number;
  index_sa: number | null;
  nominal: HousingTerms;
  real: HousingTerms;
};

export type HousingNational = {
  id: string;
  name: string;
  latest: string;
  index: number;
  nominal: Pick<HousingTerms, "y1" | "y10" | "since2000" | "drawdown">;
  real: Pick<HousingTerms, "y1" | "y10" | "since2000" | "drawdown">;
  /** [year, quarter, nsa, sa | null, real_nsa] */
  series: [number, number, number, number | null, number][];
};

export type HousingIndex = {
  built: string;
  source: string;
  latest: string;
  base_year: number;
  cpi_last_year: number;
  cpi: Record<string, number>;
  crosswalk: { matched: number; us_metros: number; unmatched: string[] };
  national: HousingNational[];
  msas: HousingMsaRow[];
};

export type HousingMsaFile = {
  cbsa: string;
  name: string;
  flavor: "purchase-only" | "all-transactions";
  division: boolean;
  metro: string | null;
  base_year: number;
  /** [year, quarter, nsa, sa | null, real_nsa] */
  series: [number, number, number, number | null, number][];
};

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
      next: { revalidate: 3600, tags: ["economy-housing"] },
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

export async function getHousingIndex(): Promise<HousingIndex | null> {
  return load<HousingIndex>(
    "index.json",
    () => JSON.parse(readFileSync(join(process.cwd(), "public", "data", "business", "economy", "housing", "index.json"), "utf-8")) as HousingIndex,
    (remote, local) => !local || remote.built > local.built,
  );
}

/** Exactly one MSA file, validated against the index so a bad cbsa returns null. */
export async function getHousingMsa(cbsa: string): Promise<HousingMsaFile | null> {
  if (!/^\d{5}$/.test(cbsa)) return null;
  const index = await getHousingIndex();
  const row = index?.msas.find((m) => m.cbsa === cbsa);
  if (!row) return null;
  return load<HousingMsaFile>(
    `msa/${cbsa}.json`,
    () => JSON.parse(readFileSync(join(process.cwd(), "public", "data", "business", "economy", "housing", "msa", `${cbsa}.json`), "utf-8")) as HousingMsaFile,
    (remote, local) => {
      // The per-MSA file carries no built date; prefer the remote only when
      // it reaches a later quarter than the local copy.
      const last = (f: HousingMsaFile | null) => (f && f.series.length ? f.series[f.series.length - 1][0] * 10 + f.series[f.series.length - 1][1] : 0);
      return last(remote) > last(local);
    },
  );
}

/** The FHFA row for a metro slug, or null when the crosswalk has none. */
export async function getHousingForMetro(slug: string): Promise<{ row: HousingMsaRow; file: HousingMsaFile | null; index: HousingIndex } | null> {
  const index = await getHousingIndex();
  const row = index?.msas.find((m) => m.metro === slug);
  if (!index || !row) return null;
  const file = await getHousingMsa(row.cbsa);
  return { row, file, index };
}

export function housingHref(cbsa: string): string {
  return `/business/economy/housing/${cbsa}`;
}

export const HORIZONS: { key: Horizon; label: string; short: string }[] = [
  { key: "y1", label: "1 year", short: "1y" },
  { key: "y5", label: "5 years", short: "5y" },
  { key: "y10", label: "10 years", short: "10y" },
  { key: "y25", label: "25 years", short: "25y" },
  { key: "since2000", label: "since 2000", short: "2000" },
];
