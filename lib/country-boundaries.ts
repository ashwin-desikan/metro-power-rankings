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

export function loadCountryBoundaries(slug: string): CountryBoundaryResult {
  return loadBoundariesForMetros(getMetrosForCountry(slug));
}

// Reusable: aggregate boundaries for any list of metros (state pages
// pass the metros for that state directly). Same payload shape as the
// country-level aggregator so the same map component handles both.
export function loadBoundariesForMetros(metros: readonly Metro[]): CountryBoundaryResult {
  const features: GeoJSONFeature[] = [];
  let totalBytes = 0;

  for (const m of metros) {
    const path = join(BOUNDARY_DIR, `${m.slug}.geojson`);
    if (!existsSync(path)) continue;

    let raw: string;
    try {
      raw = readFileSync(path, "utf-8");
    } catch {
      continue;
    }
    totalBytes += raw.length;

    let parsed: { features?: GeoJSONFeature[] };
    try {
      parsed = JSON.parse(raw) as { features?: GeoJSONFeature[] };
    } catch {
      continue;
    }

    const f = parsed.features?.[0];
    if (!f || !f.geometry) continue;

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
      geometry: f.geometry,
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
