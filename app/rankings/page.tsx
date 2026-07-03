import { getAllMetros, getRegions, regionColors, slugify } from '@/lib/data';
import RankingsTable from '../RankingsTable';
import Link from 'next/link';
import type { Metadata } from 'next';
import { readFileSync } from 'fs';
import { join } from 'path';
import { itemListJsonLd, serializeJsonLd } from '@/lib/seo';

// The metro rankings experience — map, search, filters, table, distribution,
// and regional champions — lives on its own hub now that the homepage has
// become a directory-forward landing page. ISR keeps the hourly cadence in
// step with the rest of the site.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Metro Power Rankings',
  description:
    'Every metropolitan area on Earth, scored across sixteen weighted dimensions. Search, filter by region, and inspect the full leaderboard on the map and table.',
  alternates: { canonical: '/rankings' },
};

function getLastUpdate(): string {
  try {
    const raw = readFileSync(
      join(process.cwd(), 'public', 'data', 'meta.json'),
      'utf-8',
    );
    const meta = JSON.parse(raw) as { lastUpdate?: string };
    return meta.lastUpdate || new Date().toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

// The four ranked indices, presented as siblings. Card 01 is this hub; the
// rest link to their production hubs. Zone Zero Cup is the national
// (country-level) merit index.
const SIBLING_INDICES: { n: string; label: string; href: string }[] = [
  { n: '02', label: 'People', href: '/power' },
  { n: '03', label: 'Countries', href: '/sports/zone-zero-cup' },
  { n: '04', label: 'Artists', href: '/sound/artists' },
];

const eyebrowFont = { fontFamily: "'JetBrains Mono', monospace" } as const;

export default function RankingsHubPage() {
  const metros = getAllMetros();
  const regions = getRegions();
  const lastUpdate = getLastUpdate();
  const top100 = itemListJsonLd(metros.slice(0, 100));

  const scoreDistribution: { label: string; count: number }[] = [
    { label: 'Score 100+', count: metros.filter((m) => m.score >= 100).length },
    { label: 'Score 50–100', count: metros.filter((m) => m.score >= 50 && m.score < 100).length },
    { label: 'Score 20–50', count: metros.filter((m) => m.score >= 20 && m.score < 50).length },
    { label: 'Score 10–20', count: metros.filter((m) => m.score >= 10 && m.score < 20).length },
    { label: 'Score 5–10', count: metros.filter((m) => m.score >= 5 && m.score < 10).length },
    { label: 'Score 1–5', count: metros.filter((m) => m.score >= 1 && m.score < 5).length },
    { label: 'Score <1', count: metros.filter((m) => m.score < 1).length },
  ];

  return (
    <div style={{ backgroundColor: 'var(--bg)', color: 'var(--text)' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(top100) }}
      />

      {/* Header — sibling-index strip + title. */}
      <section className="pt-16 pb-6 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4 text-xs" style={eyebrowFont}>
            <span style={{ color: 'var(--accent)' }} className="uppercase tracking-widest">
              Index / 01 Metros
            </span>
            {SIBLING_INDICES.map((s) => (
              <Link
                key={s.n}
                href={s.href}
                className="uppercase tracking-widest text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors"
              >
                {s.n} {s.label}
              </Link>
            ))}
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-2 leading-tight">
            Metro Power Rankings
          </h1>
          <p className="text-base sm:text-lg text-[var(--text-muted)] max-w-3xl">
            Every populated metropolitan area on Earth, scored across sixteen
            weighted dimensions. Search, filter by continent or region, and read
            the leaderboard on the map and in the table.
          </p>
        </div>
      </section>

      {/* Map + controls + table. */}
      <section
        id="rankings"
        className="pb-16 px-4 sm:px-6 lg:px-8 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="max-w-5xl mx-auto">
          <RankingsTable metros={metros} />
        </div>
      </section>

      {/* Score distribution — 7 tiles across the score bands. */}
      <section
        id="distribution"
        className="py-16 px-4 sm:px-6 lg:px-8 border-b scroll-mt-20"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="max-w-5xl mx-auto">
          <p className="text-xs uppercase tracking-widest mb-2" style={{ ...eyebrowFont, color: 'var(--accent)' }}>
            The spread
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold mb-8">Score distribution</h2>
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            {scoreDistribution.map((band) => (
              <div
                key={band.label}
                className="p-6 rounded-lg border"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
              >
                <div className="text-3xl font-bold" style={{ ...eyebrowFont, color: 'var(--text)' }}>
                  {band.count}
                </div>
                <div className="text-sm text-[var(--text-muted)] mt-2">{band.label}</div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-[var(--text-dim)]" style={eyebrowFont}>
            Updated {lastUpdate}
          </p>
        </div>
      </section>

      {/* Regional champions — top-3 metros and totals per region. */}
      <section
        id="regions"
        className="py-16 px-4 sm:px-6 lg:px-8 border-b scroll-mt-20"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="max-w-5xl mx-auto">
          <p className="text-xs uppercase tracking-widest mb-2" style={{ ...eyebrowFont, color: 'var(--accent)' }}>
            By region
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold mb-8">Regional champions</h2>
          <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            {regions.map((region) => (
              <div
                key={region.name}
                id={`region-${slugify(region.name)}`}
                className="p-6 rounded-lg border transition-colors hover:border-[var(--accent)] scroll-mt-24"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-center gap-2 mb-6">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: regionColors[region.name] || 'var(--text-dim)' }}
                  />
                  <h3 className="text-lg font-bold">{region.name}</h3>
                </div>

                <div className="space-y-3 mb-6">
                  {region.top3.map((metro) => (
                    <Link
                      key={metro.slug}
                      href={`/rankings/${metro.slug}`}
                      className="group flex justify-between items-baseline rounded-md -mx-2 px-2 py-1 transition-colors hover:bg-[var(--bg-card-hover)]"
                    >
                      <div className="flex-1">
                        <div className="text-sm font-semibold group-hover:text-[var(--accent)] transition-colors">
                          {metro.name}
                        </div>
                        <div className="text-xs text-[var(--text-muted)]" style={eyebrowFont}>
                          #{metro.rank}
                        </div>
                      </div>
                      <div className="text-sm font-bold" style={{ ...eyebrowFont, color: 'var(--accent)' }}>
                        {metro.score.toFixed(1)}
                      </div>
                    </Link>
                  ))}
                </div>

                <div className="pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <div className="font-bold" style={{ ...eyebrowFont, color: 'var(--accent)' }}>
                        {region.metros}
                      </div>
                      <div className="text-[var(--text-muted)]">Total metros</div>
                    </div>
                    <div>
                      <div className="font-bold" style={{ ...eyebrowFont, color: 'var(--accent)' }}>
                        {region.above50}
                      </div>
                      <div className="text-[var(--text-muted)]">Score 50+</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
