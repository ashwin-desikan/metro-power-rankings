'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MapContainer, TileLayer, CircleMarker, Tooltip, Polyline, GeoJSON, useMap, LayerGroup } from 'react-leaflet';
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
      attributionControl={true}
      preferCanvas={interactiveFeatures}
    >
      <TileLayer
        url="https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://overturemaps.org/">Overture Maps</a>'
        subdomains={['a', 'b', 'c', 'd']}
        maxZoom={18}
      />
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
      {points.map((p) => (
        <CircleMarker
          key={p.slug}
          center={[p.lat, p.lon]}
          radius={6}
          pathOptions={{
            color: '#ffffff',
            weight: 2,
            fillColor: '#4ECDC4',
            fillOpacity: 1,
          }}
        >
          <Tooltip direction="top" offset={[0, -6]} permanent={false}>
            {p.name}
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
