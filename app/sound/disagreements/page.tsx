import { promises as fs } from 'fs';
import path from 'path';
import SoundNav from '../SoundNav';
import SortTable, { type Col } from '../SortTable';

interface D { single: string; artist: string; artist_slug: string; metro: string | null; us: number | null; uk: number | null; kind: string; year: number; gap?: number }
async function load(): Promise<D[]> { return JSON.parse(await fs.readFile(path.join(process.cwd(), 'public', 'data', 'sound', 'chart_disagreements.json'), 'utf8')); }
export const metadata = { title: 'Chart Disagreements: Sound of the Metros' };
const muted = { color: 'var(--text-muted)' } as const;
const COLS: Col[] = [
  { key: 'single', label: 'Single' },
  { key: 'artist', label: 'Artist', kind: 'artist', slugKey: 'artist_slug' },
  { key: 'metro', label: 'Metro', mut: true },
  { key: 'us', label: 'US', kind: 'pk', numeric: true, align: 'right' },
  { key: 'uk', label: 'UK', kind: 'pk', numeric: true, align: 'right' },
  { key: 'year', label: 'Year', numeric: true, align: 'right', mut: true },
];

export default async function DisagreementsPage() {
  const rows = (await load()).slice(0, 150);
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <SoundNav />
      <h1 className="text-2xl font-bold tracking-tight">Chart Disagreements</h1>
      <p className="mt-2 mb-6 max-w-2xl text-sm" style={muted}>
        Singles the two countries could not agree on: a #1 on one side of the Atlantic that missed the top ten on the other, or a wide peak gap. A dash means the song never reached that chart&rsquo;s top ten. Click any column to re-sort.
      </p>
      <SortTable rows={rows as unknown as Record<string, unknown>[]} cols={COLS} initialSort="gap" />
    </main>
  );
}
