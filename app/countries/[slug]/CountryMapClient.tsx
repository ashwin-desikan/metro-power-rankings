"use client";

// Client wrapper around MetroMap that adds a per-tier toggle row plus
// All / None buttons. The server-side CountryMap loads the full
// FeatureCollection and passes it in; this component owns the visible-tier
// state, filters the FeatureCollection on each toggle, and renders the
// interactive controls.
//
// Tier preference persists across country pages via localStorage so a reader
// who narrows to "Continental City + Major Metro" while exploring the US
// keeps that view when they navigate to Germany. Default is all tiers on,
// which matches prior behavior.

import { useEffect, useMemo, useState } from "react";
import MetroMap from "@/app/MetroMap";
import { TIERS } from "@/lib/tiers";

type GeoJSONFeature = {
  type: "Feature";
  properties: Record<string, unknown> & { tierSlug?: string };
  geometry: { type: string; coordinates: unknown };
};

type FeatureCollection = {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
};

const STORAGE_KEY = "country-map-visible-tiers";
const ALL_TIER_SLUGS = TIERS.map((t) => t.slug);

function readPersistedTiers(): Set<string> {
  if (typeof window === "undefined") return new Set(ALL_TIER_SLUGS);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set(ALL_TIER_SLUGS);
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set(ALL_TIER_SLUGS);
    const valid = parsed.filter(
      (s): s is string => typeof s === "string" && ALL_TIER_SLUGS.includes(s),
    );
    // Empty array is a legitimate state (None button); preserve it.
    return new Set(valid);
  } catch {
    return new Set(ALL_TIER_SLUGS);
  }
}

export default function CountryMapClient({
  collection,
  height = 520,
}: {
  collection: FeatureCollection;
  height?: number;
}) {
  // Start with all tiers visible; rehydrate from localStorage on mount so
  // the initial server-rendered HTML matches the no-JS path.
  const [visibleTiers, setVisibleTiers] = useState<Set<string>>(
    () => new Set(ALL_TIER_SLUGS),
  );

  useEffect(() => {
    setVisibleTiers(readPersistedTiers());
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(Array.from(visibleTiers)),
      );
    } catch {
      // localStorage may be unavailable (privacy mode, quota); silently no-op.
    }
  }, [visibleTiers]);

  // Per-tier metro counts so the user knows how many polygons each toggle
  // controls before they click. Driven off the unfiltered collection.
  const tierCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of collection.features) {
      const slug = f.properties?.tierSlug;
      if (!slug) continue;
      counts[slug] = (counts[slug] || 0) + 1;
    }
    return counts;
  }, [collection]);

  const filteredCollection = useMemo<FeatureCollection>(() => {
    return {
      type: "FeatureCollection",
      features: collection.features.filter((f) => {
        const slug = f.properties?.tierSlug;
        return slug ? visibleTiers.has(slug) : true;
      }),
    };
  }, [collection, visibleTiers]);

  const toggleTier = (slug: string) => {
    setVisibleTiers((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const enableAll = () => setVisibleTiers(new Set(ALL_TIER_SLUGS));
  const enableNone = () => setVisibleTiers(new Set());

  // Only show toggles for tiers that actually exist in this country's data.
  // No point letting a reader toggle "Global Capital" on a country page
  // that has zero Global Capital metros.
  const tiersInUse = TIERS.filter((t) => (tierCounts[t.slug] || 0) > 0);
  const visibleCount = filteredCollection.features.length;
  const totalCount = collection.features.length;

  return (
    <>
      <MetroMap
        points={[]}
        showConnections={false}
        boundary={filteredCollection}
        interactiveFeatures={true}
        height={height}
      />

      {/* Toggle bar: per-tier pills plus All/None controls. Sits below the
          map so it doubles as the legend (color swatch + tier name + count
          per pill). Pills wrap on narrow viewports. */}
      <div
        className="flex flex-wrap items-center gap-2 mt-4"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        <button
          type="button"
          onClick={enableAll}
          className="text-[11px] px-2 py-1 rounded border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
        >
          All
        </button>
        <button
          type="button"
          onClick={enableNone}
          className="text-[11px] px-2 py-1 rounded border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
        >
          None
        </button>
        <span
          className="text-[11px] text-[var(--text-dim)] mr-1"
          aria-hidden="true"
        >
          |
        </span>
        {tiersInUse.map((tier) => {
          const on = visibleTiers.has(tier.slug);
          const count = tierCounts[tier.slug] || 0;
          return (
            <button
              key={tier.slug}
              type="button"
              onClick={() => toggleTier(tier.slug)}
              aria-pressed={on}
              className="text-[11px] px-2 py-1 rounded border transition flex items-center gap-1.5"
              style={{
                borderColor: on ? tier.accentHex : "var(--border)",
                color: on ? "var(--text)" : "var(--text-dim)",
                backgroundColor: on ? `${tier.accentHex}22` : "transparent",
              }}
              title={`${tier.name}: ${count} ${count === 1 ? "metro" : "metros"}`}
            >
              <span
                aria-hidden="true"
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{
                  backgroundColor: tier.accentHex,
                  opacity: on ? 0.9 : 0.3,
                }}
              />
              {tier.name}
              <span
                className="text-[10px] opacity-70 ml-0.5"
                style={{ color: "inherit" }}
              >
                {count}
              </span>
            </button>
          );
        })}
        <span
          className="text-[11px] text-[var(--text-muted)] ml-auto"
          aria-live="polite"
        >
          {visibleCount === totalCount
            ? `${totalCount} polygons`
            : `${visibleCount} of ${totalCount} polygons`}
        </span>
      </div>
    </>
  );
}
