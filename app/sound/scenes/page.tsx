import { promises as fs } from 'fs';
import path from 'path';
import Link from 'next/link';
import SoundNav from '../SoundNav';

interface Scene { slug: string; name: string; metro: string; metro_slug: string; era: string; blurb: string; artists: string[] }
async function load(): Promise<Scene[]> { return JSON.parse(await fs.readFile(path.join(process.cwd(), 'public', 'data', 'sound', 'scenes.json'), 'utf8')); }
export const metadata = { title: 'Scenes — Sound of the Metros' };
const muted = { color: 'var(--text-muted)' } as const;

export default async function ScenesPage() {
  const scenes = await load();
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <SoundNav />
      <h1 className="text-2xl font-bold tracking-tight">Scenes</h1>
      <p className="mt-2 mb-6 max-w-2xl text-sm" style={muted}>The moments a single metro briefly owned the sound of the world. Curated.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {scenes.map((s) => (
          <Link key={s.slug} href={`/sound/scenes/${s.slug}`} className="block rounded-lg border p-4 hover:border-[var(--accent)]" style={{ borderColor: 'var(--border, #222b36)' }}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-lg font-bold">{s.name}</h2>
              <span className="text-xs tabular-nums" style={muted}>{s.era}</span>
            </div>
            <div className="mb-2 text-sm" style={muted}>{s.metro}</div>
            <p className="text-sm">{s.blurb}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
