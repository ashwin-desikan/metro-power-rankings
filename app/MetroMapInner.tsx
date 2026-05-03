'use client';

import { MapContainer, TileLayer, CircleMarker, Tooltip, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapPoint } from './MetroMap';

// Padding adapts to span: tight derbies get more breathing room than
// continent-wide clusters. Returns south-west then north-east bound pairs.
function getBounds(points: MapPoint[]): [[number, number], [number, number]] {
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

// Single-point case needs a center + zoom rather than bounds.
function isSinglePoint(points: MapPoint[]): boolean {
  return points.length === 1;
}

export default function MetroMapInner({
  points,
  showConnections,
}: {
  points: MapPoint[];
  showConnections: boolean;
}) {
  const single = isSinglePoint(points);
  const bounds = single ? undefined : getBounds(points);
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
        attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
        subdomains={['a', 'b', 'c', 'd']}
        maxZoom={18}
      />
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
