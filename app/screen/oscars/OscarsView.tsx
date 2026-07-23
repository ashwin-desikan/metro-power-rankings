'use client';

import { useMemo, useState } from 'react';
import { useSessionState } from '@/lib/useSessionState';
import type { ScreenCeremony, ScreenOscarNominee } from '@/lib/screen';

const ord = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};
const muted = { color: 'var(--text-muted)' } as const;
const GOLD = '#e8c766';
const ACTING = /^Act(or|ress)/;

function Entry({ label, n }: { label: string; n: ScreenOscarNominee }) {
  const actingFirst = ACTING.test(label);
  const names = n.names.join(', ');
  return (
    <span style={n.winner ? { color: GOLD, fontWeight: 600 } : undefined}>
      {actingFirst ? (
        <>{names}{n.film ? <span> — {n.film}</span> : null}</>
      ) : (
        <>{n.film || names}{n.film && names ? <span> — {names}</span> : null}</>
      )}
    </span>
  );
}

function CategoryCard({ label, nominees }: { label: string; nominees: ScreenOscarNominee[] }) {
  return (
    <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border, #222b36)' }}>
      <h3 className="mb-2 text-sm font-bold uppercase tracking-wide" style={muted}>{label}</h3>
      <ul className="space-y-1.5 text-sm">
        {nominees.map((n, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden style={{ color: n.winner ? GOLD : 'transparent', width: '1em' }}>★</span>
            <Entry label={label} n={n} />
          </li>
        ))}
      </ul>
    </div>
  );
}

interface Match { year: number; yearLabel: string; category: string; film: string; names: string[]; winner: boolean; big6: boolean }

export default function OscarsView({ ceremonies }: { ceremonies: ScreenCeremony[] }) {
  const list = [...ceremonies].sort((a, b) => b.ceremony - a.ceremony);
  const [cerRaw, setCer] = useSessionState<number>('mpr.screen.oscars.ceremony', list[0].ceremony);
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const current = list.find((c) => c.ceremony === cerRaw) ?? list[0];

  const matches = useMemo(() => {
    if (!term) return null;
    const out: Match[] = [];
    for (const c of ceremonies) {
      for (const cat of c.big6) {
        for (const n of cat.nominees) {
          const hay = `${n.film} ${n.names.join(' ')} ${cat.label}`.toLowerCase();
          if (hay.includes(term)) out.push({ year: c.filmYear ?? 0, yearLabel: c.yearLabel, category: cat.label, film: n.film, names: n.names, winner: n.winner, big6: true });
        }
      }
      for (const o of c.others) {
        const hay = `${o.film} ${o.names.join(' ')} ${o.category}`.toLowerCase();
        if (hay.includes(term)) out.push({ year: c.filmYear ?? 0, yearLabel: c.yearLabel, category: o.category, film: o.film, names: o.names, winner: true, big6: false });
      }
    }
    out.sort((a, b) => b.year - a.year);
    return out;
  }, [term, ceremonies]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold" style={muted}>Ceremony</label>
        <select
          value={current.ceremony}
          onChange={(e) => setCer(Number(e.target.value))}
          disabled={!!term}
          className="rounded-md border bg-transparent px-2 py-1 text-sm disabled:opacity-40"
          style={{ borderColor: 'var(--border, #222b36)', color: 'var(--text, #e6edf3)' }}
        >
          {list.map((c) => (
            <option key={c.ceremony} value={c.ceremony} style={{ background: '#0e1116' }}>
              {c.yearLabel} ({ord(c.ceremony)})
            </option>
          ))}
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search any film, name or category, all years…"
          className="w-80 rounded-md border bg-transparent px-3 py-1.5 text-sm"
          style={{ borderColor: 'var(--border, #222b36)', color: 'var(--text, #e6edf3)' }}
        />
        {term ? (
          <button type="button" onClick={() => setQ('')} className="rounded-md border px-3 py-1.5 text-sm" style={{ borderColor: 'var(--border, #222b36)', color: 'var(--text-muted)' }}>
            Clear
          </button>
        ) : null}
      </div>

      {matches ? (
        <div>
          <p className="mb-3 text-xs" style={muted}>{matches.length} result{matches.length === 1 ? '' : 's'} for &ldquo;{q.trim()}&rdquo;. Winners in gold; Big Six nominations included, other categories winners-only.</p>
          <ul className="space-y-1.5 text-sm">
            {matches.slice(0, 200).map((m, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden style={{ color: m.winner ? GOLD : 'transparent', width: '1em' }}>★</span>
                <span>
                  <span className="tabular-nums" style={muted}>{m.yearLabel}</span>{' · '}
                  <span style={muted}>{m.category}</span>{' · '}
                  <span style={m.winner ? { color: GOLD, fontWeight: 600 } : undefined}>
                    {ACTING.test(m.category) ? `${m.names.join(', ')}${m.film ? ` — ${m.film}` : ''}` : `${m.film || m.names.join(', ')}${m.film && m.names.length ? ` — ${m.names.join(', ')}` : ''}`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div>
          <div className="mb-3 flex items-baseline justify-between flex-wrap gap-2">
            <h2 className="text-lg font-bold text-[var(--text)]">{ord(current.ceremony)} Academy Awards</h2>
            <p className="text-xs" style={muted}>honouring the films of {current.yearLabel}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {current.big6.map((cat) => (
              <CategoryCard key={cat.label} label={cat.label} nominees={cat.nominees} />
            ))}
          </div>
          {current.others.length > 0 ? (
            <div className="mt-4 rounded-lg border p-4" style={{ borderColor: 'var(--border, #222b36)' }}>
              <h3 className="mb-1 text-xs font-bold uppercase tracking-wide" style={{ color: '#d69f6e' }}>The rest of the night</h3>
              <p className="mb-3 text-xs" style={muted}>Winners of every other competitive and honorary award of the ceremony.</p>
              <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2 text-xs">
                {current.others.map((o, i) => (
                  <li key={i}>
                    <span style={muted}>{o.category}: </span>
                    <span>
                      {o.film ? <span className="font-medium text-[var(--text)]">{o.film}</span> : null}
                      {o.film && o.names.length ? <span style={muted}> — </span> : null}
                      {o.names.length ? <span style={muted}>{o.names.join(', ')}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
      <p className="text-xs text-[var(--text-dim)] mt-4">
        The Big Six categories show every nominee, winners starred in gold; scientific and
        technical awards are presented separately by the Academy and omitted. Data: the open
        oscar_data project (BSD-2-Clause).
      </p>
    </div>
  );
}
