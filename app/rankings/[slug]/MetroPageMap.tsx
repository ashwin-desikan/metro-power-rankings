// Server component. Renders a Leaflet map for any metro with valid
// primary-city coordinates. Three layers stack:
//   1. (Optional) A dissolved-county boundary polygon, loaded from
//      public/data/metro-boundaries/{slug}.geojson if it exists.
//   2. Team / venue markers from Team List + FootballClub_Data, color-
//      coded by category (Major League / Other teams / Venues). The
//      classification mirrors the written sections of the metro page
//      (TeamsSection + EventsSection in page.tsx).
//   3. A primary-city pin at metros.json (lat, lon).
//
// Markers are computed server-side and passed as plain JSON. Entries
// missing lat/lng silently fall through to the written sections only.

import { readFileSync } from "fs";
import { join } from "path";

import { getAllMetros } from "@/lib/data";
import MetroMap from "@/app/MetroMap";
import { buildMarkers, MARKER_COLORS, MARKER_LABELS, type MarkerCategory } from "@/lib/teamMarkers";

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

  // Legend chips render only when at least one marker in that category
  // is present. Keeps the chrome quiet on metros with no plottable rows.
  const presentCategories: MarkerCategory[] = (["majorLeague", "otherTeam", "venue"] as const).filter(
    (cat) => markers.some((m) => m.category === cat)
  );

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
          markers={markers}
        />
        {presentCategories.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
            {presentCategories.map((cat) => (
              <span key={cat} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: MARKER_COLORS[cat],
                    border: "1px solid #0f172a",
                  }}
                />
                {MARKER_LABELS[cat]}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
