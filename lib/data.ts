// Server-only data loading - DO NOT import from client components
// For types and formatters, import from @/lib/shared instead

import { readFileSync } from "fs";
import { join } from "path";

// Re-export shared types for convenience in server components
export type { Metro, Region } from "./shared";
export { formatPop, formatMarketCap, formatGdp, formatDimValue, regionColors } from "./shared";

export interface MetroDetail {
  metro: {
    slug: string;
    name: string;
    country: string;
    subCountry?: string;
    language?: string;
    capital?: string; // "X" = largest city, "Y" = capital, "XY" = both, "" = neither
    primaryState?: string;
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
  };
  teams?: { sport: string; league: string; team: string; city: string; major: boolean; level?: string; annual?: boolean }[];
  universities?: { rank: number; name: string; city: string; country: string }[];
  culture?: Record<string, { name: string; city: string; subtype: string; type: string; annual?: boolean; stations?: number }[]>;
  skyscrapers?: { city: string; over150m: number; over200m: number; over300m: number };
  luxury?: { name: string; city: string; type: string }[];
  events?: { sport: string; event: string; year: string; venue: string; type?: string }[];
  marketCap?: { total: number; count: number; top12: { name: string; valuation: number; source: string }[] };
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
