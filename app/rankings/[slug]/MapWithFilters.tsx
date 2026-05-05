'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import MetroMap, { type MapPoint } from '@/app/MetroMap';
import {
  MARKER_COLORS,
  MARKER_LABELS,
  type MarkerCategory,
  type TeamMarker,
} from '@/lib/teamMarkers';
import { normalizeSport, uniqueDisplaySports } from '@/lib/sportLabels';

// Client-side wrapper around MetroMap. Adds two filter dimensions
// underneath the map, both grouped under a Sport heading so future
// filter families (Culture, Business, Infrastructure) have a place
// to attach:
//
//   1. Three category toggles (Major League / Other teams / Venues).
//      Major-quality venues live in BOTH "majorLeague" and "venue"
//      tag sets, so toggling Venues includes them. Visibility is
//      ANY-match against the active set.
//
//   2. A multiselect Sport dropdown listing every unique sport in
//      the metro's marker set. Default state is all-selected. Combines
//      AND with the category toggles.

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
  // A marker counts toward every category in its categories[] array.
  // Beaver Stadium (majorLeague + venue) increments both totals.
  const counts = useMemo(() => {
    const c: Record<MarkerCategory, number> = { majorLeague: 0, otherTeam: 0, venue: 0 };
    for (const m of markers) {
      for (const cat of m.categories) c[cat] += 1;
    }
    return c;
  }, [markers]);

  // Categories with at least one marker start active. Empty categories
  // still appear in the UI as disabled chips so the layout is stable.
  const initialActiveCats = useMemo(() => {
    const set = new Set<MarkerCategory>();
    for (const cat of CATEGORIES) {
      if (counts[cat] > 0) set.add(cat);
    }
    return set;
  }, [counts]);

  const [activeCats, setActiveCats] = useState<Set<MarkerCategory>>(initialActiveCats);

  // Sport list: unique DISPLAY sports in the metro's markers. "Football"
  // and "Soccer" collapse into a single "Football/Soccer" option here so
  // readers don't see the workbook's two parallel labels.
  const allSports = useMemo(
    () => uniqueDisplaySports(markers.map((m) => m.sport)),
    [markers]
  );

  const [selectedSports, setSelectedSports] = useState<Set<string>>(() => new Set(allSports));

  // Reset sport selection if the underlying marker set changes (e.g.
  // navigating between metros within a session — Next.js may reuse the
  // tree). Without this, an unrelated sport could remain "selected" with
  // no markers backing it.
  useEffect(() => {
    setSelectedSports(new Set(allSports));
  }, [allSports]);

  const visibleMarkers = useMemo(() => {
    const allSportsSelected = selectedSports.size === allSports.length;
    return markers.filter((m) => {
      const catMatch = m.categories.some((c) => activeCats.has(c));
      if (!catMatch) return false;
      if (allSportsSelected) return true;
      return selectedSports.has(normalizeSport(m.sport));
    });
  }, [markers, activeCats, selectedSports, allSports.length]);

  const toggleCat = (cat: MarkerCategory) => {
    if (counts[cat] === 0) return;
    setActiveCats((prev) => {
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
        <div className="mt-3">
          <div
            className="text-[10px] uppercase tracking-wide font-semibold mb-2"
            style={{ color: 'var(--text-muted)', fontFamily: "'Inter', system-ui, sans-serif" }}
          >
            Sport
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {CATEGORIES.map((cat) => {
              const isActive = activeCats.has(cat);
              const isDisabled = counts[cat] === 0;
              const fill = MARKER_COLORS[cat];
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCat(cat)}
                  disabled={isDisabled}
                  aria-pressed={isActive}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-colors text-xs"
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
            {allSports.length > 1 && (
              <SportMultiSelect
                allSports={allSports}
                selected={selectedSports}
                onChange={setSelectedSports}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function SportMultiSelect({
  allSports,
  selected,
  onChange,
}: {
  allSports: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Close on outside click and on Escape.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const allOn = selected.size === allSports.length;
  const noneOn = selected.size === 0;

  const toggleSport = (sport: string) => {
    const next = new Set(selected);
    if (next.has(sport)) next.delete(sport);
    else next.add(sport);
    onChange(next);
  };

  const selectAll = () => onChange(new Set(allSports));
  const clearAll = () => onChange(new Set());

  const label = allOn
    ? `Sports: All (${allSports.length})`
    : noneOn
      ? 'Sports: None'
      : `Sports: ${selected.size} of ${allSports.length}`;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-colors text-xs"
        style={{
          borderColor: open ? 'var(--accent)' : 'var(--border)',
          background: 'transparent',
          color: allOn ? 'var(--text-muted)' : 'var(--text)',
          cursor: 'pointer',
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        <span>{label}</span>
        <span aria-hidden="true" style={{ fontSize: 9, opacity: 0.7 }}>
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="absolute z-10 mt-1 rounded-md border shadow-lg"
          style={{
            background: 'var(--bg-card)',
            borderColor: 'var(--border)',
            minWidth: 200,
            maxHeight: 280,
            overflowY: 'auto',
            padding: 6,
            fontFamily: "'Inter', system-ui, sans-serif",
          }}
        >
          <div
            className="flex justify-between items-center text-[10px] uppercase tracking-wide pb-2 px-1"
            style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}
          >
            <button
              type="button"
              onClick={selectAll}
              className="hover:underline"
              style={{ color: 'var(--accent)', cursor: 'pointer' }}
            >
              All
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="hover:underline"
              style={{ color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              None
            </button>
          </div>
          <div className="pt-1">
            {allSports.map((sport) => {
              const isOn = selected.has(sport);
              return (
                <label
                  key={sport}
                  className="flex items-center gap-2 px-1.5 py-1 rounded text-xs cursor-pointer"
                  style={{
                    color: isOn ? 'var(--text)' : 'var(--text-muted)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isOn}
                    onChange={() => toggleSport(sport)}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  <span>{sport}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
