'use client';

import { useMemo, useState } from 'react';

interface Link { name: string; slug: string; linked: boolean }
interface Nominee { work: string | null; artist: string; winner: boolean; links: Link[] }
interface Category { label: string; winner: { work: string | null; artist: string; links: Link[] } | null; nominees: Nominee[]; not_awarded?: boolean }
interface OtherItem { category: string; work: string | null; artist: string; links: Link[] }
interface OtherGroup { award: string; items: OtherItem[] }
export interface Ceremony { year: number; categories: Record<string, Category>; other?: OtherGroup[] }

const ORDER = ['album_of_the_year', 'record_of_the_year', 'song_of_the_year', 'best_new_artist'];
const AWARD_FULL: Record<string, string> = {
  BRIT: 'BRIT Awards', AMA: 'American Music Awards', VMA: 'MTV Video Music Awards',
  EMA: 'MTV Europe Music Awards', ARIA: 'ARIA Awards (Australia)', Juno: 'Juno Awards (Canada)',
};
const muted = { color: 'var(--text-muted)' } as const;
const GOLD = '#e8c766';
const COPPER = '#d69f6e';
const shortCat = (c: string) => c.replace(/ of the Year$/, '').replace(/ Solo Artist$/, '');

function Credits({ links, artist }: { links: Link[]; artist: string }) {
  if (!links || links.length === 0) return <span>{artist}</span>;
  return (
    <>
      {links.map((l, i) => (
        <span key={i}>
          {i > 0 ? ', ' : ''}
          {l.linked ? <a href={`/sound/artists/${l.slug}`} className="hover:underline">{l.name}</a> : <span>{l.name}</span>}
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

function OtherAwards({ groups }: { groups: OtherGroup[] }) {
  if (!groups || groups.length === 0) return null;
  return (
    <div className="mt-4 rounded-lg border p-4" style={{ borderColor: 'var(--border, #222b36)' }}>
      <h3 className="mb-1 text-xs font-bold uppercase tracking-wide" style={{ color: COPPER }}>Also honoured this year</h3>
      <p className="mb-3 text-xs" style={muted}>Winners of the major categories at other award bodies (weighted below the Grammys in the rankings).</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {groups.map((g) => (
          <div key={g.award}>
            <div className="mb-1 text-xs font-semibold" style={{ color: COPPER }}>{AWARD_FULL[g.award] ?? g.award}</div>
            <ul className="space-y-1 text-xs">
              {g.items.map((it, i) => (
                <li key={i}>
                  <span style={muted}>{shortCat(it.category)}: </span>
                  <span>
                    {it.work ? <span style={muted}>{it.work} — </span> : null}
                    <Credits links={it.links} artist={it.artist} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

interface Match { year: number; label: string; work: string | null; artist: string; links: Link[]; winner: boolean; award?: string }

export default function GrammysView({ ceremonies }: { ceremonies: Ceremony[] }) {
  const years = ceremonies.map((c) => c.year);
  const [year, setYear] = useState(years[0]);
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!term) return null;
    const out: Match[] = [];
    for (const c of ceremonies) {
      for (const key of ORDER) {
        const cat = c.categories[key];
        if (!cat || cat.not_awarded) continue;
        for (const n of cat.nominees) {
          const hay = `${n.work ?? ''} ${n.artist} ${n.links.map((l) => l.name).join(' ')}`.toLowerCase();
          if (hay.includes(term)) out.push({ year: c.year, label: cat.label, work: n.work, artist: n.artist, links: n.links, winner: n.winner });
        }
      }
      for (const g of c.other ?? []) {
        for (const it of g.items) {
          const hay = `${it.work ?? ''} ${it.artist} ${it.links.map((l) => l.name).join(' ')}`.toLowerCase();
          if (hay.includes(term)) out.push({ year: c.year, label: shortCat(it.category), work: it.work, artist: it.artist, links: it.links, winner: true, award: g.award });
        }
      }
    }
    out.sort((a, b) => b.year - a.year);
    return out;
  }, [term, ceremonies]);

  const current = ceremonies.find((c) => c.year === year);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold" style={muted}>Year</label>
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
          placeholder="Search any artist or work, all years and awards…"
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
          <p className="mb-3 text-xs" style={muted}>{matches.length} result{matches.length === 1 ? '' : 's'} for “{q.trim()}”. Grammy winners in gold, other-award winners in copper.</p>
          <ul className="space-y-1.5 text-sm">
            {matches.map((m, i) => {
              const color = m.award ? COPPER : m.winner ? GOLD : undefined;
              return (
                <li key={i} className="flex gap-2">
                  <span aria-hidden style={{ color: m.winner ? (m.award ? COPPER : GOLD) : 'transparent', width: '1em' }}>{m.award ? '◆' : '★'}</span>
                  <span>
                    <span className="tabular-nums" style={muted}>{m.year}</span>{' · '}
                    <span style={muted}>{m.award ? `${m.award} · ` : ''}{m.label}</span>{' · '}
                    <span style={color ? { color, fontWeight: 600 } : undefined}>
                      {m.work ? <span>{m.work} — </span> : null}
                      <Credits links={m.links} artist={m.artist} />
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : current ? (
        <div>
          <div className="grid gap-3 sm:grid-cols-2">
            {ORDER.map((k) => current.categories[k] ? <CategoryCard key={k} cat={current.categories[k]} /> : null)}
          </div>
          {current.other ? <OtherAwards groups={current.other} /> : null}
        </div>
      ) : null}
    </div>
  );
}
