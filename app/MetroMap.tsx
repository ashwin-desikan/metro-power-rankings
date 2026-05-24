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
  // Optional explicit tooltip subtitle. Overrides the auto-joined
  // city / state / country line when present. Used by BadgeMap to surface
  // a "#rank · value · tier" line per qualifying metro.
  subtitle?: string;
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
  initialCenter,
  initialZoom,
  onViewportChange,
  preferCanvas,
}: {
  points: MapPoint[];
  showConnections?: boolean;
  // Optional GeoJSON FeatureCollection to render as a shaded polygon layer.
  // When provided, the map fits bounds to the boundary extent rather than
  // the points alone. `unknown` keeps the type loose so server components
  // can pass through whatever JSON.parse returns.
  boundary?: unknown;
  height?: number | string;
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
  // Optional explicit initial center / zoom. When both are provided they
  // override the default fitBounds behavior on first mount, used by the
  // Expandable Map page to restore the user's last-saved viewport from
  // localStorage. refitOnChange should be false when this is set so the
  // restored viewport is not immediately re-fit to the points.
  initialCenter?: [number, number];
  initialZoom?: number;
  // Optional callback fired on every moveend / zoomend so the parent can
  // persist the current viewport. Receives the current map center and zoom.
  onViewportChange?: (center: [number, number], zoom: number) => void;
  // Force canvas-mode rendering for the polygon layer. Default false uses
  // SVG (one DOM node per polygon, hover-friendly but slow past ~1,000
  // features). True forces preferCanvas on MapContainer, which renders
  // polygons via the Canvas API and stays smooth at thousands of features.
  // Use on filter-driven full-corpus maps like /expandable-map; leave
  // unset for the home rankings overlay where the filter cap keeps the
  // polygon count well under the SVG threshold.
  preferCanvas?: boolean;
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
        initialCenter={initialCenter}
        initialZoom={initialZoom}
        onViewportChange={onViewportChange}
        preferCanvas={preferCanvas}
      />
    </div>
  );
}
