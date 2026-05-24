// Client-side fetcher + cache for per-metro boundary GeoJSON files. Used by
// the home-page rankings map to overlay polygons for whatever metros the
// table filter currently surfaces.
//
// Why on-demand: the full set of public/data/metro-boundaries/*.geojson is
// ~2,500 files at an aggregate ~50 MB uncompressed. Bundling them all would
// be wasteful when the home-page filter typically shows 25-100 metros.
// Pulling per-slug lets us serve only what's needed and lets Vercel's CDN
// cache the individual files normally.
//
// Module-level cache means a slug fetched once during the session is never
// fetched again, even across filter changes (the user toggling Top 25 / Top
// 100 / continent chips reuses everything previously loaded).

import { useEffect, useState } from "react";

type FeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    geometry: any;
  }>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cache = new Map<string, any | null>();
const inFlight = new Map<string, Promise<unknown>>();

async function fetchBoundary(slug: string): Promise<unknown | null> {
  if (cache.has(slug)) return cache.get(slug);
  const existing = inFlight.get(slug);
  if (existing) return existing;
  const p = (async () => {
    try {
      const res = await fetch(`/data/metro-boundaries/${slug}.geojson`, {
        cache: "force-cache",
      });
      if (!res.ok) {
        cache.set(slug, null);
        return null;
      }
      const data = await res.json();
      cache.set(slug, data);
      return data;
    } catch {
      cache.set(slug, null);
      return null;
    } finally {
      inFlight.delete(slug);
    }
  })();
  inFlight.set(slug, p);
  return p;
}

// Concurrency-limited parallel fetch. Six in flight at a time matches the
// HTTP/1 per-origin browser default; HTTP/2 multiplexing makes this less
// important, but the cap also keeps the resolver loop from queueing 100
// promises in a single tick.
async function fetchManyBoundaries(
  slugs: string[],
  concurrency = 8,
): Promise<Map<string, unknown | null>> {
  const out = new Map<string, unknown | null>();
  let cursor = 0;
  async function worker() {
    while (cursor < slugs.length) {
      const idx = cursor++;
      const slug = slugs[idx];
      const v = await fetchBoundary(slug);
      out.set(slug, v);
    }
  }
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, slugs.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return out;
}

// Returns a FeatureCollection of every loaded boundary for the given slugs.
// Slugs missing on disk (404) are simply omitted; the map still shows their
// pin via the points layer, just without a polygon overlay.
export function useMetroBoundaries(slugs: string[]): FeatureCollection | null {
  // Stable key derived from sorted slugs so re-orderings don't refetch.
  const key = [...slugs].sort().join("|");
  const [collection, setCollection] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (slugs.length === 0) {
      setCollection(null);
      return;
    }
    fetchManyBoundaries(slugs).then((loaded) => {
      if (cancelled) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const features: any[] = [];
      for (const [, v] of loaded) {
        if (!v) continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = v as any;
        if (data.type === "FeatureCollection" && Array.isArray(data.features)) {
          features.push(...data.features);
        } else if (data.type === "Feature") {
          features.push(data);
        }
      }
      setCollection(
        features.length > 0
          ? { type: "FeatureCollection", features }
          : null,
      );
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return collection;
}

// Module-level cache for the combined boundaries.json file. Fetched once
// per page session and reused across filter changes. The boundary builder
// emits a single FeatureCollection with every metro's simplified polygon;
// this hook fetches the file once and filters to the requested slug set.
//
// Why a separate hook: the Expandable Map at unfiltered full-corpus scale
// would otherwise fire ~4,000 individual /data/metro-boundaries/*.geojson
// requests, which presents to Cloudflare as a scraping burst and trips
// Bot Fight Mode rate limiting. One combined fetch fans out to zero
// origin hits after the first user warms the edge cache.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let combinedCache: any | null | undefined = undefined;
let combinedInFlight: Promise<unknown> | null = null;

async function fetchCombinedBoundaries(): Promise<unknown | null> {
  if (combinedCache !== undefined) return combinedCache;
  if (combinedInFlight) return combinedInFlight;
  combinedInFlight = (async () => {
    try {
      const res = await fetch(`/data/boundaries-simplified.json`, {
        cache: "force-cache",
      });
      if (!res.ok) {
        combinedCache = null;
        return null;
      }
      const data = await res.json();
      combinedCache = data;
      return data;
    } catch {
      combinedCache = null;
      return null;
    } finally {
      combinedInFlight = null;
    }
  })();
  return combinedInFlight;
}

// Combined-fetch variant of useMetroBoundaries. Loads boundaries-simplified.json
// once per session and returns the subset of features whose slug appears in
// the requested set. Use on the Expandable Map. Detail pages and the home
// rankings overlay should keep using useMetroBoundaries (per-slug) so they
// only pay for the small set they actually display.
export function useCombinedBoundaries(slugs: string[]): FeatureCollection | null {
  const key = [...slugs].sort().join("|");
  const [collection, setCollection] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (slugs.length === 0) {
      setCollection(null);
      return;
    }
    fetchCombinedBoundaries().then((data) => {
      if (cancelled) return;
      if (!data) {
        // File missing on edge - boundary build has not emitted it yet.
        // Returning null is preferable to falling back to ~4,000 per-slug
        // fetches because that would re-create the very Cloudflare spike
        // this hook exists to avoid. Markers still render either way.
        setCollection(null);
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allFeatures = ((data as any).features ?? []) as any[];
      const wanted = new Set(slugs);
      const filtered = allFeatures.filter((f) => {
        const s = f?.properties?.slug;
        return typeof s === "string" && wanted.has(s);
      });
      setCollection(
        filtered.length > 0
          ? { type: "FeatureCollection", features: filtered }
          : null,
      );
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return collection;
}
