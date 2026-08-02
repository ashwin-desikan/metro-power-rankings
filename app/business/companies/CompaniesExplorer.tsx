'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
// Local mirror of lib/business BizCompany (lib/business is server-only; a
// use-client file must not import it, per check:client-imports).
type BizCompany = {
  rank: number;
  name: string;
  symbol: string;
  cap: number;
  country: string;
  metro: string | null;
  metroSlug: string;
  source: string;
};

// Client explorer for the company universe. The server renders the top 500;
// the first time a filter or search needs more, the FULL universe
// (/data/business/companies.json, ~12,900 rows) is fetched once and cached.

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const SHOW = 500;

function fmtCap(n: number): string {
  if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(0) + 'M';
  return '$' + n.toFixed(0);
}

export default function CompaniesExplorer({ initial, total }: { initial: BizCompany[]; total: number }) {
  const [q, setQ] = useState('');
  const [country, setCountry] = useState('');
  const [source, setSource] = useState('');
  const [all, setAll] = useState<BizCompany[] | null>(null);
  const [loading, setLoading] = useState(false);
  const fetched = useRef(false);

  const filtering = q.trim() !== '' || country !== '' || source !== '';

  async function ensureAll() {
    if (fetched.current) return;
    fetched.current = true;
    setLoading(true);
    try {
      const res = await fetch('/data/business/companies.json');
      if (res.ok) {
        const data = (await res.json()) as { companies: BizCompany[] };
        setAll(data.companies);
      }
    } catch {
      /* stay on the top 500 */
    } finally {
      setLoading(false);
    }
  }

  const universe = all ?? initial;
  const countries = useMemo(
    () => [...new Set(universe.map((c) => c.country).filter(Boolean))].sort(),
    [universe],
  );

  const rows = useMemo(() => {
    if (!filtering) return initial.slice(0, SHOW);
    const needle = q.trim().toLowerCase();
    return universe.filter(
      (c) =>
        (!needle || c.name.toLowerCase().includes(needle) || c.symbol.toLowerCase().includes(needle)) &&
        (!country || c.country === country) &&
        (!source || c.source === source),
    );
  }, [filtering, initial, universe, q, country, source]);

  const searchedAll = all !== null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); void ensureAll(); }}
          placeholder="Search name or ticker…"
          className="rounded-lg border px-3 py-1.5 text-sm bg-transparent"
          style={{ borderColor: 'var(--border)', minWidth: 220 }}
        />
        <select
          value={country}
          onChange={(e) => { setCountry(e.target.value); void ensureAll(); }}
          className="rounded-lg border px-2 py-1.5 text-sm"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }}
        >
          <option value="">All countries</option>
          {countries.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={source}
          onChange={(e) => { setSource(e.target.value); void ensureAll(); }}
          className="rounded-lg border px-2 py-1.5 text-sm"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-card)' }}
        >
          <option value="">Public + private + unicorn</option>
          <option value="Public">Public</option>
          <option value="Unicorn">Unicorn</option>
          <option value="Private">Private</option>
        </select>
        <span className="text-xs" style={{ ...MONO, color: 'var(--text-muted)' }}>
          {loading
            ? 'loading the full universe…'
            : filtering
              ? `${rows.length.toLocaleString()} match${rows.length === 1 ? '' : 'es'}${searchedAll ? '' : ' (of the top 500 so far)'}`
              : `top ${SHOW} of ${total.toLocaleString()} — filter to reach the rest`}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left" style={{ background: 'var(--bg-card)' }}>
              <th className="px-3 py-2 text-right font-semibold">#</th>
              <th className="px-3 py-2 font-semibold">Company</th>
              <th className="px-3 py-2 text-right font-semibold">Market cap</th>
              <th className="px-3 py-2 font-semibold">Country</th>
              <th className="px-3 py-2 font-semibold">Metro</th>
              <th className="px-3 py-2 font-semibold">Type</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, SHOW).map((c) => (
              <tr key={`${c.rank}-${c.symbol || c.name}`} className="border-t" style={{ borderColor: 'var(--border)' }}>
                <td className="px-3 py-1.5 text-right" style={{ ...MONO, color: 'var(--text-dim)' }}>{c.rank}</td>
                <td className="px-3 py-1.5 font-semibold whitespace-nowrap">
                  {c.name}{' '}
                  {c.symbol && <span className="text-xs font-normal" style={{ ...MONO, color: 'var(--text-dim)' }}>{c.symbol}</span>}
                </td>
                <td className="px-3 py-1.5 text-right" style={MONO}>{fmtCap(c.cap)}</td>
                <td className="px-3 py-1.5 text-[var(--text-muted)] whitespace-nowrap">{c.country}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">
                  {c.metro ? (
                    c.metroSlug
                      ? <Link href={`/rankings/${c.metroSlug}`} className="hover:underline">{c.metro}</Link>
                      : c.metro
                  ) : (
                    <span style={{ color: 'var(--text-dim)' }}>—</span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-xs text-[var(--text-muted)]">{c.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtering && rows.length > SHOW && (
        <p className="text-xs text-[var(--text-muted)] mt-2">
          Showing the first {SHOW.toLocaleString()} of {rows.length.toLocaleString()} matches - narrow the filter to see the tail.
        </p>
      )}
    </div>
  );
}
