'use client';

import { useMemo, useState } from 'react';
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
  const [year, setYear] = useState(data.meta.last_year);

  const rows: RankingRow[] = data.years[String(year)] ?? [];
  const stat = data.stats[String(year)];
  const shown = rows.length;
  const fixed = rows.filter((r) => r[8] === 1).length;
  const suspect = rows.filter((r) => r[8] === 2).length;
  const unverified = rows.filter((r) => r[8] === 3).length;
  const carried = rows.filter((r) => r[7] === 1).length;

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

      {(suspect > 0 || unverified > 0 || fixed > 0 || carried > 0) && (
        <p className="text-xs text-[var(--text-muted)] mb-3 max-w-3xl leading-relaxed">
          {fixed > 0 && (
            <>
              <span style={{ color: 'var(--text)' }}>{fixed}</span> name
              {fixed === 1 ? ' is' : 's are'} corrected to what the company was actually
              called this year.{' '}
            </>
          )}
          {suspect > 0 && (
            <>
              <span style={{ color: 'var(--accent, #4f9dff)' }}>†</span> marks a label
              that is demonstrably wrong for this year and not yet corrected ({suspect}).{' '}
            </>
          )}
          {unverified > 0 && (
            <>
              <span style={{ color: 'var(--text-dim)' }}>°</span> marks a name recorded by
              the source but not dated to this year ({unverified}). Neither Fortune feed
              dates names: each company record carries its <em>present-day</em> name in
              every year, which is why 1996 otherwise reads GE Aerospace and RTX.{' '}
            </>
          )}
          {carried > 0 && (
            <>Headquarters in muted type is carried from another year of the same company
            rather than published for this one.</>
          )}
        </p>
      )}

      <TableBox stickyCol={2}>
        <thead>
          <tr className="text-left border-b" style={{ borderColor: 'var(--border)' }}>
            <th className={TH}>#</th>
            <th className={TH}>Company</th>
            <th className={THR}>Revenue</th>
            <th className={`${THR} ${SMCOL}`}>Market value</th>
            <th className={`${TH} ${SMCOL}`}>Sector</th>
            <th className={`${TH} ${SMCOL}`}>Headquarters</th>
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
              <td className={`${TD} ${SMCOL}`}>{r[4] ?? '—'}</td>
              <td className={`${TD} ${SMCOL}`} style={r[7] === 1 ? { color: 'var(--text-dim)' } : undefined}>
                {r[5] ? (r[6] ? `${r[5]}, ${r[6]}` : r[5]) : '—'}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td className={TD} colSpan={6}>No list published for {year}.</td></tr>
          )}
        </tbody>
      </TableBox>
    </>
  );
}
