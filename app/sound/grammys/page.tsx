import { promises as fs } from 'fs';
import path from 'path';
import SoundNav from '../SoundNav';
import GrammysView, { type Ceremony } from './GrammysView';

export const metadata = { title: 'Grammy Big Four — Sound of the Metros' };

interface HubData { meta: { note: string; years: string }; ceremonies: Ceremony[] }

export default async function GrammysPage() {
  const data = JSON.parse(
    await fs.readFile(path.join(process.cwd(), 'public', 'data', 'sound', 'grammys.json'), 'utf8'),
  ) as HubData;
  const muted = { color: 'var(--text-muted)' } as const;
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <SoundNav />
      <h1 className="text-2xl font-bold tracking-tight">Grammy Big Four</h1>
      <p className="mt-1 mb-5 text-sm" style={muted}>
        Every Album, Record, and Song of the Year and Best New Artist nominee, {data.meta.years}. Winners in gold; artist
        names link to their Sound of the Metros profile where we track them. This is the prestige signal behind the{' '}
        <a href="/sound/artists" className="underline hover:text-[var(--accent)]">artist rankings</a>.
      </p>
      <GrammysView ceremonies={data.ceremonies} />
    </main>
  );
}
