'use client';

import { useMemo, useState } from 'react';

interface Link { name: string; slug: string; linked: boolean }
export interface RSAlbum { rank: number; album: string; artist: string; links: Link[] }

const muted = { color: 'var(--text-muted)' } as const;
const CRIMSON = '#e08a8a';

function Artists({ links, artist }: { links: Link[]; artist: string }) {
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

export default function RS500View({ albums }: { albums: RSAlbum[] }) {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const rows = useMemo(() => {
    if (!term) return albums;
    return albums.filter((a) => `${a.album} ${a.artist} ${a.links.map((l) => l.name).join(' ')}`.toLowerCase().includes(term));
  }, [albums, term]);

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search album or artist…"
          className="w-72 rounded-md border bg-transparent px-3 py-1.5 text-sm"
          style={{ borderColor: 'var(--border, #222b36)', color: 'var(--text, #e6edf3)' }}
        />
        <span className="text-xs" style={muted}>{rows.length} of {albums.length}</span>
      </div>
      {/* Mobile: stacked cards instead of a 3-column table */}
      <div className="grid grid-cols-1 gap-2 sm:hidden">
        {rows.map((a) => (
          <div key={a.rank} className="rounded-lg border p-3" style={{ borderColor: 'var(--border, #1b2330)' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="font-medium text-sm leading-tight">{a.album}</div>
              <div className="text-sm font-semibold tabular-nums flex-shrink-0" style={{ color: CRIMSON }}>#{a.rank}</div>
            </div>
            <div className="mt-1 text-sm" style={muted}><Artists links={a.links} artist={a.artist} /></div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto hidden sm:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left">
              <th className="py-2 pr-3 text-right" style={muted}>#</th>
              <th className="py-2 pr-3" style={muted}>Album</th>
              <th className="py-2 pr-3" style={muted}>Artist</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.rank} className="border-t" style={{ borderColor: 'var(--border, #1b2330)' }}>
                <td className="py-1.5 pr-3 text-right tabular-nums font-semibold" style={{ color: CRIMSON }}>{a.rank}</td>
                <td className="py-1.5 pr-3">{a.album}</td>
                <td className="py-1.5 pr-3" style={muted}><Artists links={a.links} artist={a.artist} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
