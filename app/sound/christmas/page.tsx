import { promises as fs } from 'fs';
import path from 'path';
import SoundNav from '../SoundNav';

interface Song { single: string; artist: string; artist_slug: string; metro: string | null; peak_date: string }
async function load(): Promise<Record<string, Song[]>> { return JSON.parse(await fs.readFile(path.join(process.cwd(), 'public', 'data', 'sound', 'uk_december_number_ones.json'), 'utf8')); }
export const metadata = { title: 'The UK December Number Ones: Sound of the Metros' };
const muted = { color: 'var(--text-muted)' } as const;

export default async function ChristmasPage() {
  const data = await load();
  const years = Object.keys(data).sort((a, b) => Number(b) - Number(a));
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <SoundNav />
      <h1 className="text-2xl font-bold tracking-tight">The UK December Number Ones</h1>
      <p className="mt-2 mb-6 max-w-2xl text-sm" style={muted}>
        Every single that reached number one in the UK during December, the closest proxy in this data to the Christmas number one. The last entry in each year is the one that held the top over the holiday.
      </p>
      <div className="space-y-3">
        {years.map((y) => (
          <div key={y} className="flex gap-4">
            <div className="w-12 shrink-0 text-sm font-bold tabular-nums" style={muted}>{y}</div>
            <div className="text-sm">
              {data[y].map((s, i) => (
                <span key={i}>
                  {i > 0 && <span style={muted}> · </span>}
                  &ldquo;{s.single}&rdquo; <span style={muted}>: <a href={`/sound/artists/${s.artist_slug}`} className="hover:underline">{s.artist}</a>{s.metro ? ` (${s.metro})` : ''}</span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
