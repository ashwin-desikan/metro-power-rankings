import { getAllMetros, getMetroDetail, formatDimValue, formatPop, formatMarketCap, formatGdp, type MetroDetail } from '@/lib/data';
import MetroPicker from './MetroPicker';

export const metadata = {
  title: 'Compare Metros | Global Metro Power Rankings',
  description:
    'Side-by-side comparison of up to four metros across sixteen dimensions of the Global Metro Power Rankings.',
};

const DEFAULT_SLUGS = ['new-york', 'london', 'tokyo', 'paris'];
const MAX_METROS = 4;

const DIMENSION_ORDER: { key: string; label: string; group: string }[] = [
  { key: 'marketCap', label: 'Market Cap', group: 'Economy' },
  { key: 'companies', label: 'Major Companies', group: 'Economy' },
  { key: 'majorLeagueTeams', label: 'Major League Teams', group: 'Sports' },
  { key: 'totalTeams', label: 'Total Teams', group: 'Sports' },
  { key: 'majorSportingEvents', label: 'Major Sporting Events', group: 'Sports' },
  { key: 'universities', label: 'Universities', group: 'Education' },
  { key: 'topUniHospResearch', label: 'Top Hospitals & Research', group: 'Education' },
  { key: 'culturalEvents', label: 'Annual Cultural Events', group: 'Culture' },
  { key: 'museumsLandmarks', label: 'Museums & Landmarks', group: 'Culture' },
  { key: 'luxuryStars', label: 'Michelin & Luxury Stars', group: 'Culture' },
  { key: 'airportScore', label: 'Airport Score', group: 'Infrastructure' },
  { key: 'portsExchangesInfra', label: 'Ports, Exchanges, Infra', group: 'Infrastructure' },
  { key: 'metroStations', label: 'Metro Stations', group: 'Infrastructure' },
  { key: 'suburbStations', label: 'Commuter Rail', group: 'Infrastructure' },
  { key: 'trainHubs', label: 'Intercity Train Hubs', group: 'Infrastructure' },
  { key: 'skyscrapers', label: 'Skyscrapers (150m+)', group: 'Infrastructure' },
];

function parseRank(rankStr: string | null | undefined): number {
  if (!rankStr) return Infinity;
  const clean = rankStr.replace(/^T-/, '');
  const n = parseInt(clean, 10);
  return Number.isFinite(n) ? n : Infinity;
}

function computeWinners(details: MetroDetail[]): Record<string, Set<string>> {
  const winners: Record<string, Set<string>> = {};
  if (details.length < 2) return winners;
  for (const { key } of DIMENSION_ORDER) {
    let bestRank = Infinity;
    for (const d of details) {
      const r = parseRank(d.dimRanks?.[key]);
      if (r < bestRank) bestRank = r;
    }
    if (!Number.isFinite(bestRank)) continue;
    const set = new Set<string>();
    for (const d of details) {
      if (parseRank(d.dimRanks?.[key]) === bestRank) set.add(d.metro.slug);
    }
    winners[key] = set;
  }
  return winners;
}

function normalizeSlugs(raw: string | string[] | undefined): string[] {
  if (!raw) return DEFAULT_SLUGS;
  const list = Array.isArray(raw) ? raw : [raw];
  const cleaned = list
    .flatMap((s) => s.split(','))
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const deduped = Array.from(new Set(cleaned)).slice(0, MAX_METROS);
  return deduped.length > 0 ? deduped : DEFAULT_SLUGS;
}

interface PageProps {
  searchParams: Promise<{ m?: string | string[] }>;
}

export default async function ComparePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const requested = normalizeSlugs(params.m);

  const details: MetroDetail[] = [];
  const missing: string[] = [];
  for (const slug of requested) {
    const d = getMetroDetail(slug);
    if (d) details.push(d);
    else missing.push(slug);
  }

  const allMetros = getAllMetros();
  const pickerMetros = allMetros
    .map((m) => ({ slug: m.slug, name: m.name, country: m.country, rank: m.rank }))
    .sort((a, b) => a.rank - b.rank);

  const winners = computeWinners(details);
  const selectedSlugs = details.map((d) => d.metro.slug);

  return (
    <div style={{ backgroundColor: 'var(--bg)', color: 'var(--text)' }}>
      <main className="pt-28 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <p
            className="text-sm font-semibold tracking-widest mb-4 uppercase"
            style={{
              color: 'var(--accent)',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            Compare
          </p>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Compare Metros
          </h1>
          <p className="text-lg text-[var(--text-muted)] mb-8 max-w-3xl">
            Pick up to {MAX_METROS} metros and see how they stack up across the
            sixteen dimensions of the Global Metro Power Rankings. The highest
            global rank in each row is highlighted. Every comparison is a
            shareable link.
          </p>

          <MetroPicker
            allMetros={pickerMetros}
            selectedSlugs={selectedSlugs}
            maxSelected={MAX_METROS}
          />

          {missing.length > 0 && (
            <p className="mt-4 text-sm text-[var(--text-muted)]">
              Unknown metros skipped: {missing.join(', ')}
            </p>
          )}

          {details.length === 0 ? (
            <p className="mt-12 text-[var(--text-muted)]">
              No metros selected. Use the picker above to add a metro.
            </p>
          ) : (
            <div className="mt-10">
              <CompareDesktop details={details} winners={winners} />
              <CompareMobile details={details} winners={winners} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function MetroColumnHeader({ d }: { d: MetroDetail }) {
  return (
    <div>
      <a
        href={`/rankings/${d.metro.slug}`}
        className="block hover:text-[var(--accent)] transition"
      >
        <div className="text-xs text-[var(--text-muted)] uppercase tracking-wide">
          {d.metro.country}
        </div>
        <div className="text-xl font-bold mt-1 leading-tight">
          {d.metro.name}
        </div>
      </a>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div
          className="rounded border px-2 py-1"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="text-[var(--text-muted)]">Rank</div>
          <div
            className="font-bold text-[var(--accent)]"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            #{d.metro.rank}
          </div>
        </div>
        <div
          className="rounded border px-2 py-1"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="text-[var(--text-muted)]">Score</div>
          <div
            className="font-bold text-[var(--accent)]"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {d.metro.score.toFixed(1)}
          </div>
        </div>
        <div
          className="rounded border px-2 py-1"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="text-[var(--text-muted)]">Population</div>
          <div
            className="font-semibold"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {formatPop(d.metro.pop)}
          </div>
        </div>
        <div
          className="rounded border px-2 py-1"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="text-[var(--text-muted)]">GDP</div>
          <div
            className="font-semibold"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {formatGdp(d.metro.gdp)}
          </div>
        </div>
      </div>
    </div>
  );
}

function DimensionCell({
  d,
  dimKey,
  isWinner,
}: {
  d: MetroDetail;
  dimKey: string;
  isWinner: boolean;
}) {
  const value = d.metro.dims?.[dimKey];
  const rank = d.dimRanks?.[dimKey];
  const hasValue = typeof value === 'number' && value > 0;
  return (
    <div
      className="flex items-baseline justify-between gap-3"
      style={{ color: isWinner ? 'var(--accent)' : 'var(--text)' }}
    >
      <span
        className="font-semibold"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {hasValue ? formatDimValue(dimKey, value) : '\u2014'}
      </span>
      <span
        className="text-xs text-[var(--text-muted)]"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {rank ? `#${rank}` : ''}
      </span>
    </div>
  );
}

function CompareDesktop({
  details,
  winners,
}: {
  details: MetroDetail[];
  winners: Record<string, Set<string>>;
}) {
  const groupedDims = DIMENSION_ORDER.reduce<Record<string, typeof DIMENSION_ORDER>>(
    (acc, dim) => {
      (acc[dim.group] ||= []).push(dim);
      return acc;
    },
    {},
  );
  const gridCols = `200px repeat(${details.length}, minmax(0, 1fr))`;

  return (
    <div className="hidden md:block">
      <div
        className="rounded-lg border overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--border)',
        }}
      >
        <div
          className="grid gap-0 p-6 border-b"
          style={{ gridTemplateColumns: gridCols, borderColor: 'var(--border)' }}
        >
          <div></div>
          {details.map((d) => (
            <div key={d.metro.slug} className="px-3">
              <MetroColumnHeader d={d} />
            </div>
          ))}
        </div>
        {Object.entries(groupedDims).map(([group, dims]) => (
          <div key={group}>
            <div
              className="grid gap-0 px-6 py-2 border-b text-xs uppercase tracking-wider text-[var(--text-muted)]"
              style={{
                gridTemplateColumns: gridCols,
                borderColor: 'var(--border)',
                backgroundColor: 'var(--bg-card-hover)',
              }}
            >
              <div className="font-semibold">{group}</div>
            </div>
            {dims.map((dim, idx) => (
              <div
                key={dim.key}
                className="grid gap-0 px-6 py-3 border-b"
                style={{
                  gridTemplateColumns: gridCols,
                  borderColor: 'var(--border)',
                  backgroundColor:
                    idx % 2 === 0 ? 'var(--bg-card)' : 'transparent',
                }}
              >
                <div className="text-sm">{dim.label}</div>
                {details.map((d) => (
                  <div key={d.metro.slug} className="px-3">
                    <DimensionCell
                      d={d}
                      dimKey={dim.key}
                      isWinner={
                        winners[dim.key]?.has(d.metro.slug) ?? false
                      }
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function CompareMobile({
  details,
  winners,
}: {
  details: MetroDetail[];
  winners: Record<string, Set<string>>;
}) {
  return (
    <div className="md:hidden space-y-6">
      {details.map((d) => (
        <div
          key={d.metro.slug}
          className="rounded-lg border p-5"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border)',
          }}
        >
          <MetroColumnHeader d={d} />
          <div className="mt-5 space-y-3">
            {DIMENSION_ORDER.map((dim) => (
              <div
                key={dim.key}
                className="flex items-baseline justify-between border-b pb-2"
                style={{ borderColor: 'var(--border)' }}
              >
                <span className="text-sm">{dim.label}</span>
                <DimensionCell
                  d={d}
                  dimKey={dim.key}
                  isWinner={winners[dim.key]?.has(d.metro.slug) ?? false}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
