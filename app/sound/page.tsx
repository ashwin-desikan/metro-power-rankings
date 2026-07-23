import { promises as fs } from 'fs';
import path from 'path';
import SoundNav from './SoundNav';
import SoundHub, { type SoundMetro, type LensConfig } from './SoundHub';
import { soundDatasetJsonLd, serializeJsonLd } from '@/lib/seo';

type SoundSummary = { generated?: string; metros?: number; attributed_artists?: number };

async function readJSON<T>(rel: string): Promise<T> {
  const p = path.join(process.cwd(), 'public', 'data', 'sound', rel);
  return JSON.parse(await fs.readFile(p, 'utf8')) as T;
}

async function load() {
  const [metros, lensesDoc, summary] = await Promise.all([
    readJSON<SoundMetro[]>('metros_unified.json'),
    readJSON<{ lenses: LensConfig[] }>('lenses.json'),
    readJSON<SoundSummary>('summary.json').catch(() => ({}) as SoundSummary),
  ]);
  return { metros, lenses: lensesDoc.lenses, summary };
}

export const metadata = {
  title: 'The Sound of the Metros',
  description:
    'Chart top-ten success by artist hometown, 1958 to 2026, across three geographies: origin, Velvet Rock affinity, and production.',
};

export default async function SoundPage() {
  const { metros, lenses, summary } = await load();
  // dateModified rides the pillar's own freshness stamp, so the structured data
  // is always exactly as fresh as the data itself — no separate maintenance.
  const dataset = soundDatasetJsonLd({
    dateModified: summary.generated ?? '2026-07-22',
    metros: summary.metros,
    artists: summary.attributed_artists,
  });
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(dataset) }}
      />
      <SoundNav />
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">The Sound of the Metros</h1>
        <p className="mt-2 max-w-2xl text-sm" style={{ color: 'var(--text-muted)' }}>
          One metro, three geographies. Where the artists are <em>from</em>, which
          metros lean toward <em>Velvet Rock</em>, and where the records were
          physically <em>made</em>. Toggle the lens; the map and the ranking
          re-sort. Diamond-marked metros appear only on the production map.
        </p>
      </header>
      <SoundHub metros={metros} lenses={lenses} />

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>More from Sound</h2>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          {[['/sound/scenes','Scenes','The moments a metro owned the sound'],['/sound/number-ones','Number-One Machines','Who topped the chart most'],['/sound/reigns','Longest Reigns','The songs that lived longest in the top ten'],['/sound/disagreements','Chart Disagreements','Where the US and UK could not agree'],['/sound/transatlantic','The Transatlantic Divide','US-facing vs UK-facing metros'],['/sound/christmas','UK December #1s','The Christmas number-one race'],['/sound/velvet-rock','Velvet Rock','The producer map, 1974 to 1989']].map(([href,title,desc])=>(
            <a key={href} href={href} className="rounded-lg border p-3 hover:border-[var(--accent)]" style={{ borderColor: 'var(--border, #222b36)' }}>
              <div className="text-sm font-semibold">{title}</div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{desc}</div>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
