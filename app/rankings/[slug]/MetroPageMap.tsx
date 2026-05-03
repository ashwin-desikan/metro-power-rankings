// Server component. Renders a Leaflet map for any metro with valid
// primary-city coordinates. Two layers stack:
//   1. A primary-city pin at metros.json (lat, lon)
//   2. (Optional) A dissolved-county boundary polygon, loaded from
//      public/data/metro-boundaries/{slug}.geojson if it exists.
//
// US metros currently have boundary coverage (~580 metros via Overture
// Maps division_area + the workbook Counties sheet). Other countries
// fall back to the pin-only view until per-country boundary ETLs ship.

import { readFileSync } from "fs";
import { join } from "path";

import { getAllMetros } from "@/lib/data";
import MetroMap from "@/app/MetroMap";

function loadBoundary(slug: string): unknown | null {
  try {
    const p = join(process.cwd(), "public", "data", "metro-boundaries", `${slug}.geojson`);
    const raw = readFileSync(p, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default function MetroPageMap({ slug }: { slug: string }) {
  const all = getAllMetros();
  const self = all.find((m) => m.slug === slug);
  if (!self) return null;
  if (self.lat === 0 && self.lon === 0) return null;

  const pinName = self.primaryCity || self.name;
  const boundary = loadBoundary(slug);

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
        <MetroMap
          points={[{ slug: self.slug, name: pinName, lat: self.lat, lon: self.lon }]}
          showConnections={false}
          boundary={boundary}
          height={boundary ? 400 : 300}
        />
      </div>
    </section>
  );
}
