// Country / state-level boundary aggregator. Server-only (uses fs.readFileSync).
//
// For a given country or state, reads each member metro's boundary GeoJSON
// from public/data/metro-boundaries/{slug}.geojson, injects per-metro
// metadata (name, rank, score, tier, population) into the Feature's
// properties, and returns a single FeatureCollection that can be fed to
// react-leaflet's <GeoJSON> component.
//
// Returns null when no member metros have boundaries on disk; the caller
// should fall back gracefully.
//
// Payload note: at country scale this can ship 1-2 MB of GeoJSON inline in
// the RSC payload (UK 1.0 MB, US 2.0 MB). For very large countries that may
// exceed the inline budget, a Phase 2 client-side fetch endpoint will swap in.

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { getMetrosForCountry } from "./countries";
import { computeTier } from "./tiers";
import type { Metro } from "./shared";

type GeoJSONFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown };
};

export type CountryBoundaryCollection = {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
};

export type CountryBoundaryResult = {
  collection: CountryBoundaryCollection | null;
  metrosWithBoundaries: number;
  metrosTotal: number;
  bytes: number;
};

const BOUNDARY_DIR = join(
  process.cwd(),
  "public",
  "data",
  "metro-boundaries",
);

// Module-scoped cache of parsed boundary geometry by metro slug. Each
// metro page, country page, and state page that includes a metro
// previously read and JSON.parsed the same geojson file independently.
// In a build with 8,000+ static pages and 4,000+ metros, that meant a
// metro polygon could be parsed 3-5 times. Caching the parse cuts I/O
// and CPU significantly. `null` means we tried and the file is missing
// or unreadable; we cache the negative result too so we don't retry.
type CachedBoundary = { geometry: GeoJSONFeature["geometry"]; bytes: number } | null;
const boundaryCache = new Map<string, CachedBoundary>();

function loadOneBoundary(slug: string): CachedBoundary {
  if (boundaryCache.has(slug)) return boundaryCache.get(slug)!;
  const path = join(BOUNDARY_DIR, `${slug}.geojson`);
  if (!existsSync(path)) {
    boundaryCache.set(slug, null);
    return null;
  }
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as { features?: GeoJSONFeature[] };
    const f = parsed.features?.[0];
    if (!f || !f.geometry) {
      boundaryCache.set(slug, null);
      return null;
    }
    const cached: CachedBoundary = { geometry: f.geometry, bytes: raw.length };
    boundaryCache.set(slug, cached);
    return cached;
  } catch {
    boundaryCache.set(slug, null);
    return null;
  }
}

export function loadCountryBoundaries(slug: string): CountryBoundaryResult {
  return loadBoundariesForMetros(getMetrosForCountry(slug));
}

// Single-metro convenience that reuses the same parse cache as the
// country/state aggregator. The metro detail page renders each metro
// exactly once at build time, but its boundary may also be needed by
// country and state pages — caching the parse here means the cost is
// paid once per build worker rather than 3-5x.
export function loadMetroBoundaryCollection(
  slug: string,
): CountryBoundaryCollection | null {
  const cached = loadOneBoundary(slug);
  if (!cached) return null;
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: cached.geometry }],
  };
}

// Reusable: aggregate boundaries for any list of metros (state pages
// pass the metros for that state directly). Same payload shape as the
// country-level aggregator so the same map component handles both.
export function loadBoundariesForMetros(metros: readonly Metro[]): CountryBoundaryResult {
  const features: GeoJSONFeature[] = [];
  let totalBytes = 0;

  for (const m of metros) {
    const cached = loadOneBoundary(m.slug);
    if (!cached) continue;
    totalBytes += cached.bytes;

    const tier = computeTier(m.score);
    features.push({
      type: "Feature",
      properties: {
        slug: m.slug,
        name: m.name,
        rank: m.rank,
        score: m.score,
        pop: m.pop,
        tier: tier.name,
        tierSlug: tier.slug,
      },
      geometry: cached.geometry,
    });
  }

  return {
    collection:
      features.length > 0
        ? { type: "FeatureCollection", features }
        : null,
    metrosWithBoundaries: features.length,
    metrosTotal: metros.length,
    bytes: totalBytes,
  };
}
