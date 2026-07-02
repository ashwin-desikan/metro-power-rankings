import { promises as fs } from 'fs';
import path from 'path';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import SoundNav from '../../SoundNav';

interface DecadeVal { us: number; uk: number; combined: number }
interface Metro {
  slug: string; metro: string; country?: string; combined: number; us_score: number; uk_score: number;
  artist_count: number; signature_decade?: string | null; distinctiveness?: number; score_per_artist?: number;
  by_decade: Record<string, DecadeVal>;
  top_artists: { name: string; slug: string; combined: number }[];
  top_songs: { single: string; artist: string; chart: string; peak: number; year: number; score: number }[];
  lenses: {
    origin: { rank?: number } | null;
    affinity: { vr_tracks: number; vr_artists: number; rank?: number };
    production: { index: number; tier: string; note: string; rank?: number } | null;
  };
}
interface VRTrack { track: string; artist: string; year: number | null; origin_metro: string | null; genres: string[] }

async function readJSON<T>(rel: string): Promise<T> {
  return JSON.parse(await fs.readFile(path.join(process.cwd(), 'public', 'data', 'sound', rel), 'utf8')) as T;
}

export async function generateStaticParams() {
  const metros = await readJSON<{ slug: string }[]>('metros_unified.json');
  return metros.map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const metros = await readJSON<Metro[]>('metros_unified.json');
  const m = metros.find((x) => x.slug === slug);
  return { title: m ? `The Sound of ${m.metro}` : 'Sound of the Metros' };
}

const muted = { color: 'var(--text-muted)' } as const;
const DECS = ['1950s', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];

export default async function MetroProfile({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [metros, vr] = await Promise.all([
    readJSON<Metro[]>('metros_unified.json'),
    readJSON<VRTrack[]>('velvet_rock_tracks.json'),
  ]);
  const m = metros.find((x) => x.slug === slug);
  if (!m) notFound();

  const vrTracks = vr.filter((t) => t.origin_metro === m.metro);
  const maxDec = Math.max(1, ...DECS.map((d) => m.by_decade[d]?.combined ?? 0));

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <SoundNav />
      <p className="mb-1 text-xs" style={muted}>
        <Link href="/sound/rankings" className="hover:underline">Rankings</Link> / Metro
      </p>
      <h1 className="text-2xl font-bold tracking-tight">The Sound of {m.metro}</h1>
      <p className="mt-1 text-sm" style={muted}>
        {m.country}
        {m.lenses.origin?.rank ? ` · #${m.lenses.origin.rank} origin` : ''}
        {m.lenses.production ? ` · #${m.lenses.production.rank} production (${m.lenses.production.tier})` : ''}
        {m.lenses.affinity.vr_tracks ? ` · ${m.lenses.affinity.vr_tracks} Velvet Rock tracks` : ''}
      </p>

      {/* score row */}
      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ['Combined (3:1)', m.combined],
          ['US score', m.us_score],
          ['UK score', m.uk_score],
          ['Attributed artists', m.artist_count],
        ].map(([k, v]) => (
          <div key={k as string} className="rounded-lg border p-3" style={{ borderColor: 'var(--border, #222b36)' }}>
            <div className="text-xs" style={muted}>{k}</div>
            <div className="text-xl font-bold tabular-nums">{v}</div>
          </div>
        ))}
      </div>

      {m.lenses.origin && (
        <p className="mt-3 text-sm" style={muted}>
          Signature decade <b style={{ color: 'var(--text, #e6edf3)' }}>{m.signature_decade}</b>
          {' · '}era-distinctiveness {m.distinctiveness}{' · '}score per artist {m.score_per_artist}
        </p>
      )}

      {/* decade fingerprint */}
      {m.lenses.origin && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide" style={muted}>Decade fingerprint</h2>
          <div className="flex items-end gap-2" style={{ height: 120 }}>
            {DECS.map((d) => {
              const v = m.by_decade[d]?.combined ?? 0;
              const h = Math.round((v / maxDec) * 100);
              const sig = d === m.signature_decade;
              return (
                <div key={d} className="flex flex-1 flex-col items-center justify-end" style={{ height: '100%' }}>
                  <div
                    title={`${d}: ${v}`}
                    style={{ width: '100%', height: `${h}%`, minHeight: v > 0 ? 3 : 0, background: sig ? '#4f9dff' : '#2c3a4d', borderRadius: 3 }}
                  />
                  <div className="mt-1 text-[10px]" style={muted}>{d.replace('s', '')}</div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        {m.top_artists.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide" style={muted}>Top artists</h2>
            <ol className="space-y-1 text-sm">
              {m.top_artists.slice(0, 15).map((a, i) => (
                <li key={a.slug + a.name} className="flex justify-between gap-2">
                  <span className="truncate"><span className="mr-1 text-xs tabular-nums" style={muted}>{i + 1}</span><Link href={`/sound/artists/${a.slug}`} className="hover:underline">{a.name}</Link></span>
                  <span className="tabular-nums" style={muted}>{a.combined}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
        {m.top_songs.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide" style={muted}>Signature songs</h2>
            <ol className="space-y-1 text-sm">
              {m.top_songs.slice(0, 15).map((s, i) => (
                <li key={s.single + i} className="truncate">
                  <span className="mr-1 text-xs tabular-nums" style={muted}>{i + 1}</span>
                  &ldquo;{s.single}&rdquo; <span className="text-xs" style={muted}>— {s.artist} · {s.chart} #{s.peak} ({s.year})</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

      {(m.lenses.production || vrTracks.length > 0) && (
        <section className="mt-8 rounded-lg border p-4" style={{ borderColor: '#5a4a1e' }}>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide" style={{ color: '#ffb64f' }}>Velvet Rock</h2>
          {m.lenses.production && (
            <p className="mb-2 text-sm">
              <b>Production capital</b> · index {m.lenses.production.index} · {m.lenses.production.tier}
              <span className="block text-xs" style={muted}>{m.lenses.production.note}</span>
            </p>
          )}
          {vrTracks.length > 0 && (
            <p className="text-sm">
              <b>{vrTracks.length}</b> Master Tape track{vrTracks.length === 1 ? '' : 's'} by {m.metro} artists:{' '}
              <span style={muted}>{vrTracks.slice(0, 12).map((t) => `${t.track} (${t.artist})`).join(' · ')}{vrTracks.length > 12 ? ' …' : ''}</span>
            </p>
          )}
        </section>
      )}
    </main>
  );
}
