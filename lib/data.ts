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
  skyscrapers?: { city: string; over150m: number; over200m: number; over300m: number };
  luxury?: { name: string; city: string; type: string }[];
  events?: { sport: string; event: string; year: string; venue: string; type?: string }[];
  marketCap?: { total: number; count: number; top12: { name: string; valuation: number; source: string }[]; asOf?: string };
  football?: { total: number; byLevel: Record<string, number> };
  supertallStructures?: { name: string; city: string; heightM: number; yearBuilt: number | null }[];
  dimRanks?: Record<string, string | null>;
}

const dataDir = join(process.cwd(), "public", "data");

export function getAllMetros() {
  const raw = readFileSync(join(dataDir, "metros.json"), "utf-8");
  return JSON.parse(raw) as import("./shared").Metro[];
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
