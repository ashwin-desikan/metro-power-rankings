'use client';

import dynamic from 'next/dynamic';

// Server-friendly wrapper. Leaflet itself needs `window`, so the inner
// component is dynamic-imported with ssr:false. The wrapper renders a
// sized container and a loading state so the page layout doesn't jump.

const InnerMap = dynamic(() => import('./MetroMapInner'), {
  ssr: false,
  loading: () => (
    <div
      className="h-full w-full flex items-center justify-center text-xs"
      style={{ color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}
    >
      Loading map…
    </div>
  ),
});

import type { TeamMarker } from "@/lib/teamMarkers";

export type MapPoint = {
  slug: string;
  name: string;
  lat: number;
  lon: number;
  // Optional metadata used by the home-page rankings map for richer
  // tooltips. When any of these are present, MetroMapInner renders a
  // multi-line tooltip (metro / city · state · country) instead of just
  // the metro name. Existing single-point callers (metro detail, country
  // page, comparison) can omit them and keep the legacy plain-name tooltip.
  city?: string;
  state?: string;
  country?: string;
  // Optional per-point fill color override. When set, MetroMapInner uses
  // this color for the marker instead of the default teal accent. Used by
  // league-map components that mix team markers with neutral venue markers
  // (e.g. NHL Global Series venues rendered pink alongside gold team pins).
  color?: string;
};

export default function MetroMap({
  points,
  showConnections = true,
  boundary,
  height = 320,
  interactiveFeatures = false,
  markers,
  refitOnChange = false,
  clickToNavigate = false,
}: {
  points: MapPoint[];
  showConnections?: boolean;
  // Optional GeoJSON FeatureCollection to render as a shaded polygon layer.
  // When provided, the map fits bounds to the boundary extent rather than
  // the points alone. `unknown` keeps the type loose so server components
  // can pass through whatever JSON.parse returns.
  boundary?: unknown;
  height?: number;
  // When true, the boundary is treated as a multi-feature country layer:
  // polygons are colored by tier, hover shows a tooltip per metro, and
  // clicking a polygon routes to that metro's detail page.
  interactiveFeatures?: boolean;
  // Optional team / venue markers rendered as a third layer above the
  // boundary and primary pin. Categorized into Major League / Other
  // teams / Venues so each color band reads at a glance.
  markers?: TeamMarker[];
  // When true, the map re-fits bounds every time the points array changes
  // (filter-driven maps like the home-page rankings overlay). Default false
  // preserves the metro-detail / comparison / country-page behavior where
  // bounds are computed once at mount and never updated.
  refitOnChange?: boolean;
  // When true, clicking a point marker navigates to /rankings/{slug}.
  // Opt-in so the metro-detail single-pin map does not become accidentally
  // self-clickable.
  clickToNavigate?: boolean;
}) {
  // Filter out zero-coord workbook entries (e.g. Mulhouse, Baden) so they
  // don't sit at (0,0) off Africa. They reappear once coords land in the xlsx.
  const valid = points.filter((p) => p.lat !== 0 || p.lon !== 0);
  // Render the map if we have any usable content: at least one valid point
  // OR a boundary FeatureCollection. The country map runs the boundary-only
  // path with points=[].
  if (valid.length === 0 && !boundary) return null;
  return (
    <div
      style={{ height, width: '100%' }}
      className="rounded-lg overflow-hidden border border-[var(--border)]"
    >
      <InnerMap
        points={valid}
        showConnections={showConnections}
        boundary={boundary}
        interactiveFeatures={interactiveFeatures}
        markers={markers}
        refitOnChange={refitOnChange}
        clickToNavigate={clickToNavigate}
      />
    </div>
  );
}
