"use client";

import { useRouter } from "next/navigation";
import { MapContainer, TileLayer, CircleMarker, Tooltip, ZoomControl, AttributionControl } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { HubMarker } from "./ElectionsWorldMap";

// World map of the election hubs: one marker per polity at its seat of
// government. Teal = competitive democracies; amber = managed / non-competitive
// systems, keeping the honesty framing legible at map scale. Click a marker to
// open the hub; hover for the last and next election.

export default function ElectionsWorldMapInner({ markers }: { markers: HubMarker[] }) {
  const router = useRouter();
  return (
    <MapContainer
      center={[24, 12]}
      zoom={2}
      minZoom={2}
      maxZoom={6}
      scrollWheelZoom={false}
      worldCopyJump
      zoomControl={false}
      attributionControl={false}
      style={{ height: "100%", width: "100%", background: "#0b0e13" }}
    >
      <ZoomControl position="bottomright" />
      <AttributionControl position="bottomleft" prefix={false} />
      <TileLayer
        url="https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
      />
      {markers.map((m) => {
        const color = m.note ? "#D97706" : "#4ECDC4";
        return (
          <CircleMarker
            key={m.code}
            center={[m.lat, m.lon]}
            radius={7}
            pathOptions={{ color, weight: 2, fillColor: color, fillOpacity: 0.55 }}
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
