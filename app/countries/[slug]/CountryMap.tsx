// Server component. Renders the country-level boundary map for any country
// page where at least one member metro has a boundary GeoJSON on disk.
// Polygons are colored by tier (lib/tiers.ts) and click through to each
// metro's detail page. Falls back to null when no boundaries exist; the
// country page handles "no map" gracefully.

import { loadCountryBoundaries } from "@/lib/country-boundaries";
import CountryMapClient from "./CountryMapClient";

export default function CountryMap({
  slug,
  countryName,
}: {
  slug: string;
  countryName: string;
}) {
  const { collection, metrosWithBoundaries, metrosTotal } =
    loadCountryBoundaries(slug);
  if (!collection) return null;

  const allTracked = metrosWithBoundaries === metrosTotal;
  const coverageNote = allTracked
    ? `${metrosWithBoundaries} ${metrosWithBoundaries === 1 ? "metro" : "metros"}`
    : `${metrosWithBoundaries} of ${metrosTotal} metros`;

  return (
    <section className="mb-12">
      <div
        className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-6"
      >
        <div className="flex items-baseline justify-between gap-3 mb-4 flex-wrap">
          <h3 className="text-base font-semibold">
            <span aria-hidden="true">🗺</span>{" "}
            {countryName} metro footprint
          </h3>
          <span
            className="text-xs"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              color: "var(--text-muted)",
            }}
          >
            {coverageNote}
          </span>
        </div>

        <CountryMapClient collection={collection} height={520} />

        <p
          className="mt-3 text-xs"
          style={{ color: "var(--text-dim)" }}
        >
          Polygons shaded by composite tier. Hover for rank, click to open the
          metro page. Boundaries derived from Overture Maps administrative
          divisions; metros without source coverage are omitted.
        </p>
      </div>
    </section>
  );
}
