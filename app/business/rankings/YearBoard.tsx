'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { RankingRow, RankingsFile } from '@/lib/business';
import { MONO, SMCOL, TD, TDR, TH, THR, TableBox } from '../ui';

// Year control + the ranked table for the selected year. Client-side because the
// whole point is scrubbing across 72 years without a round trip; the file is one
// payload the server already handed us.

function fmtM(n: number | null): string {
  if (n === null || n === undefined) return '—';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'T';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'B';
  return '$' + n.toFixed(0) + 'M';
}

const DECADES = [1955, 1960, 1970, 1980, 1990, 2000, 2010, 2020, 2026];

export default function YearBoard({ data }: { data: RankingsFile }) {
  const years = useMemo(
    () => Object.keys(data.years).map(Number).sort((a, b) => a - b),
    [data],
  );
  // Deep link: /business/rankings?year=1980 opens straight on that year — the
  // Time Machine hub links here, and its registry only promises deep links
  // that are genuinely read (lib/timeMachines.ts).
  //
  // 🔴 NOT the champions pattern. That subtree mounts client-only, so it may
  // read window in the state initialiser. THIS component is server-rendered
  // with the rest of the page, so an initialiser that saw ?year would hydrate
  // against HTML rendered for the default year and mismatch. The param is read
  // in a mount effect instead — one extra render, no mismatch — and `booted`
  // keeps the write-back below from clobbering ?year before it has been read.
  const [year, setYear] = useState(data.meta.last_year);
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    const p = parseInt(new URLSearchParams(window.location.search).get('year') ?? '', 10);
    if (Number.isFinite(p)) {
      setYear(Math.min(Math.max(p, data.meta.first_year), data.meta.last_year));
    }
    setBooted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the URL in step without a navigation, so the view is shareable.
  useEffect(() => {
    if (!booted) return;
    const u = new URL(window.location.href);
    u.searchParams.set('year', String(year));
    window.history.replaceState(null, '', u.toString());
  }, [year, booted]);

  const rows: RankingRow[] = data.years[String(year)] ?? [];
  const stat = data.stats[String(year)];
  const shown = rows.length;
  // The per-year counts of corrected / undated names and carried addresses used
  // to drive a paragraph above the table. That paragraph is gone; the glyphs and
  // the methodology card carry the meaning, so the counts are no longer computed.

  return (
    <>
      <div className="rounded-xl border p-4 mb-5" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-baseline gap-3 mb-3">
          <span className="text-4xl font-bold tabular-nums" style={MONO}>{year}</span>
          <span className="text-sm text-[var(--text-muted)]">
            {stat ? `top ${shown} of ${stat.n} listed` : 'no list'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Previous year"
            className="px-2 py-1 text-sm rounded border disabled:opacity-30"
            style={{ borderColor: 'var(--border)' }}
            disabled={year <= years[0]}
            onClick={() => setYear((y) => Math.max(years[0], y - 1))}
          >
            ←
          </button>
          <input
            type="range"
            className="flex-1 min-w-0"
            min={years[0]}
            max={years[years.length - 1]}
            step={1}
            value={year}
            aria-label="Year"
            onChange={(e) => setYear(Number(e.target.value))}
          />
          <button
            type="button"
            aria-label="Next year"
            className="px-2 py-1 text-sm rounded border disabled:opacity-30"
            style={{ borderColor: 'var(--border)' }}
            disabled={year >= years[years.length - 1]}
            onClick={() => setYear((y) => Math.min(years[years.length - 1], y + 1))}
          >
            →
          </button>
        </div>

        <div className="flex flex-wrap gap-1 mt-3">
          {DECADES.filter((d) => d >= years[0] && d <= years[years.length - 1]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setYear(d)}
              className="px-2 py-1 text-xs rounded-full border"
              style={{
                borderColor: 'var(--border)',
                color: year === d ? 'var(--text)' : 'var(--text-muted)',
                backgroundColor: year === d ? 'var(--bg-card)' : 'transparent',
              }}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* The per-year methodology paragraph that used to sit here has been removed.
          It restated the same four caveats above every year of the board, in
          counts a reader has no use for ("83 names undated", "36 metros carried"),
          directly above the data it was qualifying. The glyphs carry title
          tooltips and the "How to read this" card at the foot of the page
          explains them once. Caveats belong near the sources, not on top of the
          table. */}

      <TableBox stickyCol={2}>
        <thead>
          <tr className="text-left border-b" style={{ borderColor: 'var(--border)' }}>
            <th className={TH}>#</th>
            <th className={TH}>Company</th>
            <th className={THR}>Revenue</th>
            <th className={`${THR} ${SMCOL}`}>Market value</th>
            <th className={TH}>Metro area</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r[0]}-${r[1]}`} className="border-b" style={{ borderColor: 'var(--border)' }}>
              <td className={TD} style={MONO}>{r[0]}</td>
              <td className={TD}>
                {r[1]}
                {r[8] === 2 && (
                  <span style={{ color: 'var(--accent, #4f9dff)' }}
                        title="this label is demonstrably wrong for this year"> †</span>
                )}
                {r[8] === 3 && (
                  <span style={{ color: 'var(--text-dim)' }}
                        title="pre-1996 label from a back-naming archive; unverified"> °</span>
                )}
              </td>
              <td className={TDR} style={MONO}>{fmtM(r[2])}</td>
              <td className={`${TDR} ${SMCOL}`} style={MONO}>{fmtM(r[3])}</td>
              {/* The metro is the primary fact on a metro site: named, linked and
                  in full type. The street address underneath is the supporting
                  detail. Carried placements are no longer greyed out — the whole
                  column read as washed-out when most rows were carried. */}
              <td className={TD}>
                {r[9] ? (
                  r[10] ? (
                    <Link href={`/rankings/${r[10]}`} className="hover:underline"
                          style={{ color: 'var(--accent, #4f9dff)' }}>
                      {r[9]}
                    </Link>
                  ) : r[9]
                ) : <span className="text-[var(--text-dim)]">—</span>}
                {r[5] && (
                  <span className="block text-[11px] text-[var(--text-muted)]">
                    {r[6] ? `${r[5]}, ${r[6]}` : r[5]}
                  </span>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td className={TD} colSpan={5}>No list published for {year}.</td></tr>
          )}
        </tbody>
      </TableBox>
    </>
  );
}
