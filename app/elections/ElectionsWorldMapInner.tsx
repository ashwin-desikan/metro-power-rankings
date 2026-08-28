"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MapContainer, TileLayer, CircleMarker, Tooltip, ZoomControl, AttributionControl, useMap } from "react-leaflet";
import { latLngBounds } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { HubMarker } from "./ElectionsWorldMap";
import { basemapUrl, BASEMAP_ATTRIBUTION } from "@/lib/basemap";

// World map of the election hubs: one marker per polity at its seat of
// government. Teal = competitive democracies; amber = managed / non-competitive
// systems, keeping the honesty framing legible at map scale. Click a marker to
// open the hub; hover (or tap) for the last and next election.
//
// Mobile: one-finger dragging is disabled so the page still scrolls over the
// map (pinch-zoom and the buttons continue to work), the view fits every
// marker on mount whatever the aspect ratio, and tap targets are enlarged.

function FitAll({ markers }: { markers: HubMarker[] }) {
  const map = useMap();
  useEffect(() => {
    if (!markers.length) return;
    const b = latLngBounds(markers.map((m) => [m.lat, m.lon] as [number, number]));
    map.fitBounds(b, { padding: [24, 24] });
  }, [map, markers]);
  return null;
}

export default function ElectionsWorldMapInner({ markers }: { markers: HubMarker[] }) {
  const router = useRouter();
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    setCoarse(window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 640);
  }, []);

  const sorted = useMemo(
    // northern/dense markers render first so southern ones stay clickable
    () => [...markers].sort((a, b) => b.lat - a.lat),
    [markers],
  );

  return (
    <MapContainer
      key={coarse ? "coarse" : "fine"}
      center={[24, 12]}
      zoom={2}
      minZoom={1}
      maxZoom={7}
      scrollWheelZoom={false}
      dragging={!coarse}
      touchZoom
      maxBounds={[[-62, -185], [82, 185]]}
      maxBoundsViscosity={0.8}
      zoomControl={false}
      attributionControl={false}
      style={{ height: "100%", width: "100%", background: "#0b0e13" }}
    >
      <FitAll markers={markers} />
      <ZoomControl position="bottomright" />
      <AttributionControl position="bottomleft" prefix={false} />
      <TileLayer
        url={basemapUrl("dark_all")}
        noWrap
        attribution={BASEMAP_ATTRIBUTION}
      />
      {sorted.map((m) => {
        const color = m.note ? "#D97706" : "#4ECDC4";
        return (
          <CircleMarker
            key={m.code}
            center={[m.lat, m.lon]}
            radius={coarse ? 9 : 7}
            pathOptions={{
              color,
              weight: m.compact ? 1.25 : 2,
              fillColor: color,
              fillOpacity: m.compact ? 0.35 : 0.55,
            }}
            eventHandlers={{ click: () => router.push(m.href) }}
          >
            <Tooltip direction="top" offset={[0, -8]} opacity={1}>
              <div style={{ fontSize: 12, lineHeight: 1.45 }}>
                <div style={{ fontWeight: 700 }}>
                  {m.name}
                  {m.note ? <span style={{ color: "#D97706" }}> · {m.note}</span> : null}
                </div>
                <div style={{ color: "#6b7280" }}>Last · {m.last}</div>
                <div style={{ color: "#6b7280" }}>Next · {m.next}</div>
                <div style={{ color: "#4ECDC4", marginTop: 2 }}>Open the hub →</div>
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
