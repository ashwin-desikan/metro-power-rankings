'use client';

import { useMemo } from 'react';
import { useSessionState } from '@/lib/useSessionState';
import { GrammyChip } from '../GrammyBadges';

export interface ArtistRow {
  name: string;
  slug: string;
  metro: string;
  metro_slug: string;
  country?: string;
  peak_decade?: string;
  peak_year?: number;
  active?: string;
  bb_top10: number;
  bb_no1: number;
  bb_score: number;
  uk_top10: number;
  uk_no1: number;
  uk_score: number;
  album_raw?: number;
  prestige?: number;
  gram_wins?: number;
  gram_noms?: number;
  gram_awards?: { year: number; award: string; work?: string | null }[];
  combined: number;
}

export interface ByPeriod {
  decades: Record<string, ArtistRow[]>;
  years: Record<string, ArtistRow[]>;
}

type SortKey = 'combined' | 'bb_score' | 'uk_score' | 'album_raw' | 'prestige';
const muted = { color: 'var(--text-muted)' } as const;

export default function ArtistsTable({ artists, byPeriod }: { artists: ArtistRow[]; byPeriod?: ByPeriod }) {
  const [q, setQ] = useSessionState('mpr.sound.art.q', '');
  const [sort, setSort] = useSessionState<SortKey>('mpr.sound.art.sort', 'combined');
  const [decade, setDecade] = useSessionState<string>('mpr.sound.art.decade', 'All');
  const DECADES = ['All', '1950s', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];
  const [year, setYear] = useSessionState<string>('mpr.sound.art.year', 'All');

  const period = decade !== 'All';

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    let base = artists;
    if (byPeriod) {
      if (year !== 'All') base = byPeriod.years[year] ?? [];
      else if (decade !== 'All') base = byPeriod.decades[decade] ?? [];
    }
    let r = base;
    if (term) r = r.filter((a) => a.name.toLowerCase().includes(term) || a.metro?.toLowerCase().includes(term));
    r = [...r].sort((x, y) => (y[sort] ?? 0) - (x[sort] ?? 0));
    return term === '' && !period ? r.slice(0, 150) : r;
  }, [artists, byPeriod, q, sort, decade, year, period]);

  const Th = ({ k, label }: { k: SortKey; label: string }) => (
    <th
      className="cursor-pointer py-2 pr-3 text-right select-none"
      onClick={() => setSort(k)}
      style={{ color: sort === k ? 'var(--text, #e6edf3)' : 'var(--text-muted)' }}
    >
      {label}{sort === k ? ' ▾' : ''}
    </th>
  );

  const periodLabel = year !== 'All' ? year : decade;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1">
        {DECADES.map((d) => {
          const on = decade === d;
          return (
            <button key={d} type="button" onClick={() => { setDecade(d); setYear('All'); }}
              className="rounded-md px-2.5 py-1 text-xs font-semibold"
              style={{ background: on ? '#4f9dff' : 'transparent', color: on ? '#0e1116' : 'var(--text-muted)', border: '1px solid var(--border, #222b36)' }}>
              {d}
            </button>
          );
        })}
      </div>

      {period && (
        <div className="mb-3 flex flex-wrap gap-1">
          {['All', ...Array.from({ length: 10 }, (_, i) => String(parseInt(decade, 10) + i))].map((y) => {
            const on = year === y;
            return (
              <button key={y} type="button" onClick={() => setYear(y)}
                className="rounded px-2 py-0.5 text-xs"
                style={{ background: on ? '#c98bff' : 'transparent', color: on ? '#0e1116' : 'var(--text-muted)', border: '1px solid var(--border, #222b36)' }}>
                {y}
              </button>
            );
          })}
        </div>
      )}

      <div className="mb-3 flex items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search artist or metro…"
          className="w-64 rounded-md border bg-transparent px-3 py-1.5 text-sm"
          style={{ borderColor: 'var(--border, #222b36)', color: 'var(--text, #e6edf3)' }}
        />
        <button
          type="button"
          onClick={() => { setQ(''); setDecade('All'); setYear('All'); setSort('combined'); }}
          disabled={!q.trim() && decade === 'All' && year === 'All' && sort === 'combined'}
          className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-40"
          style={{ borderColor: 'var(--border, #222b36)', color: 'var(--text-muted)' }}
        >
          Reset
        </button>
        <span className="text-xs" style={muted}>
          {period
            ? `${rows.length} artist${rows.length === 1 ? '' : 's'} · scored in ${periodLabel}`
            : q.trim()
            ? `${rows.length} artist${rows.length === 1 ? '' : 's'}`
            : 'top 150 by all-time combined — search or pick a decade for period scores'}
        </span>
      </div>

      {period && (
        <p className="mb-3 text-xs" style={muted}>
          Scores below are earned in {periodLabel} only, not career totals. Ranked by that period.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left">
              <th className="py-2 pr-3 text-right" style={muted}>#</th>
              <th className="py-2 pr-3" style={muted}>Artist</th>
              <th className="py-2 pr-3" style={muted}>Metro</th>
              <th className="py-2 pr-3 text-right" style={muted}>BB #1</th>
              <th className="py-2 pr-3 text-right" style={muted}>BB T10</th>
              <Th k="bb_score" label="BB score" />
              <th className="py-2 pr-3 text-right" style={muted}>UK #1</th>
              <th className="py-2 pr-3 text-right" style={muted}>UK T10</th>
              <Th k="uk_score" label="UK score" />
              {!period && <Th k="album_raw" label="Albums" />}
              {!period && <Th k="prestige" label="★" />}
              <Th k="combined" label="Combined" />
              {!period && <th className="py-2 pr-3" style={muted}>Peak</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((a, i) => (
              <tr key={a.slug + a.name} className="border-t" style={{ borderColor: 'var(--border, #1b2330)' }}>
                <td className="py-1.5 pr-3 text-right tabular-nums" style={muted}>{i + 1}</td>
                <td className="py-1.5 pr-3"><a href={`/sound/artists/${a.slug}`} className="hover:underline">{a.name}</a><GrammyChip wins={a.gram_wins} noms={a.gram_noms} /></td>
                <td className="py-1.5 pr-3" style={muted}>{a.metro_slug ? (<><a href={`/rankings/${a.metro_slug}`} className="hover:underline">{a.metro}</a><a href={`/sound/metros/${a.metro_slug}`} title="Sound profile" className="ml-1 align-middle text-xs" style={{ color: 'var(--text-muted)' }}>&#9834;</a></>) : ''}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums" style={muted}>{a.bb_no1 || ''}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums" style={muted}>{a.bb_top10 || ''}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{a.bb_score || ''}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums" style={muted}>{a.uk_no1 || ''}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums" style={muted}>{a.uk_top10 || ''}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{a.uk_score || ''}</td>
                {!period && <td className="py-1.5 pr-3 text-right tabular-nums" style={muted}>{a.album_raw || ''}</td>}
                {!period && <td className="py-1.5 pr-3 text-right tabular-nums" style={{ color: a.gram_wins ? '#e8c766' : 'var(--text-muted)' }}>{a.prestige || ''}</td>}
                <td className="py-1.5 pr-3 text-right tabular-nums font-semibold">{a.combined}</td>
                {!period && <td className="py-1.5 pr-3" style={muted}>{a.peak_decade}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
