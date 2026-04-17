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
              href="https://citizenofnowhere.substack.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm hover:text-[var(--accent)] transition-colors"
            >
              Articles
            </a>
            <a
              href="#methodology"
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
            <a
              href="#methodology"
              className="px-6 py-3 rounded-lg font-semibold border transition-all hover:border-[var(--accent)] inline-block"
              style={{
                borderColor: 'var(--border)',
                color: 'var(--text)',
              }}
            >
              View Methodology
            </a>
          </div>
        </div>
      </section>

      {/* Methodology */}
      <section
        id="methodology"
        className="py-20 px-4 sm:px-6 lg:px-8 border-b scroll-mt-20"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="max-w-4xl mx-auto">
          <p
            className="text-sm font-semibold tracking-widest mb-4 uppercase"
            style={{
              color: 'var(--accent)',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            Methodology
          </p>
          <h2 className="text-4xl font-bold mb-6">How the Score Is Built</h2>
          <p className="text-lg text-[var(--text-muted)] mb-6">
            The Global Metro Power Rankings measure <em>metro completeness</em>: the
            breadth and depth of globally-recognized infrastructure, culture, sport,
            finance, education, and connectivity concentrated in a single place. It
            is not a livability score, a cost-of-living index, or a popularity
            contest. It is a composite of what a city has built.
          </p>

          <h3 className="text-xl font-semibold mt-10 mb-3">Rankings Within Rankings</h3>
          <p className="text-[var(--text-muted)] mb-4">
            Readers sometimes expect a global index to categorize everything. This
            one does not. I am tracking thousands of data points across sixteen
            dimensions, and each dimension draws its own lines. Poland&apos;s
            volleyball league is top-ranked in the world, but Ekstraklasa is not
            among the twenty strongest football leagues, so Polish football clubs
            do not appear under &quot;major league teams.&quot; That is a feature,
            not an omission: the index rewards presence on <em>globally</em> ranked
            lists, and every dimension inherits the cutoffs of its source.
          </p>
          <p className="text-[var(--text-muted)] mb-4">
            Put another way, this is a set of rankings within rankings. Your metro
            is being measured against what the world has already decided is worth
            counting. A 2-star Michelin restaurant scores the same in Warsaw as in
            Paris. A top-50 university carries the same weight in Nairobi as in
            Boston. What differs is how much of that curated global recognition any
            one metro has accumulated.
          </p>

          <h3 className="text-xl font-semibold mt-10 mb-3">The Sixteen Components</h3>
          <p className="text-[var(--text-muted)] mb-4">
            The composite is the sum of sixteen weighted terms. The weighting is
            deliberate: linear for things where volume matters (population, market
            cap), logarithmic for things with sharp diminishing returns (transit,
            skyscrapers, Michelin stars), and capped for things where you either
            have the thing or you do not (major league teams, hosted mega-events).
          </p>
          <div className="grid md:grid-cols-2 gap-3 text-sm text-[var(--text-muted)] mb-6">
            <div className="border rounded-lg p-4" style={{ borderColor: 'var(--border)' }}>
              <p className="font-semibold text-[var(--text)] mb-1">1. Population</p>
              <p>Linear, divided by 3 million. A 30M metro earns 10 points.</p>
            </div>
            <div className="border rounded-lg p-4" style={{ borderColor: 'var(--border)' }}>
              <p className="font-semibold text-[var(--text)] mb-1">2. Market Capitalization</p>
              <p>Sum of corporate HQ value, divided by $700B. NYC ($8.3T) earns ~11.9 points.</p>
            </div>
            <div className="border rounded-lg p-4" style={{ borderColor: 'var(--border)' }}>
              <p className="font-semibold text-[var(--text)] mb-1">3. Major League Teams</p>
              <p>NFL, MLB, NBA, NHL, top-flight football, rugby, cricket. 1:1, hard cap at 10.</p>
            </div>
            <div className="border rounded-lg p-4" style={{ borderColor: 'var(--border)' }}>
              <p className="font-semibold text-[var(--text)] mb-1">4. Minor &amp; College Teams</p>
              <p>Lower divisions, college programs. 0.25 points each, capped at 40 teams.</p>
            </div>
            <div className="border rounded-lg p-4" style={{ borderColor: 'var(--border)' }}>
              <p className="font-semibold text-[var(--text)] mb-1">5. Cultural &amp; Civic Assets</p>
              <p>Museums, landmarks, ports, stock exchanges, IXPs, central banks, data centers. 0.65 points each.</p>
            </div>
            <div className="border rounded-lg p-4" style={{ borderColor: 'var(--border)' }}>
              <p className="font-semibold text-[var(--text)] mb-1">6. Top-50 Universities</p>
              <p>CWUR top-50. 3.5 points each. Boston (5 top-50) earns ~17.5 points.</p>
            </div>
            <div className="border rounded-lg p-4" style={{ borderColor: 'var(--border)' }}>
              <p className="font-semibold text-[var(--text)] mb-1">7. Other Research Institutions</p>
              <p>Top-500 universities, top-250 hospitals, research institutes. 2.2 points each.</p>
            </div>
            <div className="border rounded-lg p-4" style={{ borderColor: 'var(--border)' }}>
              <p className="font-semibold text-[var(--text)] mb-1">8. Metro Transit</p>
              <p>Subway and light rail stations, log-scaled. LOG(500) ≈ 2.7 points.</p>
            </div>
            <div className="border rounded-lg p-4" style={{ borderColor: 'var(--border)' }}>
              <p className="font-semibold text-[var(--text)] mb-1">9. GaWC Global Connectivity</p>
              <p>Reciprocal of world-city rank. Alpha++ = 12 points, Sufficiency = 1.</p>
            </div>
            <div className="border rounded-lg p-4" style={{ borderColor: 'var(--border)' }}>
              <p className="font-semibold text-[var(--text)] mb-1">10. Suburban Rail</p>
              <p>Commuter rail stations, log-scaled at half the weight of urban transit.</p>
            </div>
            <div className="border rounded-lg p-4" style={{ borderColor: 'var(--border)' }}>
              <p className="font-semibold text-[var(--text)] mb-1">11. Intercity Train Hubs</p>
              <p>Stations with 30M+ annual passengers, LOG × 2.0. Tokyo (51) scores 3.42 points.</p>
            </div>
            <div className="border rounded-lg p-4" style={{ borderColor: 'var(--border)' }}>
              <p className="font-semibold text-[var(--text)] mb-1">12. Skyscrapers</p>
              <p>150m+ buildings, LOG × 5.7. NYC (324) earns ~14.3 points.</p>
            </div>
            <div className="border rounded-lg p-4" style={{ borderColor: 'var(--border)' }}>
              <p className="font-semibold text-[var(--text)] mb-1">13. Airport Score</p>
              <p>Weighted by tier (Mega Hub = 5, Major = 3, International = 2, Regional = 1).</p>
            </div>
            <div className="border rounded-lg p-4" style={{ borderColor: 'var(--border)' }}>
              <p className="font-semibold text-[var(--text)] mb-1">14. Major Sporting Events</p>
              <p>Olympics, World Cups, Grand Slams, F1. 0.2 each, capped at 20.</p>
            </div>
            <div className="border rounded-lg p-4" style={{ borderColor: 'var(--border)' }}>
              <p className="font-semibold text-[var(--text)] mb-1">15. Annual Cultural Events</p>
              <p>Recurring festivals, parades, fairs of global stature. 1 point each.</p>
            </div>
            <div className="border rounded-lg p-4" style={{ borderColor: 'var(--border)' }}>
              <p className="font-semibold text-[var(--text)] mb-1">16. Michelin &amp; Luxury Hospitality</p>
              <p>Weighted Michelin stars (3★×3, 2★×2), LOG × 3.0. Paris (91) earns 5.88 points.</p>
            </div>
          </div>

          <h3 className="text-xl font-semibold mt-10 mb-3">Why These Weights</h3>
          <p className="text-[var(--text-muted)] mb-4">
            The design rewards breadth over extreme depth in any one dimension. A
            city that has a stock exchange <em>and</em> top-flight universities{' '}
            <em>and</em> a skyline <em>and</em> major league sports will beat a
            city that dominates just one of those.
          </p>
          <p className="text-[var(--text-muted)] mb-4">
            Logarithmic scaling for transit, skyscrapers, and Michelin stars
            reflects diminishing returns: the jump from zero to one subway line is
            transformative, but the jump from 10 to 11 is marginal. Reciprocal
            scaling for GaWC connectivity reflects its power-law distribution, where
            the gap between Alpha++ and Alpha+ is much larger than the gap between
            lower tiers. Caps on major league teams prevent London (99 teams) or
            NYC (74) from dominating the sports dimension; 25 teams is not 2.5
            times better than 10.
          </p>

          <h3 className="text-xl font-semibold mt-10 mb-3">Data Sources</h3>
          <p className="text-[var(--text-muted)] mb-4">
            The dataset is hand-curated across two years: 4,285 metropolitan areas
            spanning 237 countries, with every cultural and infrastructural asset
            individually verified and mapped through a municipality-level geographic
            hierarchy of 182,000+ administrative units. Primary sources include
            CWUR (universities), GaWC Research Network (global connectivity), CTBUH
            Skyscraper Center (150m+ buildings), UEFA (stadium ratings), TEA/AECOM
            (theme park attendance), UFI (convention centers), the Michelin Guide
            and Wikipedia&apos;s published lists, and national statistics agencies
            for population. There is no scraping, no AI-generated fill, and no
            guessing: if a city cannot be matched to a metro through the municipality
            or county lookup, it is excluded.
          </p>

          <h3 className="text-xl font-semibold mt-10 mb-3">Known Limitations</h3>
          <ul className="text-[var(--text-muted)] space-y-3 mb-6 list-disc pl-5">
            <li>
              <strong className="text-[var(--text)]">Data availability bias.</strong>{' '}
              English-language sources are over-represented. The dataset has ~1,080
              US cultural entries against ~100 for India, despite India having more
              metros above one million. African and South Asian metros are
              structurally under-counted.
            </li>
            <li>
              <strong className="text-[var(--text)]">Michelin geographic bias.</strong>{' '}
              The Michelin Guide only covers parts of Western Europe, Japan, East
              Asia, and select metros in North and Latin America. Most of Africa,
              South Asia, and the Middle East score zero on that dimension by
              construction.
            </li>
            <li>
              <strong className="text-[var(--text)]">No temporal dimension.</strong>{' '}
              Every score is a current snapshot. The index does not yet capture
              trajectory: whether a metro is rising, stagnant, or declining.
            </li>
            <li>
              <strong className="text-[var(--text)]">Market cap volatility.</strong>{' '}
              Corporate HQ value is point-in-time. A market correction shifts the
              top of the leaderboard noticeably, particularly for San Francisco and
              New York.
            </li>
            <li>
              <strong className="text-[var(--text)]">Safety, crime, and quality of life are not yet measured.</strong>{' '}
              These are candidates for a future dimension. If you have a suggested
              source, let me know.
            </li>
          </ul>

          <div
            className="mt-10 p-6 rounded-lg border"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border)',
            }}
          >
            <p className="text-sm text-[var(--text-muted)] mb-2">Further reading</p>
            <p className="text-[var(--text)]">
              The first article in the series, with the top 25, continental
              champions, and the San Francisco anomaly, is on{' '}
              <a
                href="https://citizenofnowhere.substack.com/p/the-global-metro-power-rankings"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-[var(--accent)]"
                style={{ color: 'var(--accent)' }}
              >
                Citizen of Nowhere
              </a>
              .
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer
        className="py-12 px-4 sm:px-6 lg:px-8 border-t"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            <div>
              <h4 className="font-semibold mb-4">Explore</h4>
              <ul className="space-y-2 text-sm text-[var(--text-muted)]">
                <li><a href="#rankings" className="hover:text-[var(--accent)]">All Rankings</a></li>
                <li><a href="#regions" className="hover:text-[var(--accent)]">By Region</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Learn</h4>
              <ul className="space-y-2 text-sm text-[var(--text-muted)]">
                <li><a href="#methodology" className="hover:text-[var(--accent)]">Methodology</a></li>
                <li><a href="#methodology" className="hover:text-[var(--accent)]">Dimensions</a></li>
                <li><a href="#methodology" className="hover:text-[var(--accent)]">Data Sources</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Connect</h4>
              <ul className="space-y-2 text-sm text-[var(--text-muted)]">
                <li>
                  <a
                    href="https://citizenofnowhere.substack.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[var(--accent)]"
                  >
                    Substack
                  </a>
                </li>
                <li>
                  <a href="mailto:ashwind@gmail.com" className="hover:text-[var(--accent)]">Contact</a>
                </li>
              </ul>
            </div>
          </div>
          <div
            className="border-t pt-8 text-sm text-[var(--text-muted)]"
            style={{ borderColor: 'var(--border)' }}
          >
            <p>&copy; 2026 Global Metro Power Rankings. Hand-curated by Ashwin D.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
