import Link from 'next/link';
import { getAllMetros, getMeta } from '@/lib/data';
import { tierName } from '@/lib/tiers';
import HomeMap from './HomeMap';
import MetroSearch, { type SearchEntry } from './MetroSearch';

// Home console: the map-plus-sidecar zone that sits directly under the
// compressed hero. Replaces the old stats grid as the first interactive
// surface a visitor sees. Map on the left (about 60% width at md+), search
// and top-five on the right. Both stacks collapse to vertical on narrow
// viewports without losing any of the three components.
//
// All data is read server-side via lib/data so metros.json never crosses
// to the client; we ship only the slim SearchEntry list to MetroSearch.
export default function HomeConsole() {
  const metros = getAllMetros();
  const meta = getMeta();

  // Slim entry list for client-side autocomplete. Stripping every field
  // except what the dropdown renders keeps the JS payload small (~150KB
  // gzipped for the full corpus vs ~1.6MB for the raw metros.json).
  const searchEntries: SearchEntry[] = metros.map((m) => ({
    rank: m.rank,
    slug: m.slug,
    name: m.name,
    country: m.country,
    primaryCity: m.primaryCity,
    score: m.score,
    tierName: tierName(m.score),
  }));

  const topFive = metros
    .filter((m) => m.rank > 0)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 5);

  // Top 250 metros for the editorial map. Shipped as a slim shape (no
  // dimension breakdown, no team rosters) to keep the home-page payload
  // small. The map ignores any row without lat/lon.
  const mapMetros = metros
    .filter((m) => m.rank > 0 && typeof m.lat === 'number' && typeof m.lon === 'number')
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 250)
    .map((m) => ({
      rank: m.rank,
      slug: m.slug,
      name: m.name,
      country: m.country,
      primaryCity: m.primaryCity,
      primaryState: m.primaryState,
      score: m.score,
      lat: m.lat,
      lon: m.lon,
    }));

  // Format the lastUpdate stamp. meta.lastUpdate is ISO-ish (YYYY-MM-DD);
  // render as Mon DD, YYYY to match the /updates page convention.
  const lastUpdateLabel = (() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(meta.lastUpdate || '');
    if (!m) return meta.lastUpdate || '';
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[parseInt(m[2], 10) - 1]} ${parseInt(m[3], 10)}, ${m[1]}`;
  })();

  return (
    <section className="px-4 sm:px-6 lg:px-8 pb-6 border-b" style={{ borderColor: 'var(--border)' }}>
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Map column - 60% on lg+, stacks above sidecar on smaller widths. */}
          <div className="lg:col-span-3">
            <HomeMap initialMetros={mapMetros} />
            <div
              className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px]"
              style={{ color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}
            >
              <span className="inline-flex items-center gap-1">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ background: '#7c3aed' }}
                  aria-hidden="true"
                />
                Global Capital
              </span>
              <span className="inline-flex items-center gap-1">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ background: '#2563eb' }}
                  aria-hidden="true"
                />
                Continental
              </span>
              <span className="inline-flex items-center gap-1">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ background: '#0891b2' }}
                  aria-hidden="true"
                />
                Major
              </span>
              <span className="inline-flex items-center gap-1">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ background: '#16a34a' }}
                  aria-hidden="true"
                />
                Regional
              </span>
              <span className="inline-flex items-center gap-1">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ background: '#6b7280' }}
                  aria-hidden="true"
                />
                Lower tiers
              </span>
            </div>
          </div>

          {/* Sidecar - search and top 5. 40% on lg+, full-width on smaller. */}
          <aside className="lg:col-span-2 flex flex-col gap-3">
            <div>
              <div
                className="text-[10px] tracking-widest mb-1.5 uppercase"
                style={{ color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}
              >
                Find your city
              </div>
              <MetroSearch entries={searchEntries} />
            </div>

            <div
              className="rounded-lg border p-3"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-center justify-between mb-2">
                <div
                  className="text-[10px] tracking-widest uppercase"
                  style={{ color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}
                >
                  Top 5
                </div>
                <div
                  className="text-[10px]"
                  style={{ color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}
                >
                  Updated {lastUpdateLabel}
                </div>
              </div>
              <ul className="space-y-1.5">
                {topFive.map((m) => (
                  <li key={m.slug}>
                    <Link
                      href={`/rankings/${m.slug}`}
                      className="flex items-center justify-between gap-2 py-0.5 px-1 rounded hover:bg-[var(--bg-hover,rgba(255,255,255,0.04))] transition-colors"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className="inline-block w-5 text-right text-xs"
                          style={{
                            color: 'var(--text-muted)',
                            fontFamily: "'JetBrains Mono', monospace",
                          }}
                        >
                          {m.rank}
                        </span>
                        <span className="text-sm truncate" style={{ color: 'var(--text)' }}>
                          {m.name}
                        </span>
                      </span>
                      <span
                        className="text-xs whitespace-nowrap"
                        style={{
                          color: 'var(--text-muted)',
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      >
                        {m.score.toFixed(1)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div
                className="mt-2.5 pt-2.5 flex items-center justify-between text-[11px] border-t"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              >
                <Link href="/random" className="hover:text-[var(--accent)] transition-colors">
                  Random metro &rarr;
                </Link>
                <Link href="/compare" className="hover:text-[var(--accent)] transition-colors">
                  Compare &rarr;
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
