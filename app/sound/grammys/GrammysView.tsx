'use client';

import { useMemo, useState } from 'react';

interface Link { name: string; slug: string; linked: boolean }
interface Nominee { work: string | null; artist: string; winner: boolean; links: Link[] }
interface Category { label: string; winner: { work: string | null; artist: string; links: Link[] } | null; nominees: Nominee[]; not_awarded?: boolean }
export interface Ceremony { year: number; categories: Record<string, Category> }

const ORDER = ['album_of_the_year', 'record_of_the_year', 'song_of_the_year', 'best_new_artist'];
const muted = { color: 'var(--text-muted)' } as const;
const GOLD = '#e8c766';

function Credits({ links, artist }: { links: Link[]; artist: string }) {
  if (!links || links.length === 0) return <span>{artist}</span>;
  return (
    <>
      {links.map((l, i) => (
        <span key={i}>
          {i > 0 ? ', ' : ''}
          {l.linked ? (
            <a href={`/sound/artists/${l.slug}`} className="hover:underline">{l.name}</a>
          ) : (
            <span>{l.name}</span>
          )}
        </span>
      ))}
    </>
  );
}

function CategoryCard({ cat }: { cat: Category }) {
  return (
    <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border, #222b36)' }}>
      <h3 className="mb-2 text-sm font-bold uppercase tracking-wide" style={muted}>{cat.label}</h3>
      {cat.not_awarded ? (
        <p className="text-sm" style={muted}>Not awarded this year.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {cat.nominees.map((n, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden style={{ color: n.winner ? GOLD : 'transparent', width: '1em' }}>★</span>
              <span style={n.winner ? { color: GOLD, fontWeight: 600 } : undefined}>
                {n.work ? <span>{n.work} — </span> : null}
                <Credits links={n.links} artist={n.artist} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function GrammysView({ ceremonies }: { ceremonies: Ceremony[] }) {
  const years = ceremonies.map((c) => c.year);
  const [year, setYear] = useState(years[0]);
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!term) return null;
    const out: { year: number; label: string; nominee: Nominee }[] = [];
    for (const c of ceremonies) {
      for (const key of ORDER) {
        const cat = c.categories[key];
        if (!cat || cat.not_awarded) continue;
        for (const n of cat.nominees) {
          const hay = `${n.work ?? ''} ${n.artist} ${n.links.map((l) => l.name).join(' ')}`.toLowerCase();
          if (hay.includes(term)) out.push({ year: c.year, label: cat.label, nominee: n });
        }
      }
    }
    return out;
  }, [term, ceremonies]);

  const current = ceremonies.find((c) => c.year === year);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold" style={muted}>Ceremony</label>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          disabled={!!term}
          className="rounded-md border bg-transparent px-2 py-1 text-sm disabled:opacity-40"
          style={{ borderColor: 'var(--border, #222b36)', color: 'var(--text, #e6edf3)' }}
        >
          {ceremonies.map((c) => (
            <option key={c.year} value={c.year} style={{ background: '#0e1116' }}>{c.year}</option>
          ))}
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search any artist or work, all years…"
          className="w-72 rounded-md border bg-transparent px-3 py-1.5 text-sm"
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
          <p className="mb-3 text-xs" style={muted}>{matches.length} nominee row{matches.length === 1 ? '' : 's'} match “{q.trim()}”. Winners in gold.</p>
          <ul className="space-y-1.5 text-sm">
            {matches.map((m, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden style={{ color: m.nominee.winner ? GOLD : 'transparent', width: '1em' }}>★</span>
                <span>
                  <span className="tabular-nums" style={muted}>{m.year}</span>{' · '}
                  <span style={muted}>{m.label}</span>{' · '}
                  <span style={m.nominee.winner ? { color: GOLD, fontWeight: 600 } : undefined}>
                    {m.nominee.work ? <span>{m.nominee.work} — </span> : null}
                    <Credits links={m.nominee.links} artist={m.nominee.artist} />
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : current ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {ORDER.map((k) => current.categories[k] ? <CategoryCard key={k} cat={current.categories[k]} /> : null)}
        </div>
      ) : null}
    </div>
  );
}
