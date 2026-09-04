import { promises as fs } from 'fs';
import path from 'path';
import SoundNav from '../SoundNav';
import RankingsLens, { type RankMetro } from './RankingsLens';

async function load(): Promise<RankMetro[]> {
  const p = path.join(process.cwd(), 'public', 'data', 'sound', 'metros_unified.json');
  return JSON.parse(await fs.readFile(p, 'utf8')) as RankMetro[];
}

export const metadata = {
  title: 'Sound of the Metros: Rankings',
  description: 'Metro leaderboard across three lenses: origin (US:UK 3:1), Velvet Rock affinity, and production.',
};

export default async function SoundRankingsPage() {
  const metros = await load();
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <SoundNav />
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Rankings</h1>
        <p className="mt-2 max-w-2xl text-sm" style={{ color: 'var(--text-muted)' }}>
          The full metro leaderboard. Switch lens to re-rank. Origin also exposes the
          signature decade, era-distinctiveness, and concentration (score per artist).
        </p>
      </header>
      <RankingsLens metros={metros} />
    </main>
  );
}
