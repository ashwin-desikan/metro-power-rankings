'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MapContainer, TileLayer, CircleMarker, Tooltip, Polyline, GeoJSON, useMap, LayerGroup, ZoomControl, AttributionControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapPoint } from './MetroMap';
import { MARKER_COLORS, MARKER_LABELS, sortForRender, formatLevel, type TeamMarker } from '@/lib/teamMarkers';
import { normalizeSport } from '@/lib/sportLabels';

// Padding adapts to span: tight derbies get more breathing room than
// continent-wide clusters. Returns south-west then north-east bound pairs.
function getPointBounds(points: MapPoint[]): [[number, number], [number, number]] {
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const span = Math.max(
    Math.max(...lats) - Math.min(...lats),
    Math.max(...lons) - Math.min(...lons),
  );
  const pad = Math.max(0.2, span * 0.25);
  return [
    [Math.min(...lats) - pad, Math.min(...lons) - pad],
    [Math.max(...lats) + pad, Math.max(...lons) + pad],
  ];
}

// Create two custom Leaflet panes used by the primary city pin layer:
//   - primaryPins (z-index 670) sits above the default overlayPane (400,
//     GeoJSON polygons), markerPane (600), and tooltipPane (650). The
//     primary CircleMarker mounts here so the pin is always hoverable
//     above the boundary polygon at any zoom.
//   - primaryPinTooltips (z-index 690) sits above the pin pane so the
//     tooltip floats on top of the pin itself; without a dedicated pane
//     the default tooltipPane (650) would sit below primaryPins and the
//     tooltip would disappear behind the pin on hover.
// Panes are idempotent — createPane is only called the first time the
// component mounts on a given map.
function PrimaryPinPane() {
  const map = useMap();
  useEffect(() => {
    if (!map.getPane('primaryPins')) {
      const pane = map.createPane('primaryPins');
      pane.style.zIndex = '670';
      pane.style.pointerEvents = 'auto';
    }
    if (!map.getPane('primaryPinTooltips')) {
      const tipPane = map.createPane('primaryPinTooltips');
      tipPane.style.zIndex = '690';
      tipPane.style.pointerEvents = 'none';
    }
  }, [map]);
  return null;
}

// When a boundary GeoJSON is provided, fit map bounds to its extent so
// the map frames the metro region naturally rather than the city pin alone.
function FitToBoundary({ boundary }: { boundary: unknown }) {
  const map = useMap();
  useEffect(() => {
    if (!boundary) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const layer = L.geoJSON(boundary as any);
      const bounds = layer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
    } catch {
      // ignore malformed boundary; pin-only fallback is fine
    }
  }, [boundary, map]);
  return null;
}

// Re-fit map bounds whenever the points array changes. Used by the
// home-page rankings map where the table filter set is reactive. A stable
// key derived from the slug list keeps the effect dep array shallow so
// React doesn't re-run on every parent render.
function FitToPoints({ points }: { points: MapPoint[] }) {
  const map = useMap();
  const key = points.map((p) => p.slug).join('|');
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lon], 9);
      return;
    }
    const lats = points.map((p) => p.lat);
    const lons = points.map((p) => p.lon);
    const span = Math.max(
      Math.max(...lats) - Math.min(...lats),
      Math.max(...lons) - Math.min(...lons),
    );
    // Tightened from 0.5 / span*0.15 so filter changes zoom in more
    // aggressively. A continent-wide filter now frames continent-fill,
    // not continent-plus-surrounding-ocean.
    const pad = Math.max(0.2, span * 0.06);
    const bounds: [[number, number], [number, number]] = [
      [Math.min(...lats) - pad, Math.min(...lons) - pad],
      [Math.max(...lats) + pad, Math.max(...lons) + pad],
    ];
    // animate: true is the leaflet default; explicit duration keeps the
    // transition snappy without feeling jumpy on rapid filter toggles.
    map.fitBounds(bounds, { padding: [16, 16], animate: true, duration: 0.5 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

// Tier accent palette. Mirrors lib/tiers.ts so the country-map polygon
// shading reads as the same hierarchy used everywhere else on the site.
// Falls back to the site accent for any feature missing a tier slug.
const TIER_FILL: Record<string, string> = {
  'global-capital':   '#7c3aed',
  'world-city':       '#2563eb',
  'major-metro':      '#0891b2',
  'regional-hub':     '#16a34a',
  'established-city': '#ca8a04',
  'emerging-city':    '#ea580c',
  'local-city':       '#6b7280',
};
const DEFAULT_FILL = '#4ECDC4';

// Build a stable React key from a boundary FeatureCollection. react-leaflet
// won't diff <GeoJSON data> on prop change, so when the country-map tier
// toggle filters the collection we have to remount via key. Joining feature
// slugs is cheap and uniquely identifies the visible set; falls back to
// the JSON length when slugs are absent (single-metro pages).
function getBoundaryKey(boundary: unknown): string {
  if (!boundary || typeof boundary !== 'object') return 'none';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const features = (boundary as any).features;
  if (!Array.isArray(features)) return 'single';
  if (features.length === 0) return 'empty';
  const slugs = features
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((f: any) => f?.properties?.slug || '')
    .join('|');
  return `${features.length}:${slugs}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tierStyle(feature: any) {
  const tierSlug = feature?.properties?.tierSlug as string | undefined;
  const color = (tierSlug && TIER_FILL[tierSlug]) || DEFAULT_FILL;
  return {
    color,
    weight: 1.2,
    fillColor: color,
    fillOpacity: 0.42,
  };
}

export default function MetroMapInner({
  points,
  showConnections,
  boundary,
  interactiveFeatures = false,
  markers,
  refitOnChange = false,
  clickToNavigate = false,
}: {
  points: MapPoint[];
  showConnections: boolean;
  boundary?: unknown;
  // When true, polygon styling is driven by feature.properties.tierSlug,
  // each polygon binds a hover tooltip with name + rank, and clicking
  // navigates to the metro detail page. Default false preserves the
  // single-boundary behavior used on metro detail and matchup pages.
  interactiveFeatures?: boolean;
  // Team / venue markers, classified by category. Rendered above the
  // boundary polygon and below the primary pin so the metro's home pin
  // stays visually dominant.
  markers?: TeamMarker[];
  // Re-fit map bounds whenever the points array changes. Powers the
  // home-page rankings overlay where the table's filter state drives
  // the visible point set.
  refitOnChange?: boolean;
  // Wire each point marker to navigate to /rankings/{slug} on click.
  // Opt-in so existing single-pin callers (metro detail) don't become
  // accidentally self-clickable.
  clickToNavigate?: boolean;
}) {
  const router = useRouter();
  const single = points.length === 1;
  // When a boundary is present, FitToBoundary takes over after mount;
  // bounds/center here are just the initial frame.
  const bounds = boundary || single || points.length === 0 ? undefined : getPointBounds(points);
  const center: [number, number] | undefined = single
    ? [points[0].lat, points[0].lon]
    : points.length === 0
      ? [0, 0]
      : undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleEachFeature = (feature: any, layer: any) => {
    const p = feature?.properties || {};
    const name = p.name as string | undefined;
    const rank = p.rank as number | undefined;
    const tier = p.tier as string | undefined;
    if (name) {
      const html =
        `<div style="font-family:'Inter',system-ui,sans-serif;padding:2px 4px;">` +
        `<strong>${name}</strong>` +
        (rank ? ` <span style="color:#9ca3af">· #${rank}</span>` : '') +
        (tier ? `<div style="font-size:11px;color:#9ca3af;margin-top:2px">${tier}</div>` : '') +
        `</div>`;
      layer.bindTooltip(html, { direction: 'top', sticky: true, opacity: 0.95 });
    }
    if (typeof p.slug === 'string') {
      const slug = p.slug as string;
      layer.on('click', () => {
        router.push(`/rankings/${slug}`);
      });
    }
  };

  return (
    <MapContainer
      bounds={bounds}
      center={center}
      zoom={single ? 9 : undefined}
      style={{ height: '100%', width: '100%', background: 'var(--bg-card)' }}
      scrollWheelZoom={false}
      attributionControl={false}
      zoomControl={false}
      preferCanvas={interactiveFeatures}
      worldCopyJump={true}
    >
      {/* Default zoom (top-left) and attribution (bottom-right) overlap
          markers in the corners readers most want to click. Reposition
          both: zoom to bottom-right, attribution to bottom-left without
          the Leaflet prefix so it reads as a discreet credit line. */}
      <ZoomControl position="bottomright" />
      <AttributionControl position="bottomleft" prefix={false} />
      <TileLayer
        url="https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://overturemaps.org/">Overture Maps</a>'
        subdomains={['a', 'b', 'c', 'd']}
        maxZoom={18}
        minZoom={1}
        // World-wrap on: tiles repeat horizontally so panning east or west
        // never hits a hard edge. Pairs with worldCopyJump on MapContainer
        // so markers always render at the longitude the user is viewing.
        // minZoom=1 lets readers pull all the way out to see the whole
        // planet in one frame; below that, the CARTO tile pack returns
        // 404s and Leaflet renders empty squares.
      />
      <PrimaryPinPane />
      {boundary ? (
        <>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <GeoJSON
            // react-leaflet GeoJSON does NOT diff `data` once mounted; without
            // a changing `key`, tier toggles on the country map (filtered
            // FeatureCollection) would not visually update. Key off the
            // collection identity so any change forces a remount.
            key={getBoundaryKey(boundary)}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data={boundary as any}
            style={
              interactiveFeatures
                ? tierStyle
                : {
                    color: '#4ECDC4',
                    weight: 2,
                    fillColor: '#4ECDC4',
                    fillOpacity: 0.18,
                  }
            }
            onEachFeature={interactiveFeatures ? handleEachFeature : undefined}
          />
          <FitToBoundary boundary={boundary} />
        </>
      ) : null}
      {showConnections && points.length >= 2 ? (
        <Polyline
          positions={points.map((p) => [p.lat, p.lon])}
          pathOptions={{ color: '#4ECDC4', weight: 2, dashArray: '6 6', opacity: 0.85 }}
        />
      ) : null}
      {markers && markers.length > 0 ? (
        <LayerGroup>
          {sortForRender(markers).map((m, idx) => {
            const fill = MARKER_COLORS[m.category];
            const levelLabel = formatLevel(m.level);
            return (
              <CircleMarker
                key={`marker-${idx}-${m.lat}-${m.lng}`}
                center={[m.lat, m.lng]}
                radius={7}
                pathOptions={{
                  color: '#0f172a',
                  weight: 1.5,
                  fillColor: fill,
                  fillOpacity: 0.95,
                }}
                eventHandlers={{
                  mouseover: (e) => e.target.setRadius(9),
                  mouseout: (e) => e.target.setRadius(7),
                }}
              >
                <Tooltip direction="top" offset={[0, -7]} opacity={0.97}>
                  <div style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 12, lineHeight: 1.4 }}>
                    <div style={{ fontWeight: 600 }}>{m.name}</div>
                    {m.subtitle ? (
                      <div style={{ color: '#9ca3af' }}>{m.subtitle}</div>
                    ) : (m.sport || m.league) ? (
                      <div style={{ color: '#9ca3af' }}>
                        {normalizeSport(m.sport)}{m.league ? ` · ${m.league}` : ''}
                      </div>
                    ) : null}
                    {levelLabel ? (
                      <div style={{ color: '#9ca3af', fontSize: 11, marginTop: 1 }}>
                        {levelLabel}
                      </div>
                    ) : null}
                    <div style={{ color: fill, fontSize: 11, marginTop: 2, fontWeight: 500 }}>
                      {m.href ? (
                        <a
                          href={m.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: fill, textDecoration: 'underline' }}
                        >
                          {MARKER_LABELS[m.category]} →
                        </a>
                      ) : (
                        MARKER_LABELS[m.category]
                      )}
                    </div>
                  </div>
                </Tooltip>
              </CircleMarker>
            );
          })}
        </LayerGroup>
      ) : null}
      {refitOnChange ? <FitToPoints points={points} /> : null}
      {points.map((p) => {
        const richMeta = [p.city, p.state, p.country].filter(Boolean).join(' · ');
        // Per-point color override lets league-map callers mix categories
        // (e.g. gold NHL team pins alongside pink Global Series venues).
        // Falls back to the site's teal accent.
        const fill = p.color ?? '#4ECDC4';
        return (
        <CircleMarker
          key={p.slug}
          center={[p.lat, p.lon]}
          radius={6}
          pane="primaryPins"
          pathOptions={{
            color: '#ffffff',
            weight: 2,
            fillColor: fill,
            fillOpacity: 1,
            pane: 'primaryPins',
          }}
          eventHandlers={
            clickToNavigate
              ? { click: () => router.push(`/rankings/${p.slug}`) }
              : undefined
          }
        >
          <Tooltip
            direction="top"
            offset={[0, -6]}
            permanent={false}
            pane="primaryPinTooltips"
          >
            {(p.subtitle || richMeta) ? (
              <div style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 12, lineHeight: 1.4 }}>
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                <div style={{ color: '#9ca3af', fontSize: 11 }}>{p.subtitle || richMeta}</div>
              </div>
            ) : (
              p.name
            )}
          </Tooltip>
        </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
