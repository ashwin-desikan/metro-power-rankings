'use client';

import { useSessionState } from '@/lib/useSessionState';
import SortTable, { type Col } from '../../sound/SortTable';
import type { CanonFilm } from '@/lib/screen';

const chip = (on: boolean) => ({
  background: on ? '#4f9dff' : 'transparent',
  color: on ? '#0e1116' : 'var(--text-muted)',
  border: '1px solid var(--border, #222b36)',
});

// early cinema (1888-1919) is a handful of landmark shorts — one chip, not four
const decOf = (y: number) => (y < 1920 ? 1910 : Math.floor(y / 10) * 10);
const decLabel = (d: number) => (d === 1910 ? 'Pre-1920' : `${d}s`);

export default function CanonView({ films }: { films: CanonFilm[] }) {
  const decades = Array.from(new Set(films.map((f) => decOf(f.year)))).sort((a, b) => a - b);
  const [decadeRaw, setDecade] = useSessionState<number>('mpr.screen.canon.decade', 0);
  const [yearRaw, setYear] = useSessionState<number>('mpr.screen.canon.year', 0);
  const decade = decades.includes(decadeRaw) ? decadeRaw : 0;
  const yearsInDec = decade
    ? Array.from(new Set(films.filter((f) => decOf(f.year) === decade).map((f) => f.year))).sort((a, b) => a - b)
    : [];
  const year = decade && yearsInDec.includes(yearRaw) ? yearRaw : 0;
  const filtered = films.filter(
    (f) => (decade === 0 || decOf(f.year) === decade) && (year === 0 || f.year === year),
  );
  const hasRatings = films.some((f) => f.rating != null);

  const cols: Col[] = [
    { key: 'listRank', label: '#', align: 'right', numeric: true },
    { key: 'title', label: 'Film', bold: true },
    { key: 'year', label: 'Year', align: 'right', numeric: true },
    { key: 'director', label: 'Director', mut: true },
    { key: 'metroName', label: 'Set in', kind: 'rmetro', metroSlugKey: 'metro' },
    ...(hasRatings ? [{ key: 'rating', label: 'TMDb', align: 'right', numeric: true, mut: true } as Col] : []),
    { key: 'hit', label: 'Hit', mut: true },
  ];
  const rows = filtered.map((f) => ({
    listRank: f.rank,
    title: f.title,
    year: f.year,
    director: f.directors.map((d) => d.name).join(', '),
    metroName: f.setting ? `${f.setting.metroName}${f.setting.via === 'filmed' ? ' (filmed)' : ''}` : '—',
    metro: f.setting?.metro ?? null,
    rating: f.rating ?? null,
    hit: f.topGrosser ? '✓' : '',
  }));

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1">
        <button type="button" onClick={() => { setDecade(0); setYear(0); }} className="rounded-md px-3 py-1.5 text-sm font-semibold" style={chip(decade === 0)}>
          All decades
        </button>
        {decades.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => { setDecade(d); setYear(0); }}
            className="rounded-md px-3 py-1.5 text-sm font-semibold"
            style={chip(d === decade)}
          >
            {decLabel(d)}
          </button>
        ))}
      </div>
      {decade !== 0 ? (
        <div className="mb-3 flex flex-wrap gap-1">
          <button type="button" onClick={() => setYear(0)} className="rounded-md px-2.5 py-1 text-xs font-semibold" style={chip(year === 0)}>
            All years
          </button>
          {yearsInDec.map((y) => (
            <button key={y} type="button" onClick={() => setYear(y)} className="rounded-md px-2.5 py-1 text-xs font-semibold tabular-nums" style={chip(year === y)}>
              {y}
            </button>
          ))}
        </div>
      ) : null}
      <p className="text-xs text-[var(--text-dim)] mb-3">
        {filtered.length === films.length
          ? `All ${films.length} films`
          : `${filtered.length} of ${films.length} films${decade ? ` · ${decade}s` : ''}${year ? ` · ${year}` : ''}`}
      </p>
      <SortTable rows={rows} cols={cols} initialSort="listRank" initialDir="asc" />
      {hasRatings ? (
        <p className="text-xs text-[var(--text-dim)] mt-4">
          Ratings: This product uses the TMDB API but is not endorsed or certified by TMDB.
        </p>
      ) : null}
    </div>
  );
}
