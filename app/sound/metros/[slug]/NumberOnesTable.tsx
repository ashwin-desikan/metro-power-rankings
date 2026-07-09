'use client';

import { useState } from 'react';

interface N1 { single: string; artist: string; charts: string; year: number }
type Key = 'year' | 'single' | 'artist' | 'charts';

const muted = { color: 'var(--text-muted)' } as const;

export default function NumberOnesTable({ rows }: { rows: N1[] }) {
  const [sort, setSort] = useState<Key>('year');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [expanded, setExpanded] = useState(false);

  const sorted = [...rows].sort((a, b) => {
    let c = 0;
    if (sort === 'year') c = a.year - b.year;
    else {
      c = String(a[sort]).localeCompare(String(b[sort]));
      if (c === 0) c = a.year - b.year;
    }
    return dir === 'asc' ? c : -c;
  });

  const CAP = 25;
  const visible = expanded ? sorted : sorted.slice(0, CAP);

  const onSort = (k: Key) => {
    if (k === sort) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSort(k); setDir(k === 'year' ? 'desc' : 'asc'); }
  };

  const cols: { key: Key; label: string; align?: 'right' }[] = [
    { key: 'year', label: 'Year', align: 'right' },
    { key: 'single', label: 'Single' },
    { key: 'artist', label: 'Artist' },
    { key: 'charts', label: 'Chart' },
  ];
  const arrow = (k: Key) => (k === sort ? (dir === 'asc' ? ' ▲' : ' ▼') : '');

  return (
    <div className="rounded-lg border" style={{ borderColor: 'var(--border, #222b36)' }}>
      {/* Mobile: stacked cards, no horizontal scrolling */}
      <div className="max-h-[480px] overflow-y-auto sm:hidden divide-y" style={{ borderColor: 'var(--border, #222b36)' }}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide sticky top-0 z-10" style={{ background: 'var(--bg-card, #0f151c)', borderBottom: '1px solid var(--border, #222b36)' }}>
          {cols.map((c, i) => (
            <span key={c.key} className="inline-flex items-center gap-2">
              {i > 0 && <span aria-hidden style={muted}>&middot;</span>}
              <button
                type="button"
                onClick={() => onSort(c.key)}
                className="hover:text-[var(--accent)]"
                style={{ color: c.key === sort ? 'var(--accent)' : 'var(--text-muted)' }}
              >
                {c.label}{arrow(c.key)}
              </button>
            </span>
          ))}
        </div>
        {visible.map((r, i) => (
          <div key={r.single + r.artist + r.year + i} className="px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium text-sm leading-tight">&ldquo;{r.single}&rdquo;</div>
              <div className="text-xs tabular-nums flex-shrink-0" style={muted}>{r.year}</div>
            </div>
            <div className="mt-0.5 text-sm">{r.artist}</div>
            <div className="mt-0.5 text-xs" style={muted}>{r.charts}</div>
          </div>
        ))}
      </div>

      <div className="max-h-[480px] overflow-y-auto overflow-x-auto hidden sm:block">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10" style={{ background: 'var(--bg-card, #0f151c)' }}>
            <tr>
              {cols.map((c) => (
                <th
                  key={c.key}
                  onClick={() => onSort(c.key)}
                  className={`cursor-pointer select-none px-3 py-2 text-xs font-semibold uppercase tracking-wide hover:text-[var(--accent)] ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                  style={{ color: c.key === sort ? 'var(--accent)' : 'var(--text-muted)', borderBottom: '1px solid var(--border, #222b36)' }}
                >
                  {c.label}{arrow(c.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={r.single + r.artist + r.year + i} className="hover:bg-[var(--bg-card-hover)]">
                <td className="px-3 py-1.5 text-right tabular-nums" style={muted}>{r.year}</td>
                <td className="px-3 py-1.5">&ldquo;{r.single}&rdquo;</td>
                <td className="px-3 py-1.5">{r.artist}</td>
                <td className="px-3 py-1.5 text-xs" style={muted}>{r.charts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 text-[11px]" style={muted}>
        <span>{expanded ? rows.length : Math.min(CAP, rows.length)} of {rows.length} #1 singles &middot; click a column to sort</span>
        {rows.length > CAP && (
          <button type="button" onClick={() => setExpanded((v) => !v)} className="rounded px-2 py-0.5 hover:text-[var(--accent)]" style={{ color: 'var(--accent)' }}>
            {expanded ? 'Show top 25' : `Show all ${rows.length}`}
          </button>
        )}
      </div>
    </div>
  );
}
