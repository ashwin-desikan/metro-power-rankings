'use client';

import { useMemo, useState } from 'react';

import MetroMap, { type MapPoint } from '@/app/MetroMap';
import {
  MARKER_COLORS,
  MARKER_LABELS,
  type MarkerCategory,
  type TeamMarker,
} from '@/lib/teamMarkers';

// Client-side wrapper around MetroMap that adds three category toggles
// below the map. Each toggle shows the marker count and acts as a
// visibility switch. State lives in this component so the server
// component upstream stays a clean boundary + markers passthrough.

const CATEGORIES: readonly MarkerCategory[] = ['majorLeague', 'otherTeam', 'venue'];

export default function MapWithFilters({
  point,
  boundary,
  markers,
  height,
}: {
  point: MapPoint;
  boundary?: unknown;
  markers: TeamMarker[];
  height: number;
}) {
  const counts = useMemo(() => {
    const c: Record<MarkerCategory, number> = { majorLeague: 0, otherTeam: 0, venue: 0 };
    for (const m of markers) c[m.category] += 1;
    return c;
  }, [markers]);

  // Default: every category that has at least one marker is on. Categories
  // with zero markers still appear in the toggle row so the legend reads
  // consistently across metros, but they are disabled.
  const initialActive = useMemo(() => {
    const set = new Set<MarkerCategory>();
    for (const cat of CATEGORIES) {
      if (counts[cat] > 0) set.add(cat);
    }
    return set;
  }, [counts]);

  const [active, setActive] = useState<Set<MarkerCategory>>(initialActive);

  const visibleMarkers = useMemo(
    () => markers.filter((m) => active.has(m.category)),
    [markers, active]
  );

  const toggle = (cat: MarkerCategory) => {
    if (counts[cat] === 0) return;
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const totalCount = counts.majorLeague + counts.otherTeam + counts.venue;

  return (
    <>
      <MetroMap
        points={[point]}
        showConnections={false}
        boundary={boundary}
        height={height}
        markers={visibleMarkers}
      />
      {totalCount > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 mt-3 text-xs"
          role="group"
          aria-label="Marker category filters"
        >
          {CATEGORIES.map((cat) => {
            const isActive = active.has(cat);
            const isDisabled = counts[cat] === 0;
            const fill = MARKER_COLORS[cat];
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggle(cat)}
                disabled={isDisabled}
                aria-pressed={isActive}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-colors"
                style={{
                  borderColor: isActive ? fill : 'var(--border)',
                  background: isActive ? `${fill}1f` : 'transparent',
                  color: isDisabled
                    ? 'var(--text-muted)'
                    : isActive
                      ? 'var(--text)'
                      : 'var(--text-muted)',
                  opacity: isDisabled ? 0.45 : 1,
                  cursor: isDisabled ? 'not-allowed' : 'pointer',
                  fontFamily: "'Inter', system-ui, sans-serif",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-block',
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    background: fill,
                    border: '1px solid #0f172a',
                    opacity: isActive ? 1 : 0.55,
                  }}
                />
                <span>{MARKER_LABELS[cat]}</span>
                <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {counts[cat]}
                </span>
              </button>
            );
          })}
          <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
            click to toggle
          </span>
        </div>
      )}
    </>
  );
}
