'use client';

import { useMemo, useEffect, useState } from 'react';
import MetroMap, { type MapPoint } from './MetroMap';
import { useMetroBoundaries } from '@/lib/useMetroBoundaries';

// Home console map. Shows the top-N metros as tier-colored markers across
// the full corpus footprint. Distinct from RankingsTable's embedded map
// (which mirrors the active filter set) — this map is the editorial,
// always-on view of the index that lives next to the search and top-five
// sidecar on the home page.
//
// Tier colors mirror lib/tiers.ts accentHex values so the legend renders
// inline beneath the map without re-importing the full TIERS array on
// the client.
const TIER_COLOR = (score: number): string => {
  if (score >= 100) return '#7c3aed';
  if (score >= 50) return '#2563eb';
  if (score >= 20) return '#0891b2';
  if (score >= 10) return '#16a34a';
  if (score >= 5) return '#ca8a04';
  if (score >= 1) return '#ea580c';
  return '#6b7280';
};

interface HomeMapPoint extends MapPoint {
  score: number;
}

interface Props {
  // Top-N points to render. Defaults to 250 — small enough to keep the map
  // legible and the boundary fetch cheap, large enough to populate visible
  // regions everywhere on the globe.
  points?: HomeMapPoint[];
  initialMetros?: Array<{
    rank: number;
    slug: string;
    name: string;
    country: string;
    primaryCity?: string;
    primaryState?: string;
    score: number;
    lat: number;
    lon: number;
  }>;
  topN?: number;
}

export default function HomeMap({ initialMetros, topN = 250 }: Props) {
  // Fall back to fetching metros.json if the parent didn't pass them in.
  // The default home flow passes via getAllMetros on the server, but the
  // hook exists for any future client-only callers (e.g. the random page).
  const [metros, setMetros] = useState(initialMetros ?? null);

  useEffect(() => {
    if (initialMetros) return;
    let cancelled = false;
    fetch('/data/metros.json')
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const arr = Array.isArray(d) ? d : d.metros;
        setMetros(arr);
      })
      .catch(() => {
        // Silent fail; the map renders empty and the surrounding layout is fine.
      });
    return () => {
      cancelled = true;
    };
  }, [initialMetros]);

  const points = useMemo<HomeMapPoint[]>(() => {
    if (!metros) return [];
    return metros
      .filter(
        (m) =>
          m.rank > 0 &&
          typeof m.lat === 'number' &&
          typeof m.lon === 'number' &&
          (m.lat !== 0 || m.lon !== 0),
      )
      .sort((a, b) => a.rank - b.rank)
      .slice(0, topN)
      .map((m) => ({
        slug: m.slug,
        name: m.name,
        lat: m.lat,
        lon: m.lon,
        city: m.primaryCity,
        state: m.primaryState,
        country: m.country,
        score: m.score,
        color: TIER_COLOR(m.score),
      }));
  }, [metros, topN]);

  const boundary = useMetroBoundaries(points.map((p) => p.slug));

  return (
    <div className="rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
      <MetroMap
        points={points}
        showConnections={false}
        height={360}
        refitOnChange
        clickToNavigate
        boundary={boundary ?? undefined}
      />
    </div>
  );
}
