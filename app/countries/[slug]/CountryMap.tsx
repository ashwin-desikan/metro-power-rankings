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

        <div
          className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] tracking-wide"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            color: "var(--text-muted)",
          }}
        >
          <LegendSwatch color="#7c3aed" label="Global Capital" />
          <LegendSwatch color="#2563eb" label="Continental City" />
          <LegendSwatch color="#0891b2" label="Major Metro" />
          <LegendSwatch color="#16a34a" label="Regional Hub" />
          <LegendSwatch color="#ca8a04" label="Established" />
          <LegendSwatch color="#ea580c" label="Emerging" />
          <LegendSwatch color="#6b7280" label="Local" />
        </div>

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

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className="inline-block w-2.5 h-2.5 rounded-sm"
        style={{ backgroundColor: color, opacity: 0.7 }}
      />
      {label}
    </span>
  );
}
