import { getAllMetros } from '@/lib/data';
import {
  formatContextValue,
  type Badge,
  type QualifyingMetro,
} from '@/lib/badges';
import BadgeMapClient, { type BadgePoint, type BadgeTierDef } from './BadgeMapClient';

// Server orchestrator. Joins qualifying metros to lat/lon via
// getAllMetros() and emits the slim BadgePoint shape used by the client.
// Metros without a usable lat/lon are dropped silently (the page table
// still surfaces them); the map is best-effort visualization.
//
// Every live badge in lib/badges.ts BADGES picks this up automatically
// because the page renders <BadgeMap /> per generateStaticParams.

interface Props {
  badge: Badge;
  qualifying: QualifyingMetro[];
}

export default function BadgeMap({ badge, qualifying }: Props) {
  const metros = getAllMetros();
  const bySlug = new Map(metros.map((m) => [m.slug, m]));

  const tierMap = new Map<string, BadgeTierDef>();
  for (const t of badge.tiers ?? []) {
    tierMap.set(t.slug, { slug: t.slug, name: t.name, accentHex: t.accentHex });
  }

  const points: BadgePoint[] = [];
  for (const q of qualifying) {
    const m = bySlug.get(q.slug);
    if (!m) continue;
    if (typeof m.lat !== 'number' || typeof m.lon !== 'number') continue;
    if (m.lat === 0 && m.lon === 0) continue;
    const tierDef = q.tier ? tierMap.get(q.tier) : undefined;
    points.push({
      slug: q.slug,
      name: q.name,
      country: q.country,
      continent: m.continent,
      lat: m.lat,
      lon: m.lon,
      rank: q.rank,
      formattedValue: formatContextValue(badge.slug, q.contextValue),
      contextLabel: q.contextLabel,
      tierSlug: q.tier,
      tierName: tierDef?.name,
      tierColor: tierDef?.accentHex,
    });
  }

  // If no points resolve to lat/lon, skip the map entirely rather than
  // rendering an empty Leaflet container. The page still lists the
  // qualifying metros in the table below.
  if (points.length === 0) return null;

  const tiers: BadgeTierDef[] | undefined = badge.tiers
    ? badge.tiers.map((t) => ({ slug: t.slug, name: t.name, accentHex: t.accentHex }))
    : undefined;

  return (
    <section
      aria-label={`${badge.name} map`}
      className="pt-2 pb-6"
    >
      <BadgeMapClient
        badgeName={badge.name}
        badgeEmoji={badge.emoji}
        points={points}
        tiers={tiers}
      />
    </section>
  );
}
