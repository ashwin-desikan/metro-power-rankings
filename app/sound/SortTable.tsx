'use client';

import { useState, type ReactNode } from 'react';

export interface Col {
  key: string;
  label: string;
  align?: 'right';
  numeric?: boolean;
  kind?: 'rank' | 'peak' | 'pk' | 'artist' | 'metro' | 'with' | 'grammy';
  slugKey?: string;
  metroSlugKey?: string;
  bold?: boolean;
  mut?: boolean;
}

const muted = { color: 'var(--text-muted)' } as const;
function aslug(n: string) {
  return n.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
const pkfmt = (p: number | null) => (p == null ? '—' : p === 1 ? '#1' : `#${p}`);

export default function SortTable({
  rows, cols, initialSort, initialDir = 'desc',
}: { rows: Record<string, unknown>[]; cols: Col[]; initialSort: string; initialDir?: 'asc' | 'desc' }) {
  const [sort, setSort] = useState(initialSort);
  const [dir, setDir] = useState<'asc' | 'desc'>(initialDir);

  const sorted = [...rows].sort((a, b) => {
    const av = a[sort], bv = b[sort];
    const numeric = typeof av === 'number' || av == null || typeof bv === 'number' || bv == null;
    if (numeric) {
      const x = typeof av === 'number' ? av : -Infinity;
      const y = typeof bv === 'number' ? bv : -Infinity;
      return dir === 'asc' ? x - y : y - x;
    }
    return dir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });

  const onSort = (c: Col) => {
    if (c.kind === 'rank') return;
    if (sort === c.key) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSort(c.key); setDir(c.numeric ? 'desc' : 'asc'); }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} onClick={() => onSort(c)}
                className={`${c.kind === 'rank' ? '' : 'cursor-pointer'} select-none py-2 pr-3 ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                style={{ color: sort === c.key ? 'var(--text, #e6edf3)' : 'var(--text-muted)' }}>
                {c.label}{sort === c.key ? (dir === 'asc' ? ' ▴' : ' ▾') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={i} className="border-t" style={{ borderColor: 'var(--border, #1b2330)' }}>
              {cols.map((c) => {
                const v = r[c.key];
                let cell: ReactNode = v as ReactNode;
                let style: React.CSSProperties | undefined = c.mut ? muted : undefined;
                if (c.kind === 'rank') cell = i + 1;
                else if (c.kind === 'peak') cell = v === 1 ? <b>1</b> : (v as ReactNode);
                else if (c.kind === 'pk') { cell = pkfmt(v as number | null); if (v === 1) style = { color: 'var(--accent)' }; else style = muted; }
                else if (c.kind === 'artist') { const sl = (r[c.slugKey || 'slug'] as string) || aslug(String(v)); cell = <a href={`/sound/artists/${sl}`} className="hover:underline">{v as ReactNode}</a>; }
                else if (c.kind === 'metro') { const ms = r[c.metroSlugKey || 'metro_slug'] as string; cell = v ? (<><a href={`/rankings/${ms}`} className="hover:underline">{v as ReactNode}</a><a href={`/sound/metros/${ms}`} title="Sound profile" className="ml-1 align-middle text-xs" style={muted}>&#9834;</a></>) : ''; }
                else if (c.kind === 'with') { const arr = (v as string[]) || []; cell = arr.length ? arr.map((n, j) => <span key={j}>{j > 0 ? ', ' : ''}<a href={`/sound/artists/${aslug(n)}`} className="hover:underline">{n}</a></span>) : <span style={muted}>—</span>; }
                else if (c.kind === 'grammy') { const won = !!r['grammy_won']; cell = v ? <span style={{ color: won ? '#e8c766' : 'var(--text-muted)' }}>{won ? '★' : '☆'} {v as ReactNode}</span> : <span style={muted}>—</span>; style = undefined; }
                return (
                  <td key={c.key} className={`py-1.5 pr-3 ${c.align === 'right' ? 'text-right tabular-nums' : ''} ${c.bold ? 'font-semibold tabular-nums' : ''}`} style={style}>{cell}</td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
