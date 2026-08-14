'use client';

import { useEffect, useRef } from 'react';

import { useSessionState } from '@/lib/useSessionState';
import type { ScreenYear } from '@/lib/screen';

const gross = (n: number) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(2)}bn` : n >= 1e6 ? `$${Math.round(n / 1e6).toLocaleString('en-US')}m` : `$${Math.round(n / 1e3)}k`;

const chip = (on: boolean) => ({
  background: on ? '#4f9dff' : 'transparent',
  color: on ? '#0e1116' : 'var(--text-muted)',
  border: '1px solid var(--border, #222b36)',
});

export default function YearsView({ years }: { years: ScreenYear[] }) {
  const decades = Array.from(new Set(years.map((y) => Math.floor(y.year / 10) * 10))).sort((a, b) => b - a);
  const [decadeRaw, setDecade] = useSessionState<number>('mpr.screen.years.decade', decades[0]);
  const [yearRaw, setYear] = useSessionState<number>('mpr.screen.years.year', 0);

  // `/screen/years?year=1994` opens on that year, so the Time Machine hub can
  // hand a reader straight here.
  //
  // An effect rather than an initialiser, for the same reason as the Power
  // Atlas: this component server-renders, so reading `window` during render
  // would be a hydration mismatch. It also has to be an effect anyway, because
  // the state it sets is backed by sessionStorage.
  //
  // ⚠️ IT FIRES ONCE AND THEN NEVER AGAIN. Without the ref it would re-apply
  // the URL year every time the component re-rendered, and the reader would
  // find the year chips fighting back every time they clicked one.
  const consumed = useRef(false);
  useEffect(() => {
    if (consumed.current) return;
    consumed.current = true;
    const q = parseInt(new URLSearchParams(window.location.search).get('year') ?? '', 10);
    if (!Number.isFinite(q) || !years.some((y) => y.year === q)) return;
    setDecade(Math.floor(q / 10) * 10);
    setYear(q);
  }, [years, setDecade, setYear]);

  const decade = decades.includes(decadeRaw) ? decadeRaw : decades[0];
  const yearsInDec = years
    .filter((y) => Math.floor(y.year / 10) * 10 === decade)
    .map((y) => y.year)
    .sort((a, b) => b - a);
  const year = yearsInDec.includes(yearRaw) ? yearRaw : 0;
  const shown = years
    .filter((y) => Math.floor(y.year / 10) * 10 === decade && (year === 0 || y.year === year))
    .sort((a, b) => b.year - a.year);

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1">
        {decades.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => { setDecade(d); setYear(0); }}
            className="rounded-md px-3 py-1.5 text-sm font-semibold"
            style={chip(d === decade)}
          >
            {`${d}s`}
          </button>
        ))}
      </div>
      <div className="mb-5 flex flex-wrap gap-1">
        <button type="button" onClick={() => setYear(0)} className="rounded-md px-2.5 py-1 text-xs font-semibold" style={chip(year === 0)}>
          All years
        </button>
        {yearsInDec.map((y) => (
          <button key={y} type="button" onClick={() => setYear(y)} className="rounded-md px-2.5 py-1 text-xs font-semibold tabular-nums" style={chip(year === y)}>
            {y}
          </button>
        ))}
      </div>

      <div className="grid gap-5">
        {shown.map((y) => (
          <section key={y.year} className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <div className="px-4 py-3 flex flex-wrap items-baseline justify-between gap-2" style={{ backgroundColor: 'var(--bg-card)' }}>
              <h2 className="text-lg font-bold text-[var(--text)] tabular-nums">{y.year}</h2>
              {y.awards ? (
                <p className="text-xs text-[var(--text-muted)]">
                  {y.awards.picture ? <><span className="font-semibold text-[var(--text)]">Best Picture:</span> {y.awards.picture.film}</> : null}
                  {y.awards.director ? <>{' · '}<span className="font-semibold">Director:</span> {y.awards.director.name}</> : null}
                  {y.awards.actor ? <>{' · '}<span className="font-semibold">Actor:</span> {y.awards.actor.name}</> : null}
                  {y.awards.actress ? <>{' · '}<span className="font-semibold">Actress:</span> {y.awards.actress.name}</> : null}
                </p>
              ) : (
                <p className="text-xs text-[var(--text-dim)]">Before the first Academy Awards (1929)</p>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]">
                  <tr>
                    <th className="text-left px-4 py-1.5 w-8">#</th>
                    <th className="text-left px-4 py-1.5">Film</th>
                    <th className="text-right px-4 py-1.5">{y.basis === 'rentals' ? 'Rentals' : 'Worldwide gross'}</th>
                    <th className="text-left px-4 py-1.5">Genre</th>
                    <th className="text-left px-4 py-1.5">Director</th>
                    <th className="text-right px-4 py-1.5">TMDb</th>
                  </tr>
                </thead>
                <tbody>
                  {y.films.map((fl, i) => (
                    <tr key={fl.title + i} className="border-t" style={{ borderColor: 'var(--border)', opacity: fl.tmdb ? 0.72 : 1 }}>
                      <td className="px-4 py-1.5 tabular-nums text-[var(--text-dim)]">{i + 1}</td>
                      <td className="px-4 py-1.5 font-medium text-[var(--text)]">
                        {fl.title}
                        {fl.tmdb ? <span className="ml-1.5 text-[9px] uppercase tracking-wider text-[var(--text-dim)]">tmdb</span> : null}
                      </td>
                      <td className="px-4 py-1.5 text-right tabular-nums text-[var(--text-muted)]">{gross(fl.gross)}</td>
                      <td className="px-4 py-1.5 text-[var(--text-muted)]">{fl.genre || '—'}</td>
                      <td className="px-4 py-1.5 text-[var(--text-muted)]">{fl.directors.join(', ') || '—'}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums text-[var(--text-muted)]">{fl.rating != null ? fl.rating.toFixed(1) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
      <p className="text-xs text-[var(--text-dim)] mt-4">
        Years before the late 1970s are generally reported as US rentals rather than worldwide
        gross — comparable within a year, not across eras. Award winners are shown against the
        year of the films they honoured, not the ceremony date. Rows marked <span className="uppercase text-[9px] tracking-wider">tmdb</span> extend
        the top ten with TMDb revenue data (1960 onward). This product uses the TMDB API but is
        not endorsed or certified by TMDB.
      </p>
    </div>
  );
}
