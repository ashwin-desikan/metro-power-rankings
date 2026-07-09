import { promises as fs } from 'fs';
import path from 'path';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import SoundNav from '../../SoundNav';
import SortTable, { type Col } from '../../SortTable';
import { BadgeRow } from '../../GrammyBadges';

interface Song { single: string; chart: string; peak: number; year: number; weeks: number; credit?: string; grammy?: string; grammy_won?: boolean }
interface Artist {
  name: string; slug: string; metro: string | null; metro_slug: string | null;
  bb_no1: number; bb_top10: number; uk_no1: number; uk_top10: number;
  combined: number; album_raw?: number; album_est?: boolean; active: string; peak_year?: number; songs: Song[];
  city?: string | null; prestige?: number; gram_wins?: number; gram_noms?: number;
  gram_awards?: { year: number; award: string; work?: string | null }[]; gram_nom_awards?: { year: number; award: string; work?: string | null }[];
  other_awards?: { award: string; year: number; category: string; work?: string | null }[];
  rs_albums?: { rank: number; album: string }[];
}

async function readAll(): Promise<Record<string, Artist>> {
  return JSON.parse(await fs.readFile(path.join(process.cwd(), 'public', 'data', 'sound', 'artists_detail.json'), 'utf8'));
}

// Pre-generate only the ~300 most notable artists by prestige score, not all
// 2,579 - the long tail is still reachable: dynamicParams=true renders it on
// first request and the long revalidate caches the result, same pattern as
// app/states/[slug]/page.tsx and app/teams/football/[slug]/page.tsx. This was
// the single largest static route in the whole site and a major contributor
// to Vercel build/deploy time on every single deploy.
export const dynamicParams = true;
export const revalidate = 31536000; // 1 year — effectively static

export async function generateStaticParams() {
  const a = JSON.parse(await fs.readFile(path.join(process.cwd(), 'public', 'data', 'sound', 'artists.json'), 'utf8')) as { slug: string; prestige?: number }[];
  return a
    .slice()
    .sort((x, y) => (y.prestige ?? 0) - (x.prestige ?? 0))
    .slice(0, 300)
    .map((x) => ({ slug: x.slug }));
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
            {a.city ? <>{a.city}{' · '}</> : null}
            <Link href={`/rankings/${a.metro_slug}`} className="underline hover:text-[var(--accent)]">{a.metro}</Link>{' '}
            <Link href={`/sound/metros/${a.metro_slug}`} title="Sound profile">&#9834;</Link>
            {' · '}
          </>
        )}
        active {a.active}{a.peak_year ? ` · peak ${a.peak_year}` : ''}
      </p>
      <BadgeRow wins={a.gram_awards} noms={a.gram_nom_awards} others={a.other_awards} className="mt-3" />
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border, #222b36)' }}>
          <div className="text-xs" style={muted}>Combined</div><div className="text-lg font-bold tabular-nums">{a.combined.toFixed(2)}</div>
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border, #222b36)' }}>
          <div className="text-xs" style={muted}>US #1 / Top 10</div><div className="text-lg font-bold tabular-nums">{a.bb_no1} / {a.bb_top10}</div>
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border, #222b36)' }}>
          <div className="text-xs" style={muted}>UK #1 / Top 10</div><div className="text-lg font-bold tabular-nums">{a.uk_no1} / {a.uk_top10}</div>
        </div>
        {a.album_raw ? (
          <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border, #222b36)' }}>
            <div className="text-xs" style={muted}>Album sales{a.album_est ? ' (est.)' : ''}</div><div className="text-lg font-bold tabular-nums">{a.album_raw}M</div>
          </div>
        ) : null}
        {a.prestige ? (
          <div className="rounded-lg border p-3" style={{ borderColor: 'rgba(212,175,55,0.4)' }}>
            <div className="text-xs" style={muted}>Grammy prestige</div><div className="text-lg font-bold tabular-nums" style={{ color: '#e8c766' }}>{a.prestige?.toFixed(2)}</div>
          </div>
        ) : null}
      </div>
      {a.rs_albums && a.rs_albums.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide" style={{ color: '#e08a8a' }}>
            On <a href="/sound/rolling-stone-500" className="hover:underline">Rolling Stone&rsquo;s 500 Greatest Albums</a> ({a.rs_albums.length})
          </h2>
          <ol className="space-y-1 text-sm">
            {a.rs_albums.map((x) => (
              <li key={x.rank} className="flex gap-3">
                <span className="tabular-nums font-semibold" style={{ color: '#e08a8a', minWidth: '2.5rem' }}>#{x.rank}</span>
                <span>{x.album}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      <h2 className="mt-6 mb-2 text-sm font-bold uppercase tracking-wide" style={muted}>Top-ten singles ({a.songs.length})</h2>
      <SortTable rows={a.songs as unknown as Record<string, unknown>[]} cols={songCols} initialSort="year" initialDir="desc" />
    </main>
  );
}
