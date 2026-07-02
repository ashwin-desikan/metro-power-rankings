import { promises as fs } from 'fs';
import path from 'path';
import SoundNav from '../SoundNav';
import SortTable, { type Col } from '../SortTable';

interface R { single: string; artist: string; artist_slug: string; metro: string | null; chart: string; weeks: number; peak: number; year: number }
async function load(): Promise<R[]> { return JSON.parse(await fs.readFile(path.join(process.cwd(), 'public', 'data', 'sound', 'longest_reigns.json'), 'utf8')); }
export const metadata = { title: 'Longest Reigns — Sound of the Metros' };
const muted = { color: 'var(--text-muted)' } as const;
const COLS: Col[] = [
  { key: 'weeks', label: 'Weeks', numeric: true, align: 'right', bold: true },
  { key: 'single', label: 'Single' },
  { key: 'artist', label: 'Artist', kind: 'artist', slugKey: 'artist_slug' },
  { key: 'metro', label: 'Metro', mut: true },
  { key: 'chart', label: 'Chart', mut: true },
  { key: 'peak', label: 'Peak', numeric: true, align: 'right', mut: true },
  { key: 'year', label: 'Year', numeric: true, align: 'right', mut: true },
];

export default async function ReignsPage() {
  const rows = (await load()).slice(0, 120);
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <SoundNav />
      <h1 className="text-2xl font-bold tracking-tight">Longest Reigns</h1>
      <p className="mt-2 mb-6 max-w-2xl text-sm" style={muted}>The singles that lived longest in the top ten, by total weeks. US and UK. Click any column to re-sort.</p>
      <SortTable rows={rows as unknown as Record<string, unknown>[]} cols={COLS} initialSort="weeks" />
    </main>
  );
}
