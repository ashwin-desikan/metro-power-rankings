// Server component. Loads the metro pin, the optional boundary polygon,
// and the team/venue + university marker sets, then hands them to a
// client-side wrapper (MapWithFilters) that adds per-category toggles.
// Four layers stack on the map itself:
//   1. (Optional) Dissolved-county boundary polygon from
//      public/data/metro-boundaries/{slug}.geojson.
//   2. Team / venue markers from Team List + FootballClub_Data, color-
//      coded by category (Major League / Other teams / Venues).
//   3. University markers from CWUR top-500 (indigo), surfaced when the
//      details file carries lat/lng (workbook coverage 2026-05-09 onward).
//   4. The primary-city pin at metros.json (lat, lon).

import { getAllMetros } from "@/lib/data";
import { buildMarkers, buildUniversityMarkers } from "@/lib/teamMarkers";
import { loadMetroBoundaryCollection } from "@/lib/country-boundaries";

import MapWithFilters from "./MapWithFilters";

type MarkerInput = Parameters<typeof buildMarkers>[0];
type UniversityInput = Parameters<typeof buildUniversityMarkers>[0];

export default function MetroPageMap({
  slug,
  teams,
  universities,
}: {
  slug: string;
  teams?: MarkerInput;
  universities?: UniversityInput;
}) {
  const all = getAllMetros();
  const self = all.find((m) => m.slug === slug);
  if (!self) return null;
  if (self.lat === 0 && self.lon === 0) return null;

  const pinName = self.primaryCity || self.name;
  const boundary = loadMetroBoundaryCollection(slug);
  const teamMarkers = buildMarkers(teams);
  const uniMarkers = buildUniversityMarkers(universities);
  const markers = [...teamMarkers, ...uniMarkers];

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
