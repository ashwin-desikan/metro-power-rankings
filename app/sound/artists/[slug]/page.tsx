import { promises as fs } from 'fs';
import path from 'path';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import SoundNav from '../../SoundNav';
import SortTable, { type Col } from '../../SortTable';
import { GrammyBadges } from '../../GrammyBadges';

interface Song { single: string; chart: string; peak: number; year: number; weeks: number; credit?: string; grammy?: string }
interface Artist {
  name: string; slug: string; metro: string | null; metro_slug: string | null;
  bb_no1: number; bb_top10: number; uk_no1: number; uk_top10: number;
  combined: number; album_raw?: number; album_est?: boolean; active: string; peak_year?: number; songs: Song[];
  prestige?: number; gram_wins?: number; gram_noms?: number; gram_awards?: { year: number; award: string; work?: string | null }[];
}

async function readAll(): Promise<Record<string, Artist>> {
  return JSON.parse(await fs.readFile(path.join(process.cwd(), 'public', 'data', 'sound', 'artists_detail.json'), 'utf8'));
}
export async function generateStaticParams() {
  const a = JSON.parse(await fs.readFile(path.join(process.cwd(), 'public', 'data', 'sound', 'artists.json'), 'utf8')) as { slug: string }[];
  return a.map((x) => ({ slug: x.slug }));
}
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = (await readAll())[slug];
  return { title: a ? `${a.name} — Sound of the Metros` : 'Artist — Sound of the Metros' };
}
const muted = { color: 'var(--text-muted)' } as const;
const SONG_COLS: Col[] = [
  { key: 'single', label: 'Single' },
  { key: 'credit', label: 'Artist', mut: true },
  { key: 'chart', label: 'Chart', mut: true },
  { key: 'peak', label: 'Peak', numeric: true, align: 'right', kind: 'peak' },
  { key: 'weeks', label: 'Weeks', numeric: true, align: 'right', mut: true },
  { key: 'year', label: 'Year', numeric: true, align: 'right', mut: true },
];

export default async function ArtistPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = (await readAll())[slug];
  if (!a) notFound();
  const hasGrammy = a.songs.some((s) => s.grammy);
  const songCols: Col[] = hasGrammy ? [...SONG_COLS, { key: 'grammy', label: 'Grammy', kind: 'grammy' }] : SONG_COLS;
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <SoundNav />
      <p className="mb-1 text-xs" style={muted}>
        <Link href="/sound/artists" className="hover:underline">Artists</Link> / Artist
      </p>
      <h1 className="text-2xl font-bold tracking-tight">{a.name}</h1>
      <p className="mt-1 text-sm" style={muted}>
        {a.metro && (
          <>
            From{' '}
            <Link href={`/rankings/${a.metro_slug}`} className="underline hover:text-[var(--accent)]">{a.metro}</Link>{' '}
            <Link href={`/sound/metros/${a.metro_slug}`} title="Sound profile">&#9834;</Link>
            {' · '}
          </>
        )}
        active {a.active}{a.peak_year ? ` · peak ${a.peak_year}` : ''}
      </p>
      <GrammyBadges awards={a.gram_awards} className="mt-3" />
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border, #222b36)' }}>
          <div className="text-xs" style={muted}>Combined</div><div className="text-lg font-bold tabular-nums">{a.combined}</div>
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border, #222b36)' }}>
          <div className="text-xs" style={muted}>US #1 / Top 10</div><div className="text-lg font-bold tabular-nums">{a.bb_no1} / {a.bb_top10}</div>
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border, #222b36)' }}>
          <div className="text-xs" style={muted}>UK #1 / Top 10</div><div className="text-lg font-bold tabular-nums">{a.uk_no1} / {a.uk_top10}</div>
        </div>
        {a.album_raw ? (
          <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border, #222b36)' }}>
            <div className="text-xs" style={muted}>Album sales (M){a.album_est ? ' (est.)' : ''}</div><div className="text-lg font-bold tabular-nums">{a.album_raw}</div>
          </div>
        ) : null}
        {a.prestige ? (
          <div className="rounded-lg border p-3" style={{ borderColor: 'rgba(212,175,55,0.4)' }}>
            <div className="text-xs" style={muted}>Grammy prestige</div><div className="text-lg font-bold tabular-nums" style={{ color: '#e8c766' }}>{a.prestige}</div>
          </div>
        ) : null}
      </div>
      <h2 className="mt-6 mb-2 text-sm font-bold uppercase tracking-wide" style={muted}>Top-ten singles ({a.songs.length})</h2>
      <SortTable rows={a.songs as unknown as Record<string, unknown>[]} cols={songCols} initialSort="peak" initialDir="asc" />
    </main>
  );
}
