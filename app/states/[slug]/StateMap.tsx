// State / province-level boundary map. Server component. Reuses the country
// page's CountryMap visual treatment: aggregated metro polygons colored by
// tier, hover tooltips, click-through to metro detail. Falls back to null
// when no member metro has a boundary on disk.

import MetroMap from "@/app/MetroMap";
import { loadBoundariesForMetros } from "@/lib/country-boundaries";
import { getMetrosForState } from "@/lib/states";

export default function StateMap({
  slug,
  stateName,
}: {
  slug: string;
  stateName: string;
}) {
  const metros = getMetrosForState(slug);
  const { collection, metrosWithBoundaries, metrosTotal } =
    loadBoundariesForMetros(metros);
  if (!collection) return null;

  const allTracked = metrosWithBoundaries === metrosTotal;
  const coverageNote = allTracked
    ? `${metrosWithBoundaries} ${metrosWithBoundaries === 1 ? "metro" : "metros"}`
    : `${metrosWithBoundaries} of ${metrosTotal} metros`;

  return (
    <section className="mb-12">
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-6">
        <div className="flex items-baseline justify-between gap-3 mb-4 flex-wrap">
          <h3 className="text-base font-semibold">
            <span aria-hidden="true">🗺</span>{" "}
            {stateName} metro footprint
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

        <MetroMap
          points={[]}
          showConnections={false}
          boundary={collection}
          interactiveFeatures={true}
          height={520}
        />

        <div
          className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] tracking-wide"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            color: "var(--text-muted)",
          }}
        >
          <LegendSwatch color="#7c3aed" label="Global Capital" />
          <LegendSwatch color="#2563eb" label="Continental Metro" />
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
          divisions; metros without source coverage are omitted. Some metro
          footprints may extend beyond the state border where the metropolitan
          area spans state lines.
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
