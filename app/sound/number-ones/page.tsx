import { promises as fs } from 'fs';
import path from 'path';
import SoundNav from '../SoundNav';
import SortTable, { type Col } from '../SortTable';

interface A { name: string; slug: string; bb_no1: number; uk_no1: number; metro: string; metro_slug: string }
interface N { metro: string; count: number }
async function j<T>(f: string): Promise<T> {
  return JSON.parse(await fs.readFile(path.join(process.cwd(), 'public', 'data', 'sound', f), 'utf8')) as T;
}
export const metadata = { title: 'Number-One Machines: Sound of the Metros' };
const muted = { color: 'var(--text-muted)' } as const;
const A_COLS: Col[] = [
  { key: 'rank', label: '#', kind: 'rank', align: 'right' },
  { key: 'name', label: 'Artist', kind: 'artist', slugKey: 'slug' },
  { key: 'bb_no1', label: 'US', numeric: true, align: 'right', mut: true },
  { key: 'uk_no1', label: 'UK', numeric: true, align: 'right', mut: true },
  { key: 'total', label: 'Total', numeric: true, align: 'right', bold: true },
];
const M_COLS: Col[] = [
  { key: 'rank', label: '#', kind: 'rank', align: 'right' },
  { key: 'metro', label: 'Metro', kind: 'metro', metroSlugKey: 'slug' },
  { key: 'count', label: '#1s', numeric: true, align: 'right', bold: true },
];

export default async function NumberOnesPage() {
  const [artists, no1] = await Promise.all([j<A[]>('artists.json'), j<Record<string, N>>('metro_number_ones.json')]);
  const topArtists = artists.map((a) => ({ ...a, total: a.bb_no1 + a.uk_no1 })).filter((a) => a.total > 0).sort((x, y) => y.total - x.total).slice(0, 40);
  const topMetros = Object.entries(no1).map(([slug, v]) => ({ slug, ...v })).sort((x, y) => y.count - x.count).slice(0, 40);
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <SoundNav />
      <h1 className="text-2xl font-bold tracking-tight">Number-One Machines</h1>
      <p className="mt-2 mb-6 max-w-2xl text-sm" style={muted}>Who topped the chart most, by artist and by metro, across the US and UK, 1958 to 2026. Click any column to re-sort.</p>
      <div className="grid gap-8 md:grid-cols-2">
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide" style={muted}>Artists by #1 singles</h2>
          <SortTable rows={topArtists as unknown as Record<string, unknown>[]} cols={A_COLS} initialSort="total" />
        </section>
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide" style={muted}>Metros by #1 singles</h2>
          <SortTable rows={topMetros as unknown as Record<string, unknown>[]} cols={M_COLS} initialSort="count" />
        </section>
      </div>
    </main>
  );
}
