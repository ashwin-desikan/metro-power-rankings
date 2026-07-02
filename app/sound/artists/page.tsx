import { promises as fs } from 'fs';
import path from 'path';
import SoundNav from '../SoundNav';
import ArtistsTable, { type ArtistRow, type ByPeriod } from './ArtistsTable';

async function j<T>(f: string): Promise<T> {
  return JSON.parse(await fs.readFile(path.join(process.cwd(), 'public', 'data', 'sound', f), 'utf8')) as T;
}

export const metadata = {
  title: 'Sound of the Metros — Artists',
  description: 'Every attributed artist with hometown metro and per-chart top-ten record, 1958 to 2026.',
};

export default async function SoundArtistsPage() {
  const [artists, byPeriod] = await Promise.all([
    j<ArtistRow[]>('artists.json'),
    j<ByPeriod>('artists_by_period.json'),
  ]);
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <SoundNav />
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Artists</h1>
        <p className="mt-2 max-w-2xl text-sm" style={{ color: 'var(--text-muted)' }}>
          {artists.length.toLocaleString()} attributed artists, each tied to a canonical
          hometown metro, with separate Billboard and UK top-ten records. Search, sort by chart, or
          pick a decade or year to rank artists by the score they earned in that window. Combined blends singles with an album pillar (worldwide album sales, weighted 0.5), which is why album-era acts like Pink Floyd and Led Zeppelin appear.
        </p>
      </header>
      <ArtistsTable artists={artists} byPeriod={byPeriod} />
    </main>
  );
}
