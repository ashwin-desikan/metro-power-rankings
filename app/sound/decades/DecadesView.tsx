'use client';

import { useSessionState } from '@/lib/useSessionState';

interface DMetro { slug: string; metro: string; us: number; uk: number; combined: number; rank: number }
interface DArtist { name: string; slug: string; metro: string; combined: number }
interface DSong { single: string; artist: string; metro: string; chart: string; peak: number; year: number; score: number }
export interface Decade { metros: DMetro[]; top_artists: DArtist[]; top_songs: DSong[] }
export type DecadesData = Record<string, Decade>;

const muted = { color: 'var(--text-muted)' } as const;

export default function DecadesView({ data }: { data: DecadesData }) {
  const decades = Object.keys(data);
  const [dec, setDec] = useSessionState<string>('mpr.sound.decade', decades.includes('1980s') ? '1980s' : decades[0]);
  const d = data[dec] ?? data[decades[0]];
  const maxMetro = d.metros.length ? d.metros[0].combined : 1;

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-1">
        {decades.map((k) => {
          const on = k === dec;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setDec(k)}
              className="rounded-md px-3 py-1.5 text-sm font-semibold"
              style={{ background: on ? '#4f9dff' : 'transparent', color: on ? '#0e1116' : 'var(--text-muted)', border: '1px solid var(--border, #222b36)' }}
            >
              {k}
            </button>
          );
        })}
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide" style={muted}>Leading metros</h2>
          <ol className="space-y-1">
            {d.metros.slice(0, 15).map((m, i) => (
              <li key={m.slug} className="grid items-center gap-2" style={{ gridTemplateColumns: '20px 1fr 44px' }}>
                <span className="text-right text-xs tabular-nums" style={muted}>{i + 1}</span>
                <span className="relative flex items-center">
                  <span className="absolute h-2 rounded" style={{ width: `${Math.max(3, (m.combined / maxMetro) * 100)}%`, background: '#4f9dff', opacity: 0.35 }} />
                  <a href={`/rankings/${m.slug}`} className="relative z-10 truncate text-sm hover:underline">{m.metro}</a><a href={`/sound/metros/${m.slug}`} title="Sound profile" className="ml-1 text-xs align-middle" style={{ color: 'var(--text-muted)' }}>&#9834;</a>
                </span>
                <span className="text-right text-xs tabular-nums" style={muted}>{m.combined}</span>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide" style={muted}>Defining artists</h2>
          <ol className="space-y-1 text-sm">
            {d.top_artists.slice(0, 12).map((a, i) => (
              <li key={a.slug + a.name} className="flex justify-between gap-2">
                <span className="truncate">
                  <span className="mr-1 text-xs tabular-nums" style={muted}>{i + 1}</span>
                  {a.name} <span className="text-xs" style={muted}>· {a.metro}</span>
                </span>
                <span className="tabular-nums" style={muted}>{a.combined}</span>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide" style={muted}>Signature songs</h2>
          <ol className="space-y-1 text-sm">
            {d.top_songs.slice(0, 12).map((s, i) => (
              <li key={s.single + s.artist + i} className="truncate">
                <span className="mr-1 text-xs tabular-nums" style={muted}>{i + 1}</span>
                &ldquo;{s.single}&rdquo;{' '}
                <span className="text-xs" style={muted}>
                  : {s.artist} · {s.metro} · {s.chart} #{s.peak} ({s.year})
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
