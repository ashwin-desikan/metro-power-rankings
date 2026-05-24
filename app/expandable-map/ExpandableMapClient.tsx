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

// localStorage keys. Versioned so future schema changes can invalidate
// older payloads cleanly via key bump.
const LS_FILTERS = 'expandable-map.filters.v1';
const LS_SIZE = 'expandable-map.size.v1';
const LS_VIEWPORT = 'expandable-map.viewport.v1';

const MIN_HEIGHT = 320;
const DEFAULT_HEIGHT = 640;
const MAX_HEIGHT = 2400; // generous ceiling; fullscreen uses viewport height instead

type FilterState = {
  selectedContinent: string;
  selectedRegion: string;
  selectedCountry: string;
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
  const [filters, setFilters] = useState<FilterState>({
    selectedContinent: 'All',
    selectedRegion: 'All',
    selectedCountry: 'All',
    searchTerm: '',
    searchScope: 'all',
  });

  // Size: a numeric height plus a fullscreen toggle. When fullscreen, we
  // render the map at calc(100vh - <header offset>) instead of `height` px.
  const [size, setSize] = useState<SizeState>({
    height: DEFAULT_HEIGHT,
    fullscreen: false,
  });

  // Viewport. `null` until the user has actually panned/zoomed; until then
  // the map runs default fitBounds behavior.
  const [viewport, setViewport] = useState<ViewportState | null>(null);

  // On mount, hydrate from localStorage. Doing this in an effect rather than
  // useState initializer avoids SSR hydration mismatches.
  const hydratedRef = useRef(false);
  useEffect(() => {
    setFilters(readLS<FilterState>(LS_FILTERS, filters));
    setSize(readLS<SizeState>(LS_SIZE, size));
    const vp = typeof window !== 'undefined' ? window.localStorage.getItem(LS_VIEWPORT) : null;
    if (vp) {
      try {
        const parsed = JSON.parse(vp) as ViewportState;
        if (
          Array.isArray(parsed.center) &&
          parsed.center.length === 2 &&
          typeof parsed.zoom === 'number'
        ) {
          setViewport(parsed);
        }
      } catch {
        // ignore
      }
    }
    hydratedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist filter changes
  useEffect(() => {
    if (!hydratedRef.current) return;
    writeLS(LS_FILTERS, filters);
  }, [filters]);

  // Persist size changes
  useEffect(() => {
    if (!hydratedRef.current) return;
    writeLS(LS_SIZE, size);
  }, [size]);

  // Viewport persist with light throttling (only write at most every 250ms
  // on the trailing edge so a vigorous drag does not pummel localStorage).
  const viewportWriteTimer = useRef<number | null>(null);
  const handleViewportChange = useCallback((center: [number, number], zoom: number) => {
    setViewport({ center, zoom });
    if (!hydratedRef.current) return;
    if (viewportWriteTimer.current !== null) {
      window.clearTimeout(viewportWriteTimer.current);
    }
    viewportWriteTimer.current = window.setTimeout(() => {
      writeLS(LS_VIEWPORT, { center, zoom });
    }, 250);
  }, []);

  // Clear viewport (force refit on next render) — used by the "Reset view"
  // button. Clears both state and localStorage so a reload won't restore it.
  const resetViewport = useCallback(() => {
    setViewport(null);
    if (typeof window !== 'undefined') {
      try { window.localStorage.removeItem(LS_VIEWPORT); } catch {}
    }
  }, []);

  // Filter computation
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
    return result;
  }, [metros, filters]);

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
          // Tier color so the map reads as a heatmap of significance: purple
          // Global Capital -> blue Continental -> teal Major -> green Regional
          // -> yellow Established -> orange Emerging -> grey Local. Matches
          // the tier badges everywhere else on the site.
          color: computeTier(m.score).accentHex,
        })),
    [filtered],
  );

  // Country list, scoped by the active continent/region selection so the
  // dropdown stays relevant. Empty selection (continent=All, region=All)
  // shows every country in the corpus.
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

  // Polygon-load gating. The full corpus is roughly 4,000 metros / 50 MB of
  // boundary geojsons. Loading all on every page open would crush slow
  // connections and render perf even with canvas mode. We gate at a soft
  // threshold: at or below POLYGON_AUTO_LIMIT we fetch automatically; above
  // it the user has to opt in via the "Load polygons" toggle. Markers always
  // render either way so the map is useful even before polygons load.
  const POLYGON_AUTO_LIMIT = 500;
  const [polygonOverride, setPolygonOverride] = useState(false);
  const shouldLoadPolygons = mapPoints.length <= POLYGON_AUTO_LIMIT || polygonOverride;
  const boundarySlugs = useMemo(
    () => (shouldLoadPolygons ? mapPoints.map((p) => p.slug) : []),
    [shouldLoadPolygons, mapPoints],
  );
  const mapBoundary = useMetroBoundaries(boundarySlugs);

  // Reset the explicit override when the user narrows the filter set back
  // under the auto-limit, so re-broadening does not silently re-trigger a
  // 4,000-polygon fetch.
  useEffect(() => {
    if (polygonOverride && mapPoints.length <= POLYGON_AUTO_LIMIT) {
      setPolygonOverride(false);
    }
  }, [mapPoints.length, polygonOverride]);

  // Resize handle: drag the bottom edge to set height. Listener attaches on
  // pointerdown and detaches on pointerup. Height clamped to [MIN, MAX].
  const dragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(DEFAULT_HEIGHT);
  const onResizeDown = (e: React.PointerEvent) => {
    if (size.fullscreen) return; // resize disabled in fullscreen
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

  // '/' keystroke focuses search input
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

  // Effective render height: viewport-based when fullscreen, fixed otherwise.
  // "calc(100vh - 96px)" leaves room for the site header (h-16 = 64px) plus
  // a little breathing room. The filter bar is rendered above the map in
  // non-fullscreen mode; in fullscreen the filter bar floats as an overlay
  // anchored to the top-left of the map container.
  const mapHeight = size.fullscreen ? '100vh' : `${size.height}px`;

  // Reset filters
  const resetFilters = () => {
    setFilters({
      selectedContinent: 'All',
      selectedRegion: 'All',
      selectedCountry: 'All',
      searchTerm: '',
      searchScope: 'all',
    });
  };

  const activeFilterCount =
    (filters.selectedContinent !== 'All' ? 1 : 0) +
    (filters.selectedRegion !== 'All' ? 1 : 0) +
    (filters.selectedCountry !== 'All' ? 1 : 0) +
    (filters.searchTerm ? 1 : 0);

  const filterBar = (
    <div className="space-y-4">
      {/* Continent */}
      <div>
        <p className="text-xs text-[var(--text-muted)] mb-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Continent</p>
        <div className="flex flex-wrap gap-2">
          {CONTINENTS.map((c) => (
            <button
              key={c}
              onClick={() => setFilters((f) => ({
                ...f,
                selectedContinent: c,
                selectedRegion: c !== 'All' ? 'All' : f.selectedRegion,
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

      {/* Region */}
      <div>
        <p className="text-xs text-[var(--text-muted)] mb-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Region</p>
        <div className="flex flex-wrap gap-2">
          {REGIONS.map((r) => (
            <button
              key={r}
              onClick={() => setFilters((f) => ({
                ...f,
                selectedRegion: r,
                selectedContinent: r !== 'All' ? 'All' : f.selectedContinent,
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

      {/* Country picker. Scoped by continent/region selections above.
          Faster than typing the country name in search, and pairs with the
          continent/region chips naturally. Selecting a country clears the
          continent/region above to avoid conflicting filters. */}
      <div>
        <p className="text-xs text-[var(--text-muted)] mb-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          Country {filters.selectedContinent !== 'All' || filters.selectedRegion !== 'All'
            ? <span className="text-[var(--text-dim)]">(scoped to {filters.selectedRegion !== 'All' ? filters.selectedRegion : filters.selectedContinent})</span>
            : null}
        </p>
        <select
          value={filters.selectedCountry}
          onChange={(e) => setFilters((f) => ({
            ...f,
            selectedCountry: e.target.value,
            // Selecting a country clears continent/region so the row count
            // narrows monotonically rather than producing empty intersections.
            selectedContinent: e.target.value !== 'All' ? 'All' : f.selectedContinent,
            selectedRegion: e.target.value !== 'All' ? 'All' : f.selectedRegion,
          }))}
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

      {/* Tier legend. Mirrors the marker color per tier so the map reads as
          a heatmap of significance. Not interactive - the same continent /
          region / country filters drive what is visible. */}
      <div>
        <p className="text-xs text-[var(--text-muted)] mb-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Tier color</p>
        <div className="flex flex-wrap gap-3 text-xs">
          {TIERS.map((t) => (
            <span key={t.slug} className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: t.accentHex, border: '1px solid rgba(255,255,255,0.15)' }} />
              <span className="text-[var(--text-muted)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{t.name}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Search row */}
      <div className="flex flex-col sm:flex-row gap-2">
        <select
          value={filters.searchScope}
          onChange={(e) => setFilters((f) => ({ ...f, searchScope: e.target.value as SearchScope }))}
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
          onChange={(e) => setFilters((f) => ({ ...f, searchTerm: e.target.value }))}
          className="flex-1 px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-[var(--text)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
        />
      </div>
    </div>
  );

  return (
    <div className={size.fullscreen ? 'fixed inset-0 z-50 bg-[var(--bg)]' : 'space-y-4'}>
      {/* Header / control bar */}
      {!size.fullscreen ? (
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>Expandable Map</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {filtered.length.toLocaleString()} metro{filtered.length === 1 ? '' : 's'} match the current filters.
              Drag the bottom edge to resize. Filters and viewport persist. Polygons auto-load when the filtered set is at or below {POLYGON_AUTO_LIMIT}; markers always show.
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

      {/* Filter bar (always above the map in non-fullscreen; floating panel in fullscreen) */}
      {!size.fullscreen ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
          {filterBar}
        </div>
      ) : null}

      {/* Map container */}
      <div className="relative" style={{ height: mapHeight }}>
        <MetroMap
          points={mapPoints}
          showConnections={false}
          height={size.fullscreen ? 0 : size.height}
          refitOnChange={!viewport}
          clickToNavigate
          boundary={mapBoundary ?? undefined}
          initialCenter={viewport?.center}
          initialZoom={viewport?.zoom}
          onViewportChange={handleViewportChange}
          preferCanvas
        />
        {/* Polygon-load banner. Sits above the map in the top-center, only
            when the filtered set is too large to auto-load polygons. Clicking
            opts in for this filter state; markers are unaffected either way. */}
        {!shouldLoadPolygons ? (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] px-4 py-2 rounded-md text-xs font-medium border bg-[var(--bg-card)] border-[var(--border)] shadow-lg flex items-center gap-3"
               style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            <span className="text-[var(--text-muted)]">
              Showing markers only ({mapPoints.length.toLocaleString()} metros). Polygons auto-load at &le; {POLYGON_AUTO_LIMIT}.
            </span>
            <button
              onClick={() => setPolygonOverride(true)}
              className="text-[var(--accent)] hover:underline"
            >Load polygons</button>
          </div>
        ) : null}
        {/* Fullscreen overlays: floating filter panel + exit button */}
        {size.fullscreen ? (
          <>
            <button
              onClick={() => setSize((s) => ({ ...s, fullscreen: false }))}
              className="absolute top-3 right-3 z-[1000] px-3 py-1.5 rounded-md text-xs font-medium border bg-[var(--bg-card)] border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors shadow-lg"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >Exit fullscreen</button>
            <details className="absolute top-3 left-3 z-[1000] w-[min(360px,calc(100vw-2rem))] rounded-lg border bg-[var(--bg-card)] border-[var(--border)] shadow-lg">
              <summary className="cursor-pointer select-none px-4 py-2 text-sm font-semibold flex items-center justify-between">
                <span>Filters</span>
                <span className="text-xs text-[var(--text-muted)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {filtered.length.toLocaleString()} matched
                </span>
              </summary>
              <div className="px-4 pb-4 pt-2">{filterBar}</div>
            </details>
          </>
        ) : null}

        {/* Resize handle (only in non-fullscreen) */}
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
            Map height: {size.height}px · Click a metro to open its detail page · Filters and viewport persist across sessions
          </span>
          <Link href="/" className="hover:text-[var(--accent)] transition-colors">
            ← Back to rankings
          </Link>
        </div>
      ) : null}
    </div>
  );
}
