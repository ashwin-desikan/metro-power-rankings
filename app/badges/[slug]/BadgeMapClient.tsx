'use client';

// Client-side filter UI and MetroMap wrapper for any badge page. Lives
// under app/badges/[slug]/ so it stays scoped to the badge route.
//
// Filters:
//   - Continent (single-select): All / Europe / North America / Asia /
//     South America / Africa / Oceania.
//   - Tier (multi-select): only shown when the badge defines tiers. Each
//     pill renders a swatch + name + count. All/None controls top the row.
//
// Markers:
//   - One CircleMarker per qualifying metro, colored by badge tier
//     (accentHex). Falls back to the site accent if the badge has no tiers.
//   - Tooltip: name, country, #rank, formatted value, optional tier name.
//   - Click navigates to /rankings/{slug} via clickToNavigate on MetroMap.
//   - Bounds refit on filter change so picking a continent zooms in.

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { MapPoint } from '@/app/MetroMap';

const MetroMap = dynamic(() => import('@/app/MetroMap'), {
  ssr: false,
  loading: () => (
    <div
      className="h-full w-full flex items-center justify-center text-xs"
      style={{ color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}
    >
      Loading map…
    </div>
  ),
});

export type BadgePoint = {
  slug: string;
  name: string;
  country: string;
  continent: string;
  lat: number;
  lon: number;
  rank: number;
  formattedValue: string;
  contextLabel: string;
  tierSlug?: string;
  tierName?: string;
  tierColor?: string;
};

export type BadgeTierDef = {
  slug: string;
  name: string;
  accentHex: string;
};

const DEFAULT_ACCENT = '#4ECDC4';

const CONTINENTS = [
  'All',
  'Europe',
  'North America',
  'Asia',
  'South America',
  'Africa',
  'Oceania',
] as const;

interface Props {
  badgeName: string;
  badgeEmoji: string;
  points: BadgePoint[];
  tiers?: BadgeTierDef[];
}

export default function BadgeMapClient({ badgeName, badgeEmoji, points, tiers }: Props) {
  const [continent, setContinent] = useState<(typeof CONTINENTS)[number]>('All');

  const hasTiers = !!(tiers && tiers.length > 0);
  const allTierSlugs = useMemo(() => (tiers ?? []).map((t) => t.slug), [tiers]);
  const [visibleTiers, setVisibleTiers] = useState<Set<string>>(
    () => new Set(allTierSlugs),
  );

  // Per-tier counts so the legend pills show how many metros each tier
  // covers before the reader clicks.
  const tierCounts = useMemo<Record<string, number>>(() => {
    if (!hasTiers) return {};
    const counts: Record<string, number> = {};
    for (const p of points) {
      if (!p.tierSlug) continue;
      counts[p.tierSlug] = (counts[p.tierSlug] || 0) + 1;
    }
    return counts;
  }, [points, hasTiers]);

  // Same for continents — used to dim continent pills that have zero
  // qualifying metros.
  const continentCounts = useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    for (const p of points) {
      counts[p.continent] = (counts[p.continent] || 0) + 1;
    }
    return counts;
  }, [points]);

  const filtered = useMemo(() => {
    return points.filter((p) => {
      if (continent !== 'All' && p.continent !== continent) return false;
      if (hasTiers && p.tierSlug && !visibleTiers.has(p.tierSlug)) return false;
      return true;
    });
  }, [points, continent, visibleTiers, hasTiers]);

  const mapPoints: MapPoint[] = useMemo(
    () =>
      filtered.map((p) => {
        const subParts: string[] = [
          p.country,
          `#${p.rank}`,
          `${p.contextLabel}: ${p.formattedValue}`,
        ];
        if (p.tierName) subParts.push(p.tierName);
        return {
          slug: p.slug,
          name: p.name,
          lat: p.lat,
          lon: p.lon,
          country: p.country,
          color: p.tierColor ?? DEFAULT_ACCENT,
          subtitle: subParts.join(' · '),
        };
      }),
    [filtered],
  );

  const toggleTier = (slug: string) => {
    setVisibleTiers((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };
  const enableAllTiers = () => setVisibleTiers(new Set(allTierSlugs));
  const enableNoneTiers = () => setVisibleTiers(new Set());

  const visibleContinents = CONTINENTS.filter(
    (c) => c === 'All' || (continentCounts[c] || 0) > 0,
  );

  return (
    <div className="space-y-3">
      <div
        className="rounded-lg overflow-hidden border"
        style={{ borderColor: 'var(--border)', height: 420 }}
      >
        {mapPoints.length > 0 ? (
          <MetroMap
            points={mapPoints}
            showConnections={false}
            height={420}
            refitOnChange
            clickToNavigate
          />
        ) : (
          <div
            className="h-full w-full flex items-center justify-center text-center px-6"
            style={{ backgroundColor: 'var(--bg-card)' }}
          >
            <div>
              <p className="text-sm text-[var(--text)] mb-1">
                No metros match these filters.
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Clear continent or re-enable a tier above.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Continent filter row. Single-select. Continents with zero
          qualifying metros are hidden so the row stays focused on what
          actually appears for this badge. */}
      <div
        className="flex flex-wrap items-center gap-2"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        <span
          className="text-[10px] tracking-widest uppercase text-[var(--text-muted)] mr-1"
          aria-hidden="true"
        >
          Continent
        </span>
        {visibleContinents.map((c) => {
          const on = continent === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setContinent(c)}
              aria-pressed={on}
              className="text-[11px] px-2.5 py-1 rounded border transition"
              style={{
                borderColor: on ? 'var(--accent)' : 'var(--border)',
                color: on ? 'var(--text)' : 'var(--text-muted)',
                backgroundColor: on ? 'rgba(78,205,196,0.10)' : 'transparent',
              }}
            >
              {c}
            </button>
          );
        })}
      </div>

      {/* Tier filter row. Only rendered when the badge actually defines
          tiers; counts come from the unfiltered point set. */}
      {hasTiers && tiers && (
        <div
          className="flex flex-wrap items-center gap-2"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          <span
            className="text-[10px] tracking-widest uppercase text-[var(--text-muted)] mr-1"
            aria-hidden="true"
          >
            Tier
          </span>
          <button
            type="button"
            onClick={enableAllTiers}
            className="text-[11px] px-2 py-1 rounded border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
          >
            All
          </button>
          <button
            type="button"
            onClick={enableNoneTiers}
            className="text-[11px] px-2 py-1 rounded border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition"
          >
            None
          </button>
          {tiers.map((t) => {
            const on = visibleTiers.has(t.slug);
            const count = tierCounts[t.slug] || 0;
            if (count === 0) return null;
            return (
              <button
                key={t.slug}
                type="button"
                onClick={() => toggleTier(t.slug)}
                aria-pressed={on}
                className="text-[11px] px-2 py-1 rounded border transition flex items-center gap-1.5"
                style={{
                  borderColor: on ? t.accentHex : 'var(--border)',
                  color: on ? 'var(--text)' : 'var(--text-dim)',
                  backgroundColor: on ? `${t.accentHex}22` : 'transparent',
                }}
                title={`${t.name}: ${count} ${count === 1 ? 'metro' : 'metros'}`}
              >
                <span
                  aria-hidden="true"
                  className="inline-block w-2.5 h-2.5 rounded-sm"
                  style={{ backgroundColor: t.accentHex, opacity: on ? 0.9 : 0.3 }}
                />
                {t.name}
                <span className="text-[10px] opacity-70 ml-0.5">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Status line: visible / total */}
      <div
        className="text-[11px] text-[var(--text-muted)] flex items-center gap-2"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
        aria-live="polite"
      >
        <span aria-hidden="true">{badgeEmoji}</span>
        <span>
          {badgeName}: showing {filtered.length} of {points.length} qualifying metros
        </span>
      </div>
    </div>
  );
}
