import { promises as fs } from 'fs';
import path from 'path';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import SoundNav from '../../SoundNav';

interface Scene { slug: string; name: string; metro: string; metro_slug: string; era: string; blurb: string; artists: string[] }
interface Detail { name: string; slug: string; combined: number; bb_no1: number; uk_no1: number; songs: { single: string; chart: string; peak: number; weeks: number; year: number }[] }

async function j<T>(f: string): Promise<T> { return JSON.parse(await fs.readFile(path.join(process.cwd(), 'public', 'data', 'sound', f), 'utf8')) as T; }
function aslug(name: string) { return name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

export async function generateStaticParams() { return (await j<Scene[]>('scenes.json')).map((s) => ({ slug: s.slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const s = (await j<Scene[]>('scenes.json')).find((x) => x.slug === slug);
  return { title: s ? `${s.name}: Sound of the Metros` : 'Scene' };
}
const muted = { color: 'var(--text-muted)' } as const;

export default async function ScenePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [scenes, details] = await Promise.all([j<Scene[]>('scenes.json'), j<Record<string, Detail>>('artists_detail.json')]);
  const s = scenes.find((x) => x.slug === slug);
  if (!s) notFound();
  const members = s.artists.map((n) => details[aslug(n)]).filter((d): d is Detail => !!d).sort((a, b) => b.combined - a.combined);
  const total = Math.round(members.reduce((acc, m) => acc + m.combined, 0) * 10) / 10;
  const songs = members.flatMap((m) => m.songs.map((sg) => ({ ...sg, artist: m.name })))
    .sort((a, b) => a.peak - b.peak || b.weeks - a.weeks).slice(0, 20);
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <SoundNav />
      <p className="mb-1 text-xs" style={muted}><Link href="/sound/scenes" className="hover:underline">Scenes</Link> / Scene</p>
      <h1 className="text-2xl font-bold tracking-tight">{s.name}</h1>
      <p className="mt-1 text-sm" style={muted}>
        <Link href={`/rankings/${s.metro_slug}`} className="underline hover:text-[var(--accent)]">{s.metro}</Link>{' '}
        <Link href={`/sound/metros/${s.metro_slug}`} title="Sound profile">&#9834;</Link> · {s.era} · combined {total}
      </p>
      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed">{s.blurb}</p>
      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide" style={muted}>Artists</h2>
          <ol className="space-y-1 text-sm">{members.map((m) => (
            <li key={m.slug} className="flex justify-between gap-2">
              <a href={`/sound/artists/${m.slug}`} className="hover:underline">{m.name}</a>
              <span className="tabular-nums" style={muted}>{m.combined}</span></li>))}</ol>
        </section>
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide" style={muted}>Signature songs</h2>
          <ol className="space-y-1 text-sm">{songs.map((sg, i) => (
            <li key={i} className="truncate">&ldquo;{sg.single}&rdquo; <span className="text-xs" style={muted}>: {sg.artist} · {sg.chart} #{sg.peak} ({sg.year})</span></li>))}</ol>
        </section>
      </div>
    </main>
  );
}
