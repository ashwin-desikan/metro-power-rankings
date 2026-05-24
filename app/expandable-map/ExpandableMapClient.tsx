'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Metro } from '@/lib/shared';
import MetroMap, { type MapPoint } from './../MetroMap';
import { useMetroBoundaries } from '@/lib/useMetroBoundaries';
import { computeTier, TIERS } from '@/lib/tiers';

type SearchScope = 'all' | 'country' | 'metro' | 'state' | 'county';

const SEARCH_SCOPE_LABEL: Record<SearchScope, string> = {
  all: 'All',
  country: 'Country',
  metro: 'Metro Area',
  state: 'State / Province',
  county: 'County / Municipality',
};

const CONTINENTS = ['All', 'Europe', 'North America', 'Asia', 'South America', 'Africa', 'Oceania'];

const REGIONS = [
  'All', 'North America', 'Europe', 'East Asia', 'China', 'ASEAN',
  'Latin America', 'MENA', 'Oceania', 'South Asia', 'Africa', 'Eurasia',
];

type ViewLimit = 'all' | 'top25' | 'top50' | 'top100';
const VIEW_LIMITS: { id: ViewLimit; label: string; cap: number | null }[] = [
  { id: 'all', label: 'All', cap: null },
  { id: 'top25', label: 'Top 25', cap: 25 },
  { id: 'top50', label: 'Top 50', cap: 50 },
  { id: 'top100', label: 'Top 100', cap: 100 },
];

const ALL_TIER_SLUGS = TIERS.map((t) => t.slug);

// localStorage keys. Versioned so future schema changes can invalidate
// older payloads cleanly via key bump. v2 bumped over v1 because we added
// selectedTiers and view to the persisted filter shape.
const LS_FILTERS = 'expandable-map.filters.v2';
const LS_SIZE = 'expandable-map.size.v1';
const LS_VIEWPORT = 'expandable-map.viewport.v1';

const MIN_HEIGHT = 320;
const DEFAULT_HEIGHT = 640;
const MAX_HEIGHT = 2400;

type FilterState = {
  selectedContinent: string;
  selectedRegion: string;
  selectedCountry: string;
  selectedTiers: string[]; // tier slugs that are visible
  view: ViewLimit;
  searchTerm: string;
  searchScope: SearchScope;
};

type SizeState = {
  height: number;
  fullscreen: boolean;
};

type ViewportState = {
  center: [number, number];
  zoom: number;
};

const DEFAULT_FILTERS: FilterState = {
  selectedContinent: 'All',
  selectedRegion: 'All',
  selectedCountry: 'All',
  selectedTiers: ALL_TIER_SLUGS,
  view: 'all',
  searchTerm: '',
  searchScope: 'all',
};

function readLS<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) } as T;
  } catch {
    return fallback;
  }
}

function writeLS<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage disabled — swallow silently.
  }
}

export default function ExpandableMapClient({ metros }: { metros: Metro[] }) {
  // Filters
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  // Size
  const [size, setSize] = useState<SizeState>({
    height: DEFAULT_HEIGHT,
    fullscreen: false,
  });

  // Viewport. null = use bounds-fit. Non-null = use these center/zoom (on
  // first mount only, until the next filter change clears it back to null).
  const [viewport, setViewport] = useState<ViewportState | null>(null);

  // Hydrate from localStorage on mount
  const hydratedRef = useRef(false);
  useEffect(() => {
    setFilters(readLS<FilterState>(LS_FILTERS, DEFAULT_FILTERS));
    setSize(readLS<SizeState>(LS_SIZE, { height: DEFAULT_HEIGHT, fullscreen: false }));
    const vp = typeof window !== 'undefined' ? window.localStorage.getItem(LS_VIEWPORT) : null;
    if (vp) {
      try {
        const parsed = JSON.parse(vp) as ViewportState;
        if (Array.isArray(parsed.center) && parsed.center.length === 2 && typeof parsed.zoom === 'number') {
          setViewport(parsed);
        }
      } catch {}
    }
    hydratedRef.current = true;
  }, []);

  useEffect(() => { if (hydratedRef.current) writeLS(LS_FILTERS, filters); }, [filters]);
  useEffect(() => { if (hydratedRef.current) writeLS(LS_SIZE, size); }, [size]);

  // Filter-aware setFilters helper. Every filter mutation should go through
  // this so the saved viewport is cleared and the map re-fits to the new
  // points. The user's pan/zoom is preserved until the next filter change.
  const updateFilters = useCallback((mut: (f: FilterState) => FilterState) => {
    setFilters((f) => mut(f));
    setViewport(null);
    if (typeof window !== 'undefined') {
      try { window.localStorage.removeItem(LS_VIEWPORT); } catch {}
    }
  }, []);

  // Viewport persistence (debounced trailing 250ms). Set only by user pan/zoom
  // events that fire after the initial render. We don't try to distinguish
  // programmatic refits from user moves; the updateFilters helper above
  // resets viewport at the moment of user filter intent, which is the
  // moment that matters.
  const viewportWriteTimer = useRef<number | null>(null);
  const handleViewportChange = useCallback((center: [number, number], zoom: number) => {
    setViewport({ center, zoom });
    if (!hydratedRef.current) return;
    if (viewportWriteTimer.current !== null) window.clearTimeout(viewportWriteTimer.current);
    viewportWriteTimer.current = window.setTimeout(() => {
      writeLS(LS_VIEWPORT, { center, zoom });
    }, 250);
  }, []);

  // Reset viewport explicitly
  const resetViewport = useCallback(() => {
    setViewport(null);
    if (typeof window !== 'undefined') {
      try { window.localStorage.removeItem(LS_VIEWPORT); } catch {}
    }
  }, []);

  // Filter computation. Order: continent / region / country / tier / search /
  // view-cap. Each filter is independent so the user can stack them. View
  // cap applies AFTER all other filters so "Top 25 of Europe" works.
  const filtered = useMemo(() => {
    let result = metros;
    if (filters.selectedContinent !== 'All') {
      result = result.filter((m) => m.continent === filters.selectedContinent);
    }
    if (filters.selectedRegion !== 'All') {
      result = result.filter((m) => m.region === filters.selectedRegion);
    }
    if (filters.selectedCountry !== 'All') {
      result = result.filter((m) => m.country === filters.selectedCountry);
    }
    if (filters.selectedTiers.length < TIERS.length) {
      const visible = new Set(filters.selectedTiers);
      result = result.filter((m) => visible.has(computeTier(m.score).slug));
    }
    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      const matchesCountry = (m: Metro) => m.country.toLowerCase().includes(term);
      const matchesMetro = (m: Metro) => m.name.toLowerCase().includes(term);
      const matchesState = (m: Metro) =>
        (m.subCountry && m.subCountry.toLowerCase().includes(term)) ||
        (m.primaryState && m.primaryState.toLowerCase().includes(term)) ||
        (m.state2 && m.state2.toLowerCase().includes(term)) ||
        (m.state3 && m.state3.toLowerCase().includes(term)) ||
        false;
      const matchesCounty = (m: Metro) => m.primaryCity.toLowerCase().includes(term);
      result = result.filter((m) => {
        if (filters.searchScope === 'country') return matchesCountry(m);
        if (filters.searchScope === 'metro') return matchesMetro(m);
        if (filters.searchScope === 'state') return matchesState(m);
        if (filters.searchScope === 'county') return matchesCounty(m);
        return matchesCountry(m) || matchesMetro(m) || matchesState(m) || matchesCounty(m);
      });
    }
    // View cap (Top 25 / 50 / 100). Score-descending order already comes from
    // metros.json. Apply slice last so search/filter narrow first.
    const limit = VIEW_LIMITS.find((v) => v.id === filters.view)?.cap;
    if (limit !== undefined && limit !== null) {
      result = result.slice(0, limit);
    }
    return result;
  }, [metros, filters]);

  // Per-metro tier lookup used both for marker color and for enriching
  // polygon features with tierSlug so MetroMapInner can color them.
  const slugTier = useMemo(() => {
    const m = new Map<string, { slug: string; name: string; accentHex: string; rank: number }>();
    metros.forEach((metro, i) => {
      const t = computeTier(metro.score);
      m.set(metro.slug, { slug: t.slug, name: t.name, accentHex: t.accentHex, rank: i + 1 });
    });
    return m;
  }, [metros]);

  const mapPoints = useMemo<MapPoint[]>(
    () =>
      filtered
        .filter((m): m is Metro & { lat: number; lon: number } =>
          typeof m.lat === 'number' &&
          typeof m.lon === 'number' &&
          (m.lat !== 0 || m.lon !== 0),
        )
        .map((m) => ({
          slug: m.slug,
          name: m.name,
          lat: m.lat,
          lon: m.lon,
          city: m.primaryCity,
          state: m.primaryState,
          country: m.country,
          color: slugTier.get(m.slug)?.accentHex,
        })),
    [filtered, slugTier],
  );

  // Country dropdown options - scoped by active continent/region
  const countryOptions = useMemo(() => {
    let pool = metros;
    if (filters.selectedContinent !== 'All') {
      pool = pool.filter((m) => m.continent === filters.selectedContinent);
    }
    if (filters.selectedRegion !== 'All') {
      pool = pool.filter((m) => m.region === filters.selectedRegion);
    }
    return Array.from(new Set(pool.map((m) => m.country))).filter(Boolean).sort();
  }, [metros, filters.selectedContinent, filters.selectedRegion]);

  // Polygons load for ALL filtered metros - no auto-load cap. Canvas mode
  // on MetroMap keeps render perf acceptable past 1,000 features. At the
  // unfiltered global level (~4,000 metros) initial fetch is heavy but
  // subsequent navigation is cached by the boundary loader.
  const boundarySlugs = useMemo(() => mapPoints.map((p) => p.slug), [mapPoints]);
  const rawBoundary = useMetroBoundaries(boundarySlugs);

  // Enrich boundary features with tier props so MetroMapInner tier-styles
  // each polygon. Each feature's slug is read from properties.slug (set by
  // the boundary builder) and mapped to the tier color via slugTier above.
  const tieredBoundary = useMemo(() => {
    if (!rawBoundary) return undefined;
    return {
      ...rawBoundary,
      features: rawBoundary.features.map((f) => {
        const slug = (f.properties?.slug as string | undefined) ?? '';
        const t = slugTier.get(slug);
        return {
          ...f,
          properties: {
            ...f.properties,
            tierSlug: t?.slug,
            tier: t?.name,
            rank: t?.rank,
          },
        };
      }),
    };
  }, [rawBoundary, slugTier]);

  // Resize handle
  const dragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(DEFAULT_HEIGHT);
  const onResizeDown = (e: React.PointerEvent) => {
    if (size.fullscreen) return;
    dragging.current = true;
    dragStartY.current = e.clientY;
    dragStartHeight.current = size.height;
    e.preventDefault();
  };
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      const delta = e.clientY - dragStartY.current;
      const next = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, dragStartHeight.current + delta));
      setSize((s) => ({ ...s, height: next }));
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  // Escape exits fullscreen
  useEffect(() => {
    if (!size.fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSize((s) => ({ ...s, fullscreen: false }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [size.fullscreen]);

  // '/' focuses search
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== '/') return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      ev.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Reset filters
  const resetFilters = () => updateFilters(() => DEFAULT_FILTERS);

  const activeFilterCount =
    (filters.selectedContinent !== 'All' ? 1 : 0) +
    (filters.selectedRegion !== 'All' ? 1 : 0) +
    (filters.selectedCountry !== 'All' ? 1 : 0) +
    (filters.selectedTiers.length < TIERS.length ? 1 : 0) +
    (filters.view !== 'all' ? 1 : 0) +
    (filters.searchTerm ? 1 : 0);

  const toggleTier = (slug: string) => {
    updateFilters((f) => {
      const set = new Set(f.selectedTiers);
      if (set.has(slug)) set.delete(slug); else set.add(slug);
      // If the user is about to deselect the last visible tier, restore all
      // (avoids the "empty map" trap).
      if (set.size === 0) return { ...f, selectedTiers: ALL_TIER_SLUGS };
      return { ...f, selectedTiers: Array.from(set) };
    });
  };
  const tierAllOn = filters.selectedTiers.length === TIERS.length;

  const filterBar = (
    <div className="space-y-4">
      {/* View cap (Top N) */}
      <div>
        <p className="text-xs text-[var(--text-muted)] mb-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>View</p>
        <div className="flex flex-wrap gap-2">
          {VIEW_LIMITS.map((v) => (
            <button
              key={v.id}
              onClick={() => updateFilters((f) => ({ ...f, view: v.id }))}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
                filters.view === v.id
                  ? 'bg-[var(--accent)] text-black'
                  : 'bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border)] hover:border-[var(--text-dim)]'
              }`}
            >{v.label}</button>
          ))}
        </div>
      </div>

      {/* Continent */}
      <div>
        <p className="text-xs text-[var(--text-muted)] mb-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Continent</p>
        <div className="flex flex-wrap gap-2">
          {CONTINENTS.map((c) => (
            <button
              key={c}
              onClick={() => updateFilters((f) => ({
                ...f,
                selectedContinent: c,
                // Continent and region are mutually exclusive
                selectedRegion: c !== 'All' ? 'All' : f.selectedRegion,
                // Picking a continent clears any country selection that may
                // have been narrowed under a different continent
                selectedCountry: c !== 'All' ? 'All' : f.selectedCountry,
              }))}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
                filters.selectedContinent === c
                  ? 'bg-[var(--accent)] text-black'
                  : 'bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border)] hover:border-[var(--text-dim)]'
              }`}
            >{c}</button>
          ))}
        </div>
      </div>

      {/* Region — selecting clears Continent because some regions span
          continents (Eurasia, MENA). */}
      <div>
        <p className="text-xs text-[var(--text-muted)] mb-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Region</p>
        <div className="flex flex-wrap gap-2">
          {REGIONS.map((r) => (
            <button
              key={r}
              onClick={() => updateFilters((f) => ({
                ...f,
                selectedRegion: r,
                selectedContinent: r !== 'All' ? 'All' : f.selectedContinent,
                selectedCountry: r !== 'All' ? 'All' : f.selectedCountry,
              }))}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
                filters.selectedRegion === r
                  ? 'bg-[var(--accent)] text-black'
                  : 'bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border)] hover:border-[var(--text-dim)]'
              }`}
            >{r}</button>
          ))}
        </div>
      </div>

      {/* Country picker */}
      <div>
        <p className="text-xs text-[var(--text-muted)] mb-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          Country {filters.selectedContinent !== 'All' || filters.selectedRegion !== 'All'
            ? <span className="text-[var(--text-dim)]">(scoped to {filters.selectedRegion !== 'All' ? filters.selectedRegion : filters.selectedContinent})</span>
            : null}
        </p>
        <select
          value={filters.selectedCountry}
          onChange={(e) => {
            const next = e.target.value;
            // Selecting "All" returns to global view: clear continent/region
            // too so the map snaps back to fit the entire corpus.
            if (next === 'All') {
              updateFilters((f) => ({ ...f, selectedCountry: 'All', selectedContinent: 'All', selectedRegion: 'All' }));
            } else {
              updateFilters((f) => ({
                ...f,
                selectedCountry: next,
                selectedContinent: 'All',
                selectedRegion: 'All',
              }));
            }
          }}
          className="w-full sm:max-w-md px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-[var(--text)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
          aria-label="Filter by country"
        >
          <option value="All">All countries ({countryOptions.length.toLocaleString()})</option>
          {countryOptions.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Tier legend (filterable) */}
      <div>
        <div className="flex items-center justify-between mb-2 gap-2">
          <p className="text-xs text-[var(--text-muted)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Tier</p>
          {!tierAllOn ? (
            <button
              onClick={() => updateFilters((f) => ({ ...f, selectedTiers: ALL_TIER_SLUGS }))}
              className="text-xs text-[var(--accent)] hover:underline"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >Show all tiers</button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {TIERS.map((t) => {
            const on = filters.selectedTiers.includes(t.slug);
            return (
              <button
                key={t.slug}
                onClick={() => toggleTier(t.slug)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                  on
                    ? 'border-[var(--text-dim)] text-[var(--text)]'
                    : 'border-[var(--border)] text-[var(--text-dim)] opacity-50 hover:opacity-90'
                }`}
                style={{ fontFamily: "'JetBrains Mono', monospace", backgroundColor: on ? 'var(--bg-card)' : 'transparent' }}
                aria-pressed={on}
              >
                <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: t.accentHex, border: '1px solid rgba(255,255,255,0.15)' }} />
                {t.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search row */}
      <div className="flex flex-col sm:flex-row gap-2">
        <select
          value={filters.searchScope}
          onChange={(e) => updateFilters((f) => ({ ...f, searchScope: e.target.value as SearchScope }))}
          className="px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-[var(--text)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] sm:w-56"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
          aria-label="Search scope"
        >
          {(Object.keys(SEARCH_SCOPE_LABEL) as SearchScope[]).map((scope) => (
            <option key={scope} value={scope}>{SEARCH_SCOPE_LABEL[scope]}</option>
          ))}
        </select>
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Search metros…  (press / to focus)"
          value={filters.searchTerm}
          onChange={(e) => updateFilters((f) => ({ ...f, searchTerm: e.target.value }))}
          className="flex-1 px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-[var(--text)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
        />
      </div>
    </div>
  );

  return (
    <div className={size.fullscreen ? 'fixed inset-0 z-[100] bg-[var(--bg)] flex flex-col' : 'space-y-4'}>
      {/* Header / control bar */}
      {!size.fullscreen ? (
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>Expandable Map</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {filtered.length.toLocaleString()} metro{filtered.length === 1 ? '' : 's'} match the current filters.
              Drag the bottom edge to resize. Filters, viewport, and tier visibility persist across sessions.
            </p>
          </div>
          <div className="flex gap-2">
            {activeFilterCount > 0 ? (
              <button
                onClick={resetFilters}
                className="px-3 py-1.5 rounded-md text-xs font-medium border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >Reset filters</button>
            ) : null}
            {viewport ? (
              <button
                onClick={resetViewport}
                className="px-3 py-1.5 rounded-md text-xs font-medium border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >Reset view</button>
            ) : null}
            <button
              onClick={() => setSize((s) => ({ ...s, fullscreen: true }))}
              className="px-3 py-1.5 rounded-md text-xs font-medium border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >Fullscreen</button>
          </div>
        </div>
      ) : null}

      {/* Filter bar (non-fullscreen) */}
      {!size.fullscreen ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          {filterBar}
        </div>
      ) : null}

      {/* Map container. In fullscreen mode it must flex-grow to fill the
          remaining height of the fixed-position parent; otherwise it uses
          the resizable pixel height. */}
      <div
        className={size.fullscreen ? 'relative flex-1 min-h-0' : 'relative'}
        style={size.fullscreen ? undefined : { height: `${size.height}px` }}
      >
        <MetroMap
          points={mapPoints}
          showConnections={false}
          height={size.fullscreen ? '100%' : size.height}
          refitOnChange
          clickToNavigate
          interactiveFeatures
          boundary={tieredBoundary ?? undefined}
          initialCenter={viewport?.center}
          initialZoom={viewport?.zoom}
          onViewportChange={handleViewportChange}
          preferCanvas
        />

        {/* Fullscreen overlays */}
        {size.fullscreen ? (
          <>
            <button
              onClick={() => setSize((s) => ({ ...s, fullscreen: false }))}
              className="absolute top-3 right-3 z-[1000] px-3 py-1.5 rounded-md text-xs font-medium border bg-[var(--bg-card)] border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors shadow-lg"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
              title="Esc"
            >Exit fullscreen</button>
            <details className="absolute top-3 left-3 z-[1000] w-[min(420px,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] overflow-auto rounded-lg border bg-[var(--bg-card)] border-[var(--border)] shadow-lg" open>
              <summary className="cursor-pointer select-none px-4 py-2 text-sm font-semibold flex items-center justify-between sticky top-0 bg-[var(--bg-card)]">
                <span>Filters</span>
                <span className="text-xs text-[var(--text-muted)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {filtered.length.toLocaleString()} matched
                </span>
              </summary>
              <div className="px-4 pb-4 pt-2">{filterBar}</div>
            </details>
          </>
        ) : null}

        {/* Resize handle */}
        {!size.fullscreen ? (
          <div
            onPointerDown={onResizeDown}
            className="absolute left-0 right-0 -bottom-1 h-2 cursor-row-resize flex items-center justify-center group"
            aria-label="Drag to resize map"
            title="Drag to resize"
          >
            <div className="h-0.5 w-12 rounded-full bg-[var(--border)] group-hover:bg-[var(--accent)] transition-colors" />
          </div>
        ) : null}
      </div>

      {/* Footnote (non-fullscreen) */}
      {!size.fullscreen ? (
        <div className="text-xs text-[var(--text-muted)] flex items-center justify-between flex-wrap gap-2 pt-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          <span>
            Map height: {size.height}px · Click a marker or polygon to open a metro · Filter changes auto-fit; pan/zoom is saved across sessions
          </span>
          <Link href="/" className="hover:text-[var(--accent)] transition-colors">
            ← Back to rankings
          </Link>
        </div>
      ) : null}
    </div>
  );
}
