// Server component. Renders the country-level boundary map for any country
// page where at least one member metro has a boundary GeoJSON on disk.
// Polygons are colored by tier (lib/tiers.ts) and click through to each
// metro's detail page. Falls back to null when no boundaries exist; the
// country page handles "no map" gracefully.

import { loadCountryBoundaries } from "@/lib/country-boundaries";
import CountryMapClient from "./CountryMapClient";
import Collapsible from "./Collapsible";
import { withIcon } from "./sectionIcons";

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

  // Discoverability fix 2026-08-04: this used to be a bare <section> with a
  // text-base h3 reading "{country} metro footprint", while every other section
  // on the page is a Collapsible with a text-xl bold title. It scanned as a
  // card rather than a section, and its heading did not match its nav chip
  // ("Geography"), so it was easy to miss entirely - a thorough external review
  // of this page read it end to end and never mentioned the map. Now it uses
  // the same Collapsible shell as its neighbours and the title matches the chip.
  return (
    <Collapsible
      id="geography"
      title={withIcon("geography", "Geography")}
      right={
        <span
          className="text-xs"
          style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-muted)" }}
        >
          {coverageNote}
        </span>
      }
    >
      <p className="text-sm text-[var(--text-muted)] mb-3">
        <span aria-hidden="true">🗺</span> {countryName} metro footprint, shaded
        by composite tier.
      </p>
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4 sm:p-6 min-w-0">
        <CountryMapClient collection={collection} height={520} />
        <p className="mt-3 text-xs" style={{ color: "var(--text-dim)" }}>
          Hover for rank, click to open the metro page. Boundaries derived from
          Overture Maps administrative divisions; metros without source coverage
          are omitted.
        </p>
      </div>
    </Collapsible>
  );
}
