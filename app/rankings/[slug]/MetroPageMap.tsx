// Server component. Two cases handled in priority order:
//   1. Metro is part of a conurbation cluster with 2+ workbook members:
//      render a MetroMap of all members ("Greater Golden Horseshoe").
//   2. Metro has valid lat/lon but is solo: render a single-point map
//      ("Where is Manchester?") so every metro page gets a geographic anchor.
//   3. Metro has zero coords: return null silently.

import { getAllMetros } from "@/lib/data";
import { getBadgesForMetro } from "@/lib/badges";
import MetroMap from "@/app/MetroMap";

export default function MetroPageMap({ slug }: { slug: string }) {
  const all = getAllMetros();
  const bySlug = new Map(all.map((m) => [m.slug, m]));
  const self = bySlug.get(slug);
  if (!self) return null;

  const badges = getBadgesForMetro(slug);
  const conurbation = badges.find((b) => b.badge.slug === "conurbations");
  const cluster = conurbation?.qualifying.cluster;

  // Case 1: cluster with 2+ workbook members that have valid coords.
  if (cluster) {
    const points = cluster.memberSlugs
      .map((s) => bySlug.get(s))
      .filter((m): m is NonNullable<typeof m> => m !== undefined && (m.lat !== 0 || m.lon !== 0))
      .map((m) => ({ slug: m.slug, name: m.name, lat: m.lat, lon: m.lon }));

    if (points.length >= 2) {
      return (
        <section>
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-6">
            <div className="flex items-baseline justify-between gap-3 mb-4 flex-wrap">
              <h3 className="text-base font-semibold">
                <span aria-hidden="true">🔗</span> {conurbation!.qualifying.name}
              </h3>
              <span
                className="text-xs"
                style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-muted)" }}
              >
                {points.length} metros · {cluster.diameterKm.toFixed(0)} km diameter
              </span>
            </div>
            <MetroMap points={points} height={320} />
          </div>
        </section>
      );
    }
  }

  // Case 2: solo metro with valid coords. Show a single-point "where is this"
  // map at city-zoom (Leaflet zoom 10 shows roughly ~50 km on a side).
  if (self.lat !== 0 || self.lon !== 0) {
    return (
      <section>
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-6">
          <div className="flex items-baseline justify-between gap-3 mb-4 flex-wrap">
            <h3 className="text-base font-semibold">
              <span aria-hidden="true">📍</span> Location
            </h3>
            <span
              className="text-xs"
              style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-muted)" }}
            >
              {self.lat.toFixed(2)}, {self.lon.toFixed(2)}
            </span>
          </div>
          <MetroMap
            points={[{ slug: self.slug, name: self.name, lat: self.lat, lon: self.lon }]}
            showConnections={false}
            height={300}
          />
        </div>
      </section>
    );
  }

  // Case 3: no valid coords. Silent.
  return null;
}
