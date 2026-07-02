import { promises as fs } from 'fs';
import path from 'path';
import SoundNav from '../SoundNav';
import RS500View, { type RSAlbum } from './RS500View';

export const metadata = { title: "Rolling Stone's 500 Greatest Albums — Sound of the Metros" };

export default async function RS500Page() {
  const data = JSON.parse(
    await fs.readFile(path.join(process.cwd(), 'public', 'data', 'sound', 'rolling_stone_500.json'), 'utf8'),
  ) as { list: string; albums: RSAlbum[] };
  const muted = { color: 'var(--text-muted)' } as const;
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <SoundNav />
      <h1 className="text-2xl font-bold tracking-tight">Rolling Stone&rsquo;s 500 Greatest Albums</h1>
      <p className="mt-1 mb-5 text-sm" style={muted}>
        The 2023 edition of Rolling Stone&rsquo;s all-time album canon. Each placement feeds an artist&rsquo;s prestige
        score, weighted by rank, and appears as a crimson badge on their profile. Artist names link where we track them.
        This is one input to the{' '}
        <a href="/sound/artists" className="underline hover:text-[var(--accent)]">artist rankings</a>.
      </p>
      <RS500View albums={data.albums} />
    </main>
  );
}
