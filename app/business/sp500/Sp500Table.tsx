'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
// Local mirror of lib/business Sp500Constituent (server-only module).
type Sp500Constituent = {
  symbol: string;
  name: string;
  sector: string;
  subIndustry: string;
  hq: string;
  hqCity: string;
  hqState: string;
  dateAdded: string;
  founded: string;
  cap: number | null;
  metro: string | null;
  metroSlug: string;
};

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;

function fmtCap(n: number | null): string {
  if (!n) return '—';
  if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
  return '$' + (n / 1e6).toFixed(0) + 'M';
}

export default function Sp500Table({ rows }: { rows: Sp500Constituent[] }) {
  const [q, setQ] = useState('');
  const [sector, setSector] = useState('');
  const sectors = useMemo(() => [...new Set(rows.map((r) => r.sector))].sort(), [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!needle ||
          r.name.toLowerCase().includes(needle) ||
          r.symbol.toLowerCase().includes(needle) ||
          (r.metro ?? '').toLowerCase().includes(needle)) &&
        (!sector || r.sector === sector),
    );
  }, [rows, q, sector]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, ticker or metro…"
          className="rounded-lg border px-3 py-1.5 text-sm bg-transparent"
          style={{ borderColor: 'var(--border)', minWidth: 240 }}
        />
        <select
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          className="rounded-lg border px-2 py-1.5 text-sm"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }}
        >
          <option value="">All sectors</option>
          {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-xs" style={{ ...MONO, color: 'var(--text-muted)' }}>
          {shown.length} of {rows.length}
        </span>
      </div>
      <div className="overflow-x-auto rounded-xl border max-h-[560px] overflow-y-auto" style={{ borderColor: 'var(--border)' }}>
        <table className="w-full text-sm">
          <thead className="sticky top-0" style={{ background: 'var(--bg-card)' }}>
            <tr className="text-left">
              <th className="px-3 py-2 font-semibold">Company</th>
              <th className="px-3 py-2 text-right font-semibold">Market cap</th>
              <th className="px-3 py-2 font-semibold">Sector</th>
              <th className="px-3 py-2 font-semibold">Metro</th>
              <th className="px-3 py-2 text-right font-semibold">Added</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.symbol} className="border-t" style={{ borderColor: 'var(--border)' }}>
                <td className="px-3 py-1.5 font-semibold whitespace-nowrap">
                  {r.name}{' '}
                  <span className="text-xs font-normal" style={{ ...MONO, color: 'var(--text-dim)' }}>{r.symbol}</span>
                </td>
                <td className="px-3 py-1.5 text-right" style={MONO}>{fmtCap(r.cap)}</td>
                <td className="px-3 py-1.5 text-[var(--text-muted)] whitespace-nowrap">{r.sector}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">
                  {r.metro ? (
                    r.metroSlug
                      ? <Link href={`/rankings/${r.metroSlug}`} className="hover:underline">{r.metro}</Link>
                      : r.metro
                  ) : (
                    <span className="text-[var(--text-muted)]">{r.hq}</span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-right" style={{ ...MONO, color: 'var(--text-muted)' }}>
                  {/^\d{4}/.test(r.dateAdded) ? r.dateAdded.slice(0, 4) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
