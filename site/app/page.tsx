import { getAllMetros, getRegions, formatPop, formatMarketCap, regionColors } from '@/lib/data';
import RankingsTable from './RankingsTable';

export default async function Home() {
  const metros = getAllMetros();
  const regions = getRegions();

  // Calculate score distribution
  const scoreDistribution = {
    '100+': metros.filter((m) => m.score >= 100).length,
    '50-100': metros.filter((m) => m.score >= 50 && m.score < 100).length,
    '20-50': metros.filter((m) => m.score >= 20 && m.score < 50).length,
    '10-20': metros.filter((m) => m.score >= 10 && m.score < 20).length,
    '5-10': metros.filter((m) => m.score >= 5 && m.score < 10).length,
    '1-5': metros.filter((m) => m.score >= 1 && m.score < 5).length,
    '<1': metros.filter((m) => m.score < 1).length,
  };

  return (
    <div style={{ backgroundColor: 'var(--bg)', color: 'var(--text)' }}>
      {/* Navigation Bar */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md border-b"
        style={{
          backgroundColor: 'rgba(8, 8, 13, 0.8)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div
            className="text-lg font-bold tracking-tight"
            style={{ color: 'var(--accent)', fontFamily: "'JetBrains Mono', monospace" }}
          >
            METRO POWER RANKINGS
          </div>
          <div className="hidden md:flex gap-8 items-center">
            <a
              href="#rankings"
              className="text-sm hover:text-[var(--accent)] transition-colors"
            >
              Rankings
            </a>
            <a
              href="#"
              className="text-sm hover:text-[var(--accent)] transition-colors"
            >
              Compare
            </a>
            <a
              href="#regions"
              className="text-sm hover:text-[var(--accent)] transition-colors"
            >
              Regions
            </a>
            <a
              href="#"
              className="text-sm hover:text-[var(--accent)] transition-colors"
            >
              Articles
            </a>
            <a
              href="#"
              className="text-sm hover:text-[var(--accent)] transition-colors"
            >
              Methodology
            </a>
            <input
              type="text"
              placeholder="Search..."
              className="px-3 py-1 bg-[var(--bg-card)] border border-[var(--border)] rounded text-sm text-[var(--text)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section
        className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="max-w-5xl mx-auto text-center">
          <p
            className="text-sm font-semibold tracking-widest mb-4 uppercase"
            style={{
              color: 'var(--accent)',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            Citizen of Nowhere
          </p>
          <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
            Global Metro<br />Power Rankings
          </h1>
          <p className="text-lg text-[var(--text-muted)] mb-8 max-w-2xl mx-auto">
            16 dimensions across 4,285 metropolitan areas spanning 237 countries.
            A data-driven measure of what makes a city matter globally.
          </p>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-12">
            {[
              { label: 'Metros', value: '4,285' },
              { label: 'Dimensions', value: '16' },
              { label: 'Countries', value: '237' },
              { label: 'Data Points', value: '230K+' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="p-4 rounded-lg border"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border)',
                }}
              >
                <div
                  className="text-2xl font-bold"
                  style={{
                    color: 'var(--accent)',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {stat.value}
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-1">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Rankings Table Section */}
      <section
        id="rankings"
        className="py-20 px-4 sm:px-6 lg:px-8 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="max-w-7xl mx-auto">
          <RankingsTable metros={metros} />
        </div>
      </section>

      {/* Score Distribution Section */}
      <section
        className="py-20 px-4 sm:px-6 lg:px-8 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="max-w-5xl mx-auto">
          <h2
            className="text-3xl font-bold mb-12"
            style={{ color: 'var(--accent)' }}
          >
            Score Distribution
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(scoreDistribution).map(([range, count]) => (
              <div
                key={range}
                className="p-6 rounded-lg border"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border)',
                }}
              >
                <div
                  className="text-3xl font-bold"
                  style={{
                    color: 'var(--accent)',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {count}
                </div>
                <div className="text-sm text-[var(--text-muted)] mt-2">
                  Score {range}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Regional Champions Section */}
      <section
        id="regions"
        className="py-20 px-4 sm:px-6 lg:px-8 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="max-w-7xl mx-auto">
          <h2
            className="text-3xl font-bold mb-12"
            style={{ color: 'var(--accent)' }}
          >
            Regional Champions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {regions.map((region) => (
              <div
                key={region.name}
                className="p-6 rounded-lg border transition-all hover:border-[var(--accent)]"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border)',
                }}
              >
                <div className="flex items-center gap-2 mb-6">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{
                      backgroundColor:
                        regionColors[region.name] || 'var(--text-dim)',
                    }}
                  />
                  <h3 className="text-lg font-bold">{region.name}</h3>
                </div>

                {/* Top 3 metros */}
                <div className="space-y-3 mb-6">
                  {region.top3.map((metro, idx) => (
                    <div key={metro.slug} className="flex justify-between items-baseline">
                      <div className="flex-1">
                        <div className="text-sm font-semibold">{metro.name}</div>
                        <div className="text-xs text-[var(--text-muted)]">
                          #{metro.rank}
                        </div>
                      </div>
                      <div
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          color: 'var(--accent)',
                        }}
                        className="text-sm font-bold"
                      >
                        {metro.score.toFixed(1)}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Region stats */}
                <div
                  className="pt-4 border-t"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <div
                        className="text-[var(--accent)] font-bold"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {region.metros}
                      </div>
                      <div className="text-[var(--text-muted)]">Total metros</div>
                    </div>
                    <div>
                      <div
                        className="text-[var(--accent)] font-bold"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                      >
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

      {/* Articles Preview Section */}
      <section
        className="py-20 px-4 sm:px-6 lg:px-8 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="max-w-5xl mx-auto">
          <h2
            className="text-3xl font-bold mb-12"
            style={{ color: 'var(--accent)' }}
          >
            Featured Articles
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                title: 'The Global Metro Power Rankings',
                subtitle: 'Introducing our composite score measuring the completeness of every metropolitan area.',
                status: 'Published',
                statusColor: 'var(--accent)',
              },
              {
                title: 'The 50 Most Complete Small Cities',
                subtitle:
                  'From Zurich to Singapore, these metros punch above their weight class.',
                status: 'Coming Soon',
                statusColor: 'var(--text-dim)',
              },
              {
                title: "Why China's Metros Score So High",
                subtitle:
                  'Exploring the dimensions that make Chinese cities stand out globally.',
                status: 'Coming Soon',
                statusColor: 'var(--text-dim)',
              },
            ].map((article) => (
              <div
                key={article.title}
                className="p-6 rounded-lg border transition-all hover:border-[var(--accent)]"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border)',
                }}
              >
                <div className="mb-4">
                  <span
                    className="text-xs font-semibold uppercase tracking-widest"
                    style={{ color: article.statusColor, fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {article.status}
                  </span>
                </div>
                <h3 className="text-lg font-bold mb-3">{article.title}</h3>
                <p className="text-sm text-[var(--text-muted)]">
                  {article.subtitle}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6">
            Explore Every Metro on Earth
          </h2>
          <p className="text-lg text-[var(--text-muted)] mb-8">
            Search, filter, and analyze data for all 4,285 metropolitan areas. Compare regions,
            understand global patterns, and discover emerging metros.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              className="px-6 py-3 rounded-lg font-semibold transition-all"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'black',
              }}
            >
              Browse All Metros
            </button>
            <button
              className="px-6 py-3 rounded-lg font-semibold border transition-all hover:border-[var(--accent)]"
              style={{
                borderColor: 'var(--border)',
                color: 'var(--text)',
              }}
            >
              View Methodology
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer
        className="py-12 px-4 sm:px-6 lg:px-8 border-t"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div>
              <h4 className="font-semibold mb-4">Explore</h4>
              <ul className="space-y-2 text-sm text-[var(--text-muted)]">
                <li><a href="#" className="hover:text-[var(--accent)]">All Rankings</a></li>
                <li><a href="#" className="hover:text-[var(--accent)]">By Region</a></li>
                <li><a href="#" className="hover:text-[var(--accent)]">By Country</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Learn</h4>
              <ul className="space-y-2 text-sm text-[var(--text-muted)]">
                <li><a href="#" className="hover:text-[var(--accent)]">Methodology</a></li>
                <li><a href="#" className="hover:text-[var(--accent)]">Data Sources</a></li>
                <li><a href="#" className="hover:text-[var(--accent)]">Dimensions</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Resources</h4>
              <ul className="space-y-2 text-sm text-[var(--text-muted)]">
                <li><a href="#" className="hover:text-[var(--accent)]">Blog</a></li>
                <li><a href="#" className="hover:text-[var(--accent)]">API</a></li>
                <li><a href="#" className="hover:text-[var(--accent)]">Downloads</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Connect</h4>
              <ul className="space-y-2 text-sm text-[var(--text-muted)]">
                <li><a href="#" className="hover:text-[var(--accent)]">Twitter</a></li>
                <li><a href="#" className="hover:text-[var(--accent)]">LinkedIn</a></li>
                <li><a href="#" className="hover:text-[var(--accent)]">Contact</a></li>
              </ul>
            </div>
          </div>
          <div
            className="border-t pt-8 flex flex-col md:flex-row justify-between items-center text-sm text-[var(--text-muted)]"
            style={{ borderColor: 'var(--border)' }}
          >
            <p>&copy; 2026 Global Metro Power Rankings. All rights reserved.</p>
            <div className="flex gap-4 mt-4 md:mt-0">
              <a href="#" className="hover:text-[var(--accent)]">Privacy</a>
              <a href="#" className="hover:text-[var(--accent)]">Terms</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
