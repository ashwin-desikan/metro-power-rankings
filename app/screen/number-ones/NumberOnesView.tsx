'use client';

import { useSessionState } from '@/lib/useSessionState';
import type { N1Film, N1Year } from '@/lib/screen';

const chip = (on: boolean) => ({
  background: on ? '#4f9dff' : 'transparent',
  color: on ? '#0e1116' : 'var(--text-muted)',
  border: '1px solid var(--border, #222b36)',
});
const muted = { color: 'var(--text-muted)' } as const;
const GOLD = '#e8c766';

const gross = (n: number | null) =>
  n == null ? '—' : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}m` : `$${Math.round(n / 1e3)}k`;

function Badges({ f }: { f: N1Film }) {
  return (
    <>
      {f.bestPicture ? <span className="ml-1.5 text-[9px] uppercase tracking-wider" style={{ color: GOLD }}>BP</span> : null}
      {f.canonRank != null ? <span className="ml-1.5 text-[9px] uppercase tracking-wider text-[var(--accent)]">canon #{f.canonRank}</span> : null}
    </>
  );
}

export default function NumberOnesView({ films, years }: { films: Record<string, N1Film>; years: N1Year[] }) {
  const decades = Array.from(new Set(years.map((y) => Math.floor(y.year / 10) * 10))).sort((a, b) => b - a);
  const [decadeRaw, setDecade] = useSessionState<number>('mpr.screen.n1.decade', decades[0]);
  const [yearRaw, setYear] = useSessionState<number>('mpr.screen.n1.year', 0);
  const [desc, setDesc] = useSessionState<boolean>('mpr.screen.n1.desc', true);
  const decade = decades.includes(decadeRaw) ? decadeRaw : decades[0];
  const yearsInDec = years.filter((y) => Math.floor(y.year / 10) * 10 === decade).map((y) => y.year).sort((a, b) => b - a);
  const year = yearsInDec.includes(yearRaw) ? yearRaw : 0;
  const shown = years
    .filter((y) => Math.floor(y.year / 10) * 10 === decade && (year === 0 || y.year === year))
    .sort((a, b) => (desc ? b.year - a.year : a.year - b.year));

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1">
        {decades.map((d) => (
          <button key={d} type="button" onClick={() => { setDecade(d); setYear(0); }}
            className="rounded-md px-3 py-1.5 text-sm font-semibold" style={chip(d === decade)}>
            {`${d}s`}
          </button>
        ))}
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-1">
        <button type="button" onClick={() => setYear(0)} className="rounded-md px-2.5 py-1 text-xs font-semibold" style={chip(year === 0)}>
          All years
        </button>
        {yearsInDec.map((y) => (
          <button key={y} type="button" onClick={() => setYear(y)} className="rounded-md px-2.5 py-1 text-xs font-semibold tabular-nums" style={chip(year === y)}>
            {y}
          </button>
        ))}
        <span className="mx-1.5 h-4 w-px" style={{ backgroundColor: 'var(--border, #222b36)' }} aria-hidden />
        <button
          type="button"
          onClick={() => setDesc(!desc)}
          className="rounded-md px-2.5 py-1 text-xs font-semibold"
          style={chip(false)}
          title="Flip the order of the weekly runs"
        >
          {desc ? 'Newest first ↓' : 'Oldest first ↑'}
        </button>
      </div>

      <div className="grid gap-5">
        {shown.map((y) => {
          // consecutive same-film weeks collapse into one row with a week count
          const runs: { target: string; from: string; to: string; n: number; peak: number | null }[] = [];
          for (const w of y.weeks) {
            const last = runs[runs.length - 1];
            if (last && last.target === w.target) {
              last.to = w.date; last.n += 1;
              last.peak = Math.max(last.peak ?? 0, w.gross ?? 0) || last.peak;
            } else {
              runs.push({ target: w.target, from: w.date, to: w.date, n: 1, peak: w.gross });
            }
          }
          const ordered = desc ? [...runs].reverse() : runs;
          return (
            <section key={y.year} className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <div className="px-4 py-3 flex flex-wrap items-baseline justify-between gap-2" style={{ backgroundColor: 'var(--bg-card)' }}>
                <h2 className="text-lg font-bold text-[var(--text)] tabular-nums">{y.year}</h2>
                <p className="text-xs" style={muted}>{y.weeks.length} chart weeks · {runs.length} different №1 runs</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]">
                    <tr>
                      <th className="text-left px-4 py-1.5">From</th>
                      <th className="text-left px-4 py-1.5">Film</th>
                      <th className="text-right px-4 py-1.5">Weeks</th>
                      <th className="text-right px-4 py-1.5">Best week</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordered.map((r, i) => {
                      const f = films[r.target];
                      return (
                        <tr key={r.target + i} className="border-t" style={{ borderColor: 'var(--border)' }}>
                          <td className="px-4 py-1.5 tabular-nums text-[var(--text-dim)]">{r.from.slice(5)}</td>
                          <td className="px-4 py-1.5 font-medium text-[var(--text)]">
                            {f?.title ?? r.target}
                            {f ? <Badges f={f} /> : null}
                          </td>
                          <td className="px-4 py-1.5 text-right tabular-nums" style={r.n >= 5 ? { color: GOLD, fontWeight: 600 } : muted}>{r.n}</td>
                          <td className="px-4 py-1.5 text-right tabular-nums" style={muted}>{gross(r.peak)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
      <p className="text-xs text-[var(--text-dim)] mt-4">
        Weekly Variety charts through 1981, weekend box office (Box Office Mojo via Wikipedia)
        from 1982. Consecutive weeks at №1 are collapsed into runs; five-week-plus runs in gold.
        BP marks Best Picture winners; canon # links the film&apos;s rank in the 500 Greatest.
      </p>
    </div>
  );
}
