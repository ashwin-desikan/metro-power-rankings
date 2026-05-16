"use client";

// SportsMapInner — react-leaflet inner for /sports. Renders many CircleMarkers
// with sport-encoded ring color and Level-encoded fill. Adapts bounds to the
// visible set so filtering re-frames the map automatically.

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { SPORT_COLORS, DEFAULT_SPORT_COLOR, CONFERENCE_COLORS, type TeamMarker } from "./SportsExplorer";

type Props = { markers: TeamMarker[] };

// World-fit fallback when there are zero visible markers (e.g. over-filtered).
const WORLD_CENTER: [number, number] = [25, 10];
const WORLD_ZOOM = 2;

function FitToMarkers({ markers }: { markers: TeamMarker[] }) {
  const map = useMap();
  // Build a stable hash of marker positions so we only refit when the set
  // materially changes; otherwise zoom would reset on every render.
  const hash = useMemo(() => {
    if (markers.length === 0) return "empty";
    const lat = markers.reduce((s, m) => s + m.lat, 0) / markers.length;
    const lng = markers.reduce((s, m) => s + m.lng, 0) / markers.length;
    return `${markers.length}:${lat.toFixed(2)}:${lng.toFixed(2)}`;
  }, [markers]);

  useEffect(() => {
    if (markers.length === 0) {
      map.setView(WORLD_CENTER, WORLD_ZOOM);
      return;
    }
    const lats = markers.map((m) => m.lat);
    const lngs = markers.map((m) => m.lng);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash, map]);
  return null;
}

const MAJOR_FILL = "#d4af37"; // gold
const OTHER_FILL = "#64748b"; // slate-500

export default function SportsMapInner({ markers }: Props) {
  const router = useRouter();

  return (
    <MapContainer
      center={WORLD_CENTER}
      zoom={WORLD_ZOOM}
      style={{ height: "100%", width: "100%", background: "var(--bg-card)" }}
      scrollWheelZoom
      worldCopyJump
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
      />
      <FitToMarkers markers={markers} />
      {markers.map((m, i) => {
        // Conference color takes precedence for college rows (FBS football,
        // NCAA Division I basketball). Everything else uses the sport hue.
        const isCollege = m.league_raw === "FBS" || (m.sport === "Basketball" && m.league_raw === "NCAA");
        const ring = (isCollege && CONFERENCE_COLORS[m.league])
          || SPORT_COLORS[m.sport]
          || DEFAULT_SPORT_COLOR;
        const fill = m.level === "Major" ? MAJOR_FILL : OTHER_FILL;
        return (
          <CircleMarker
            key={`${m.team}-${m.league}-${i}`}
            center={[m.lat, m.lng]}
            radius={5}
            pathOptions={{
              color: ring,
              weight: 2,
              fillColor: fill,
              fillOpacity: 0.9,
            }}
            eventHandlers={{
              click: () => {
                // Prefer the metro page when available; fall back to the
                // team page only if the marker has no metro slug. Most users
                // want city context first, team page second.
                if (m.metro_slug) router.push(`/rankings/${m.metro_slug}`);
                else if (m.team_page_url) router.push(m.team_page_url);
              },
            }}
          >
            <Tooltip direction="top" offset={[0, -4]} opacity={0.95}>
              <div style={{ fontFamily: "'Inter', sans-serif" }}>
                <div style={{ fontWeight: 600, fontSize: 12 }}>{m.team}</div>
                <div style={{ fontSize: 11, opacity: 0.85 }}>
                  {m.sport} · {m.league}
                  {m.workbook_level ? ` · Level ${m.workbook_level}` : (m.level === "Major" ? " · Major League" : "")}
                </div>
                <div style={{ fontSize: 10, opacity: 0.75 }}>
                  {m.league === "International Teams" && m.federation
                    ? `${m.federation} (${m.country})`
                    : (m.metro || m.city || m.country)}
                </div>
                {(m.metro_slug || m.team_page_url) && (
                  <div style={{ fontSize: 10, marginTop: 2, opacity: 0.7 }}>
                    Click for {m.metro_slug ? "metro page" : "team page"}
                  </div>
                )}
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
