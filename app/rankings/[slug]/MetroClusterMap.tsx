// Server component. Looks up the metro's conurbation cluster (named
// megaregion, single-metro override, or auto-cluster) and, if found,
// renders a MetroMap of all members. Returns null silently when the
// metro isn't in any conurbation (most metros below Tier B-Continental).

import { getAllMetros } from "@/lib/data";
import { getBadgesForMetro } from "@/lib/badges";
import MetroMap from "@/app/MetroMap";

export default function MetroClusterMap({ slug }: { slug: string }) {
  const badges = getBadgesForMetro(slug);
  const conurbation = badges.find((b) => b.badge.slug === "conurbations");
  if (!conurbation || !conurbation.qualifying.cluster) return null;

  const cluster = conurbation.qualifying.cluster;
  const all = getAllMetros();
  const bySlug = new Map(all.map((m) => [m.slug, m]));

  // Member slugs include the lead metro itself; that's intentional so the
  // viewing metro shows up as one of the dots, not as separate from the cluster.
  const points = cluster.memberSlugs
    .map((s) => bySlug.get(s))
    .filter((m): m is NonNullable<typeof m> => m !== undefined && (m.lat !== 0 || m.lon !== 0))
    .map((m) => ({ slug: m.slug, name: m.name, lat: m.lat, lon: m.lon }));

  // Single-metro overrides (e.g. Greater Kansas City) have one member; not
  // worth a map. Skip the section silently.
  if (points.length < 2) return null;

  return (
    <section>
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-6">
        <div className="flex items-baseline justify-between gap-3 mb-4 flex-wrap">
          <h3 className="text-base font-semibold">
            <span aria-hidden="true">🔗</span> {conurbation.qualifying.name}
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
