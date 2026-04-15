'use client';

import { useState, useMemo } from 'react';
import { Metro, formatPop, regionColors } from '@/lib/shared';

interface RankingsTableProps {
  metros: Metro[];
}

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

const MAX_SCORE = 175.7; // New York's score

export default function RankingsTable({ metros }: RankingsTableProps) {
  const [view, setView] = useState<'top25' | 'top100'>('top25');
  const [selectedContinent, setSelectedContinent] = useState('All');
  const [selectedRegion, setSelectedRegion] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');

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

    // Filter by search term (includes sub-country, states)
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (m) =>
          m.name.toLowerCase().includes(term) ||
          m.country.toLowerCase().includes(term) ||
          m.primaryCity.toLowerCase().includes(term) ||
          (m.subCountry && m.subCountry.toLowerCase().includes(term)) ||
          (m.primaryState && m.primaryState.toLowerCase().includes(term)) ||
          (m.state2 && m.state2.toLowerCase().includes(term)) ||
          (m.state3 && m.state3.toLowerCase().includes(term))
      );
    }

    // Limit to view
    return result.slice(0, view === 'top25' ? 25 : 100);
  }, [metros, selectedContinent, selectedRegion, searchTerm, view]);

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

          {/* Search */}
          <input
            type="text"
            placeholder="Search metros, cities, countries, states (e.g. California, Scotland)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-[var(--text)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full">
          <thead>
            <tr
              className="border-b border-[var(--border)]"
              style={{ backgroundColor: 'var(--bg-card)' }}
            >
              <th
                className="px-4 py-3 text-left text-sm font-semibold text-[var(--text-muted)]"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                Rank
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--text-muted)]">
                Metro Area
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-[var(--text-muted)]">
                Region
              </th>
              <th
                className="px-4 py-3 text-right text-sm font-semibold text-[var(--text-muted)]"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                Population
              </th>
              <th
                className="px-4 py-3 text-right text-sm font-semibold text-[var(--text-muted)]"
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
                  className="px-4 py-3 text-sm font-semibold"
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    color: 'var(--accent)',
                  }}
                >
                  #{metro.rank}
                </td>
                <td className="px-4 py-3">
  <a href={`/rankings/${metro.slug}`} className="block">
    <div className="font-semibold text-[var(--text)] hover:text-[var(--accent)] transition">
      {metro.name}
    </div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {metro.country}
                    </div>
                  </a>
                </td>
                <td className="px-4 py-3 text-sm">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor:
                        regionColors[metro.region] || 'var(--text-dim)',
                    }}
                  />
                </td>
                <td
                  className="px-4 py-3 text-right text-sm text-[var(--text)]"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {formatPop(metro.pop)}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div
                      className="h-1 bg-[var(--accent)] rounded-full"
                      style={{
                        width: `${(metro.score / MAX_SCORE) * 80}px`,
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
