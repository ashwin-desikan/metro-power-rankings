"use client";

// FootballMapInner — react-leaflet map for the /teams/football index.
// Renders the filtered club set as CircleMarkers with the curated /
// hash-derived primary color. Clicking a marker navigates to the club page.
//
// SSR-safe via the dynamic import in FootballIndexClient.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { basemapUrl, BASEMAP_ATTRIBUTION } from "@/lib/basemap";

export type FootballMapPoint = {
  slug: string;
  cur_name: string;
  country: string;
  metro: string | null;
  lat: number;
  lng: number;
  color: string;
};

type Props = {
  points: FootballMapPoint[];
  // refitKey: a string the parent flips ONLY when the geographic scope
  // should change (i.e. the country filter changed). Levels, year, and
  // search reshape the marker set without resetting the viewport so the
  // user can drill in without losing their pan/zoom.
  refitKey: string;
};

const WORLD_CENTER: [number, number] = [48, 5]; // Europe-centered fallback
const WORLD_ZOOM = 4;

function FitToPoints({ points, refitKey }: { points: FootballMapPoint[]; refitKey: string }) {
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
      { padding: [24, 24], animate: false },
    );
    // points intentionally excluded from deps -- refitKey is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refitKey, map]);
  return null;
}

export default function FootballMapInner({ points, refitKey }: Props) {
  const router = useRouter();
  return (
    <MapContainer
      center={WORLD_CENTER}
      zoom={WORLD_ZOOM}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom
      preferCanvas
    >
      <TileLayer
        url={basemapUrl("dark_all", { retina: true })}
        attribution={BASEMAP_ATTRIBUTION}
      />
      <FitToPoints points={points} refitKey={refitKey} />
      {points.map((p) => (
        <CircleMarker
          key={p.slug}
          center={[p.lat, p.lng]}
          radius={5}
          weight={1.5}
          pathOptions={{
            color: "#0f0f12",
            fillColor: p.color,
            fillOpacity: 0.95,
          }}
          eventHandlers={{
            click: () => router.push(`/teams/football/${p.slug}`),
          }}
        >
          <Tooltip direction="top" offset={[0, -4]} opacity={0.95}>
            <div style={{ fontSize: 11, lineHeight: 1.3 }}>
              <div style={{ fontWeight: 600 }}>{p.cur_name}</div>
              <div style={{ opacity: 0.75 }}>
                {p.metro ? `${p.metro} · ` : ""}{p.country}
              </div>
            </div>
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
