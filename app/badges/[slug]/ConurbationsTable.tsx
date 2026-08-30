'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { formatPop, fmtKm } from '@/lib/shared';
import { tierAnchor, computeTier } from '@/lib/tiers';
import MetroMap from '@/app/MetroMap';
import { CappedList } from "@/app/_shared/Disclosure";

// Per-member metadata enriched server-side from metros.json. Drives state /
// province / city searches that the QualifyingMetro shape alone can't answer.
export type EnrichedMember = {
  slug: string;
  name: string;
  country: string;
  subCountry?: string;
  primaryState?: string;
  state2?: string;
  state3?: string;
  primaryCity?: string;
  lat: number;
  lon: number;
};

export type EnrichedConurbationRow = {
  slug: string;
  name: string;
  country: string;
  // ETL-resolved slugs so the country name in the row can link to the
  // /countries/[slug] page. countrySlug prefers UK constituent (e.g.
  // England); sovereignSlug holds the parent (united-kingdom).
  countrySlug?: string;
  sovereignSlug?: string;
  rank: number;
  score: number;
  contextValue: number;
  contextLabel: string;
  tier?: string;
  cluster?: {
    id: string;
    size: number;
    diameterKm: number;
    populationSum: number;
    otherSlugs: string[];
    otherNames: string[];
    memberSlugs: string[];
    memberNames: string[];
    componentMetro?: { slug: string; name: string; rank: number };
  };
  members: EnrichedMember[];
};

export type TierDef = {
  slug: string;
  name: string;
  description: string;
  accentHex: string;
};

type SearchScope = 'all' | 'cluster' | 'country' | 'state' | 'metro';

const SEARCH_SCOPE_LABEL: Record<SearchScope, string> = {
  all: 'All',
  cluster: 'Cluster Name',
  country: 'Country',
  state: 'State / Province',
  metro: 'Metro Area',
};

function formatContext(value: number): string {
  return value.toFixed(1);
}

function ConurbationRowView({
  row,
  position,
  isOpen,
  onToggle,
}: {
  row: EnrichedConurbationRow;
  position: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const tier = computeTier(row.score);
  const rankLabel =
    row.tier === 'D' ? `M#${row.rank}` : `#${position}`;

  return (
    <>
    <tr style={{ borderBottom: isOpen ? 'none' : '1px solid var(--border)' }}>
      <td
        className="py-3 pr-4 pl-4 text-xs text-[var(--text-dim)]"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {rankLabel}
      </td>
      <td className="py-3 pr-4">
        <Link
          href={`/rankings/${row.slug}`}
          className="font-semibold hover:text-[var(--accent)]"
        >
          {row.name}
        </Link>
        <span className="text-sm text-[var(--text-muted)] ml-2">
          {(row.sovereignSlug ?? row.countrySlug) ? (
            <Link
              href={`/countries/${row.sovereignSlug ?? row.countrySlug}`}
              className="hover:text-[var(--accent)]"
            >
              {row.country}
            </Link>
          ) : (
            row.country
          )}
        </span>
        {row.cluster?.componentMetro ? (
          <div className="text-xs text-[var(--text-dim)] mt-0.5">
            <span>anchor: </span>
            <Link
              href={`/rankings/${row.cluster.componentMetro.slug}`}
              className="hover:text-[var(--accent)] underline-offset-2"
            >
              {row.cluster.componentMetro.name}
            </Link>
            <span> (#{row.cluster.componentMetro.rank})</span>
          </div>
        ) : null}
        {row.cluster && row.cluster.otherSlugs.length > 0 ? (
          <div className="text-xs text-[var(--text-muted)] mt-0.5">
            <span aria-hidden="true">↔ </span>
            {row.cluster.otherSlugs.map((s, i) => (
              <span key={s}>
                <Link href={`/rankings/${s}`} className="hover:text-[var(--accent)]">
                  {row.cluster!.otherNames[i] ?? s}
                </Link>
                {i < row.cluster!.otherSlugs.length - 1 ? <span>, </span> : null}
              </span>
            ))}
            <span className="text-[var(--text-dim)]">
              {' '}({row.cluster.size} metros, {fmtKm(row.cluster.diameterKm)}, {formatPop(row.cluster.populationSum)} pop)
            </span>
          </div>
        ) : row.cluster && row.cluster.otherNames.length > 0 ? (
          <div className="text-xs text-[var(--text-muted)] mt-0.5">
            <span aria-hidden="true">↔ </span>
            <span>{row.cluster.otherNames.join(', ')}</span>
            <span className="text-[var(--text-dim)]">
              {' '}({row.cluster.size} areas, {formatPop(row.cluster.populationSum)} pop)
            </span>
          </div>
        ) : null}
        {hasMappableMembers(row) ? (
          <button
            type="button"
            onClick={onToggle}
            className="mt-2 text-xs px-2 py-0.5 rounded border hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--text-muted)',
              fontFamily: "'JetBrains Mono', monospace",
            }}
            aria-expanded={isOpen}
          >
            {isOpen ? 'Hide map' : 'Show map'}
          </button>
        ) : null}
      </td>
      <td
        className="py-3 pr-4 text-right font-bold"
        style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--accent)' }}
      >
        {formatContext(row.contextValue)}
      </td>
      <td
        className="py-3 pr-4 text-right text-sm"
        style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-muted)' }}
      >
        <Link
          href={`/methodology${tierAnchor(row.score)}`}
          className="hover:text-[var(--accent)]"
        >
          {tier.name}
        </Link>
      </td>
    </tr>
    {isOpen && hasMappableMembers(row) ? (
      <tr>
        <td colSpan={4} className="px-4 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <MetroMap
            points={row.members
              .filter((m) => m.lat !== 0 || m.lon !== 0)
              .map((m) => ({ slug: m.slug, name: m.name, lat: m.lat, lon: m.lon }))}
            height={360}
          />
        </td>
      </tr>
    ) : null}
    </>
  );
}

// Mobile card equivalent of ConurbationRowView — same fields and the same
// map-toggle state, stacked instead of a wide table row.
function ConurbationCardView({
  row,
  position,
  isOpen,
  onToggle,
}: {
  row: EnrichedConurbationRow;
  position: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const tier = computeTier(row.score);
  const rankLabel =
    row.tier === 'D' ? `M#${row.rank}` : `#${position}`;

  return (
    <div className="p-3" style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span
            className="text-[10px] text-[var(--text-dim)] mr-1.5"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {rankLabel}
          </span>
          <Link
            href={`/rankings/${row.slug}`}
            className="font-semibold hover:text-[var(--accent)]"
          >
            {row.name}
          </Link>
          <span className="text-xs text-[var(--text-muted)] ml-1.5">
            {(row.sovereignSlug ?? row.countrySlug) ? (
              <Link
                href={`/countries/${row.sovereignSlug ?? row.countrySlug}`}
                className="hover:text-[var(--accent)]"
              >
                {row.country}
              </Link>
            ) : (
              row.country
            )}
          </span>
        </div>
        <div
          className="text-right flex-shrink-0 font-bold"
          style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--accent)' }}
        >
          {formatContext(row.contextValue)}
        </div>
      </div>
      {row.cluster?.componentMetro ? (
        <div className="text-xs text-[var(--text-dim)] mt-0.5">
          <span>anchor: </span>
          <Link
            href={`/rankings/${row.cluster.componentMetro.slug}`}
            className="hover:text-[var(--accent)] underline-offset-2"
          >
            {row.cluster.componentMetro.name}
          </Link>
          <span> (#{row.cluster.componentMetro.rank})</span>
        </div>
      ) : null}
      {row.cluster && row.cluster.otherSlugs.length > 0 ? (
        <div className="text-xs text-[var(--text-muted)] mt-0.5">
          <span aria-hidden="true">↔ </span>
          {row.cluster.otherSlugs.map((s, i) => (
            <span key={s}>
              <Link href={`/rankings/${s}`} className="hover:text-[var(--accent)]">
                {row.cluster!.otherNames[i] ?? s}
              </Link>
              {i < row.cluster!.otherSlugs.length - 1 ? <span>, </span> : null}
            </span>
          ))}
          <span className="text-[var(--text-dim)]">
            {' '}({row.cluster.size} metros, {fmtKm(row.cluster.diameterKm)}, {formatPop(row.cluster.populationSum)} pop)
          </span>
        </div>
      ) : row.cluster && row.cluster.otherNames.length > 0 ? (
        <div className="text-xs text-[var(--text-muted)] mt-0.5">
          <span aria-hidden="true">↔ </span>
          <span>{row.cluster.otherNames.join(', ')}</span>
          <span className="text-[var(--text-dim)]">
            {' '}({row.cluster.size} areas, {formatPop(row.cluster.populationSum)} pop)
          </span>
        </div>
      ) : null}
      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
        <Link
          href={`/methodology${tierAnchor(row.score)}`}
          className="hover:text-[var(--accent)] text-[var(--text-muted)]"
        >
          {tier.name}
        </Link>
        {hasMappableMembers(row) ? (
          <button
            type="button"
            onClick={onToggle}
            className="px-2 py-1 rounded border hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--text-muted)',
              fontFamily: "'JetBrains Mono', monospace",
            }}
            aria-expanded={isOpen}
          >
            {isOpen ? 'Hide map' : 'Show map'}
          </button>
        ) : null}
      </div>
      {isOpen && hasMappableMembers(row) ? (
        <div className="mt-2">
          <MetroMap
            points={row.members
              .filter((m) => m.lat !== 0 || m.lon !== 0)
              .map((m) => ({ slug: m.slug, name: m.name, lat: m.lat, lon: m.lon }))}
            height={280}
          />
        </div>
      ) : null}
    </div>
  );
}

// A cluster is mappable if it has 2+ members with non-zero coordinates.
// Single-metro override rows render with one workbook member and are
// excluded; the map of a single dot has no editorial value.
function hasMappableMembers(row: EnrichedConurbationRow): boolean {
  const withCoords = row.members.filter((m) => m.lat !== 0 || m.lon !== 0);
  return withCoords.length >= 2;
}

export default function ConurbationsTable({
  rows,
  tiers,
}: {
  rows: EnrichedConurbationRow[];
  tiers: TierDef[];
}) {
  const [searchScope, setSearchScope] = useState<SearchScope>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  // Positional rank in the original (unfiltered) sorted list — preserved so
  // that filtering doesn't renumber the cluster ranks (#1 stays #1 regardless
  // of search). For Tier D rows this is overridden in the row view to use
  // M#metroRank.
  const positionBySlug = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r, i) => m.set(r.slug, i + 1));
    return m;
  }, [rows]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return rows;

    const matchesCluster = (r: EnrichedConurbationRow) =>
      r.name.toLowerCase().includes(term);

    const matchesCountry = (r: EnrichedConurbationRow) => {
      // Lead's display country (may be multi: "China / Hong Kong / Macau")
      if (r.country.toLowerCase().includes(term)) return true;
      // Any member's country
      return r.members.some((mb) => mb.country.toLowerCase().includes(term));
    };

    const matchesState = (r: EnrichedConurbationRow) => {
      return r.members.some(
        (mb) =>
          (mb.subCountry && mb.subCountry.toLowerCase().includes(term)) ||
          (mb.primaryState && mb.primaryState.toLowerCase().includes(term)) ||
          (mb.state2 && mb.state2.toLowerCase().includes(term)) ||
          (mb.state3 && mb.state3.toLowerCase().includes(term)),
      );
    };

    const matchesMetro = (r: EnrichedConurbationRow) => {
      // Lead display name
      if (r.name.toLowerCase().includes(term)) return true;
      // Member workbook names
      if (r.members.some((mb) => mb.name.toLowerCase().includes(term))) return true;
      // Member primary cities (catches "Manhattan" inside New York etc.)
      if (
        r.members.some(
          (mb) => mb.primaryCity && mb.primaryCity.toLowerCase().includes(term),
        )
      )
        return true;
      // Cluster otherNames covers extraSatellites (e.g. "Felixstowe", "Mulhouse")
      if (r.cluster?.otherNames?.some((n) => n.toLowerCase().includes(term))) return true;
      if (r.cluster?.memberNames?.some((n) => n.toLowerCase().includes(term))) return true;
      return false;
    };

    return rows.filter((r) => {
      if (searchScope === 'cluster') return matchesCluster(r);
      if (searchScope === 'country') return matchesCountry(r);
      if (searchScope === 'state') return matchesState(r);
      if (searchScope === 'metro') return matchesMetro(r);
      return (
        matchesCluster(r) ||
        matchesCountry(r) ||
        matchesState(r) ||
        matchesMetro(r)
      );
    });
  }, [rows, searchTerm, searchScope]);

  // Group filtered rows by tier
  const tieredGroups = useMemo(() => {
    const m = new Map<string, EnrichedConurbationRow[]>();
    for (const t of tiers) m.set(t.slug, []);
    for (const r of filtered) {
      const k = r.tier ?? '_other';
      const arr = m.get(k);
      if (arr) arr.push(r);
    }
    return m;
  }, [filtered, tiers]);

  return (
    <div>
      {/* Search row: scope dropdown + text input — mirrors the homepage
          RankingsTable pattern so the muscle memory carries over. */}
      <div className="mb-8 flex flex-col sm:flex-row gap-2">
        <select
          value={searchScope}
          onChange={(e) => setSearchScope(e.target.value as SearchScope)}
          className="px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-[var(--text)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] sm:w-56"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
          aria-label="Search scope"
        >
          {(Object.keys(SEARCH_SCOPE_LABEL) as SearchScope[]).map((k) => (
            <option key={k} value={k}>
              {SEARCH_SCOPE_LABEL[k]}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder={
            searchScope === 'cluster'
              ? 'Search cluster name (e.g. Greater Zurich, Tri-State Area)...'
              : searchScope === 'country'
                ? 'Search by country (e.g. Germany, Japan)...'
                : searchScope === 'state'
                  ? 'Search by state or province (e.g. Bavaria, Ontario)...'
                  : searchScope === 'metro'
                    ? 'Search by metro or member (e.g. Mulhouse, Felixstowe)...'
                    : 'Search clusters, members, countries, states (e.g. Bavaria, Mulhouse, Tri-State)...'
          }
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 px-4 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-[var(--text)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
        />
      </div>

      {/* Tier breakdown — counts reflect the filtered set so readers see the
          shape of the result space change as they type. */}
      <section className="mb-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {tiers.map((t) => {
            const count = tieredGroups.get(t.slug)?.length ?? 0;
            return (
              <div
                key={t.slug}
                className="border rounded-lg p-4"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border)',
                }}
              >
                <div
                  className="text-xs uppercase tracking-wider"
                  style={{
                    color: t.accentHex,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  Tier {t.slug}
                </div>
                <div className="text-2xl font-bold mt-1">{count}</div>
                <div className="text-xs text-[var(--text-muted)] mt-1">
                  {t.name.replace(/^Tier \w+ — /, '')}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Tier sections — hide tiers with zero post-filter rows so the page
          doesn't show empty headers for narrow searches. */}
      {tiers.map((t) => {
        const group = tieredGroups.get(t.slug) ?? [];
        if (group.length === 0) return null;
        return (
          <section key={t.slug} className="mb-12" id={`tier-${t.slug.toLowerCase()}`}>
            <header className="mb-4">
              <h2 className="text-2xl font-bold" style={{ color: t.accentHex }}>
                {t.name}
              </h2>
              <p className="text-sm text-[var(--text-muted)] mt-1">
                {t.description}
              </p>
            </header>
            {/* Mobile: stacked cards instead of a 4-column table */}
            <div
              className="border rounded-lg overflow-hidden sm:hidden"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border)',
              }}
            >
              <CappedList
                initial={12}
                noun="metros"
                items={group.map((r) => (
                <ConurbationCardView
                  key={`${r.slug}-card`}
                  row={r}
                  position={positionBySlug.get(r.slug) ?? r.rank}
                  isOpen={openSlug === r.slug}
                  onToggle={() => setOpenSlug(openSlug === r.slug ? null : r.slug)}
                />
              ))}
              />
            </div>

            <div
              className="border rounded-lg overflow-x-auto hidden sm:block"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border)',
              }}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className="text-left text-xs text-[var(--text-dim)] uppercase tracking-wider"
                    style={{
                      borderBottom: '1px solid var(--border)',
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    <th className="py-2 pl-4 pr-4">Rank</th>
                    <th className="py-2 pr-4">Cluster</th>
                    <th className="py-2 pr-4 text-right">
                      {group[0]?.contextLabel ?? 'Value'}
                    </th>
                    <th className="py-2 pr-4 text-right">Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {group.map((r) => (
                    <ConurbationRowView
                      key={r.slug}
                      row={r}
                      position={positionBySlug.get(r.slug) ?? r.rank}
                      isOpen={openSlug === r.slug}
                      onToggle={() => setOpenSlug(openSlug === r.slug ? null : r.slug)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {filtered.length === 0 ? (
        <div
          className="text-center py-12 text-[var(--text-muted)]"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          No conurbations match your search.
        </div>
      ) : null}
    </div>
  );
}
