'use client';

import Link from 'next/link';
import { Fragment, useMemo, useState } from 'react';
import { TableBox, SectionHead, TH, THR, TD, TDR, MONO, SMCOL } from '../ui';
import type { RankingMetrosFile } from '@/lib/business';

function fmtRev(musd: number): string {
  if (musd >= 1e6) return '$' + (musd / 1e6).toFixed(2) + 'T';
  if (musd >= 1e3) return '$' + (musd / 1e3).toFixed(1) + 'B';
  return '$' + musd.toFixed(0) + 'M';
}

export default function MetroBoard({ data }: { data: RankingMetrosFile }) {
  const years = data.meta.years;
  const [year, setYear] = useState(years[years.length - 1]);
  const [draft, setDraft] = useState(year);
  // Which metros have their city breakdown open. Keyed by metro name and kept
  // across a year change on purpose: scrubbing years while watching one metro's
  // cities is the point, and collapsing on every tick would fight the reader.
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const rows = data.years[String(year)] ?? [];
  const totals = useMemo(() => {
    const companies = rows.reduce((a, r) => a + r.companies, 0);
    const revenue = rows.reduce((a, r) => a + r.revenue, 0);
    return { companies, revenue, metros: rows.length };
  }, [rows]);

  // The share of the top 100 held by the leading metro is the number that makes
  // the concentration story legible, so it is computed here rather than left for
  // the reader to do in their head.
  const leadShare = rows.length && totals.companies
    ? Math.round((rows[0].companies / totals.companies) * 100)
    : 0;

  return (
    <section id="metros" className="mt-10">
      <SectionHead
        title="Where the giants were"
        sub="Every company placed in the metro it was headquartered in that year."
        more={'A company that moved counts for each metro it actually occupied, so '
          + 'Atlantic Richfield is Philadelphia in 1960 and Los Angeles in 1980 '
          + 'rather than one or the other throughout.'}
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]"
               style={MONO} htmlFor="metro-year">
          Year
        </label>
        <input
          id="metro-year"
          type="range"
          min={years[0]}
          max={years[years.length - 1]}
          value={draft}
          onChange={(e) => setDraft(Number(e.target.value))}
          onPointerUp={() => setYear(draft)}
          onKeyUp={() => setYear(draft)}
          onTouchEnd={() => setYear(draft)}
          className="flex-1 min-w-[200px]"
        />
        <span className="text-2xl font-bold tabular-nums" style={MONO}>{draft}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          ['Metros represented', String(totals.metros)],
          ['Companies placed', String(totals.companies)],
          ['Combined revenue', fmtRev(totals.revenue)],
          ['Held by the leader', leadShare ? leadShare + '%' : '—'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border p-3"
               style={{ borderColor: 'var(--border)' }}>
            <div className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]"
                 style={MONO}>{label}</div>
            <div className="text-xl font-bold mt-1">{value}</div>
          </div>
        ))}
      </div>

      <TableBox stickyCol={2}>
        <thead>
          <tr className="text-left border-b" style={{ borderColor: 'var(--border)' }}>
            <th className={TH}>#</th>
            <th className={TH}>Metro</th>
            <th className={THR}>Companies</th>
            <th className={THR}>Revenue</th>
            <th className={`${TH} ${SMCOL}`}>Highest ranked</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <Fragment key={r.metro}>
            <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
              <td className={TD} style={MONO}>
                <button
                  type="button"
                  onClick={() => setOpen((o) => ({ ...o, [r.metro]: !o[r.metro] }))}
                  aria-expanded={!!open[r.metro]}
                  aria-label={`${open[r.metro] ? 'Hide' : 'Show'} the cities inside ${r.metro}`}
                  className="mr-1 w-4 text-left hover:text-[var(--text)]"
                  style={{ color: 'var(--text-dim)' }}
                >
                  {open[r.metro] ? '−' : '+'}
                </button>
                {i + 1}
              </td>
              <td className={TD}>
                {r.slug ? (
                  <Link href={`/rankings/${r.slug}`} className="hover:underline"
                        style={{ color: 'var(--accent, #4f9dff)' }}>
                    {r.metro}
                  </Link>
                ) : r.metro}
                {r.carried === r.companies && r.companies > 0 && (
                  <span className="ml-1 text-[var(--text-dim)]"
                        title="every company in this row was placed by a carried address, not a dated era">°</span>
                )}
              </td>
              <td className={TDR} style={MONO}>{r.companies}</td>
              <td className={TDR} style={MONO}>{fmtRev(r.revenue)}</td>
              <td className={`${TD} ${SMCOL}`}>
                {r.top ? <>#{r.topRank} {r.top}</> : '—'}
              </td>
            </tr>
            {/* The city breakdown. A metro row says Detroit; this says Highland
                Park, Auburn Hills and Southfield, which is the question a metro
                aggregate immediately raises. */}
            {open[r.metro] && r.cities.map((c) => (
              <tr key={`${r.metro}-${c.city}`} className="border-b"
                  style={{ borderColor: 'var(--border)',
                           backgroundColor: 'var(--bg-card)' }}>
                <td className={TD} />
                <td className={`${TD} pl-6 text-[13px] text-[var(--text-muted)]`}>
                  {c.city}
                </td>
                <td className={TDR} style={MONO}>{c.companies}</td>
                <td className={TDR} style={MONO}>{fmtRev(c.revenue)}</td>
                <td className={`${TD} ${SMCOL} text-[13px] text-[var(--text-muted)]`}>
                  {c.top ? <>#{c.topRank} {c.top}</> : '—'}
                </td>
              </tr>
            ))}
            </Fragment>
          ))}
          {rows.length === 0 && (
            <tr><td className={TD} colSpan={5}>No companies placed in {year}.</td></tr>
          )}
        </tbody>
      </TableBox>

      <p className="mt-3 text-xs text-[var(--text-dim)] max-w-3xl">
        <span style={{ color: 'var(--text-dim)' }}>°</span> every company in that row
        was placed by a single published address carried across its whole run, rather
        than by a dated headquarters era. Of {data.meta.rows.toLocaleString()} board
        rows, {data.meta.placedByDatedEra.toLocaleString()} are placed by a dated era,{' '}
        {data.meta.placedByCarriedAddress.toLocaleString()} by a carried address, and{' '}
        {data.meta.unplaced} could not be placed at all and are excluded from these
        totals.
      </p>
    </section>
  );
}
