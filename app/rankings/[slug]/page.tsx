import { notFound } from "next/navigation";
import Link from "next/link";
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
import { BASE_URL, placeJsonLd, serializeJsonLd, sportsTeamJsonLd } from "@/lib/seo";
import {
  getQualifierByMetroName,
  qualifierAnchorId,
} from "@/lib/neighborhoods";

export const dynamicParams = false;

const infrastructureTypes = new Set([
  "Airport", "Bridge/Tunnel/Dam/Canal", "Central Bank", "Data Center Hub",
  "Internet Exchange", "Metro System", "Military Base", "Port",
  "Stock Exchange", "Suburban Rail", "Trade Venue", "Train Station",
]);

const infrastructureOrder = [
  "Airport", "Port", "Military Base", "Bridge/Tunnel/Dam/Canal",
  "Train Station", "Metro System", "Suburban Rail", "Trade Venue",
  "Central Bank", "Stock Exchange", "Data Center Hub", "Internet Exchange",
];

const culturalAssetOrder = [
  "Cultural Event", "Museum/Landmark",
];

// Education & Research lives under its own H2 below Cultural Assets.
// Universities is backed by detail.universities; Hospital and Research
// Institution come from detail.culture like everything else.
const educationResearchOrder = [
  "Universities", "Hospital", "Research Institution",
];

const sportsEventType = "Sporting Event";

// Notable Venues ordering: Olympics-class venues lead, then football, then American
// football, then the marquee team sports (basketball/baseball/cricket/rugby/hockey
// in any order), then everything else. Sports that alias to the same family
// (Test Cricket + T20 Cricket, Rugby Union + Rugby League, Olympics/Athletics +
// bare "Olympics") collapse into one rank.
const VENUE_SPORT_PRIORITY: Record<string, number> = {
  "Olympics/Athletics": 0,
  "Olympics": 0,
  "Football": 1,
  "Soccer": 1,
  "Football/Soccer": 1,
  "American Football": 2,
  "Basketball": 3,
  "Baseball": 3,
  "Test Cricket": 3,
  "T20 Cricket": 3,
  "Rugby Union": 3,
  "Rugby League": 3,
  "Hockey": 3,
};
const venueSportRank = (sport: string): number =>
  VENUE_SPORT_PRIORITY[sport] ?? 99;

// Tailwind class string shared across collapsible subgroups (Other Teams,
// Notable Venues, Museum buckets, Infrastructure entries, Luxury types).
const COLLAPSIBLE_CARD_CLASS =
  "bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden group";
const COLLAPSIBLE_SUMMARY_CLASS =
  "flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[var(--bg-card-hover)] transition select-none";

function formatAssetHeading(
  type: string,
  dims?: Record<string, number>
): string {
  switch (type) {
    case "Hospital":
      return "Top 250 Hospitals";
    case "Research Institution":
      return "Top Research Institutions";
    case "Bridge/Tunnel/Dam/Canal":
      return "Notable Bridge/Tunnel/Dam/Canals";
    case "Train Station":
      return "Notable Train Hubs";
    case "Metro System": {
      const n = dims?.metroStations;
      return n && n > 0 ? `Metro System (${n.toLocaleString()} stations)` : "Metro System";
    }
    case "Suburban Rail": {
      const n = dims?.suburbStations;
      return n && n > 0 ? `Suburban Rail (${n.toLocaleString()} stations)` : "Suburban Rail";
    }
    default:
      return type;
  }
}

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
    alternates: {
      canonical: `/rankings/${slug}`,
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: `${BASE_URL}/rankings/${slug}`,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
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
  const neighborhoodQualifier = getQualifierByMetroName(metro.name);
  const allMetros = getAllMetros();
  const currentIndex = allMetros.findIndex((m) => m.slug === slug);
  const bestScore = Math.max(...allMetros.map((m) => m.score));

  // Get similar metros (5 with adjacent ranks)
  const similarMetros = allMetros
    .filter((m) => Math.abs(m.rank - metro.rank) <= 10 && m.slug !== slug)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 5);

  // Structured data: Place with aggregateRating, plus BreadcrumbList.
  // qid/wikipediaUrl expand Place.sameAs so entity resolvers (Google, LLM
  // crawlers) can link this metro to its canonical Wikidata/Wikipedia record.
  // Both are optional and omitted when absent.
  const placeSchema = placeJsonLd({
    name: metro.name,
    country: metro.country,
    region: metro.region,
    slug: metro.slug,
    rank: metro.rank,
    score: metro.score,
    pop: metro.pop,
    lat: metro.lat,
    lon: metro.lon,
    bestScore,
    qid: metro.qid,
    wikipediaUrl: metro.wikipediaUrl,
  });

  // SportsTeam JSON-LD is emitted per team that has a Wikidata QID. Teams
  // without a QID are silently skipped so partial coverage never produces
  // placeholder-laden schema. As of 2026-04-24, coverage spans NFL, MLB, NBA,
  // NHL (all US franchises plus Toronto MLB/NBA and all seven Canadian NHL
  // franchises); future tranches will extend to MLS, WNBA, and overseas leagues.
  const teamSchemas = (detail.teams ?? [])
    .filter((t) => t.qid)
    .map((t) =>
      sportsTeamJsonLd({
        name: t.team,
        sport: t.sport,
        league: t.league,
        metroName: metro.name,
        metroSlug: metro.slug,
        qid: t.qid,
        wikipediaUrl: t.wikipediaUrl,
      }),
    );

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Rankings",
        item: `${BASE_URL}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: metro.region,
        item: `${BASE_URL}/#regions`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: metro.country,
        item: `${BASE_URL}/?country=${encodeURIComponent(metro.country)}`,
      },
      {
        "@type": "ListItem",
        position: 4,
        name: metro.name,
        item: `${BASE_URL}/rankings/${metro.slug}`,
      },
    ],
  };

  return (
    <main className="min-h-screen bg-[var(--bg)]">
      {/* Structured data: Place + aggregateRating, breadcrumb hierarchy, and
          one SportsTeam entity per Wikidata-linked team. Only teams with a QID
          produce a script tag, so partial coverage never pollutes the schema. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(placeSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbSchema) }}
      />
      {teamSchemas.map((schema, i) => (
        <script
          key={`team-schema-${i}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }}
        />
      ))}

      <div className="max-w-6xl mx-auto px-4 pt-28 pb-8 space-y-12">
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
          {metro.subCountry && (
            <>
              <span>/</span>
              <span className="text-[var(--text)]">{metro.subCountry}</span>
            </>
          )}
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
                {metro.country}
                {metro.subCountry && <> • <span className="text-[var(--text)]">{metro.subCountry}</span></>}
                {" "}• {metro.region}
              </p>
              {metro.primaryCity && (
                <p className="text-lg">
                  Primary City: <span className="text-[var(--text)]">{metro.primaryCity}</span>
                </p>
              )}
              {metro.primaryState && (
                <p className="text-lg">
                  Primary State/Province: <span className="text-[var(--text)]">{metro.primaryState}</span>
                </p>
              )}
              {metro.language && (
                <p className="text-lg">
                  Primary Language: <span className="text-[var(--text)]">{metro.language}</span>
                </p>
              )}
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
              {/* Capital / Largest City Badges */}
              {metro.capital && metro.capital.length > 0 && (
                <div className="flex gap-2 mt-3">
                  {(metro.capital === "Y" || metro.capital === "XY") && (
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      Capital City
                    </span>
                  )}
                  {(metro.capital === "X" || metro.capital === "XY") && (
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                      Largest City
                    </span>
                  )}
                </div>
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

        {/* City Status Card */}
        {metro.capital && metro.capital.length > 0 && (
          <section>
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-6">
              <div className="flex flex-wrap items-center gap-6">
                {(metro.capital === "Y" || metro.capital === "XY") && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                      <span className="text-amber-400 text-lg">&#9733;</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-amber-400">National Capital</p>
                      <p className="text-xs text-[var(--text-muted)]">Capital city of {metro.country}</p>
                    </div>
                  </div>
                )}
                {(metro.capital === "X" || metro.capital === "XY") && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                      <span className="text-blue-400 text-lg">&#9650;</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-blue-400">Largest City</p>
                      <p className="text-xs text-[var(--text-muted)]">Largest metro area in {metro.country}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Walkable Elite Quarters — surfaced for metros that clear the Marylebone test */}
        {neighborhoodQualifier && (
          <section>
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-6">
              <div className="flex items-start gap-4 flex-wrap">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-emerald-400 text-lg" aria-hidden="true">&#9873;</span>
                </div>
                <div className="flex-1 min-w-[240px]">
                  <p className="text-sm font-semibold text-emerald-400">Walkable Elite Quarters</p>
                  <p className="text-xs text-[var(--text-muted)] mb-3">
                    Neighborhoods that clear the dense, historic, walkable, elite residential test.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {neighborhoodQualifier.neighborhoods.map((n) => (
                      <Link
                        key={n}
                        href={`/neighborhoods#${qualifierAnchorId(metro.name)}`}
                        className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 hover:text-emerald-200 transition-colors"
                      >
                        {n}
                      </Link>
                    ))}
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-3">
                    From{" "}
                    <Link
                      href={`/neighborhoods#${qualifierAnchorId(metro.name)}`}
                      className="underline hover:text-[var(--accent)] transition-colors"
                    >
                      The Last of the Marylebones
                    </Link>
                    . 103 of 4,200+ metros clear the bar.
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Stats Grid */}
        {hasStatsToShow(detail) && (
          <section>
            <h2 id="stats" className="text-2xl font-bold mb-6">Key Statistics</h2>
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
                  <th
                    className="text-right px-6 py-3 font-semibold text-[var(--text)]"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    Rank
                  </th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(metro.dims).map(([key, value], idx) => {
                  const anchor = getDimensionAnchor(key);
                  const rankStr = detail.dimRanks?.[key];
                  return (
                    <tr
                      key={key}
                      className={`border-t border-[var(--border)] hover:bg-[var(--bg-card-hover)] transition ${
                        idx % 2 === 0 ? "bg-[var(--bg-card)]" : ""
                      }`}
                    >
                      <td className="px-6 py-3">
                        {anchor ? (
                          <a href={`#${anchor}`} className="text-[var(--text)] hover:text-[var(--accent)] transition">
                            {formatDimensionName(key)} <span className="text-xs text-[var(--text-muted)]">&#8599;</span>
                          </a>
                        ) : (
                          <span className="text-[var(--text)]">{formatDimensionName(key)}</span>
                        )}
                      </td>
                      <td
                        className="px-6 py-3 text-right text-[var(--accent)] font-mono"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {typeof value === "number" ? formatDimValue(key, value) : "\u2014"}
                      </td>
                      <td
                        className="px-6 py-3 text-right font-mono text-[var(--text-muted)]"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {rankStr ? (
                          <span className={rankStr.startsWith("T-") ? "text-[var(--text-muted)]" : "text-[var(--text)]"}>
                            #{rankStr}
                          </span>
                        ) : (
                          "\u2014"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Sports Section */}
        {((detail.teams && detail.teams.length > 0) || (detail.events && detail.events.length > 0) || (detail.culture && detail.culture[sportsEventType])) && (() => {
          // Teams flagged Annual=Y in Team List (F1 Grands Prix, NASCAR races,
          // Sailing regattas, Powerboat races) are recurring events, not
          // standing team entries. Lift them out of detail.teams and inject
          // them into the Annual Sporting Events category alongside
          // Culture-Infra annuals like marathons and The Masters.
          const annualTeamEvents = (detail.teams || [])
            .filter((t) => t.annual === true)
            .map((t) => ({
              name: t.team,
              city: t.city,
              subtype: t.sport,
              type: "Sporting Event",
              annual: true,
            }));
          const mergedSportingEvents = [
            ...(detail.culture?.[sportsEventType] || []),
            ...annualTeamEvents,
          ];
          return (
            <section>
              <h2 id="sports" className="text-2xl font-bold mb-6">Sports</h2>
              {detail.teams && detail.teams.length > 0 && (
                <TeamsSection teams={detail.teams} />
              )}
              {((detail.events && detail.events.length > 0) || mergedSportingEvents.length > 0) && (
                <EventsSection events={detail.events || []} sportingEvents={mergedSportingEvents} />
              )}
            </section>
          );
        })()}

        {/* Top Companies Section */}
        {detail.marketCap && detail.marketCap.top12 && detail.marketCap.top12.length > 0 && (
          <section>
            <h2 id="companies" className="text-2xl font-bold mb-6">Top Companies</h2>
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


        {/* Cultural Assets Section (Cultural Events + Museums/Landmarks) */}
        {((detail.culture && culturalAssetOrder.some((type) => detail.culture?.[type] && detail.culture[type].length > 0)) ||
          (detail.supertallStructures && detail.supertallStructures.length > 0)) && (
          <section>
            <h2 id="culture" className="text-2xl font-bold mb-6">Cultural Assets</h2>
            <div className="space-y-8">
              {culturalAssetOrder.map((type) => {
                if (type === "Cultural Event") {
                  const all = detail.culture?.[type];
                  if (!all || all.length === 0) return null;
                  const annual = all.filter((a) => a.annual === true);
                  const oneOff = all
                    .filter((a) => !a.annual)
                    .slice()
                    .sort((a, b) => {
                      const ya = parseInt(a.name.trim().match(/^(\d{4})/)?.[1] || "0");
                      const yb = parseInt(b.name.trim().match(/^(\d{4})/)?.[1] || "0");
                      return yb - ya;
                    });
                  const renderCard = (asset: { name: string; city: string; subtype: string }, idx: number) => (
                    <div key={idx} className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-3 hover:border-[var(--accent)] transition">
                      <p className="font-medium text-[var(--text)]">{asset.name}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {asset.city}
                        {asset.subtype && ` \u2022 ${asset.subtype}`}
                      </p>
                    </div>
                  );
                  return (
                    <div key={type}>
                      <h3 className="text-lg font-semibold text-[var(--accent)] mb-4">Cultural Events</h3>
                      {annual.length > 0 && (
                        <div className="mb-6">
                          <h4 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">Annual Events</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {annual.map(renderCard)}
                          </div>
                        </div>
                      )}
                      {oneOff.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">Notable One-off Events</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {oneOff.map(renderCard)}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }
                if (type === "Museum/Landmark") {
                  const all = detail.culture?.[type] ?? [];
                  const supertallCount = detail.supertallStructures?.length ?? 0;
                  if (all.length === 0 && supertallCount === 0) return null;
                  // 4 smart buckets across the 20 subtypes. Unknown subtypes fall
                  // into "Landmarks & Civic" so future xlsx additions don't break.
                  const buckets: Array<{ name: string; subtypes: string[] }> = [
                    { name: "Museums & Galleries", subtypes: ["Art", "History", "Science", "Cultural Heritage", "Archaeology"] },
                    { name: "Performing Arts Venues", subtypes: ["Concert Hall", "Opera House", "Theatre", "Amphitheatre"] },
                    { name: "Parks, Zoos & Theme Parks", subtypes: ["Park/Garden", "Zoo", "Aquarium", "Theme Park"] },
                    { name: "Landmarks & Civic", subtypes: ["Memorial", "Religious site", "Government", "International Organization", "Library", "Shopping", "Film Hub"] },
                  ];
                  const knownSubtypes = new Set(buckets.flatMap((b) => b.subtypes));
                  const renderCard = (asset: { name: string; city: string; subtype: string }, idx: number) => (
                    <div key={idx} className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-3 hover:border-[var(--accent)] transition">
                      <p className="font-medium text-[var(--text)]">{asset.name}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {asset.city}
                        {asset.subtype && ` \u2022 ${asset.subtype}`}
                      </p>
                    </div>
                  );
                  const towers = detail.supertallStructures ?? [];
                  return (
                    <div key={type}>
                      <h3 className="text-lg font-semibold text-[var(--accent)] mb-4">Notable Museums & Landmarks</h3>
                      <div className="space-y-3">
                        {buckets.map((bucket) => {
                          const inBucket = all.filter((a) =>
                            bucket.name === "Landmarks & Civic"
                              ? bucket.subtypes.includes(a.subtype) || !knownSubtypes.has(a.subtype)
                              : bucket.subtypes.includes(a.subtype)
                          );
                          if (inBucket.length === 0) return null;
                          return (
                            <details key={bucket.name} className={COLLAPSIBLE_CARD_CLASS}>
                              <summary className={COLLAPSIBLE_SUMMARY_CLASS}>
                                <span className="font-semibold text-[var(--text)]">{bucket.name}</span>
                                <span className="text-sm text-[var(--text-muted)]">
                                  {inBucket.length} item{inBucket.length !== 1 ? "s" : ""}
                                </span>
                              </summary>
                              <div className="border-t border-[var(--border)] px-4 py-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                                {inBucket.map(renderCard)}
                              </div>
                            </details>
                          );
                        })}
                        {towers.length > 0 && (
                          <details className={COLLAPSIBLE_CARD_CLASS}>
                            <summary className={COLLAPSIBLE_SUMMARY_CLASS}>
                              <span className="font-semibold text-[var(--text)]">Supertall Structures (350m+)</span>
                              <span className="text-sm text-[var(--text-muted)]">
                                {towers.length} {towers.length === 1 ? "structure" : "structures"}
                              </span>
                            </summary>
                            <div className="border-t border-[var(--border)] overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead className="bg-[var(--bg-card)] text-[var(--text-muted)]">
                                  <tr>
                                    <th className="text-left font-medium px-4 py-2">Building</th>
                                    <th className="text-left font-medium px-4 py-2">City</th>
                                    <th className="text-right font-medium px-4 py-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Height (m)</th>
                                    <th className="text-right font-medium px-4 py-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Year</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {towers.map((t, idx) => (
                                    <tr key={idx} className="border-t border-[var(--border)]">
                                      <td className="px-4 py-2 font-medium text-[var(--text)]">{t.name}</td>
                                      <td className="px-4 py-2 text-[var(--text-muted)]">{t.city}</td>
                                      <td className="px-4 py-2 text-right text-[var(--text)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                                        {t.heightM.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                                      </td>
                                      <td className="px-4 py-2 text-right text-[var(--text-muted)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                                        {t.yearBuilt ?? "\u2014"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </details>
                        )}
                      </div>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </section>
        )}

        {/* Education & Research Section (collapsed by default) */}
        {((detail.universities && detail.universities.length > 0) ||
          (detail.culture && (
            (detail.culture["Hospital"]?.length ?? 0) > 0 ||
            (detail.culture["Research Institution"]?.length ?? 0) > 0
          ))) && (
          <section>
            <h2 id="education" className="text-2xl font-bold mb-6">Education &amp; Research</h2>
            <div className="space-y-3">
              {educationResearchOrder.map((type) => {
                if (type === "Universities") {
                  const unis = detail.universities;
                  if (!unis || unis.length === 0) return null;
                  return (
                    <details key={type} id="universities" className={COLLAPSIBLE_CARD_CLASS}>
                      <summary className={COLLAPSIBLE_SUMMARY_CLASS}>
                        <span className="font-semibold text-[var(--text)]">Top 2000 Universities</span>
                        <span className="text-sm text-[var(--text-muted)]">
                          {unis.length} {unis.length === 1 ? "entry" : "entries"}
                        </span>
                      </summary>
                      <div className="border-t border-[var(--border)] px-4 py-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {unis
                          .slice()
                          .sort((a, b) => a.rank - b.rank)
                          .map((uni, idx) => (
                            <div key={idx} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4 hover:border-[var(--accent)] transition">
                              <div className="flex items-start gap-3 mb-2">
                                <div className="text-[var(--accent)] font-bold text-lg" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                                  #{uni.rank}
                                </div>
                                <div className="flex-1">
                                  <p className="font-semibold text-[var(--text)]">{uni.name}</p>
                                  <p className="text-xs text-[var(--text-muted)]">{uni.city}, {uni.country}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </details>
                  );
                }
                const assets = detail.culture?.[type];
                if (!assets || assets.length === 0) return null;
                return (
                  <details key={type} className={COLLAPSIBLE_CARD_CLASS}>
                    <summary className={COLLAPSIBLE_SUMMARY_CLASS}>
                      <span className="font-semibold text-[var(--text)]">
                        {formatAssetHeading(type, detail.metro.dims)}
                      </span>
                      <span className="text-sm text-[var(--text-muted)]">
                        {assets.length} {assets.length === 1 ? "entry" : "entries"}
                      </span>
                    </summary>
                    <div className="border-t border-[var(--border)] px-4 py-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                      {assets.map((asset, idx) => (
                        <div key={idx} className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-3 hover:border-[var(--accent)] transition">
                          <p className="font-medium text-[var(--text)]">{asset.name}</p>
                          <p className="text-xs text-[var(--text-muted)]">
                            {asset.city}
                            {asset.subtype && ` \u2022 ${asset.subtype}`}
                          </p>
                        </div>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          </section>
        )}

        {/* Infrastructure Section */}
        {detail.culture && infrastructureOrder.some((type) => detail.culture?.[type] && detail.culture[type].length > 0) && (
          <section>
            <h2 id="infrastructure" className="text-2xl font-bold mb-6">Notable Infrastructure</h2>
            <div className="space-y-3">
              {infrastructureOrder.map((type) => {
                const assets = detail.culture?.[type];
                if (!assets || assets.length === 0) return null;
                const isTransit = type === "Metro System" || type === "Suburban Rail";
                return (
                  <details key={type} className={COLLAPSIBLE_CARD_CLASS}>
                    <summary className={COLLAPSIBLE_SUMMARY_CLASS}>
                      <span className="font-semibold text-[var(--text)]">
                        {formatAssetHeading(type, detail.metro.dims)}
                      </span>
                      <span className="text-sm text-[var(--text-muted)]">
                        {assets.length} {assets.length === 1 ? "entry" : "entries"}
                      </span>
                    </summary>
                    <div className="border-t border-[var(--border)] px-4 py-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                      {assets.map((asset, idx) => {
                        const subline = isTransit && asset.stations
                          ? `${asset.city} \u2022 ${asset.stations.toLocaleString()} stations`
                          : asset.subtype
                            ? `${asset.city} \u2022 ${asset.subtype}`
                            : asset.city;
                        return (
                          <div key={idx} className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-3 hover:border-[var(--accent)] transition">
                            <p className="font-medium text-[var(--text)]">{asset.name}</p>
                            <p className="text-xs text-[var(--text-muted)]">{subline}</p>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                );
              })}
            </div>
          </section>
        )}

        {/* Luxury Hospitality Section */}
        {detail.luxury && detail.luxury.length > 0 && (
          <section>
            <h2 id="luxury" className="text-2xl font-bold mb-6">Luxury Hospitality</h2>
            <div className="space-y-3">
              {Array.from(new Set(detail.luxury.map((l) => l.type))).map((type) => {
                const itemsOfType = detail.luxury!.filter((l) => l.type === type);
                return (
                  <details key={type} className={COLLAPSIBLE_CARD_CLASS}>
                    <summary className={COLLAPSIBLE_SUMMARY_CLASS}>
                      <span className="font-semibold text-[var(--text)]">{type}</span>
                      <span className="text-sm text-[var(--text-muted)]">
                        {itemsOfType.length} {itemsOfType.length === 1 ? "entry" : "entries"}
                      </span>
                    </summary>
                    <div className="border-t border-[var(--border)] px-4 py-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                      {itemsOfType.map((item, idx) => (
                        <div key={idx} className="bg-[var(--bg-card)] border border-[var(--border)] rounded p-3 hover:border-[var(--accent)] transition">
                          <p className="font-medium text-[var(--text)]">{item.name}</p>
                          <p className="text-xs text-[var(--text-muted)]">{item.city}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
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
  teams: Array<{ sport: string; league: string; team: string; city: string; major: boolean; level?: string }>
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
    level?: string;
    annual?: boolean;
  }>;
}) {
  // Teams flagged Annual=Y in Team List (col O) are recurring-event entries
  // (F1 Grands Prix, NASCAR races, Sailing regattas, Powerboat races). They
  // render under Annual Sporting Events in EventsSection, not in any team
  // bucket here, so we strip them before bucketing.
  const teamsForBucketing = teams.filter((t) => t.annual !== true);

  // Historic Venues (col B = "Historic Venues" in Team List) get their own
  // display beneath Notable Venues. Filter them out of the standard buckets.
  const historicVenuesRaw = teamsForBucketing.filter((t) => t.league === "Historic Venues");
  const nonHistoricForBucketing = teamsForBucketing.filter((t) => t.league !== "Historic Venues");

  // Major League Teams/Venues: Teams stays expanded; Notable Venues collapses by default.
  const majorTeamsRaw = sortTeamsFootballFirst(nonHistoricForBucketing.filter((t) => t.major));
  const majorTeamsOnly = majorTeamsRaw.filter((t) => t.league !== "Notable Venues");
  const majorVenues = majorTeamsRaw.filter((t) => t.league === "Notable Venues");

  // Other Teams: four sub-groupings, all collapsible. Priority order when sport + level
  // overlap: College first (pulls out NCAA/FBS/FCS/College Hockey regardless of sport),
  // then Football/Soccer (incl. W Football), then W-prefix women's, then everything else.
  // isCollege checks level === "College" as the authoritative signal (ETL sets this for
  // any row whose Main Division starts with NCAA, including minor-sport rows under
  // generic league labels like "Other Sports"). COLLEGE_LEAGUES is kept as a fallback.
  const COLLEGE_LEAGUES = new Set(["FBS", "FCS", "NCAA", "NCAA W", "College Hockey"]);
  const FOOTBALL_SPORTS = new Set(["Football", "Soccer", "Football/Soccer", "W Football"]);
  const isCollege = (t: { league: string; level?: string }) =>
    t.level === "College" || COLLEGE_LEAGUES.has(t.league);
  const isFootball = (sport: string) => FOOTBALL_SPORTS.has(sport);
  const isWomen = (sport: string) => /^W\s/.test(sport);

  const otherTeamsRaw = nonHistoricForBucketing.filter((t) => !t.major);
  const otherCollege = otherTeamsRaw.filter((t) => isCollege(t));
  const otherFootball = sortTeamsFootballFirst(
    otherTeamsRaw.filter((t) => !isCollege(t) && isFootball(t.sport))
  );
  const otherWomen = otherTeamsRaw.filter(
    (t) => !isCollege(t) && !isFootball(t.sport) && isWomen(t.sport)
  );
  const otherMen = otherTeamsRaw.filter(
    (t) => !isCollege(t) && !isFootball(t.sport) && !isWomen(t.sport)
  );

  const gridClass = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4";

  const collapsible = (
    label: string,
    items: typeof majorTeamsRaw,
    noun = "team"
  ) => (
    <details className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden group">
      <summary className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[var(--bg-card-hover)] transition select-none">
        <span className="font-semibold text-[var(--text)]">{label}</span>
        <span className="text-sm text-[var(--text-muted)]">
          {items.length} {noun}{items.length !== 1 ? "s" : ""}
        </span>
      </summary>
      <div className={`border-t border-[var(--border)] px-4 py-3 ${gridClass}`}>
        {items.map((team, idx) => (
          <TeamCard key={idx} team={team} />
        ))}
      </div>
    </details>
  );

  return (
    <div className="space-y-6">
      {(majorTeamsOnly.length > 0 || majorVenues.length > 0 || historicVenuesRaw.length > 0) && (
        <div>
          <h3 className="text-lg font-semibold text-[var(--accent)] mb-4">
            Major League Teams/Venues
          </h3>
          {majorTeamsOnly.length > 0 && (
            <div className={`${majorVenues.length > 0 ? "mb-3" : ""} ${gridClass}`}>
              {majorTeamsOnly.map((team, idx) => (
                <TeamCard key={idx} team={team} />
              ))}
            </div>
          )}
          {majorVenues.length > 0 && (() => {
            // Dedupe by venue name: a venue hosting multiple sports (e.g. Stade
            // de France for Football + Rugby Union + Olympics/Athletics) renders
            // once with all sports listed inside the card.
            type AggregatedVenue = { name: string; city: string; sports: string[] };
            const byName = new Map<string, AggregatedVenue>();
            for (const v of majorVenues) {
              const sport = normalizeTeamSport(v.sport);
              const existing = byName.get(v.team);
              if (existing) {
                if (!existing.sports.includes(sport)) existing.sports.push(sport);
              } else {
                byName.set(v.team, { name: v.team, city: v.city, sports: [sport] });
              }
            }
            const venues = Array.from(byName.values());
            venues.forEach((v) =>
              v.sports.sort((a, b) => venueSportRank(a) - venueSportRank(b))
            );
            venues.sort(
              (a, b) => venueSportRank(a.sports[0]) - venueSportRank(b.sports[0])
            );
            return (
              <details className={COLLAPSIBLE_CARD_CLASS}>
                <summary className={COLLAPSIBLE_SUMMARY_CLASS}>
                  <span className="font-semibold text-[var(--text)]">Notable Venues</span>
                  <span className="text-sm text-[var(--text-muted)]">
                    {venues.length} {venues.length === 1 ? "venue" : "venues"}
                  </span>
                </summary>
                <div className={`border-t border-[var(--border)] px-4 py-3 ${gridClass}`}>
                  {venues.map((venue, idx) => (
                    <div
                      key={idx}
                      className="border rounded-lg p-4 hover:border-[var(--accent)] transition bg-[var(--bg-card)] border-[var(--border)]"
                    >
                      <p className="text-xs text-[var(--text-muted)] mb-1">
                        {venue.sports.join(" \u2022 ")}
                      </p>
                      <p className="font-semibold text-[var(--text)]">{venue.name}</p>
                      <p className="text-xs text-[var(--text-dim)]">{venue.city}</p>
                    </div>
                  ))}
                </div>
              </details>
            );
          })()}
          {historicVenuesRaw.length > 0 && (() => {
            // Historic Venues: legacy or decommissioned sites that hosted major
            // sporting moments (Astrodome, Maple Leaf Gardens, Panathenaic
            // Stadium, etc.). Same dedupe-by-name pattern as Notable Venues so
            // a venue hosting multiple historic disciplines renders once.
            type AggregatedVenue = { name: string; city: string; sports: string[] };
            const byName = new Map<string, AggregatedVenue>();
            for (const v of historicVenuesRaw) {
              const sport = normalizeTeamSport(v.sport);
              const existing = byName.get(v.team);
              if (existing) {
                if (!existing.sports.includes(sport)) existing.sports.push(sport);
              } else {
                byName.set(v.team, { name: v.team, city: v.city, sports: [sport] });
              }
            }
            const venues = Array.from(byName.values());
            venues.forEach((v) =>
              v.sports.sort((a, b) => venueSportRank(a) - venueSportRank(b))
            );
            venues.sort(
              (a, b) => venueSportRank(a.sports[0]) - venueSportRank(b.sports[0])
            );
            return (
              <details className={`${COLLAPSIBLE_CARD_CLASS} mt-3`}>
                <summary className={COLLAPSIBLE_SUMMARY_CLASS}>
                  <span className="font-semibold text-[var(--text)]">Historic Venues</span>
                  <span className="text-sm text-[var(--text-muted)]">
                    {venues.length} {venues.length === 1 ? "venue" : "venues"}
                  </span>
                </summary>
                <div className={`border-t border-[var(--border)] px-4 py-3 ${gridClass}`}>
                  {venues.map((venue, idx) => (
                    <div
                      key={idx}
                      className="border rounded-lg p-4 hover:border-[var(--accent)] transition bg-[var(--bg-card)] border-[var(--border)]"
                    >
                      <p className="text-xs text-[var(--text-muted)] mb-1">
                        {venue.sports.join(" \u2022 ")}
                      </p>
                      <p className="font-semibold text-[var(--text)]">{venue.name}</p>
                      <p className="text-xs text-[var(--text-dim)]">{venue.city}</p>
                    </div>
                  ))}
                </div>
              </details>
            );
          })()}
        </div>
      )}
      {(otherFootball.length > 0 || otherCollege.length > 0 || otherMen.length > 0 || otherWomen.length > 0) && (
        <div>
          <h3 className="text-lg font-semibold text-[var(--text-muted)] mb-4">
            Other Teams
          </h3>
          <div className="space-y-3">
            {otherFootball.length > 0 && collapsible("Football/Soccer Teams", otherFootball)}
            {otherCollege.length > 0 && collapsible("College/University Teams", otherCollege)}
            {otherMen.length > 0 && collapsible("Other Men\u2019s Teams", otherMen)}
            {otherWomen.length > 0 && collapsible("Other Women\u2019s Teams", otherWomen)}
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
    level?: string;
  };
}) {
  const isFootball = team.sport === "Soccer" || team.sport === "Football/Soccer";
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
      <p className="text-xs text-[var(--text-dim)]">
        {team.city}
        {isFootball && team.level && <> • <span className="text-[var(--text-muted)]">Level: {team.level}</span></>}
      </p>
    </div>
  );
}

function EventsSection({
  events,
  sportingEvents,
}: {
  events: Array<{
    sport: string;
    event: string;
    year: string;
    venue: string;
    type?: string;
  }>;
  sportingEvents: Array<{
    name: string;
    city: string;
    subtype: string;
    type: string;
    annual?: boolean;
  }>;
}) {
  type EventItem = { event: string; year: string; venue: string; type?: string };
  const grouped: Record<string, EventItem[]> = {};

  // Extract a 4-digit year from the start of an event name (for Culture-Infra finals
  // like "1984 Super Bowl" where year is embedded in the name rather than a separate field).
  const extractYear = (name: string): string => {
    const m = name.trim().match(/^(\d{4})/);
    return m ? m[1] : "";
  };

  // 1. Annual Sporting Events — Culture-Infra "Sporting Event" rows flagged annual
  //    (Marathons, Tour de France, FA Cup Final, The Masters, etc.)
  const annualEvents = sportingEvents.filter((se) => se.annual === true);
  if (annualEvents.length > 0) {
    grouped["Annual Sporting Events"] = annualEvents.map((se) => ({
      event: se.name,
      year: "",
      venue: se.city,
      type: se.subtype,
    }));
  }

  // 2. Championship Finals — one-off championship moments from two sources:
  //    (a) Culture-Infra Sporting Events without the annual flag (year in the name)
  //    (b) Golf-Tennis-F1 rows with Event Type = "US Sports Finals" (NBA/NHL/MLB finals)
  const finalsFromCulture = sportingEvents
    .filter((se) => !se.annual)
    .map((se) => ({
      event: se.name,
      year: extractYear(se.name),
      venue: se.city,
      type: se.subtype,
    }));
  const finalsFromEvents = events
    .filter((ev) => ev.type === "US Sports Finals")
    .map((ev) => ({
      event: ev.event,
      year: ev.year || extractYear(ev.event),
      venue: ev.venue,
      type: ev.sport,
    }));
  const allFinals = [...finalsFromCulture, ...finalsFromEvents].sort(
    (a, b) => (parseInt(b.year) || 0) - (parseInt(a.year) || 0)
  );
  if (allFinals.length > 0) {
    grouped["Championship Finals"] = allFinals;
  }

  // 3-7. All-Star Games / Golf Majors / Tennis Majors / F1 Races / Major Fights.
  //      US Sports Finals rows are excluded because they're already in Championship Finals.
  //      All-Star Games unifies MLB/NBA/NHL All-Star Games and NFL Pro Bowl, routed by
  //      Event Type rather than sport so it supersedes the sport-based routing below.
  //      Major Fights unifies Boxing and Pro Wrestling (WrestleMania) into one bucket.
  for (const ev of events) {
    if (ev.type === "US Sports Finals") continue;
    let category: string | null = null;
    if (ev.type === "All-Star Game") category = "All-Star Games";
    else if (ev.sport === "Golf") category = "Golf Majors";
    else if (ev.sport === "Tennis") category = "Tennis Majors";
    else if (ev.sport === "F1") category = "F1 Races";
    else if (ev.sport === "Boxing" || ev.sport === "Pro Wrestling") category = "Major Fights";
    if (!category) continue;
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push({
      event: ev.event,
      year: ev.year,
      venue: ev.venue,
      type: ev.type,
    });
  }

  // Sort Major Fights and All-Star Games chronologically (newest first) because they mix sports/leagues.
  if (grouped["Major Fights"]) {
    grouped["Major Fights"].sort(
      (a, b) => (parseInt(b.year) || 0) - (parseInt(a.year) || 0)
    );
  }
  if (grouped["All-Star Games"]) {
    grouped["All-Star Games"].sort(
      (a, b) => (parseInt(b.year) || 0) - (parseInt(a.year) || 0)
    );
  }

  const categoryOrder = [
    "Annual Sporting Events",
    "Championship Finals",
    "All-Star Games",
    "Golf Majors",
    "Tennis Majors",
    "F1 Races",
    "Major Fights",
  ];
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
                  {ev.type && (
                    <p className="text-xs text-[var(--accent)]">{ev.type}</p>
                  )}
                  <p className="text-xs text-[var(--text-muted)]">
                    {ev.year} {"\u2022"} {ev.venue}
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
function getDimensionAnchor(key: string): string | null {
  const anchors: Record<string, string> = {
    majorLeagueTeams: "sports",
    totalTeams: "sports",
    majorSportingEvents: "sports",
    companies: "companies",
    marketCap: "companies",
    culturalEvents: "culture",
    universities: "universities",
    topUniHospResearch: "universities",
    museumsLandmarks: "culture",
    portsExchangesInfra: "infrastructure",
    airportScore: "infrastructure",
    luxuryStars: "luxury",
    metroStations: "infrastructure",
    suburbStations: "infrastructure",
    trainHubs: "infrastructure",
    skyscrapers: "infrastructure",
  };
  return anchors[key] || null;
}

function formatDimensionName(key: string): string {
  const names: Record<string, string> = {
    majorLeagueTeams: "Major League Teams/Venues",
    totalTeams: "Total Teams",
    majorSportingEvents: "Major Sporting Events",
    companies: "Major Companies",
    marketCap: "Market Cap Score",
    culturalEvents: "Cultural Events",
    universities: "Universities",
    topUniHospResearch: "Top Universities, Hospitals, & Research",
    museumsLandmarks: "Notable Museums & Landmarks",
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
