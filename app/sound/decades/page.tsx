import { promises as fs } from 'fs';
import path from 'path';
import SoundNav from '../SoundNav';
import DecadesView, { type DecadesData } from './DecadesView';

async function load(): Promise<DecadesData> {
  const p = path.join(process.cwd(), 'public', 'data', 'sound', 'decades.json');
  return JSON.parse(await fs.readFile(p, 'utf8')) as DecadesData;
}

export const metadata = {
  title: 'Sound of the Metros — Decades',
  description: 'Which metro owned each decade, 1950s to 2020s, with the era-defining artists and songs.',
};

export default async function SoundDecadesPage() {
  const data = await load();
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <SoundNav />
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Decades</h1>
        <p className="mt-2 max-w-2xl text-sm" style={{ color: 'var(--text-muted)' }}>
          Who owned each decade. Pick an era to see the leading metros, the artists
          who defined it, and the highest-scoring songs. Scores are era-normalized and weighted US:UK 3:1.
        </p>
      </header>
      <DecadesView data={data} />
    </main>
  );
}
