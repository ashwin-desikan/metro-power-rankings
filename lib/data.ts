// Server-only data loading - DO NOT import from client components
// For types and formatters, import from @/lib/shared instead

import { readFileSync } from "fs";
import { join } from "path";

// Re-export shared types for convenience in server components
export type { Metro, Region } from "./shared";
export { formatPop, formatMarketCap, formatGdp, formatDimValue, regionColors, slugify } from "./shared";

export interface MetroDetail {
  metro: {
    slug: string;
    name: string;
    country: string;
    subCountry?: string;
    // ETL-resolved slugs for /countries/[...] and /states/[...] links.
    // countrySlug prefers UK constituent (England / Scotland / etc.) when
    // present; sovereignSlug holds the parent (united-kingdom) for those
    // cases so breadcrumbs can link both levels.
    countrySlug?: string;
    sovereignSlug?: string;
    stateSlug?: string;
    state2Slug?: string;
    state3Slug?: string;
    additionalStates?: { name: string; slug?: string }[];
    language?: string;
    capital?: string; // "X" = largest city, "Y" = capital, "XY" = both, "" = neither
    primaryState?: string;
    state2?: string;
    state3?: string;
    region: string;
    pop: number;
    score: number;
    rank: number;
    lat: number;
    lon: number;
    gdp: number;
    gdpPerCapita: number;
    primaryCity: string;
    gawcClass: string;
    dims: Record<string, number>;
    pctOfCountry: number;
    qid?: string;
    wikipediaUrl?: string;
  };
  teams?: { sport: string; league: string; team: string; city: string; major: boolean; level?: string; annual?: boolean; qid?: string; wikipediaUrl?: string; lat?: number; lng?: number }[];
  universities?: { rank: number; name: string; city: string; country: string }[];
  culture?: Record<string, { name: string; city: string; subtype: string; type: string; annual?: boolean; stations?: number }[]>;
  // The era fields are optional per metro, not just optional on the type:
  // build-skyscrapers.py withholds them below 5 dated buildings or 60% year
  // coverage, because a median completion year drawn from two buildings looks
  // authoritative and means nothing. Treat their absence as "not enough data",
  // never as zero.
  skyscrapers?: {
    city: string;
    over150m: number;
    over200m: number;
    over300m: number;
    medianYear?: number;
    earliest?: number;
    pctSince2000?: number;
    pctSince2010?: number;
    datedCount?: number;
    decades?: Record<string, number>;
  };
  luxury?: { name: string; city: string; type: string }[];
  events?: { sport: string; event: string; year: string; venue: string; type?: string }[];
  marketCap?: { total: number; count: number; top12: { name: string; valuation: number; source: string }[]; asOf?: string };
  football?: { total: number; byLevel: Record<string, number> };
  supertallStructures?: { name: string; city: string; heightM: number; yearBuilt: number | null }[];
  dimRanks?: Record<string, string | null>;
}

const dataDir = join(process.cwd(), "public", "data");

// Parsed once per process (same idea as _relocations below): metros.json is
// ~1.6MB and the MCP route otherwise re-parses it on every list/search call.
// The bundle ships a fixed snapshot per deploy, so caching adds no staleness.
// Callers get a fresh top-level array (some sort in place); row objects are
// shared and must not be mutated.
let _metros: import("./shared").Metro[] | null = null;
export function getAllMetros() {
  if (_metros === null) {
    const raw = readFileSync(join(dataDir, "metros.json"), "utf-8");
    _metros = JSON.parse(raw) as import("./shared").Metro[];
  }
  return _metros.slice();
}

export function getRegions() {
  const raw = readFileSync(join(dataDir, "regions.json"), "utf-8");
  return JSON.parse(raw) as import("./shared").Region[];
}

export type RelocationCard = {
  league: string;
  sport: string;
  name: string;
  years: string;
  href: string;
  kind: "relocated" | "defunct";
  relocated?: boolean;
  defunct?: boolean;
  // Per-stint stats, summed only over the franchise's years in THIS metro.
  // Populated for BIG4 tiles by scripts/build-relocations.py. pct is win%
  // for NFL/NBA/MLB and points% for NHL. finals = WS appearances (MLB pennants).
  stats?: { champ: number; div: number; finals: number; pct: number; stolen?: number; other?: number; is_mls?: boolean; mls_cups?: number; supporters_shields?: number; cont_trophies?: number; titles?: number; major_cups?: number; top_flight_seasons?: number; prem?: number; minor?: number; seasons?: number; gf?: number };
};

let _relocations: Record<string, RelocationCard[]> | null = null;
export function getRelocationsForMetro(slug: string): RelocationCard[] {
  if (_relocations === null) {
    try {
      _relocations = JSON.parse(
        readFileSync(join(dataDir, "sports", "relocations-by-metro.json"), "utf-8")
      );
    } catch {
      _relocations = {};
    }
  }
  return (_relocations ?? {})[slug] ?? [];
}

export type SimilarMetro = {
  slug: string;
  name: string;
  country: string;
  region: string;
  rank: number;
};
export type MetroSimilarity = { neighbors: SimilarMetro[]; signature: string[] };

let _similar: Record<string, MetroSimilarity> | null = null;
// Nearest metros by 16-dimension profile + distinctive signature, precomputed by
// scripts/build-similar-metros.py (value-based: log-z neighbors, raw-z signature).
// Single slug-keyed file, loaded once and cached.
export function getSimilarMetrosForMetro(slug: string): MetroSimilarity | null {
  if (_similar === null) {
    try {
      _similar = JSON.parse(
        readFileSync(join(dataDir, "similar-metros.json"), "utf-8")
      );
    } catch {
      _similar = {};
    }
  }
  return (_similar ?? {})[slug] ?? null;
}

export type MetroFootprint = {
  cellsR6: number;
  areaKm2?: number;
  ghsPop?: number;
  popRatio?: number | null;
  popFlag?: "ok" | "low" | "high" | "unknown";
};

let _footprint: Record<string, MetroFootprint> | null = null;
// Measured land area and an independent gridded population per metro, summed
// inside the Overture boundary from GHS-POP. Built by scripts/build_metro_grid.py.
//
// areaKm2 is the only field the site displays. ghsPop / popRatio / popFlag are an
// INTERNAL AUDIT of the boundary, not a correction: the workbook stays ground
// truth for population (see feedback_workbook_is_ground_truth). Do not render the
// gridded figure next to the workbook one as if they were rival estimates.
export function getMetroFootprint(slug: string): MetroFootprint | null {
  if (_footprint === null) {
    try {
      _footprint = JSON.parse(
        readFileSync(join(dataDir, "metro-footprint.json"), "utf-8")
      ).metros;
    } catch {
      _footprint = {};
    }
  }
  return (_footprint ?? {})[slug] ?? null;
}

// People per square kilometre of measured land area. Returns null unless both
// inputs are usable, so a metro with no boundary simply shows nothing rather
// than an infinity or a zero.
export function metroDensity(
  pop: number | null | undefined,
  areaKm2: number | null | undefined
): number | null {
  if (!pop || !areaKm2 || pop <= 0 || areaKm2 <= 0) return null;
  return pop / areaKm2;
}

export function getMetroDetail(slug: string): MetroDetail | null {
  try {
    const raw = readFileSync(join(dataDir, "details", `${slug}.json`), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getAllSlugs(): string[] {
  const metros = getAllMetros();
  return metros.map((m) => m.slug);
}

export function getMeta(): { lastUpdate: string } {
  try {
    const raw = readFileSync(join(dataDir, "meta.json"), "utf-8");
    return JSON.parse(raw);
  } catch {
    return { lastUpdate: "" };
  }
}
