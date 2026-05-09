'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Metro, formatPop, regionColors } from '@/lib/shared';

interface RankingsTableProps {
  metros: Metro[];
}

type SearchScope = 'all' | 'country' | 'metro' | 'state' | 'county';

const SEARCH_SCOPE_LABEL: Record<SearchScope, string> = {
  all: 'All',
  country: 'Country',
  metro: 'Metro Area',
  state: 'State / Province',
  county: 'County / Municipality',
};

const CONTINENTS = [
  'All',
  'Europe',
  'North America',
  'Asia',
  'South America',
  'Africa',
  'Oceania',
];

const REGIONS = [
  'All',
  'North America',
  'Europe',
  'East Asia',
  'China',
  'ASEAN',
  'Latin America',
  'MENA',
  'Oceania',
  'South Asia',
  'Africa',
  'Eurasia',
];

export default function RankingsTable({ metros }: RankingsTableProps) {
  const [view, setView] = useState<'top25' | 'top100'>('top25');
  const [selectedContinent, setSelectedContinent] = useState('All');
  const [selectedRegion, setSelectedRegion] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchScope, setSearchScope] = useState<SearchScope>('all');

  // Top score in the full dataset (the #1 metro). Drives the width of every
  // rank bar so updates to MetroAreas.xlsx stay in sync without hardcoding.
  const maxScore = useMemo(
    () => metros.reduce((acc, m) => (m.score > acc ? m.score : acc), 0) || 1,
    [metros],
  );

  const filtered = useMemo(() => {
    let result = metros;

    // Filter by continent
    if (selectedContinent !== 'All') {
      result = result.filter((m) => m.continent === selectedContinent);
    }

    // Filter by region
    if (selectedRegion !== 'All') {
      result = result.filter((m) => m.region === selectedRegion);
    }

    // Filter by search term, scoped to the selected field bucket. The
    // scope dropdown lets readers narrow the search to country / metro /
    // state / county, useful when the same string (e.g. "Lincoln") could
    // match a city, a state, or a county.
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
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
        if (searchScope === 'country') return matchesCountry(m);
        if (searchScope === 'metro') return matchesMetro(m);
        if (searchScope === 'state') return matchesState(m);
        if (searchScope === 'county') return matchesCounty(m);
        return matchesCountry(m) || matchesMetro(m) || matchesState(m) || matchesCounty(m);
      });
    }

    // Limit to view
    return result.slice(0, view === 'top25' ? 25 : 100);
  }, [metros, selectedContinent, selectedRegion, searchTerm, searchScope, view]);

  const title =
    selectedRegion !== 'All'
      ? `${selectedRegion} Rankings`
      : selectedContinent !== 'All'
        ? `${selectedContinent} Rankings`
        : view === 'top25'
          ? 'Top 25 Global Metros'
          : 'Top 100 Global Metros';

  return (
    <div className="space-y-6">
      <div>
        <h2
          className="text-2xl font-bold mb-4"
          style={{ color: 'var(--accent)' }}
        >
          {title}
        </h2>

        {/* Controls */}
        <div className="space-y-4">
          {/* View Toggle */}
          <div className="flex gap-3">
            <button
              onClick={() => setView('top25')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                view === 'top25'
                  ? 'bg-[var(--accent)] text-black'
                  : 'bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)]'
              }`}
            >
              Top 25
            </button>
            <button
              onClick={() => setView('top100')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                view === 'top100'
                  ? 'bg-[var(--accent)] text-black'
                  : 'bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)]'
              }`}
            >
              Top 100
            </button>
          </div>

          {/* Continent Filter Chips */}
          <div>
            <p className="text-xs text-[var(--text-muted)] mb-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Continent</p>
            <div className="flex flex-wrap gap-2">
              {CONTINENTS.map((continent) => (
                <button
                  key={continent}
                  onClick={() => {
                    setSelectedContinent(continent);
                    if (continent !== 'All') setSelectedRegion('All');
                  }}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
                    selectedContinent === continent
                      ? 'bg-[var(--accent)] text-black'
                      : 'bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border)] hover:border-[var(--text-dim)]'
                  }`}
                >
                  {continent}
                </button>
              ))}
            </div>
          </div>

          {/* Region Filter Chips */}
          <div>
            <p className="text-xs text-[var(--text-muted)] mb-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Region</p>
            <div className="flex flex-wrap gap-2">
              {REGIONS.map((region) => (
                <button
                  key={region}
                  onClick={() => {
                    setSelectedRegion(region);
                    if (region !== 'All') setSelectedContinent('All');
                  }}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
                    selectedRegion === region
                      ? 'bg-[var(--accent)] text-black'
                      : 'bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border)] hover:border-[var(--text-dim)]'
                  }`}
                >
                  {region}
                </button>
              ))}
            </div>
          </div>

          {/* Countries callout — sits just above the search bar so readers
              who want a country-first lens find it before they start typing. */}
          <Link
            href="/countries"
            className="block rounded-lg border px-4 py-3 transition-colors hover:border-[var(--accent)] group"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border)',
            }}
          >
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <div>
                <span className="text-sm font-semibold text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">
                  Looking for a country?
                </span>
                <span className="text-sm text-[var(--text-muted)] ml-2">
                  Browse all 245 sovereign states, constituents, territories,
                  and disputed regions on the Countries page.
                </span>
              </div>
              <span
                className="text-xs text-[var(--accent)]"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                Open Countries &rarr;
              </span>
            </div>
          </Link>

          {/* Search row: scope dropdown + text input */}
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={searchScope}
              onChange={(e) => setSearchScope(e.target.value as SearchScope)}
              className="px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-[var(--text)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] sm:w-56"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
              aria-label="Search scope"
            >
              {(Object.keys(SEARCH_SCOPE_LABEL) as SearchScope[]).map((k) => (
                <option key={k} value={k}>{SEARCH_SCOPE_LABEL[k]}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder={
                searchScope === 'country' ? 'Search by country (e.g. Germany, Japan)...'
                  : searchScope === 'metro' ? 'Search by metro area (e.g. Tokyo, Sao Paulo)...'
                  : searchScope === 'state' ? 'Search by state or province (e.g. California, Scotland)...'
                  : searchScope === 'county' ? 'Search by county or municipality (e.g. Cook, Manchester)...'
                  : 'Search metros, cities, countries, states (e.g. California, Scotland)...'
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 px-4 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-[var(--text)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
        </div>
      </div>

      {/* Table — responsive treatment:
          - Population column hides below sm: most expendable cut so rank,
            name, region dot, and score all fit on a phone.
          - Score bar viz hides below sm: only the numeric score remains.
          - Padding tightens to px-2 on mobile, px-4 on sm+ */}
      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full">
          <thead>
            <tr
              className="border-b border-[var(--border)]"
              style={{ backgroundColor: 'var(--bg-card)' }}
            >
              <th
                className="px-2 sm:px-4 py-3 text-left text-sm font-semibold text-[var(--text-muted)]"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                Rank
              </th>
              <th className="px-2 sm:px-4 py-3 text-left text-sm font-semibold text-[var(--text-muted)]">
                Metro Area
              </th>
              <th className="px-2 sm:px-4 py-3 text-left text-sm font-semibold text-[var(--text-muted)]">
                Region
              </th>
              <th
                className="hidden md:table-cell px-4 py-3 text-left text-sm font-semibold text-[var(--text-muted)]"
              >
                State
              </th>
              <th
                className="hidden sm:table-cell px-4 py-3 text-right text-sm font-semibold text-[var(--text-muted)]"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                Population
              </th>
              <th
                className="px-2 sm:px-4 py-3 text-right text-sm font-semibold text-[var(--text-muted)]"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                Score
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((metro) => (
              <tr
  key={metro.slug}
  className="border-b border-[var(--border)] hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer"
  onClick={() => window.location.href = `/rankings/${metro.slug}`}
>
                <td
                  className="px-2 sm:px-4 py-3 text-sm font-semibold"
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    color: 'var(--accent)',
                  }}
                >
                  #{metro.rank}
                </td>
                <td className="px-2 sm:px-4 py-3">
                  <a href={`/rankings/${metro.slug}`} className="block">
                    <div className="font-semibold text-[var(--text)] hover:text-[var(--accent)] transition">
                      {metro.name}
                    </div>
                  </a>
                  <div className="text-xs text-[var(--text-muted)]" onClick={(e) => e.stopPropagation()}>
                    {(metro.sovereignSlug ?? metro.countrySlug) ? (
                      <Link
                        href={`/countries/${metro.sovereignSlug ?? metro.countrySlug}`}
                        className="hover:text-[var(--accent)]"
                      >
                        {metro.country}
                      </Link>
                    ) : (
                      metro.country
                    )}
                  </div>
                </td>
                <td className="px-2 sm:px-4 py-3 text-sm">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor:
                        regionColors[metro.region] || 'var(--text-dim)',
                    }}
                  />
                </td>
                <td className="hidden md:table-cell px-4 py-3 text-sm" onClick={(e) => e.stopPropagation()}>
                  {metro.primaryState ? (
                    metro.stateSlug ? (
                      <Link href={`/states/${metro.stateSlug}`} className="text-[var(--text)] hover:text-[var(--accent)]">
                        {metro.primaryState}
                      </Link>
                    ) : (
                      <span className="text-[var(--text)]">{metro.primaryState}</span>
                    )
                  ) : (
                    <span className="text-[var(--text-dim)]">—</span>
                  )}
                  {(metro.state2 || metro.state3 || (metro.additionalStates && metro.additionalStates.length > 0)) ? (
                    <div className="text-[10px] text-[var(--text-dim)] mt-0.5">
                      {[
                        metro.state2 ? { name: metro.state2, slug: metro.state2Slug } : null,
                        metro.state3 ? { name: metro.state3, slug: metro.state3Slug } : null,
                        ...(metro.additionalStates ?? []),
                      ]
                        .filter((s): s is { name: string; slug?: string } => s !== null)
                        .map((s, idx, arr) => (
                          <span key={`${s.name}-${idx}`}>
                            {s.slug ? (
                              <Link href={`/states/${s.slug}`} className="hover:text-[var(--accent)]">{s.name}</Link>
                            ) : (
                              <span>{s.name}</span>
                            )}
                            {idx < arr.length - 1 ? <span> · </span> : null}
                          </span>
                        ))}
                    </div>
                  ) : null}
                </td>
                <td
                  className="hidden sm:table-cell px-4 py-3 text-right text-sm text-[var(--text)]"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {formatPop(metro.pop)}
                </td>
                <td className="px-2 sm:px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div
                      className="hidden sm:block h-1 bg-[var(--accent)] rounded-full"
                      style={{
                        width: `${(metro.score / maxScore) * 80}px`,
                      }}
                    />
                    <span
                      className="text-sm font-semibold"
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        color: 'var(--accent)',
                        minWidth: '45px',
                        textAlign: 'right',
                      }}
                    >
                      {metro.score.toFixed(1)}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div
          className="text-center py-12 text-[var(--text-muted)]"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          No metros found matching your filters.
        </div>
      )}
    </div>
  );
}
