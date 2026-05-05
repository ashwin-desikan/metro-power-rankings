// Server component. Loads the metro pin, the optional boundary polygon,
// and the team/venue marker set, then hands them to a client-side
// wrapper (MapWithFilters) that adds per-category toggles. Three layers
// stack on the map itself:
//   1. (Optional) Dissolved-county boundary polygon from
//      public/data/metro-boundaries/{slug}.geojson.
//   2. Team / venue markers from Team List + FootballClub_Data, color-
//      coded by category (Major League / Other teams / Venues).
//   3. The primary-city pin at metros.json (lat, lon).

import { readFileSync } from "fs";
import { join } from "path";

import { getAllMetros } from "@/lib/data";
import { buildMarkers } from "@/lib/teamMarkers";

import MapWithFilters from "./MapWithFilters";

function loadBoundary(slug: string): unknown | null {
  try {
    const p = join(process.cwd(), "public", "data", "metro-boundaries", `${slug}.geojson`);
    const raw = readFileSync(p, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

type MarkerInput = Parameters<typeof buildMarkers>[0];

export default function MetroPageMap({
  slug,
  teams,
}: {
  slug: string;
  teams?: MarkerInput;
}) {
  const all = getAllMetros();
  const self = all.find((m) => m.slug === slug);
  if (!self) return null;
  if (self.lat === 0 && self.lon === 0) return null;

  const pinName = self.primaryCity || self.name;
  const boundary = loadBoundary(slug);
  const markers = buildMarkers(teams);

  return (
    <section>
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-6">
        <div className="flex items-baseline justify-between gap-3 mb-4 flex-wrap">
          <h3 className="text-base font-semibold">
            <span aria-hidden="true">📍</span>{" "}
            {boundary ? `${self.name} metro area` : `Primary city: ${pinName}`}
          </h3>
          <span
            className="text-xs"
            style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-muted)" }}
          >
            {self.lat.toFixed(2)}, {self.lon.toFixed(2)}
          </span>
        </div>
        <MapWithFilters
          point={{ slug: self.slug, name: pinName, lat: self.lat, lon: self.lon }}
          boundary={boundary}
          markers={markers}
          height={boundary ? 400 : 300}
        />
      </div>
    </section>
  );
}
