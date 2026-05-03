'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, Polyline, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapPoint } from './MetroMap';

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

export default function MetroMapInner({
  points,
  showConnections,
  boundary,
}: {
  points: MapPoint[];
  showConnections: boolean;
  boundary?: unknown;
}) {
  const single = points.length === 1;
  // When a boundary is present, FitToBoundary takes over after mount;
  // bounds/center here are just the initial frame.
  const bounds = boundary || single ? undefined : getPointBounds(points);
  const center: [number, number] | undefined = single ? [points[0].lat, points[0].lon] : undefined;
  return (
    <MapContainer
      bounds={bounds}
      center={center}
      zoom={single ? 9 : undefined}
      style={{ height: '100%', width: '100%', background: 'var(--bg-card)' }}
      scrollWheelZoom={false}
      attributionControl={true}
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
            // Key forces re-render when boundary changes (e.g. between metros)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data={boundary as any}
            style={{
              color: '#4ECDC4',
              weight: 2,
              fillColor: '#4ECDC4',
              fillOpacity: 0.18,
            }}
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
