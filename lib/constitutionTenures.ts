import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// How many executives each constitution has seen, and which leaders outlasted
// the document that made them. Built by
// scripts/civic/build_constitution_tenures.py from constitutions.json and the
// dated leaders files. Read at build time; both inputs are committed.
//
// THREE THINGS THIS LAYER REFUSES TO DO, each learned the hard way:
//   1. Pick one office globally. Head of state is the executive in the United
//      States, head of government in Italy. Both counts ship.
//   2. Count rotating offices. Switzerland's presidency rotates annually, so a
//      naive count makes the calmest polity in Europe the most volatile.
//   3. Trust an open-ended tenure. A row with no end date is filled from the
//      next holder's start, or the Han dynasty outlasts ten constitutions.

export type TenureCountry = {
  slug: string;
  name: string;
  adopted: number;
  years: number;
  headsOfState: number;
  headsOfGovernment: number;
  /** Which office the headline count uses: whichever actually turned over. */
  office: "hos" | "hog";
  transitions: number;
  yearsPerTransition: number | null;
  /** Rotating, acting and party offices, counted but not included. */
  excluded: Partial<Record<"rotating" | "acting" | "party", number>>;
  inOfficeAtAdoption: { name: string; role: string }[];
  /** Counted rows that came from a coarse "backbone" leaders file. */
  approximateRows: number;
  constitutionsSince1789: number;
};

export type Spanner = {
  slug: string;
  country: string;
  name: string;
  role: string;
  start: number;
  end: number | null;
  constitutionsOutlasted: number;
  adoptedDuring: number[];
};

export type TenuresData = {
  built: string;
  asOf: number;
  note: string;
  countries: TenureCountry[];
  spanners: Spanner[];
};

let cache: TenuresData | null = null;

export function getTenures(): TenuresData {
  if (!cache) {
    cache = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "constitution-tenures.json"), "utf-8"),
    ) as TenuresData;
  }
  return cache;
}

/** Countries whose count means something: at least one transition recorded. */
export function ranked(d: TenuresData): TenureCountry[] {
  return d.countries.filter((c) => c.transitions > 0);
}

/** Constitutions that have seen no change of executive at all. */
export function unchanged(d: TenuresData): TenureCountry[] {
  return d.countries
    .filter((c) => c.transitions === 0 && !Object.keys(c.excluded).length)
    .sort((a, b) => a.adopted - b.adopted);
}

export function tenuresForCountry(slug: string): TenureCountry | null {
  return getTenures().countries.find((c) => c.slug === slug) ?? null;
}

export const OFFICE_LABEL: Record<"hos" | "hog", string> = {
  hos: "heads of state",
  hog: "heads of government",
};
