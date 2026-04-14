import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getAllMetros,
  getAllSlugs,
  getMetroDetail,
  formatPop,
  formatMarketCap,
  formatGdp,
  formatDimValue,
  regionColors,
} from "@/lib/data";

export const dynamicParams = false;

export async function generateStaticParams() {
  // Generate static pages for all metros
  const slugs = getAllSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const detail = getMetroDetail(slug);

  if (!detail) {
    return {
      title: "Metro Not Found",
      description: "This metro profile could not be found.",
    };
  }

  const { metro } = detail;
  const title = `${metro.name} (#${metro.rank}) - Metro Power Rankings`;
  const description = `${metro.name}, ${metro.country}. Score: ${metro.score.toFixed(1)}. Population: ${formatPop(metro.pop)}. Region: ${metro.region}.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
    },
  };
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function MetroDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const detail = getMetroDetail(slug);

  if (!detail) {
    notFound();
  }

  const { metro } = detail;
  const allMetros = getAllMetros();
  const currentIndex = allMetros.findIndex((m) => m.slug === slug);

  // Get similar metros (5 with adjacent ranks)
  const similarMetros = allMetros
    .filter((m) => Math.abs(m.rank - metro.rank) <= 10 && m.slug !== slug)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 5);

  return (
    <main className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-12">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <a href="/" className="hover:text-[var(--accent)] transition">
            Rankings
          </a>
          <span>/</span>
          <span className="text-[var(--text)]">
            {metro.region}
          </span>
          <span>/</span>
          <span className="text-[var(--text)]">{metro.country}</span>
          <span>/</span>
          <span className="text-[var(--accent)]">{metro.name}</span>
        </nav>

        {/* Hero Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <div className="lg:col-span-2">
            <h1 className="text-5xl font-bold mb-4" style={{ color: regionColors[metro.region] || "var(--accent)" }}>
              {metro.name}
            </h1>
            <div className="space-y-2 text-[var(--text-muted)]">
              <p className="text-lg">
                {metro.country} • {metro.region}
              </p>
              <p className="text-lg">
                Population: <span className="text-[var(--text)]">{formatPop(metro.pop)}</span>
              </p>
              <p className="text-lg">
                GDP: <span className="text-[var(--text)]">{formatGdp(metro.gdp)}</span> • GDP per capita:{" "}
                <span className="text-[var(--text)]">${metro.gdpPerCapita.toLocaleString()}</span>
              </p>
              {metro.gawcClass && (
                <p className="text-lg">
                  GAWC Class: <span className="text-[var(--text)]">{metro.gawcClass}</span>
                </p>
              )}
            </div>
          </div>

          {/* Rank & Score Card */}
          <div
            className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-6 text-center"
            style={{
              borderLeft: `4px solid ${regionColors[metro.region] || "var(--accent)"}`,
            }}
          >
            <div className="text-5xl font-bold text-[var(--accent)] mb-2">
              #{metro.rank}
            </div>
            <p className="text-[var(--text-muted)] text-sm mb-4">Global Rank</p>
            <div className="text-4xl font-bold text-[var(--text)] mb-2">
              {metro.score.toFixed(1)}
            </div>
            <p className="text-[var(--text-muted)] text-sm">Power Score</p>
            {metro.pctOfCountry > 0 && (
              <>
                <hr className="my-4 border-[var(--border)]" />
                <p className="text-xs text-[var(--text-muted)] mb-1">% of Country Score</p>
                <p className="text-2xl font-bold text-[var(--accent)]">
                  {metro.pctOfCountry.toFixed(1)}%
                </p>
              </>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        {hasStatsToShow(detail) && (
          <section>
            <h2 className="text-2xl font-bold mb-6">Key Statistics</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {metro.dims.majorLeagueTeams > 0 && (
                <StatCard
                  label="Major Teams"
                  value={Math.round(metro.dims.majorLeagueTeams)}
                />
              )}
              {metro.dims.totalTeams > 0 && (
                <StatCard
                  label="Total Teams"
                  value={Math.round(metro.dims.totalTeams)}
                />
              )}
              {metro.dims.companies > 0 && (
                <StatCard
                  label="Major Companies"
                  value={Math.round(metro.dims.companies)}
                />
              )}
              {detail.marketCap && detail.marketCap.total > 0 && (
                <StatCard
                  label="Market Cap"
                  value={formatMarketCap(detail.marketCap.total)}
                />
              )}
              {detail.skyscrapers && detail.skyscrapers.over150m > 0 && (
                <StatCard
                  label="Skyscrapers (150m+)"
                  value={detail.skyscrapers.over150m}
                />
              )}
              {detail.skyscrapers && detail.skyscrapers.over200m > 0 && (
                <StatCard
                  label="Supertall (200m+)"
                  value={detail.skyscrapers.over200m}
                />
              )}
              {detail.skyscrapers && detail.skyscrapers.over300m > 0 && (
                <StatCard
                  label="Megatal (300m+)"
                  value={detail.skyscrapers.over300m}
                />
              )}
              {metro.dims.metroStations > 0 && (
                <StatCard
                  label="Metro Stations"
                  value={Math.round(metro.dims.metroStations)}
                />
              )}
              {metro.dims.suburbStations > 0 && (
                <StatCard
                  label="Commuter Rail"
                  value={Math.round(metro.dims.suburbStations)}
                />
              )}
              {metro.dims.universities > 0 && (
                <StatCard
                  label="Universities"
                  value={Math.round(metro.dims.universities)}
                />
              )}
              {metro.dims.luxuryStars > 0 && (
                <StatCard
                  label="Michelin Stars"
                  value={Math.round(metro.dims.luxuryStars)}
                />
              )}
              {metro.dims.culturalEvents > 0 && (
                <StatCard
                  label="Cultural Events"
                  value={Math.round(metro.dims.culturalEvents)}
                />
              )}
            </div>
          </section>
        )}

        {/* Dimensions Table */}
        <section>
          <h2 className="text-2xl font-bold mb-6">Dimension Breakdown</h2>
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--border)]">
                <tr className="bg-[var(--bg-card-hover)]">
                  <th className="text-left px-6 py-3 font-semibold text-[var(--text)]">
                    Dimension
                  </th>
                  <th className="text-right px-6 py-3 font-semibold text-[var(--text)]">
                    Value
                  </th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(metro.dims).map(([key, value], idx) => (
                  <tr
                    key={key}
                    className={`border-t border-[var(--border)] hover:bg-[var(--bg-card-hover)] transition ${
                      idx % 2 === 0 ? "bg-[var(--bg-card)]" : ""
                    }`}
                  >
                    <td className="px-6 py-3 text-[var(--text)]">
                      {formatDimensionName(key)}
                    </td>
                    <td
                      className="px-6 py-3 text-right text-[var(--accent)] font-mono"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {typeof value === "number" ? formatDimValue(key, value) : "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Sporting Events Section (Teams + Major Events) */}
        {(detail.teams?.length > 0 || detail.events?.length > 0) && (
          <section>
            <h2 className="text-2xl font-bold mb-6">Sporting Events</h2>
            {detail.teams && detail.teams.length > 0 && (
              <TeamsSection teams={detail.teams} />
            )}
            {detail.events && detail.events.length > 0 && (
              <EventsSection events={detail.events} />
            )}
          </section>
        )}

        {/* Universities Section */}
        {detail.universities && detail.universities.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold mb-6">Universities</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {detail.universities
                .sort((a, b) => a.rank - b.rank)
                .map((uni, idx) => (
                  <div
                    key={idx}
                    className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4 hover:border-[var(--accent)] transition"
                  >
                    <div className="flex items-start gap-3 mb-2">
                      <div
                        className="text-[var(--accent)] font-bold text-lg"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        #{uni.rank}
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-[var(--text)]">{uni.name}</p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {uni.city}, {uni.country}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </section>
        )}

        {/* Cultural Assets Section */}
        {detail.culture && Object.keys(detail.culture).length > 0 && (
          <section>
            <h2 className="text-2xl font-bold mb-6">Cultural Assets</h2>
            <div className="space-y-8">
              {Object.entries(detail.culture).map(([type, assets]) => (
                <div key={type}>
                  <h3 className="text-lg font-semibold text-[var(--accent)] mb-4">
                    {type}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {assets.map((asset, idx) => (
                      <div
                        key={idx}
                        className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-3 hover:border-[var(--accent)] transition"
                      >
                        <p className="font-medium text-[var(--text)]">{asset.name}</p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {asset.city}
                          {asset.subtype && ` \u2022 ${asset.subtype}`}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Luxury Hospitality Section */}
        {detail.luxury && detail.luxury.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold mb-6">Luxury Hospitality</h2>
            <div className="space-y-6">
              {Array.from(new Set(detail.luxury.map((l) => l.type))).map((type) => {
                const itemsOfType = detail.luxury!.filter((l) => l.type === type);
                return (
                  <div key={type}>
                    <h3 className="text-lg font-semibold text-[var(--accent)] mb-3">
                      {type}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {itemsOfType.map((item, idx) => (
                        <div
                          key={idx}
                          className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-3 hover:border-[var(--accent)] transition"
                        >
                          <p className="font-medium text-[var(--text)]">{item.name}</p>
                          <p className="text-xs text-[var(--text-muted)]">{item.city}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Market Cap Section */}
        {detail.marketCap && detail.marketCap.top12 && detail.marketCap.top12.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold mb-6">Top Companies</h2>
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--border)]">
                  <tr className="bg-[var(--bg-card-hover)]">
                    <th className="text-left px-4 py-3 font-semibold text-[var(--text)] w-10">
                      #
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-[var(--text)]">
                      Company
                    </th>
                    <th className="text-right px-4 py-3 font-semibold text-[var(--text)]">
                      Valuation
                    </th>
                    <th className="text-right px-4 py-3 font-semibold text-[var(--text)]">
                      Type
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {detail.marketCap.top12.map((company, idx) => {
                    const val = typeof company === "number" ? company : company.valuation;
                    const name = typeof company === "number" ? "" : company.name || "";
                    const source = typeof company === "number" ? "" : company.source || "";
                    const sourceColor =
                      source === "Unicorn"
                        ? "text-purple-400"
                        : source === "Private"
                        ? "text-amber-400"
                        : "text-[var(--text-muted)]";
                    return (
                      <tr
                        key={idx}
                        className={`border-t border-[var(--border)] hover:bg-[var(--bg-card-hover)] transition ${
                          idx % 2 === 0 ? "bg-[var(--bg-card)]" : ""
                        }`}
                      >
                        <td
                          className="px-4 py-3 text-[var(--text-muted)] font-mono"
                          style={{ fontFamily: "'JetBrains Mono', monospace" }}
                        >
                          {idx + 1}
                        </td>
                        <td className="px-4 py-3 text-[var(--text)] font-medium">
                          {name}
                        </td>
                        <td
                          className="px-4 py-3 text-right text-[var(--accent)] font-mono"
                          style={{ fontFamily: "'JetBrains Mono', monospace" }}
                        >
                          {formatMarketCap(val)}
                        </td>
                        <td className={`px-4 py-3 text-right text-xs ${sourceColor}`}>
                          {source}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-3">
              Total Market Cap: {formatMarketCap(detail.marketCap.total)} across{" "}
              {detail.marketCap.count} companies
            </p>
          </section>
        )}


        {/* Similar Metros Section */}
        {similarMetros.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold mb-6">Similar Metros by Rank</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {similarMetros.map((sim) => (
                <a
                  key={sim.slug}
                  href={`/rankings/${sim.slug}`}
                  className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4 hover:border-[var(--accent)] hover:bg-[var(--bg-card-hover)] transition group"
                >
                  <div className="flex items-baseline gap-2 mb-2">
                    <span
                      className="text-2xl font-bold text-[var(--accent)]"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      #{sim.rank}
                    </span>
                  </div>
                  <p className="font-semibold text-[var(--text)] group-hover:text-[var(--accent)] transition mb-1">
                    {sim.name}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mb-3">{sim.country}</p>
                  <p
                    className="text-sm text-[var(--accent)] font-mono"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {sim.score.toFixed(1)} pts
                  </p>
                </a>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

// Helper Components
function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
      <p className="text-xs text-[var(--text-muted)] mb-2">{label}</p>
      <p
        className="text-2xl font-bold text-[var(--accent)]"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {value}
      </p>
    </div>
  );
}

function sortTeamsFootballFirst(
  teams: Array<{ sport: string; league: string; team: string; city: string; major: boolean }>
) {
  return [...teams].sort((a, b) => {
    const aIsFootball = a.sport === "Soccer" || a.sport === "Football/Soccer" ? 0 : 1;
    const bIsFootball = b.sport === "Soccer" || b.sport === "Football/Soccer" ? 0 : 1;
    return aIsFootball - bIsFootball;
  });
}

function normalizeTeamSport(sport: string): string {
  return sport === "Soccer" ? "Football/Soccer" : sport;
}

function TeamsSection({
  teams,
}: {
  teams: Array<{
    sport: string;
    league: string;
    team: string;
    city: string;
    major: boolean;
  }>;
}) {
  const majorTeams = sortTeamsFootballFirst(teams.filter((t) => t.major));
  const otherTeams = sortTeamsFootballFirst(teams.filter((t) => !t.major));

  return (
    <div className="space-y-6">
      {majorTeams.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-[var(--accent)] mb-4">
            Major League Teams
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {majorTeams.map((team, idx) => (
              <TeamCard key={idx} team={team} />
            ))}
          </div>
        </div>
      )}
      {otherTeams.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-[var(--text-muted)] mb-4">
            Other Teams
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {otherTeams.map((team, idx) => (
              <TeamCard key={idx} team={team} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TeamCard({
  team,
}: {
  team: {
    sport: string;
    league: string;
    team: string;
    city: string;
    major: boolean;
  };
}) {
  return (
    <div
      className={`border rounded-lg p-4 hover:border-[var(--accent)] transition ${
        team.major
          ? "bg-[var(--bg-card)] border-[var(--border)]"
          : "bg-[var(--bg-card)] border-[var(--border)]"
      }`}
    >
      <p className="text-xs text-[var(--text-muted)] mb-1">
        {normalizeTeamSport(team.sport)} • {team.league}
      </p>
      <p className="font-semibold text-[var(--text)]">{team.team}</p>
      <p className="text-xs text-[var(--text-dim)]">{team.city}</p>
    </div>
  );
}

function EventsSection({
  events,
}: {
  events: Array<{
    sport: string;
    event: string;
    year: string;
    venue: string;
  }>;
}) {
  const categoryMap: Record<string, string> = {
    Golf: "Golf Majors",
    Tennis: "Tennis Majors",
    F1: "F1 Races",
  };

  const grouped: Record<string, typeof events> = {};
  for (const ev of events) {
    const category = categoryMap[ev.sport] || ev.sport;
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push(ev);
  }

  const categoryOrder = ["Golf Majors", "Tennis Majors", "F1 Races"];
  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    const ai = categoryOrder.indexOf(a);
    const bi = categoryOrder.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  return (
    <div className="mt-8">
      <h3 className="text-lg font-semibold text-[var(--accent)] mb-4">
        Major Sporting Events
      </h3>
      <div className="space-y-3">
        {sortedCategories.map((category) => (
          <details
            key={category}
            className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden group"
          >
            <summary className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[var(--bg-card-hover)] transition select-none">
              <span className="font-semibold text-[var(--text)]">{category}</span>
              <span className="text-sm text-[var(--text-muted)]">
                {grouped[category].length} event{grouped[category].length !== 1 ? "s" : ""}
              </span>
            </summary>
            <div className="border-t border-[var(--border)] px-4 py-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              {grouped[category].map((ev, idx) => (
                <div key={idx} className="py-2">
                  <p className="font-medium text-[var(--text)]">{ev.event}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {ev.year} • {ev.venue}
                  </p>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

// Helper functions
function formatDimensionName(key: string): string {
  const names: Record<string, string> = {
    majorLeagueTeams: "Major League Teams",
    totalTeams: "Total Teams",
    majorSportingEvents: "Major Sporting Events",
    companies: "Major Companies",
    marketCap: "Market Cap Score",
    culturalEvents: "Cultural Events",
    universities: "Universities",
    topUniHospResearch: "Top University Hospitals & Research",
    museumsLandmarks: "Museums & Landmarks",
    portsExchangesInfra: "Ports, Exchanges & Infrastructure",
    airportScore: "Airport Score",
    luxuryStars: "Luxury Stars (Michelin)",
    metroStations: "Metro Stations",
    suburbStations: "Commuter Rail Stations",
    trainHubs: "Train Hubs",
    skyscrapers: "Skyscrapers",
  };
  return names[key] || key.replace(/([A-Z])/g, " $1").trim();
}

function hasStatsToShow(detail: any): boolean {
  const statsToCheck = [
    detail.metro?.dims?.majorLeagueTeams,
    detail.metro?.dims?.totalTeams,
    detail.metro?.dims?.companies,
    detail.marketCap?.total,
    detail.skyscrapers?.over150m,
    detail.metro?.dims?.metroStations,
    detail.metro?.dims?.universities,
    detail.metro?.dims?.luxuryStars,
    detail.metro?.dims?.culturalEvents,
  ];
  return statsToCheck.some((stat) => stat && stat > 0);
}
