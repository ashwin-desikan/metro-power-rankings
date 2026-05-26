"use client";

// NationalMapInner — react-leaflet map for the /teams/national index.
// Renders the filtered national-team set as CircleMarkers placed at country
// centroids, colored by continent. Clicking a marker navigates to the team
// page. Same pattern as FootballMapInner; kept separate because the marker
// payload shape differs (no metro field, federation instead of country).

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export type NationalMapPoint = {
  slug: string;
  cur_name: string;
  continent: string;
  federation: string | null;
  trophies: number;
  lat: number;
  lng: number;
  color: string;
};

type Props = {
  points: NationalMapPoint[];
  refitKey: string;
};

const WORLD_CENTER: [number, number] = [25, 10];
const WORLD_ZOOM = 2;

function FitToPoints({ points, refitKey }: { points: NationalMapPoint[]; refitKey: string }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) {
      map.setView(WORLD_CENTER, WORLD_ZOOM);
      return;
    }
    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);
    const south = Math.min(...lats);
    const north = Math.max(...lats);
    const west = Math.min(...lngs);
    const east = Math.max(...lngs);
    const span = Math.max(north - south, east - west);
    const pad = Math.max(0.5, span * 0.08);
    map.fitBounds(
      [
        [south - pad, west - pad],
        [north + pad, east + pad],
      ],
      { animate: false }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refitKey]);
  return null;
}

export default function NationalMapInner({ points, refitKey }: Props) {
  const router = useRouter();
  return (
    <MapContainer
      center={WORLD_CENTER}
      zoom={WORLD_ZOOM}
      scrollWheelZoom={true}
      style={{ height: "520px", width: "100%", borderRadius: "0.75rem" }}
      worldCopyJump={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      <FitToPoints points={points} refitKey={refitKey} />
      {points.map((p) => (
        <CircleMarker
          key={p.slug}
          center={[p.lat, p.lng]}
          radius={Math.max(5, Math.min(11, 5 + Math.sqrt(p.trophies || 0) * 1.6))}
          pathOptions={{
            color: "#0f0f12",
            weight: 1,
            fillColor: p.color,
            fillOpacity: 0.85,
          }}
          eventHandlers={{
            click: () => router.push(`/teams/national/${p.slug}`),
          }}
        >
          <Tooltip direction="top" offset={[0, -4]} opacity={0.95}>
            <div className="text-xs">
              <div className="font-semibold">{p.cur_name}</div>
              <div className="text-[var(--text-muted)]">
                {p.federation ? `${p.federation} · ` : ""}{p.continent}
              </div>
              {p.trophies > 0 && (
                <div className="text-[var(--text-muted)]">{p.trophies} trophies</div>
              )}
            </div>
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
