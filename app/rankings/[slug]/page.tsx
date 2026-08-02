import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { olympicEditionSlugFromName } from "@/lib/olympics";
import { getMetroTitles, getFormerTopFlightForMetro, type FormerTopFlight } from "@/lib/championsHistory";
import ChampionLogo from "@/app/teams/_shared/ChampionLogo";
import FollowButton from "@/app/FollowButton";
import ShareRow from "@/app/_shared/ShareRow";
import { competitionHref } from "@/lib/competitionLinks";
import HubNav from "@/app/teams/HubNav";
import { getSoundForMetro } from "@/lib/sound";
import SoundSection from "./SoundSection";
import { getScreenForMetro } from "@/lib/screen";
import ScreenSection from "./ScreenSection";
import { getMayor } from "@/lib/mayors";
import {
  getAllMetros,
  getMetroDetail,
  getRelocationsForMetro,
  getSimilarMetrosForMetro,
  formatPop,
  formatMarketCap,
  formatGdp,
  formatDimValue,
  regionColors,
  slugify,
} from "@/lib/data";
import { BASE_URL, placeJsonLd, serializeJsonLd, sportsTeamJsonLd } from "@/lib/seo";
import {
  getQualifierByMetroName,
  qualifierAnchorId,
} from "@/lib/neighborhoods";
import {
  getTopTeamByMetroName,
  topTeamAnchorId,
} from "@/lib/topTeams";
import { computeTier } from "@/lib/tiers";
import { normalizeSport, sportIcon, leagueIcon } from "@/lib/sportLabels";
import { getBaseballLeagueByName } from "@/lib/allTeams";
import { getCwsForSchool } from "@/lib/cws";
import { getCrest } from "@/lib/teamCrest";
import { getRugbyClubHonours } from "@/lib/rugbyClubs";
import { getT20Honours } from "@/lib/cricketClubs";
import { getEuroleagueHonours } from "@/lib/basketball";
import { getDomesticHonours } from "@/lib/domesticHonours";
import { rugbyClubColor, rugbyMonogram } from "@/lib/rugby-colors";
import { cricketClubColor } from "@/lib/cricket-colors";
import { euroleagueClubColor, euroleagueMonogram } from "@/lib/euroleague-colors";
import { getNpbTeamByName } from "@/lib/npb";
import { getCurrentChampionships } from "@/lib/champions";
import ChampionBadge from "@/app/teams/ChampionBadge";
import { isGoldStandardLeague } from "@/lib/goldStandard";
import { getNflFranchiseByTeamName, getChampionshipAppearances as getNflChampApps } from "@/lib/nfl";
import { getMlbFranchiseByTeamName } from "@/lib/mlb";
import { getNbaFranchiseByTeamName } from "@/lib/nba";
import { getNhlFranchiseByTeamName } from "@/lib/nhl";
import { getIplFranchiseByTeamName } from "@/lib/ipl";
import { getFootballClubByName, getClTitlesForClub } from "@/lib/football";
import { getDomesticClubByName, getDefunctNaslForMetro } from "@/lib/domesticFootball";
import { getDefunctBritishRLForMetro, getBritishRLTitlesForClub, type DefunctRLClub } from "@/lib/britishRugbyLeague";
import { getWnbaFranchiseByTeamName } from "@/lib/wnba";
import { getCflFranchiseByTeamName } from "@/lib/cfl";
import { getF1RaceResultByName } from "@/lib/f1";
import { getAflFranchiseByTeamName } from "@/lib/afl";
import { getNrlFranchiseByTeamName } from "@/lib/nrl";
import { getWClubByName } from "@/lib/wfootball";
import { resolveTeamLink, type TeamLink } from "@/lib/teamLinks";
import { getCfbTeamForName, cfbMonogram, getFormerMajorCfbForMetro, type FormerCfbCard } from "@/lib/cfb";
import { getFormerMajorCbbForMetro, getCbbTeamForName, cbbMonogram, type FormerCbbCard, type CbbTeam } from "@/lib/cbb";
import { getWcbbForMetro, getFormerWcbbForMetro, type WcbbCard, type FormerWcbbCard } from "@/lib/wcbb";
import { getNflEuropeForMetro } from "@/lib/nflEurope";
import { getCollegeHockeyForMetro, type CollegeHockeyCard } from "@/lib/collegeHockey";
import BadgeChips from "./BadgeChips";
import MetroPageMap from "./MetroPageMap";

export const dynamicParams = true;
export const revalidate = 86400;

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

// Pre-render only the top metros by score at build; the long tail (~4,000
// pages plus their OG cards) renders on demand via ISR and is cached. The
// per-metro pages were ~63% of build prerenders, removed without changing
// what readers see. dynamicParams=true above allows any valid slug on demand.
const PRERENDER_TOP_N = 250;

export async function generateStaticParams() {
  return [...getAllMetros()]
    .sort((a, b) => b.score - a.score)
    .slice(0, PRERENDER_TOP_N)
    .map((m) => ({ slug: m.slug }));
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
  const sound = getSoundForMetro(slug);
  const screen = getScreenForMetro(slug);
  const mayor = await getMayor(slug);

  if (!detail) {
    notFound();
  }

  const { metro } = detail;
  const neighborhoodQualifier = getQualifierByMetroName(metro.name);
  const topTeamPick = getTopTeamByMetroName(metro.name);
  const allMetros = getAllMetros();
  const currentIndex = allMetros.findIndex((m) => m.slug === slug);
  const bestScore = Math.max(...allMetros.map((m) => m.score));

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

      <div className="max-w-6xl mx-auto px-4 pt-12 pb-8 space-y-12">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <a href="/" className="hover:text-[var(--accent)] transition">
            Rankings
          </a>
          <span>/</span>
          <a
            href={`/#region-${slugify(metro.region)}`}
            className="text-[var(--text)] hover:text-[var(--accent)] transition"
          >
            {metro.region}
          </a>
          <span>/</span>
          {(metro.sovereignSlug ?? metro.countrySlug) ? (
            <Link
              href={`/countries/${metro.sovereignSlug ?? metro.countrySlug}`}
              className="text-[var(--text)] hover:text-[var(--accent)]"
            >
              {metro.country}
            </Link>
          ) : (
            <span className="text-[var(--text)]">{metro.country}</span>
          )}
          {metro.subCountry && (
            <>
              <span>/</span>
              {metro.countrySlug ? (
                <Link
                  href={`/countries/${metro.countrySlug}`}
                  className="text-[var(--text)] hover:text-[var(--accent)]"
                >
                  {metro.subCountry}
                </Link>
              ) : (
                <span className="text-[var(--text)]">{metro.subCountry}</span>
              )}
            </>
          )}
          <span>/</span>
          <span className="text-[var(--accent)]">{metro.name}</span>
        </nav>

        {/* Hero Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <div className="lg:col-span-2">
            <h1 className="text-4xl sm:text-5xl font-bold mb-4" style={{ color: regionColors[metro.region] || "var(--accent)" }}>
              {metro.name}
            </h1>
            <div className="mb-4">
              <FollowButton type="metro" slug={slug} name={metro.name} href={`/rankings/${slug}`} />
            </div>
            <div className="space-y-2 text-[var(--text-muted)]">
              <p className="text-lg">
                {(metro.sovereignSlug ?? metro.countrySlug) ? (
                  <Link
                    href={`/countries/${metro.sovereignSlug ?? metro.countrySlug}`}
                    className="hover:text-[var(--accent)]"
                  >
                    {metro.country}
                  </Link>
                ) : (
                  metro.country
                )}
                {metro.subCountry && (
                  <>
                    {" "}•{" "}
                    {metro.countrySlug ? (
                      <Link
                        href={`/countries/${metro.countrySlug}`}
                        className="text-[var(--text)] hover:text-[var(--accent)]"
                      >
                        {metro.subCountry}
                      </Link>
                    ) : (
                      <span className="text-[var(--text)]">{metro.subCountry}</span>
                    )}
                  </>
                )}
                {" "}•{" "}
                <a
                  href={`/#region-${slugify(metro.region)}`}
                  className="hover:text-[var(--accent)]"
                >
                  {metro.region}
                </a>
              </p>
              {metro.primaryCity && (
                <p className="text-lg">
                  Primary City: <span className="text-[var(--text)]">{metro.primaryCity}</span>
                </p>
              )}
              {mayor && (
                <p className="text-lg">
                  Mayor of {mayor.city}: <span className="text-[var(--text)]">{mayor.mayor}</span>{mayor.party ? <span className="text-[var(--text-muted)] text-sm"> ({mayor.party})</span> : null}
                  {mayor.since ? (
                    <span className="text-[var(--text-muted)] text-sm"> (since {mayor.since.slice(0, 4)})</span>
                  ) : null}
                  {mayor.second ? (
                    <span className="text-[var(--text-muted)] text-sm"> · {mayor.second.name} ({mayor.second.role})</span>
                  ) : null}
                </p>
              )}
              {metro.primaryState && (
                <p className="text-lg">
                  Primary State/Province:{" "}
                  {metro.stateSlug ? (
                    <Link
                      href={`/states/${metro.stateSlug}`}
                      className="text-[var(--text)] hover:text-[var(--accent)]"
                    >
                      {metro.primaryState}
                    </Link>
                  ) : (
                    <span className="text-[var(--text)]">{metro.primaryState}</span>
                  )}
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
              {/* Sources line: outbound link to canonical Wikipedia and
                  Wikidata records for the metro. Renders only when populated
                  (Top 156 as of 2026-05-01, expanded from Top 100 prior). Pairs
                  with the Place.sameAs emitted in JSON-LD above so visible UX
                  matches schema. */}
              {(metro.wikipediaUrl || metro.qid) && (
                <p className="text-sm pt-2">
                  <span className="text-[var(--text-muted)]">Sources: </span>
                  {metro.wikipediaUrl && (
                    <a
                      href={metro.wikipediaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--accent)] hover:underline"
                    >
                      Wikipedia
                    </a>
                  )}
                  {metro.wikipediaUrl && metro.qid && (
                    <span className="text-[var(--text-muted)]"> · </span>
                  )}
                  {metro.qid && (
                    <a
                      href={`https://www.wikidata.org/wiki/${metro.qid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--accent)] hover:underline"
                    >
                      Wikidata
                    </a>
                  )}
                </p>
              )}
              {/* Badges row: which categorical lenses this metro qualifies
                  for. Lives below Wikipedia/Wikidata sources so the chip row
                  reads as a peer of the structured-data citations. */}
              <BadgeChips slug={slug} />
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
            {/* Tier pill: categorical label for the score band. Links to the
                relevant section of the methodology page so a reader can see
                the boundaries and rationale for each band. */}
            {(() => {
              const tier = computeTier(metro.score);
              return (
                <Link
                  href={`/methodology#tier-${tier.slug}`}
                  className="inline-block mt-3 text-xs font-semibold rounded-full px-3 py-1 border transition hover:opacity-80"
                  style={{
                    color: tier.accentHex,
                    borderColor: tier.accentHex,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                  title={tier.tagline}
                >
                  {tier.name}
                </Link>
              );
            })()}
            {metro.pctOfCountry > 0 && (
              <>
                <hr className="my-4 border-[var(--border)]" />
                <p className="text-xs text-[var(--text-muted)] mb-1">% of Country Score</p>
                <p className="text-2xl font-bold text-[var(--accent)]">
                  {metro.pctOfCountry.toFixed(1)}%
                </p>
              </>
            )}
            {/* Share row: Reddit and LinkedIn share links. X is intentionally
                excluded. The OG image rendered at /rankings/[slug]/opengraph-image
                gives each share preview a per-metro card with tier badge,
                rank, score, and three signature dimensions. */}
            <hr className="my-4 border-[var(--border)]" />
            <p className="text-xs text-[var(--text-muted)] mb-2">Share</p>
            <ShareRow
              url={`${BASE_URL}/rankings/${slug}`}
              title={`${metro.name} (#${metro.rank}) - Global Metro Power Rankings`}
              containerClassName="flex gap-2 text-xs"
              linkClassName="flex-1 text-center rounded border px-2 py-1.5 text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors"
            />
          </div>
        </div>

        {/* Capital + Largest City Card */}
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
                      <p className="text-xs text-[var(--text-muted)]">
                        National capital of{" "}
                        {(metro.sovereignSlug ?? metro.countrySlug) ? (
                          <Link
                            href={`/countries/${metro.sovereignSlug ?? metro.countrySlug}`}
                            className="hover:text-[var(--accent)]"
                          >
                            {metro.country}
                          </Link>
                        ) : (
                          metro.country
                        )}
                      </p>
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
                      <p className="text-xs text-[var(--text-muted)]">
                        Largest metro area in{" "}
                        {(metro.sovereignSlug ?? metro.countrySlug) ? (
                          <Link
                            href={`/countries/${metro.sovereignSlug ?? metro.countrySlug}`}
                            className="hover:text-[var(--accent)]"
                          >
                            {metro.country}
                          </Link>
                        ) : (
                          metro.country
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {(() => {
          const navItems = [
            { label: "Map", href: "#map" },
            { label: "Dimensions", href: "#stats" },
            ...((getSimilarMetrosForMetro(slug)?.neighbors?.length ?? 0) > 0 ? [{ label: "Similar Metros", href: "#similar" }] : []),
            ...(((detail.teams && detail.teams.length > 0) || (detail.events && detail.events.length > 0) || (detail.culture && detail.culture[sportsEventType]) || getRelocationsForMetro(slug).length > 0 || getFormerTopFlightForMetro(slug).length > 0 || getFormerMajorCfbForMetro(slug).length > 0 || getFormerMajorCbbForMetro(slug).length > 0 || getFormerWcbbForMetro(slug).length > 0 || getDefunctBritishRLForMetro(slug).length > 0) ? [{ label: "Sports", href: "#sports" }] : []),
            ...(getMetroTitles(slug).length > 0 ? [{ label: "Championships", href: "#championships" }] : []),
            ...(detail.marketCap && detail.marketCap.top12 && detail.marketCap.top12.length > 0 ? [{ label: "Companies", href: "#companies" }] : []),
            ...(((detail.culture && culturalAssetOrder.some((type) => detail.culture?.[type] && (detail.culture[type]?.length ?? 0) > 0)) || (detail.supertallStructures && detail.supertallStructures.length > 0)) ? [{ label: "Culture", href: "#culture" }] : []),
            ...(((detail.universities && detail.universities.length > 0) || (detail.culture && (((detail.culture["Hospital"]?.length ?? 0) > 0) || ((detail.culture["Research Institution"]?.length ?? 0) > 0)))) ? [{ label: "Education", href: "#education" }] : []),
            ...((detail.culture && infrastructureOrder.some((type) => detail.culture?.[type] && (detail.culture[type]?.length ?? 0) > 0)) ? [{ label: "Infrastructure", href: "#infrastructure" }] : []),
            ...(detail.luxury && detail.luxury.length > 0 ? [{ label: "Luxury", href: "#luxury" }] : []),
            ...(sound ? [{ label: "Sound", href: "#sound" }] : []),
            ...(screen ? [{ label: "Screen", href: "#screen" }] : []),
          ];
          return <HubNav items={navItems} />;
        })()}

        {/* Map: cluster context for any metro that's part of a multi-metro
            conurbation, single-point Location pin otherwise. Returns null
            for the handful of zero-coord workbook entries. The #map id is
            the anchor target for stadium-name links on the per-team pages
            (e.g. /teams/nfl/buffalo-bills "Home: Highmark Stadium"). */}
        <div id="map" className="scroll-mt-20">
          <MetroPageMap slug={slug} teams={detail.teams} universities={detail.universities} />
        </div>

        {/* Top Team : surfaced for metros that landed a pick on the Top
            Sports Teams sheet. Mirrors the Walkable Elite Quarters card so
            civic-identity surfaces cluster visually on the metro page. */}
        {topTeamPick && (
          <section>
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-6">
              <div className="flex items-start gap-4 flex-wrap">
                <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-amber-400 text-lg" aria-hidden="true">&#9812;</span>
                </div>
                <div className="flex-1 min-w-[160px]">
                  <p className="text-sm font-semibold text-amber-400">Top Team</p>
                  <p className="text-xs text-[var(--text-muted)] mb-3">
                    The single sporting franchise this metro is identified with.
                  </p>
                  <div className="flex flex-wrap gap-2 items-center">
                    {topTeamPick.team.split("/").map((name) => {
                      const trimmed = name.trim();
                      return (
                        <Link
                          key={trimmed}
                          href={`/top-teams#${topTeamAnchorId(topTeamPick.metro)}`}
                          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20 hover:text-amber-200 transition-colors"
                        >
                          {trimmed}
                        </Link>
                      );
                    })}
                    {topTeamPick.sport && (
                      <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-mono border border-[var(--border)] rounded px-2 py-0.5">
                        {topTeamPick.sport === "American Football (NCAA)"
                          ? "College Football"
                          : topTeamPick.sport === "Basketball (NCAA)"
                          ? "College Basketball"
                          : normalizeSport(topTeamPick.sport)}
                      </span>
                    )}
                    {topTeamPick.team.includes("/") && (
                      <span className="text-[10px] uppercase tracking-widest text-amber-400 font-mono border border-amber-500/30 rounded px-2 py-0.5">
                        Co-equal
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-3">
                    From{" "}
                    <Link
                      href={`/top-teams#${topTeamAnchorId(topTeamPick.metro)}`}
                      className="underline hover:text-[var(--accent)] transition-colors"
                    >
                      The Team That Wins the City
                    </Link>
                    . One pick per metro across 312 metros worldwide.
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Walkable Elite Quarters : surfaced for metros that clear the Marylebone test */}
        {neighborhoodQualifier && (
          <section>
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-6">
              <div className="flex items-start gap-4 flex-wrap">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-emerald-400 text-lg" aria-hidden="true">&#9873;</span>
                </div>
                <div className="flex-1 min-w-[160px]">
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
                    . A small qualifying set out of the full corpus.
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Dimension Breakdown — consolidated value + global rank. Replaces
            the former Key Statistics grid, whose metrics duplicated these
            dimensions (Market Cap also appears under Top Companies; skyscraper
            counts under Skyline). All 16 dimensions render; empties recede. */}
        <section>
          <div className="flex items-baseline justify-between gap-3 mb-4 flex-wrap">
            <h2 id="stats" className="text-2xl font-bold">Dimension Breakdown</h2>
            <span className="text-xs text-[var(--text-muted)]">Value and global rank across all 16 dimensions</span>
          </div>
          {(() => {
            const sig = getSimilarMetrosForMetro(slug)?.signature ?? [];
            if (sig.length === 0) return null;
            return (
              <p className="text-sm text-[var(--text-muted)] mb-4">
                Stands out for{" "}
                <span className="text-[var(--text)]">
                  {sig.map((k) => formatDimensionName(k)).join(", ")}
                </span>
                .
              </p>
            );
          })()}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {Object.entries(metro.dims).map(([key, value]) => {
              const anchor =
                key === "skyscrapers"
                  ? ((detail.supertallStructures?.length ?? 0) > 0 ? "skyline" : null)
                  : getDimensionAnchor(key);
              const rankStr = detail.dimRanks?.[key];
              const isEmpty = !(typeof value === "number" && value > 0);
              const rankNum = rankStr ? parseInt(rankStr.replace(/^T-/, ""), 10) : NaN;
              const rankClass =
                rankStr === "1"
                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                  : Number.isFinite(rankNum) && rankNum <= 5
                  ? "text-[var(--accent)] border-[var(--accent)]"
                  : "text-[var(--text-muted)] border-[var(--border)]";
              const inner = (
                <div
                  className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-[var(--border)] transition ${anchor ? "hover:border-[var(--accent)]" : ""} ${isEmpty ? "opacity-40" : ""}`}
                  style={{ background: "var(--bg-card)" }}
                >
                  <span className="text-sm text-[var(--text)] leading-snug pr-2">
                    {formatDimensionName(key)}
                    {anchor && <span className="text-xs text-[var(--text-muted)] ml-1">&#8599;</span>}
                  </span>
                  <span className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-sm text-[var(--text-muted)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {typeof value === "number" ? formatDimValue(key, value) : "—"}
                    </span>
                    {rankStr && (
                      <span
                        className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs border ${rankClass}`}
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        #{rankStr}
                      </span>
                    )}
                  </span>
                </div>
              );
              return anchor ? (
                <a key={key} href={`#${anchor}`} className="block">{inner}</a>
              ) : (
                <div key={key}>{inner}</div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-4 mt-3 text-xs text-[var(--text-muted)]">
            <span className="inline-flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-sm bg-emerald-400"></span>World #1</span>
            <span className="inline-flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-sm" style={{ background: "var(--accent)" }}></span>Top 5</span>
            <span className="inline-flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-sm bg-[var(--text-muted)]"></span>Outside top 5</span>
          </div>
        </section>

        {/* Most similar metros — nearest profiles across all 16 dimensions,
            precomputed by scripts/build-similar-metros.py. Mirrors everynoise's
            "click a place to sort by similarity" idea. */}
        {(() => {
          const similar = getSimilarMetrosForMetro(slug);
          if (!similar || !similar.neighbors || similar.neighbors.length === 0) return null;
          return (
            <section>
              <div className="flex items-baseline justify-between gap-3 mb-4 flex-wrap">
                <h2 id="similar" className="text-2xl font-bold">Most similar metros</h2>
                <span className="text-xs text-[var(--text-muted)]">Closest profiles across all 16 dimensions</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {similar.neighbors.map((n) => (
                  <Link
                    key={n.slug}
                    href={`/rankings/${n.slug}`}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-[var(--border)] transition hover:border-[var(--accent)]"
                    style={{ background: "var(--bg-card)" }}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: regionColors[n.region] || "var(--accent)" }}
                      />
                      <span className="flex flex-col min-w-0">
                        <span className="text-sm text-[var(--text)] truncate">{n.name}</span>
                        <span className="text-xs text-[var(--text-muted)] truncate">{n.country}</span>
                      </span>
                    </span>
                    <span className="text-xs text-[var(--text-muted)] flex-shrink-0" style={{ fontFamily: "'JetBrains Mono', monospace" }}>#{n.rank}</span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })()}

        {/* Sports Section */}
        {((detail.teams && detail.teams.length > 0) || (detail.events && detail.events.length > 0) || (detail.culture && detail.culture[sportsEventType]) || getRelocationsForMetro(slug).length > 0 || getFormerTopFlightForMetro(slug).length > 0 || getFormerMajorCfbForMetro(slug).length > 0 || getFormerMajorCbbForMetro(slug).length > 0 || getFormerWcbbForMetro(slug).length > 0 || getDefunctBritishRLForMetro(slug).length > 0) && (() => {
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
              subtype: normalizeSport(t.sport),
              type: "Sporting Event",
              annual: true,
            }));
          // Deduplicate by name — Tennis Majors and similar events can appear
          // in both the Culture-Infra "Sporting Event" rows and Team List annual
          // entries. Keep the first occurrence (Culture-Infra wins as authoritative).
          const _merged = [
            ...(detail.culture?.[sportsEventType] || []),
            ...annualTeamEvents,
          ];
          const _seen = new Set<string>();
          const mergedSportingEvents = _merged.filter((e) => {
            const key = e.name.trim().toLowerCase();
            if (_seen.has(key)) return false;
            _seen.add(key);
            return true;
          });
          return (
            <section>
              <h2 id="sports" className="text-2xl font-bold mb-6">Sports</h2>
              {((detail.teams && detail.teams.length > 0) || getRelocationsForMetro(slug).length > 0 || getFormerTopFlightForMetro(slug).length > 0 || getFormerMajorCfbForMetro(slug).length > 0 || getFormerMajorCbbForMetro(slug).length > 0 || getFormerWcbbForMetro(slug).length > 0 || getDefunctBritishRLForMetro(slug).length > 0) && (
                <TeamsSection teams={detail.teams || []} metroName={metro.name} topTeamPick={topTeamPick} relocations={getRelocationsForMetro(slug)} formerCfb={getFormerMajorCfbForMetro(slug)} formerCbb={getFormerMajorCbbForMetro(slug)} wcbb={getWcbbForMetro(slug)} collegeHockey={getCollegeHockeyForMetro(slug)} formerWcbb={getFormerWcbbForMetro(slug)} formerRugby={getFormerTopFlightForMetro(slug)} defunctRL={getDefunctBritishRLForMetro(slug)} />
              )}
              {((detail.events && detail.events.length > 0) || mergedSportingEvents.length > 0) && (
                <EventsSection events={detail.events || []} sportingEvents={mergedSportingEvents} />
              )}
            </section>
          );
        })()}

        {/* Championship History: every title won by a team while based here */}
        {(() => {
          const titles = getMetroTitles(slug);
          if (!titles.length) return null;
          return (
            <section>
              <h2 id="championships" className="text-2xl font-bold mb-2">Championship History</h2>
              <p className="text-sm text-[var(--text-muted)] mb-4">
                Every major championship won by a team while it represented {metro.name}, across all
                sports, newest first. {titles.length} in total. Each links to the team and the
                competition&apos;s full honour roll.
              </p>
              <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden">
                {/* Mobile: one card per title, same data as the desktop table */}
                <div className="sm:hidden divide-y divide-[var(--border)] max-h-[32rem] overflow-y-auto">
                  {titles.map((t, i) => (
                    <div key={`${t.compSlug}-${t.year}-${i}-card`} className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <ChampionLogo name={t.champion} canonical={t.canonical} size={t.tier != null && t.tier <= 2 ? 22 : 16} />
                        {t.teamHref ? (
                          <Link href={t.teamHref} className={`hover:text-[var(--accent)] hover:underline text-[var(--text)] ${t.tier != null && t.tier <= 2 ? "font-bold text-base" : "font-medium text-sm"}`}>{t.champion}</Link>
                        ) : (
                          <span className={`text-[var(--text)] ${t.tier != null && t.tier <= 2 ? "font-bold text-base" : "font-medium text-sm"}`}>{t.champion}</span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs tabular-nums text-[var(--text-muted)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        <span>{t.year ?? "\u2014"}</span>
                        {t.date ? <span>{"\u00b7"} {t.date}</span> : null}
                      </div>
                      <div className="mt-1 text-xs">
                        {sportIcon(t.sport) ? <span aria-hidden className="mr-1">{sportIcon(t.sport)}</span> : null}
                        <Link href={competitionHref(t.compSlug)} className="text-[var(--text-muted)] hover:text-[var(--accent)] hover:underline">{t.eraName || t.competition}</Link>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Desktop: full table */}
                <div className="hidden sm:block max-h-[32rem] overflow-y-auto overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-[var(--bg-card)] border-b border-[var(--border)]">
                      <tr className="text-left text-[10px] uppercase tracking-widest text-[var(--text-dim)]">
                        <th className="px-4 py-2 font-semibold">Year</th>
                        <th className="px-4 py-2 font-semibold">Date</th>
                        <th className="px-4 py-2 font-semibold">Champion</th>
                        <th className="px-4 py-2 font-semibold">Competition</th>
                      </tr>
                    </thead>
                    <tbody>
                      {titles.map((t, i) => (
                        <tr key={`${t.compSlug}-${t.year}-${i}`} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-card-hover)] transition">
                          <td className="px-4 py-2 tabular-nums whitespace-nowrap" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                            {t.year ?? "\u2014"}
                          </td>
                          <td className="px-4 py-2 tabular-nums whitespace-nowrap text-[var(--text-muted)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                            {t.date || "\u2014"}
                          </td>
                          <td className="px-4 py-2">
                            <ChampionLogo name={t.champion} canonical={t.canonical} size={t.tier != null && t.tier <= 2 ? 22 : 16} />
                            {t.teamHref ? (
                              <Link href={t.teamHref} className={`hover:text-[var(--accent)] hover:underline text-[var(--text)] ${t.tier != null && t.tier <= 2 ? "font-bold text-base" : ""}`}>{t.champion}</Link>
                            ) : (
                              <span className={`text-[var(--text)] ${t.tier != null && t.tier <= 2 ? "font-bold text-base" : ""}`}>{t.champion}</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-xs">
                            {sportIcon(t.sport) ? <span aria-hidden className="mr-1">{sportIcon(t.sport)}</span> : null}
                            <Link href={competitionHref(t.compSlug)} className="text-[var(--text-muted)] hover:text-[var(--accent)] hover:underline">{t.eraName || t.competition}</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          );
        })()}

        {/* Top Companies Section */}
        {detail.marketCap && detail.marketCap.top12 && detail.marketCap.top12.length > 0 && (
          <section>
            <h2 id="companies" className="text-2xl font-bold mb-6">Top Companies</h2>

            {/* Mobile: one card per company instead of a 4-column table.
                Same detail.marketCap.top12 array, card presentation only. */}
            <div className="grid grid-cols-1 gap-2 sm:hidden">
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
                  <div
                    key={`${idx}-card`}
                    className="rounded-lg border p-3 flex items-center justify-between gap-3"
                    style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="text-[var(--text-muted)] font-mono text-sm flex-shrink-0"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {idx + 1}
                      </span>
                      <span className="font-medium text-sm truncate">{name}</span>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div
                        className="text-[var(--accent)] font-mono text-sm"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {formatMarketCap(val)}
                      </div>
                      {source && <div className={`text-xs ${sourceColor}`}>{source}</div>}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden hidden sm:block">
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
            {detail.marketCap.asOf && (
              <p className="text-xs text-[var(--text-muted)] mt-1 italic">
                Source data as of{" "}
                {new Date(detail.marketCap.asOf + "T00:00:00").toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}{" "}
                (companiesmarketcap.com)
              </p>
            )}
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
                  const culturalAll = detail.culture?.[type] || [];
                  // Pull Music-track events (Eurovision Song Contest in particular)
                  // out of detail.events and present them alongside Culture-Infra
                  // Cultural Events. Eurovision is filed in Golf-Tennis-F1 because
                  // the source spreadsheet uses that sheet for any year-stamped
                  // event tied to a venue. Surfacing it under Notable One-off
                  // Events on the metro page is the natural home. Keep both
                  // sport === "Music" and type === "Music Event" as triggers so
                  // future entries are matched even if one field is empty.
                  const musicEvents = (detail.events || [])
                    .filter((ev) => ev.sport === "Music" || ev.type === "Music Event")
                    .map((ev) => ({
                      name: ev.year ? `${ev.year} ${ev.event}` : ev.event,
                      city: ev.venue,
                      subtype: ev.type || "Music Event",
                      annual: false,
                    }));
                  const all = [...culturalAll, ...musicEvents];
                  if (all.length === 0) return null;
                  const annual = all.filter((a) => a.annual === true);
                  // Year extraction: look for any 4-digit year in the name so
                  // entries with year prefixes ("2011 Christchurch Earthquake")
                  // and parenthesised year suffixes ("Watergate Break-in (1972)")
                  // both sort correctly by recency.
                  const extractYear = (name: string): number => {
                    const matches = name.match(/(\d{4})/g);
                    if (!matches) return 0;
                    return Math.max(...matches.map((m) => parseInt(m, 10)));
                  };
                  const oneOff = all
                    .filter((a) => !a.annual)
                    .slice()
                    .sort((a, b) => extractYear(b.name) - extractYear(a.name));
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
                          <details id="skyline" className={COLLAPSIBLE_CARD_CLASS}>
                            <summary className={COLLAPSIBLE_SUMMARY_CLASS}>
                              <span className="font-semibold text-[var(--text)]">Supertall Structures (350m+)</span>
                              <span className="text-sm text-[var(--text-muted)]">
                                {towers.length} {towers.length === 1 ? "structure" : "structures"}
                              </span>
                            </summary>
                            <div className="border-t border-[var(--border)]">
                              {/* Mobile: stacked cards */}
                              <div className="sm:hidden divide-y divide-[var(--border)]">
                                {towers.map((t, idx) => (
                                  <div key={idx} className="px-4 py-2.5">
                                    <p className="font-medium text-[var(--text)]">{t.name}</p>
                                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-[var(--text-muted)] tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                                      <span className="font-sans">{t.city}</span>
                                      <span>{t.heightM.toLocaleString(undefined, { maximumFractionDigits: 1 })} m</span>
                                      <span>{t.yearBuilt ?? "\u2014"}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              {/* Desktop: table */}
                              <div className="hidden sm:block overflow-x-auto">
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

        <SoundSection sound={sound} slug={slug} />

        <ScreenSection screen={screen} />

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

      </div>
    </main>
  );
}

// Helper Components

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
  // Delegates to the shared sport-label rule. Local shim retained so
  // existing call sites (TeamCard, sortTeamsFootballFirst predicates)
  // don't have to be touched while the underlying mapping evolves.
  return normalizeSport(sport);
}

function lastYearOf(years: string | null | undefined): number {
  if (!years) return 0;
  const m = String(years).match(/\d{4}/g);
  return m ? Math.max(...m.map(Number)) : 0;
}

// Best-available championship count for non-American, non-football major sports
// (Aussie Rules, Rugby League/Union, cricket, EuroLeague basketball, NPB, CFL,
// and any winners-roll domestic club). Used only to order metro team cards
// within a sport; returns 0 when no honours source resolves.
function otherTitleCount(t: { sport: string; league: string; team: string }): number {
  const afl = getAflFranchiseByTeamName(t.team); if (afl) return afl.premierships ?? 0;
  const nrl = getNrlFranchiseByTeamName(t.team); if (nrl) return nrl.premierships ?? 0;
  const cfl = getCflFranchiseByTeamName(t.team); if (cfl) return cfl.grey_cups ?? 0;
  const wnba = getWnbaFranchiseByTeamName(t.team); if (wnba) return wnba.titles ?? 0;
  const ipl = getIplFranchiseByTeamName(t.team); if (ipl) return ipl.titles ?? 0;
  const s = (t.sport || "").toLowerCase();
  if (s.includes("baseball")) { const n = getNpbTeamByName(t.team); if (n) return n.js_titles ?? 0; }
  if (s.includes("rugby") && !s.includes("league")) {
    return getRugbyClubHonours(t.team, t.league).reduce((a, h) => a + (h.titles || 0), 0);
  }
  if (s.includes("cricket")) {
    return getT20Honours(t.team).reduce((a, h) => a + (h.titles || 0), 0);
  }
  if (s.includes("basket")) { const el = getEuroleagueHonours(t.team); if (el) return el.titles ?? 0; }
  return (getDomesticHonours(t.sport, t.team) || []).reduce((a, h) => a + (h.count || 0), 0);
}

function TeamsSection({
  teams,
  metroName,
  topTeamPick,
  relocations = [],
  formerCfb = [],
  formerCbb = [],
  wcbb = { major: [], other: [] },
  collegeHockey = { major: [], other: [] },
  formerWcbb = [],
  formerRugby = [],
  defunctRL = [],
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
  metroName?: string;
  topTeamPick?: import("@/lib/topTeams").TopTeamPick | null;
  relocations?: import("@/lib/data").RelocationCard[];
  formerCfb?: FormerCfbCard[];
  formerCbb?: FormerCbbCard[];
  wcbb?: { major: WcbbCard[]; other: WcbbCard[] };
  collegeHockey?: { major: CollegeHockeyCard[]; other: CollegeHockeyCard[] };
  formerWcbb?: FormerWcbbCard[];
  formerRugby?: FormerTopFlight[];
  defunctRL?: DefunctRLClub[];
}) {
  // Teams flagged Annual=Y in Team List (col O) are recurring-event entries
  // (F1 Grands Prix, NASCAR races, Sailing regattas, Powerboat races). They
  // render under Annual Sporting Events in EventsSection, not in any team
  // bucket here, so we strip them before bucketing.
  // A club already carded as a rugby-union relocation (which carries the proper
  // founded-ended lifespan, e.g. Wasps 1867-2014) wins; drop it from formerRugby
  // so it shows once. formerRugby only fills former top-flight clubs that have no
  // relocation card (FC Lourdes, Stadoceste Tarbais, ...).
  if (formerRugby.length && relocations.length) {
    const _relRugby = new Set(
      relocations.filter((r) => r.league === "rugby-union").map((r) => (r.name || "").toLowerCase().trim()),
    );
    formerRugby = formerRugby.filter((f) => !_relRugby.has(f.club.toLowerCase().trim()));
  }
  const teamsForBucketing = teams.filter((t) => t.annual !== true);

  // Historic Venues (col B = "Historic Venues" in Team List) get their own
  // display beneath Notable Venues. Filter them out of the standard buckets.
  const historicVenuesRaw = teamsForBucketing.filter((t) => t.league === "Historic Venues");
  const nonHistoricForBucketing = teamsForBucketing.filter((t) => t.league !== "Historic Venues");

  // Precompute level + major_cups for every football team so the sort
  // comparators don't call getFootballClubByName() on every comparison.
  const FOOTBALL_SPORT_SET = new Set(["Soccer", "Football/Soccer", "Football"]);
  type FootballSortKey = { level: number; majorCups: number };
  const footballSortKeys = new Map<string, FootballSortKey>();
  for (const t of nonHistoricForBucketing) {
    if (FOOTBALL_SPORT_SET.has(t.sport)) {
      const club = getFootballClubByName(t.team);
      footballSortKeys.set(t.team, {
        level: parseInt(t.level ?? "99") || 99,
        majorCups: club?.totals.major_cups ?? 0,
      });
    }
  }

  // Identify which team(s) are the Top Team for this metro.
  // topTeamPick.team may be slash-separated for co-equal picks.
  const topTeamNames = topTeamPick
    ? topTeamPick.team.split("/").map((n) => n.trim().toLowerCase()).filter(Boolean)
    : [];
  const topPickSport = (topTeamPick?.sport ?? "").trim();
  const topPickIsCollege = /\(NCAA/.test(topPickSport);
  const baseSportKey = (s: string) =>
    s.toLowerCase().replace(/\(ncaa[^)]*\)/g, "").replace(/[^a-z]/g, "")
      .replace("soccer", "football").replace("icehockey", "hockey");
  // Co-equal Top Team picks can span two sports ("Basketball / Baseball" for
  // New York's Knicks/Yankees), so match a team if its sport is ANY of them.
  const topPickSportKeys = topPickSport.split("/").map((s) => baseSportKey(s)).filter(Boolean);
  const TOP_COLLEGE_LEAGUES = new Set(["FBS", "FCS", "NCAA", "NCAA W", "College Hockey"]);
  // Match by name, then (when sport context exists) require the card's sport to
  // match the Top Team pick's sport so e.g. Texas football is the Top Team in
  // Austin without also flagging Texas basketball/baseball.
  const isTopTeamFn = (teamName: string, teamSport?: string, teamLeague?: string): boolean => {
    const nameHit = topTeamNames.some((tn) => {
      const t = teamName.toLowerCase();
      return tn === t || t.endsWith(" " + tn) || tn.endsWith(" " + t);
    });
    if (!nameHit) return false;
    if (topPickSportKeys.length === 0 || teamSport === undefined) return true;
    if (!topPickSportKeys.includes(baseSportKey(teamSport))) return false;
    const teamIsCollege = teamLeague !== undefined && TOP_COLLEGE_LEAGUES.has(teamLeague);
    return topPickIsCollege ? teamIsCollege : !teamIsCollege;
  };

  // Precompute sort keys for American major sports (NFL, MLB, NBA, NHL).
  // Sport order: NFL first, then MLB, NBA, NHL, other.
  const AMERICAN_SPORT_ORDER: Record<string, number> = {
    "American Football": 0,
    "Baseball": 1,
    "Basketball": 2,
    "Hockey": 3,
  };
  // foundedYear: older franchise sorts first (ascending) as tiebreaker when
  // two teams share the same championship count. Resolves Rangers > Islanders
  // (1927 vs 1973), Knicks > Nets (1947 vs 1968), Giants > Jets, etc.
  type AmericanSortKey = { sportOrder: number; champs: number; foundedYear: number };
  const americanSortKeys = new Map<string, AmericanSortKey>();
  for (const t of nonHistoricForBucketing) {
    const order = AMERICAN_SPORT_ORDER[t.sport];
    if (order !== undefined) {
      let champs = 0;
      let foundedYear = 9999;
      if (t.sport === "American Football") {
        const f = getNflFranchiseByTeamName(t.team);
        champs = f?.championships ?? 0;
        foundedYear = f?.founding_year ?? 9999;
      } else if (t.sport === "Baseball") {
        const f = getMlbFranchiseByTeamName(t.team);
        champs = f?.championships ?? 0;
        foundedYear = f?.founding_year ?? 9999;
      } else if (t.sport === "Basketball") {
        const f = getNbaFranchiseByTeamName(t.team);
        champs = f?.championships ?? 0;
        foundedYear = f?.founding_year ?? 9999;
      } else if (t.sport === "Hockey") {
        const f = getNhlFranchiseByTeamName(t.team);
        champs = f?.championships ?? 0;
        foundedYear = f?.founded ?? 9999;
      }
      americanSortKeys.set(t.team, { sportOrder: order, champs, foundedYear });
    }
  }

  // Sort keys for every other major sport: group by sport label, then titles desc.
  const otherSortKeys = new Map<string, { sportKey: string; titles: number }>();
  for (const t of nonHistoricForBucketing) {
    if (AMERICAN_SPORT_ORDER[t.sport] === undefined && !FOOTBALL_SPORT_SET.has(t.sport)) {
      otherSortKeys.set(t.team, { sportKey: normalizeSport(t.sport), titles: otherTitleCount(t) });
    }
  }

  // Full priority sort for major-league teams:
  //  0: Top Team for this metro (pinned first)
  //  1: Gold Standard American (NFL/MLB/NBA/NHL): sport order, then champs desc
  //  2: Gold Standard Football (Big 5 Lv1): level asc, trophies desc
  //  3: Other Gold Standard
  //  4: Non-Gold American sports: sport order, champs desc
  //  5: Non-Gold Football: level asc, trophies desc
  //  6: Everything else
  function majorSortScore(t: { sport: string; league: string; team: string; level?: string }): number {
    const isFoot = FOOTBALL_SPORT_SET.has(t.sport);
    const isGold = isGoldStandardLeague(t.sport, t.league) && (!isFoot || t.level === "1");
    const isAmerican = AMERICAN_SPORT_ORDER[t.sport] !== undefined;
    if (isTopTeamFn(t.team, t.sport, t.league)) return 0;
    if (isGold && isAmerican) return 1;
    if (isGold && isFoot) return 2;
    if (isGold) return 3;
    if (isAmerican) return 4;
    if (isFoot) return 5;
    return 6;
  }
  const majorTeamsRaw = [...nonHistoricForBucketing.filter((t) => t.major && t.level !== "College")].sort((a, b) => {
    const as_ = majorSortScore(a);
    const bs_ = majorSortScore(b);
    if (as_ !== bs_) return as_ - bs_;
    const aIsFootball = FOOTBALL_SPORT_SET.has(a.sport);
    const bIsFootball = FOOTBALL_SPORT_SET.has(b.sport);
    // Gold/non-Gold American: sport order → champs desc → founded asc
    if (as_ === 1 || as_ === 4) {
      const ak = americanSortKeys.get(a.team) ?? { sportOrder: 9, champs: 0, foundedYear: 9999 };
      const bk = americanSortKeys.get(b.team) ?? { sportOrder: 9, champs: 0, foundedYear: 9999 };
      if (ak.sportOrder !== bk.sportOrder) return ak.sportOrder - bk.sportOrder;
      if (ak.champs !== bk.champs) return bk.champs - ak.champs;
      return ak.foundedYear - bk.foundedYear; // older franchise first on champ tie
    }
    // Gold/non-Gold Football: level asc then trophies desc
    if (aIsFootball && bIsFootball) {
      const ak = footballSortKeys.get(a.team) ?? { level: 99, majorCups: 0 };
      const bk = footballSortKeys.get(b.team) ?? { level: 99, majorCups: 0 };
      if (ak.level !== bk.level) return ak.level - bk.level;
      return bk.majorCups - ak.majorCups;
    }
    // Every other sport (Aussie Rules, rugby, cricket, etc.): group by sport,
    // then most titles first, so e.g. the Swans/Rabbitohs lead their codes.
    if (as_ === 3 || as_ === 6) {
      const ak = otherSortKeys.get(a.team) ?? { sportKey: normalizeSport(a.sport), titles: 0 };
      const bk = otherSortKeys.get(b.team) ?? { sportKey: normalizeSport(b.sport), titles: 0 };
      if (ak.sportKey !== bk.sportKey) return ak.sportKey.localeCompare(bk.sportKey);
      if (ak.titles !== bk.titles) return bk.titles - ak.titles;
      return a.team.localeCompare(b.team);
    }
    return 0;
  });
  const majorTeamsOnly = majorTeamsRaw.filter((t) => t.league !== "Notable Venues");
  // All Notable Venues (major and non-major) belong in the Notable Venues section,
  // never in the Other Men’s/Women’s team buckets.
  const majorVenues = nonHistoricForBucketing.filter((t) => t.league === "Notable Venues");

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

  // College-level teams always flow through the college-card pipeline below,
  // even when flagged major, so they render as college cards behind the pros.
  const otherTeamsRaw = nonHistoricForBucketing.filter((t) => (!t.major || t.level === "College") && t.league !== "Notable Venues");
  // College Football (FBS) is lifted into its own group above Football/Soccer.
  // Everything else college (FCS, basketball, hockey, ...) stays in College/University.
  const isFbsFootball = (t: { sport: string; league: string }) =>
    t.sport === "American Football" && t.league === "FBS";
  const otherFbs = otherTeamsRaw.filter((t) => isFbsFootball(t));
  // D-I men's basketball programs with at least one Sweet 16, Elite Eight, or
  // Final Four are surfaced (with FBS football) in the Major League Teams/Venues
  // section, behind the pro teams unless one is the metro Top Team; the rest
  // stay in "Other College Teams". The same gate is intended for
  // women's college basketball once that data is added.
  const cbbCardCache = new Map<string, CbbTeam | null>();
  const cbbForName = (n: string): CbbTeam | null => {
    if (!cbbCardCache.has(n)) cbbCardCache.set(n, getCbbTeamForName(n));
    return cbbCardCache.get(n) ?? null;
  };
  const isDiMensHoops = (t: { sport: string; league: string }) =>
    t.sport === "Basketball" && t.league === "NCAA";
  const hoopsQualifies = (t: { team: string }) => {
    const cc = cbbForName(t.team);
    return !!cc && (cc.sweet16 > 0 || cc.elite8 > 0 || cc.final4 > 0);
  };
  const majorCollegeHoops = otherTeamsRaw.filter((t) => isDiMensHoops(t) && hoopsQualifies(t));
  // College baseball with 4+ College World Series titles is lifted into the
  // Major League section; the rest stay in Other College Teams.
  const cwsTitlesFor = (name: string) => getCwsForSchool(name)?.titles ?? 0;
  const isCollegeBaseball = (t: { sport: string; level?: string }) =>
    t.sport === "Baseball" && t.level === "College";
  const majorCollegeBaseball = otherTeamsRaw.filter((t) => isCollegeBaseball(t) && cwsTitlesFor(t.team) >= 4);
  const otherCollege = otherTeamsRaw.filter(
    (t) => isCollege(t) && !isFbsFootball(t) && !isDiMensHoops(t) && !(t.sport === "American Football" && t.league === "FCS")
      // Women's college basketball ("NCAA W") renders via the dedicated
      // WcbbCard system (wcbb.major / wcbb.other), so exclude it here to
      // avoid a second, duplicate plain card per program.
      && t.league !== "NCAA W"
      // Notable Venues (incl. college stadiums) render in the Notable Venues section.
      && t.league !== "Notable Venues"
      // College baseball with 4+ CWS titles is promoted to the Major section above.
      && !(isCollegeBaseball(t) && cwsTitlesFor(t.team) >= 4)
  );
  const otherFootball = [...otherTeamsRaw.filter((t) => !isCollege(t) && isFootball(t.sport))].sort((a, b) => {
    const ak = footballSortKeys.get(a.team) ?? { level: 99, majorCups: 0 };
    const bk = footballSortKeys.get(b.team) ?? { level: 99, majorCups: 0 };
    if (ak.level !== bk.level) return ak.level - bk.level;
    return bk.majorCups - ak.majorCups;
  }
  );
  const otherWomen = otherTeamsRaw.filter(
    (t) => !isCollege(t) && !isFootball(t.sport) && isWomen(t.sport)
  );
  const otherMen = otherTeamsRaw.filter(
    (t) => !isCollege(t) && !isFootball(t.sport) && !isWomen(t.sport)
  );

  type MajorCollegeCard = {
    key: string; sport: "football" | "basketball"; name: string; href: string | null;
    color: string; mono: string; titles: number; secondLabel: string; secondVal: number;
    seasons: number; appStat: number; pct: number; isTop: boolean; division: string; conference: string; hasStats: boolean;
  };
  const majorCollegeCards: MajorCollegeCard[] = [
    ...otherFbs.map((t): MajorCollegeCard => {
      const cf = getCfbTeamForName(t.team);
      return {
        key: "f-" + t.team, sport: "football", name: cf?.name ?? t.team,
        href: cf ? `/teams/cfb/${cf.slug}` : null, color: cf?.color || "#444",
        mono: cfbMonogram(cf?.name ?? t.team), titles: cf?.nat_champ_count ?? 0,
        secondLabel: "Conf", secondVal: cf?.conf_titles ?? 0,
        seasons: cf?.maj_seasons || cf?.seasons || 0, appStat: cf?.bowl_app ?? 0, pct: cf?.pct ?? 0,
        isTop: isTopTeamFn(t.team, t.sport, t.league),
        division: "FBS", conference: cf?.conference ?? "", hasStats: true,
      };
    }),
    ...majorCollegeHoops.map((t): MajorCollegeCard => {
      const cb = cbbForName(t.team)!;
      return {
        key: "b-" + t.team, sport: "basketball", name: cb.name,
        href: `/teams/cbb/${cb.slug}`, color: cb.color || "#444",
        mono: cbbMonogram(cb.name), titles: cb.titles,
        secondLabel: "Final Four", secondVal: cb.final4,
        seasons: cb.seasons, appStat: cb.tour_app ?? 0, pct: cb.pct,
        isTop: isTopTeamFn(t.team, t.sport, t.league),
        division: "", conference: cb.conference ?? "", hasStats: true,
      };
    }),
  ].sort((a, b) => b.titles - a.titles || b.seasons - a.seasons || a.name.localeCompare(b.name));
  // College cards: prefer the self-hosted crest (getCrest), falling back to the
  // team-colored monogram when no badge exists (defunct/minor programs).
  const collegeLogo = (name: string, mono: string, color: string) =>
    getCrest(name) ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={getCrest(name)!.src} alt="" className="w-6 h-6 flex-shrink-0 object-contain" loading="lazy" />
    ) : (
      <span className="rounded-md grid place-items-center font-bold text-white text-[10px] flex-shrink-0" style={{ background: color, width: 24, height: 24 }} aria-hidden>{mono}</span>
    );
  const renderCollegeCard = (m: MajorCollegeCard) => {
    const body = (
      <>
        <p className="text-xs text-[var(--text-muted)] mb-1"><span aria-hidden className="mr-1">{m.sport === "football" ? "🏈" : "🏀"}</span>{m.sport === "football" ? `College Football${m.division ? ` (${m.division})` : ""}` : "College Basketball"}{m.conference ? ` (${m.conference})` : ""}{m.isTop && <span className="ml-1 cursor-default" title="Top Team for this metro — the franchise that most defines this city's sports identity" aria-label="Top Team">👑</span>}</p>
        <div className="flex items-center gap-2">
          {collegeLogo(m.name, m.mono, m.color)}
          <p className="font-semibold text-[var(--text)]">{m.name}</p>
        </div>
        {m.hasStats && (<div className="flex gap-1.5 mt-2 flex-wrap">
          <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide" style={{ background: m.titles > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)", color: m.titles > 0 ? "#d4af37" : "var(--text-dim)" }} title="National championships">{m.titles === 0 ? "No titles" : `${m.titles} Nat'l Champ${m.titles === 1 ? "" : "s"}`}</span>
          {m.secondVal > 0 && (<span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }} title={m.sport === "football" ? "Conference titles" : "Final Four appearances"}>{m.secondVal} {m.secondLabel}{m.sport === "football" ? "" : (m.secondVal === 1 ? "" : "s")}</span>)}
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }} title={m.sport === "football" ? "Bowl games" : "NCAA tournament appearances"}>{m.sport === "football" ? `${m.appStat} bowl${m.appStat === 1 ? "" : "s"}` : `${m.appStat} Tour App${m.appStat === 1 ? "" : "s"}`}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(85,85,106,0.16)", color: "var(--text-dim)" }} title="All-time win percentage">{m.pct.toFixed(3)} W%</span>
        </div>)}
      </>
    );
    return m.href ? (
      <Link key={m.key} href={m.href} className="border rounded-lg p-4 hover:border-[var(--accent)] transition bg-[var(--bg-card)] border-[var(--border)] block">{body}</Link>
    ) : (
      <div key={m.key} className="border rounded-lg p-4 bg-[var(--bg-card)] border-[var(--border)]">{body}</div>
    );
  };
  // Women's College Basketball card: titles (gold), Final Fours, tournament apps.
  const renderWcbbCard = (m: WcbbCard, isTop = false) => (
    <Link key={"w-" + m.slug} href={m.href} className="border rounded-lg p-4 hover:border-[var(--accent)] transition bg-[var(--bg-card)] border-[var(--border)] block">
      <p className="text-xs text-[var(--text-muted)] mb-1"><span aria-hidden className="mr-1">🏀</span>Women&apos;s College Basketball{m.conference ? ` (${m.conference})` : ""}{isTop && <span className="ml-1 cursor-default" title="Top Team for this metro — the franchise that most defines this city's sports identity" aria-label="Top Team">👑</span>}</p>
      <div className="flex items-center gap-2">
        {collegeLogo(m.name, m.mono, m.color)}
        <p className="font-semibold text-[var(--text)]">{m.name}</p>
      </div>
      <div className="flex gap-1.5 mt-2 flex-wrap">
        <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide" style={{ background: m.titles > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)", color: m.titles > 0 ? "#d4af37" : "var(--text-dim)" }} title="National championships">{m.titles === 0 ? "No titles" : `${m.titles} Nat'l Champ${m.titles === 1 ? "" : "s"}`}</span>
        {m.finalFours > 0 && (<span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }} title="Final Four appearances">{m.finalFours} Final Four{m.finalFours === 1 ? "" : "s"}</span>)}
        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }} title="NCAA tournament appearances">{m.tourApps} Tour App{m.tourApps === 1 ? "" : "s"}</span>
      </div>
    </Link>
  );
  // College Hockey card: titles (gold), Frozen Fours. No team page in v1 (no link).
  const renderHockeyCard = (m: CollegeHockeyCard, isTop = false) => (
    <div key={"h-" + m.name} className="border rounded-lg p-4 bg-[var(--bg-card)] border-[var(--border)]">
      <p className="text-xs text-[var(--text-muted)] mb-1"><span aria-hidden className="mr-1">🏒</span>College Hockey{isTop && <span className="ml-1 cursor-default" title="Top Team for this metro — the franchise that most defines this city's sports identity" aria-label="Top Team">👑</span>}</p>
      <div className="flex items-center gap-2">
        {collegeLogo(m.name, m.mono, m.color)}
        <p className="font-semibold text-[var(--text)]">{m.name}</p>
      </div>
      <div className="flex gap-1.5 mt-2 flex-wrap">
        <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide" style={{ background: m.titles > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)", color: m.titles > 0 ? "#d4af37" : "var(--text-dim)" }} title="National championships">{m.titles === 0 ? "No titles" : `${m.titles} Nat'l Champ${m.titles === 1 ? "" : "s"}`}</span>
        {m.frozenFours > 0 && (<span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }} title="Frozen Four appearances">{m.frozenFours} Frozen Four{m.frozenFours === 1 ? "" : "s"}</span>)}
      </div>
    </div>
  );
  // A college program that is the metro Top Team leads the whole grid, ahead
  // of the pro major-league teams; the rest of the college programs trail them.
  const topCollegeCards = majorCollegeCards.filter((m) => m.isTop);
  const restCollegeCards = majorCollegeCards.filter((m) => !m.isTop);
  // Women's basketball / college hockey programs can also be a metro Top Team
  // (e.g. UConn women in Hartford, co-equal with the men). Match by name with
  // the sport/league the Top Team pick uses ("Basketball (NCAA)" / hockey).
  const wcbbIsTop = (m: WcbbCard) => isTopTeamFn(m.name, "Basketball", "NCAA W");
  const hockeyIsTop = (m: CollegeHockeyCard) => isTopTeamFn(m.name, "Hockey", "College Hockey");
  const wcbbMajorTop = wcbb.major.filter(wcbbIsTop);
  const wcbbMajorRest = wcbb.major.filter((m) => !wcbbIsTop(m));
  const hockeyMajorTop = collegeHockey.major.filter(hockeyIsTop);
  const hockeyMajorRest = collegeHockey.major.filter((m) => !hockeyIsTop(m));
  const fcsFootballCards: MajorCollegeCard[] = otherTeamsRaw
    .filter((t) => t.sport === "American Football" && t.league === "FCS")
    .map((t): MajorCollegeCard => {
      const cf = getCfbTeamForName(t.team);
      const cb = cf ? null : cbbForName(t.team);
      return {
        key: "fcs-" + t.team, sport: "football", name: cf?.name ?? cb?.name ?? t.team,
        href: cf ? `/teams/cfb/${cf.slug}` : null, color: cf?.color || cb?.color || "#444",
        mono: cfbMonogram(cf?.name ?? cb?.name ?? t.team), titles: cf?.nat_champ_count ?? 0,
        secondLabel: "Conf", secondVal: cf?.conf_titles ?? 0,
        seasons: cf?.maj_seasons || cf?.seasons || 0, appStat: cf?.bowl_app ?? 0, pct: cf?.pct ?? 0,
        isTop: isTopTeamFn(t.team, t.sport, t.league),
        division: "FCS", conference: cf?.conference ?? "", hasStats: !!cf,
      };
    })
    .sort((a, b) => b.titles - a.titles || b.seasons - a.seasons || a.name.localeCompare(b.name));
  // D-I men's basketball programs without a Sweet 16/Elite 8/Final Four render
  // as the same college card (color circle + conference) rather than the plain
  // team card, just under Other College Teams instead of with the major teams.
  const otherCbbCards: MajorCollegeCard[] = otherTeamsRaw
    .filter((t) => isDiMensHoops(t) && !hoopsQualifies(t))
    .map((t): MajorCollegeCard => {
      const cb = cbbForName(t.team);
      return {
        key: "ob-" + t.team, sport: "basketball", name: cb?.name ?? t.team,
        href: cb ? `/teams/cbb/${cb.slug}` : null, color: cb?.color || "#444",
        mono: cbbMonogram(cb?.name ?? t.team), titles: cb?.titles ?? 0,
        secondLabel: "Final Four", secondVal: cb?.final4 ?? 0,
        seasons: cb?.seasons ?? 0, appStat: cb?.tour_app ?? 0, pct: cb?.pct ?? 0,
        isTop: isTopTeamFn(t.team, t.sport, t.league),
        division: "", conference: cb?.conference ?? "", hasStats: !!cb,
      };
    });
  const otherCollegeCards = [...fcsFootballCards, ...otherCbbCards]
    .sort((a, b) => b.titles - a.titles || b.seasons - a.seasons || a.name.localeCompare(b.name));

  const gridClass = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4";

  // Defunct pre-1985 NASL clubs based in this metro (rendered as defunct cards).
  const defunctNasl = getDefunctNaslForMetro(metroName);

  // Defunct NFL Europe / WLAF franchises that called this metro home (1991-2007).
  const nflEurope = getNflEuropeForMetro(metroName);

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
          <TeamCard key={idx} team={team} isTopTeam={isTopTeamFn(team.team, team.sport, team.league)} metroName={metroName} />
        ))}
      </div>
    </details>
  );

  return (
    <div className="space-y-6">
      {(majorTeamsOnly.length > 0 || majorCollegeCards.length > 0 || wcbb.major.length > 0 || collegeHockey.major.length > 0 || majorCollegeBaseball.length > 0 || majorVenues.length > 0 || historicVenuesRaw.length > 0) && (
        <div>
          <h3 className="text-lg font-semibold text-[var(--accent)] mb-4">
            Major League Teams/Venues
          </h3>
          {(majorTeamsOnly.length > 0 || majorCollegeCards.length > 0 || wcbb.major.length > 0 || collegeHockey.major.length > 0 || majorCollegeBaseball.length > 0) && (
            <div className={`${majorVenues.length > 0 ? "mb-3" : ""} ${gridClass}`}>
              {topCollegeCards.map(renderCollegeCard)}
              {wcbbMajorTop.map((m) => renderWcbbCard(m, true))}
              {hockeyMajorTop.map((m) => renderHockeyCard(m, true))}
              {majorTeamsOnly.map((team, idx) => (
                <TeamCard key={"m" + idx} team={team} isTopTeam={isTopTeamFn(team.team, team.sport, team.league)} metroName={metroName} />
              ))}
              {majorCollegeBaseball.map((team, idx) => (
                <TeamCard key={"mcb" + idx} team={team} isTopTeam={isTopTeamFn(team.team, team.sport, team.league)} metroName={metroName} />
              ))}
              {restCollegeCards.map(renderCollegeCard)}
              {wcbbMajorRest.map((m) => renderWcbbCard(m, false))}
              {hockeyMajorRest.map((m) => renderHockeyCard(m, false))}
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
      {(otherFootball.length > 0 || otherCollege.length > 0 || otherCollegeCards.length > 0 || wcbb.other.length > 0 || collegeHockey.other.length > 0 || otherMen.length > 0 || otherWomen.length > 0 || relocations.length > 0 || formerCfb.length > 0 || formerCbb.length > 0 || formerWcbb.length > 0 || defunctNasl.length > 0 || nflEurope.length > 0 || formerRugby.length > 0 || defunctRL.length > 0) && (
        <div>
          <h3 className="text-lg font-semibold text-[var(--text-muted)] mb-4">
            Other Teams
          </h3>
          <div className="space-y-3">
            {otherFootball.length > 0 && collapsible("Football/Soccer Teams", otherFootball)}
            {otherMen.length > 0 && collapsible("Other Men\u2019s Teams", otherMen)}
            {otherWomen.length > 0 && collapsible("Other Women\u2019s Teams", otherWomen)}
            {(otherCollegeCards.length > 0 || otherCollege.length > 0 || wcbb.other.length > 0 || collegeHockey.other.length > 0) && (
              <details className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden group">
                <summary className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[var(--bg-card-hover)] transition select-none">
                  <span className="font-semibold text-[var(--text)]">Other College Teams</span>
                  <span className="text-sm text-[var(--text-muted)]">{otherCollegeCards.length + otherCollege.length + wcbb.other.length + collegeHockey.other.length} team{otherCollegeCards.length + otherCollege.length + wcbb.other.length + collegeHockey.other.length !== 1 ? "s" : ""}</span>
                </summary>
                <div className={`border-t border-[var(--border)] px-4 py-3 ${gridClass}`}>
                  {otherCollegeCards.map(renderCollegeCard)}
                  {otherCollege.map((team, idx) => (
                    <TeamCard key={"oc" + idx} team={team} isTopTeam={isTopTeamFn(team.team, team.sport, team.league)} metroName={metroName} />
                  ))}
                  {wcbb.other.map((m) => renderWcbbCard(m))}
                  {collegeHockey.other.map((m) => renderHockeyCard(m))}
                </div>
              </details>
            )}
            {(relocations.length > 0 || formerCfb.length > 0 || formerCbb.length > 0 || formerWcbb.length > 0 || defunctNasl.length > 0 || nflEurope.length > 0 || formerRugby.length > 0 || defunctRL.length > 0) && (
              <details className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden group">
                <summary className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[var(--bg-card-hover)] transition select-none">
                  <span className="font-semibold text-[var(--text)]">Defunct/Relocated Teams</span>
                  <span className="text-sm text-[var(--text-muted)]">
                    {relocations.length + formerCfb.length + formerCbb.length + formerWcbb.length + defunctNasl.length + nflEurope.length + formerRugby.length + defunctRL.length} team{relocations.length + formerCfb.length + formerCbb.length + formerWcbb.length + defunctNasl.length + nflEurope.length + formerRugby.length + defunctRL.length !== 1 ? "s" : ""}
                  </span>
                </summary>
                <div className={`border-t border-[var(--border)] px-4 py-3 ${gridClass}`}>
                  {[
                    ...relocations.map((r, idx) => ({ y: lastYearOf(r.years), el: (
                    <Link
                      key={idx}
                      href={r.href}
                      className="border rounded-lg p-4 hover:border-[var(--accent)] transition bg-[var(--bg-card)] border-[var(--border)] block"
                    >
                      <p className="text-xs text-[var(--text-muted)] mb-1">
                        {leagueIcon(r.league) ? <span aria-hidden className="mr-1">{leagueIcon(r.league)}</span> : null}{r.sport}{[r.relocated ? "Relocated" : null, r.defunct ? "Defunct" : null].filter(Boolean).map((t) => " \u2022 " + t).join("")}
                      </p>
                      <p className="font-semibold text-[var(--text)]">{r.name}</p>
                      <p className="text-xs text-[var(--text-dim)]">{r.years}</p>
                      {r.stats && (r.league === "nfl" || r.league === "nba" || r.league === "nhl" || r.league === "mlb") && (
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide"
                            style={{
                              background: r.stats.champ > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)",
                              color: r.stats.champ > 0 ? "#d4af37" : "var(--text-dim)",
                            }}
                            title={r.stats.stolen ? "Pro football’s “stolen championship”: Pottsville won the 1925 NFL title on the field, then was stripped and the league awarded it to the Chicago Cardinals." : "Titles won during the years this franchise played in this metro"}
                          >
                            {r.stats.stolen
                              ? `${r.stats.champ} stolen title${r.stats.champ === 1 ? "" : "s"}`
                              : r.league === "mlb"
                              ? (r.stats.champ === 0 ? "No WS" : r.stats.champ === 1 ? "1 WS" : `${r.stats.champ} WS`)
                              : r.league === "nhl"
                              ? (r.stats.champ === 0 ? "No Cups" : r.stats.champ === 1 ? "1 Cup" : `${r.stats.champ} Cups`)
                              : (r.stats.champ === 0 ? "No titles" : r.stats.champ === 1 ? "1 title" : `${r.stats.champ} titles`)}
                          </span>
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded"
                            style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }}
                            title={r.league === "nhl" ? "Points percentage during the years in this metro" : "Regular-season win percentage during the years in this metro"}
                          >
                            {r.stats.pct.toFixed(3)} {r.league === "nhl" ? "Pts%" : "W%"}
                          </span>
                          {(r.league === "nhl" || r.league === "mlb") && (r.stats.other ?? 0) > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide" style={{ background: "rgba(110,138,166,0.30)", color: "#a9b8cc" }} title={r.league === "mlb" ? "Other major titles won in this metro (pre-1903 championships / 19th-century World’s Series)" : "Non-Stanley-Cup major titles won in this metro (WHA Avco Cups / pre-NHL league championships)"}>
                              {r.stats.other ?? 0} other title{(r.stats.other ?? 0) === 1 ? "" : "s"}
                            </span>
                          )}
                          {r.league === "mlb" && r.stats.finals > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(110,138,166,0.18)", color: "#a9b8cc" }} title="Pennants (World Series appearances) won in this metro">
                              {r.stats.finals} pennant{r.stats.finals === 1 ? "" : "s"}
                            </span>
                          )}
                          {r.league !== "mlb" && r.stats.div > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }} title="Division titles won in this metro">
                              {r.stats.div} div
                            </span>
                          )}
                        </div>
                      )}
                      {r.stats && r.league === "npb" && (
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide"
                            style={{
                              background: r.stats.champ > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)",
                              color: r.stats.champ > 0 ? "#d4af37" : "var(--text-dim)",
                            }}
                            title="Japan Series titles won during the years this franchise played in this metro"
                          >
                            {r.stats.champ === 0 ? "No JS" : r.stats.champ === 1 ? "1 Japan Series" : `${r.stats.champ} Japan Series`}
                          </span>
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded"
                            style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }}
                            title="Regular-season win percentage during the years in this metro"
                          >
                            {r.stats.pct.toFixed(3)} W%
                          </span>
                          {r.stats.finals > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(110,138,166,0.18)", color: "#a9b8cc" }} title="League pennants won in this metro">
                              {r.stats.finals} pennant{r.stats.finals === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                      )}
                      {r.stats && r.league === "wnba" && (
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide"
                            style={{ background: r.stats.champ > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)", color: r.stats.champ > 0 ? "#d4af37" : "var(--text-dim)" }}
                            title="WNBA championships won while in this metro"
                          >
                            {r.stats.champ === 0 ? "No titles" : r.stats.champ === 1 ? "1 title" : `${r.stats.champ} titles`}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }} title="All-time regular-season win percentage in this metro">
                            {r.stats.pct.toFixed(3)} W%
                          </span>
                          {r.stats.div > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }} title="Conference titles">
                              {r.stats.div} div
                            </span>
                          )}
                        </div>
                      )}
                      {r.stats && (r.league === "afl" || r.league === "nrl") && (
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide"
                            style={{ background: (r.stats.prem ?? 0) > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)", color: (r.stats.prem ?? 0) > 0 ? "#d4af37" : "var(--text-dim)" }}
                            title="Premierships won"
                          >
                            {(r.stats.prem ?? 0) === 0 ? "No premierships" : (r.stats.prem ?? 0) === 1 ? "1 premiership" : `${r.stats.prem} premierships`}
                          </span>
                          {(r.stats.minor ?? 0) > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(110,138,166,0.18)", color: "#a9b8cc" }} title="Minor premierships (finished top of the ladder)">
                              {r.stats.minor} minor prem
                            </span>
                          )}
                          {(r.stats.seasons ?? 0) > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }} title="Seasons in the competition">
                              {r.stats.seasons} seasons
                            </span>
                          )}
                        </div>
                      )}
                      {r.stats && r.league === "cfl" && (
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide"
                            style={{ background: r.stats.champ > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)", color: r.stats.champ > 0 ? "#d4af37" : "var(--text-dim)" }}
                            title="Grey Cup championships won while in this metro"
                          >
                            {r.stats.champ === 0 ? "No Grey Cups" : r.stats.champ === 1 ? "1 Grey Cup" : `${r.stats.champ} Grey Cups`}
                          </span>
                          {r.stats.finals > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(110,138,166,0.18)", color: "#a9b8cc" }} title="Grey Cup final appearances (won or lost)">
                              {r.stats.finals} final{r.stats.finals === 1 ? "" : "s"}
                            </span>
                          )}
                          {r.stats.pct > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }} title="Regular-season win percentage (1945–) while in this metro">
                              {r.stats.pct.toFixed(3)} W%
                            </span>
                          )}
                        </div>
                      )}
                      {r.stats && r.league === "football" && (
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          {r.stats.is_mls ? (
                            <>
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide" style={{ background: (r.stats.mls_cups ?? 0) > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)", color: (r.stats.mls_cups ?? 0) > 0 ? "#d4af37" : "var(--text-dim)" }} title="MLS Cup titles">
                                {(r.stats.mls_cups ?? 0)} {(r.stats.mls_cups ?? 0) === 1 ? "Cup" : "Cups"}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide" style={{ background: "rgba(99,102,241,0.16)", color: "#818cf8" }} title="Supporters’ Shields (best regular-season record)">
                                {(r.stats.supporters_shields ?? 0)} Sup. Shield{(r.stats.supporters_shields ?? 0) === 1 ? "" : "s"}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide" style={{ background: (r.stats.titles ?? 0) > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)", color: (r.stats.titles ?? 0) > 0 ? "#d4af37" : "var(--text-dim)" }} title="Top-flight league titles">
                                {(r.stats.titles ?? 0) === 0 ? "No titles" : (r.stats.titles ?? 0) === 1 ? "1 title" : `${r.stats.titles} titles`}
                              </span>
                              {(r.stats.major_cups ?? 0) > 0 && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }} title="Major trophies (domestic cups + continental)">
                                  {r.stats.major_cups} maj. trophies
                                </span>
                              )}
                            </>
                          )}
                          {(r.stats.cont_trophies ?? 0) > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }} title="Continental trophies">
                              {r.stats.cont_trophies} Cont.
                            </span>
                          )}
                        </div>
                      )}
                      {r.stats && (r.league === "rugby-union" || r.league === "cricket-t20" || r.league === "ipl") && (
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide" style={{ background: (r.stats.champ ?? 0) > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)", color: (r.stats.champ ?? 0) > 0 ? "#d4af37" : "var(--text-dim)" }} title="Titles won during the years this club played in this metro">
                            {(r.stats.champ ?? 0) === 0 ? "No titles" : (r.stats.champ ?? 0) === 1 ? "1 title" : `${r.stats.champ} titles`}
                          </span>
                        </div>
                      )}
                    </Link>
                    ) })),
                    ...formerCfb.map((f) => ({ y: f.lastYear, el: (
                    <Link key={f.slug} href={f.href} className="border rounded-lg p-4 hover:border-[var(--accent)] transition bg-[var(--bg-card)] border-[var(--border)] block">
                      <p className="text-xs text-[var(--text-muted)] mb-1"><span aria-hidden className="mr-1">🏈</span>College Football &bull; Former FBS</p>
                      <div className="flex items-center gap-2">
                        <span className="rounded-md grid place-items-center font-bold text-white text-[10px] flex-shrink-0" style={{ background: f.color, width: 24, height: 24 }} aria-hidden>{f.mono}</span>
                        <p className="font-semibold text-[var(--text)]">{f.name}</p>
                      </div>
                      {f.years && <p className="text-xs text-[var(--text-dim)] mt-1">{f.years}</p>}
                      <div className="flex gap-1.5 mt-2 flex-wrap">
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide" style={{ background: f.nat_champ > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)", color: f.nat_champ > 0 ? "#d4af37" : "var(--text-dim)" }} title="National championships won as a major program">
                          {f.nat_champ === 0 ? "No titles" : `${f.nat_champ} Natl Champ${f.nat_champ === 1 ? "" : "s"}`}
                        </span>
                        {f.conf > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }} title="Major conference championships">
                            {f.conf} Conf
                          </span>
                        )}
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }} title="Major (top-division) seasons">
                          {f.maj_seasons} maj season{f.maj_seasons === 1 ? "" : "s"}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(85,85,106,0.16)", color: "var(--text-dim)" }} title="All-time win percentage as a major program">
                          {f.pct.toFixed(3)} W%
                        </span>
                      </div>
                    </Link>
                    ) })),
                    ...formerRugby.map((f) => ({ y: f.lastYear ?? 0, el: (() => {
                      const inner = (
                        <>
                          <p className="text-xs text-[var(--text-muted)] mb-1"><span aria-hidden className="mr-1">🏉</span>Rugby Union &bull; Former {f.comp}</p>
                          <div className="flex items-center gap-2">
                            <ChampionLogo name={f.club} size={24} />
                            <p className="font-semibold text-[var(--text)]">{f.club}</p>
                          </div>
                          <div className="flex gap-1.5 mt-2 flex-wrap">
                            {f.comps.map((c) => (
                              <span key={c.comp} className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide" style={{ background: "rgba(212,175,55,0.16)", color: "#d4af37" }} title={`${c.comp} titles: ${c.years.join(", ")}`}>
                                {c.titles} {c.comp} title{c.titles === 1 ? "" : "s"}
                              </span>
                            ))}
                          </div>
                        </>
                      );
                      return f.href ? (
                        <Link key={`fr-${f.club}`} href={f.href} className="border rounded-lg p-4 hover:border-[var(--accent)] transition bg-[var(--bg-card)] border-[var(--border)] block">{inner}</Link>
                      ) : (
                        <div key={`fr-${f.club}`} className="border rounded-lg p-4 bg-[var(--bg-card)] border-[var(--border)]">{inner}</div>
                      );
                    })() })),
                    ...formerCbb.map((f) => ({ y: f.lastYear, el: (
                    <Link key={f.slug} href={f.href} className="border rounded-lg p-4 hover:border-[var(--accent)] transition bg-[var(--bg-card)] border-[var(--border)] block">
                      <p className="text-xs text-[var(--text-muted)] mb-1"><span aria-hidden className="mr-1">🏀</span>College Basketball &bull; Former D-I</p>
                      <div className="flex items-center gap-2">
                        <span className="rounded-md grid place-items-center font-bold text-white text-[10px] flex-shrink-0" style={{ background: f.color, width: 24, height: 24 }} aria-hidden>{f.mono}</span>
                        <p className="font-semibold text-[var(--text)]">{f.name}</p>
                      </div>
                      {f.years && <p className="text-xs text-[var(--text-dim)] mt-1">{f.years}</p>}
                      <div className="flex gap-1.5 mt-2 flex-wrap">
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide" style={{ background: f.titles > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)", color: f.titles > 0 ? "#d4af37" : "var(--text-dim)" }} title="National championships">
                          {f.titles === 0 ? "No titles" : `${f.titles} Nat'l Champ${f.titles === 1 ? "" : "s"}`}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }} title="Final Four appearances">
                          {f.final4} Final Four{f.final4 === 1 ? "" : "s"}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }} title="Seasons as a Division I program">
                          {f.seasons} season{f.seasons === 1 ? "" : "s"}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(85,85,106,0.16)", color: "var(--text-dim)" }} title="All-time win percentage as a Division I program">
                          {f.pct.toFixed(3)} W%
                        </span>
                      </div>
                    </Link>
                    ) })),
                    ...formerWcbb.map((f) => ({ y: f.lastYear, el: (
                    <Link key={f.slug} href={f.href} className="border rounded-lg p-4 hover:border-[var(--accent)] transition bg-[var(--bg-card)] border-[var(--border)] block">
                      <p className="text-xs text-[var(--text-muted)] mb-1"><span aria-hidden className="mr-1">🏀</span>Women&apos;s Basketball &bull; Former D-I</p>
                      <div className="flex items-center gap-2">
                        <span className="rounded-md grid place-items-center font-bold text-white text-[10px] flex-shrink-0" style={{ background: f.color, width: 24, height: 24 }} aria-hidden>{f.mono}</span>
                        <p className="font-semibold text-[var(--text)]">{f.name}</p>
                      </div>
                      {f.years && <p className="text-xs text-[var(--text-dim)] mt-1">{f.years}</p>}
                      <div className="flex gap-1.5 mt-2 flex-wrap">
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide" style={{ background: f.titles > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)", color: f.titles > 0 ? "#d4af37" : "var(--text-dim)" }} title="National championships">{f.titles === 0 ? "No titles" : `${f.titles} Nat'l Champ${f.titles === 1 ? "" : "s"}`}</span>
                        {f.finalFours > 0 && (<span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }} title="Final Four appearances">{f.finalFours} Final Four{f.finalFours === 1 ? "" : "s"}</span>)}
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }} title="NCAA tournament appearances">{f.tourApps} Tour App{f.tourApps === 1 ? "" : "s"}</span>
                      </div>
                    </Link>
                    ) })),
                    ...defunctNasl.map((n, idx) => ({ y: n.lastYear ?? 0, el: (() => {
                      const body = (
                        <>
                          <p className="text-xs text-[var(--text-muted)] mb-1"><span aria-hidden className="mr-1">{"⚽"}</span>Soccer &bull; NASL &bull; Defunct</p>
                          <p className="font-semibold text-[var(--text)]">{n.name}</p>
                          <p className="text-xs text-[var(--text-dim)]">{n.firstYear && n.lastYear && n.firstYear !== n.lastYear ? `${n.firstYear}–${n.lastYear}` : (n.lastYear ?? n.firstYear ?? "")}</p>
                          <div className="flex gap-1.5 mt-2 flex-wrap">
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide" style={{ background: n.titles > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)", color: n.titles > 0 ? "#d4af37" : "var(--text-dim)" }} title="NASL championships (Soccer Bowl / league title) won in this metro">{n.titles === 0 ? "No titles" : n.titles === 1 ? "1 title" : `${n.titles} titles`}</span>
                          </div>
                        </>
                      );
                      return n.slug ? (
                        <Link key={"nasl-" + idx} href={`/teams/football/${n.slug}`} className="border rounded-lg p-4 hover:border-[var(--accent)] transition bg-[var(--bg-card)] border-[var(--border)] block">{body}</Link>
                      ) : (
                        <div key={"nasl-" + idx} className="border rounded-lg p-4 bg-[var(--bg-card)] border-[var(--border)]">{body}</div>
                      );
                    })() })),
                    ...defunctRL.map((d) => ({ y: d.lastYear ?? 0, el: (
                      <div key={`drl-${d.club}`} className="border rounded-lg p-4 bg-[var(--bg-card)] border-[var(--border)]">
                        <p className="text-xs text-[var(--text-muted)] mb-1"><span aria-hidden className="mr-1">🏉</span>Rugby League &bull; British &bull; Defunct</p>
                        <p className="font-semibold text-[var(--text)]">{d.club}</p>
                        <p className="text-xs text-[var(--text-dim)]">{d.years.length === 1 ? `Champions ${d.years[0]}` : `Champions ${d.years.join(", ")}`}</p>
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide" style={{ background: "rgba(212,175,55,0.16)", color: "#d4af37" }} title={`British RL titles: ${d.years.join(", ")}`}>{d.titles === 1 ? "1 title" : `${d.titles} titles`}</span>
                        </div>
                      </div>
                    ) })),
                    ...nflEurope.map((n, idx) => ({ y: n.lastYear, el: (
                    <Link key={"nfle-" + idx} href={`/teams/nfl/international#${n.slug}`} className="border rounded-lg p-4 hover:border-[var(--accent)] transition bg-[var(--bg-card)] border-[var(--border)] block">
                      <p className="text-xs text-[var(--text-muted)] mb-1"><span aria-hidden className="mr-1">{"\uD83C\uDFC8"}</span>American Football &bull; NFL Europe &bull; Defunct</p>
                      <p className="font-semibold text-[var(--text)]">{n.name}</p>
                      <p className="text-xs text-[var(--text-dim)]">{n.firstYear === n.lastYear ? n.firstYear : `${n.firstYear}\u2013${n.lastYear}`}</p>
                      <div className="flex gap-1.5 mt-2 flex-wrap">
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide" style={{ background: n.titles > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)", color: n.titles > 0 ? "#d4af37" : "var(--text-dim)" }} title="World Bowls won while based in this metro">{n.titles === 0 ? "No World Bowls" : n.titles === 1 ? "1 World Bowl" : `${n.titles} World Bowls`}</span>
                        {n.apps > 0 && (<span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }} title="World Bowl appearances while based in this metro">{n.apps} WB app{n.apps === 1 ? "" : "s"}</span>)}
                      </div>
                      {n.relocated && n.also.length > 0 && (<p className="text-[10px] text-[var(--text-dim)] mt-1.5">Also: {n.also.join("; ")}</p>)}
                    </Link>
                    ) })),
                  ].sort((a, b) => b.y - a.y).map((e) => e.el)}
                </div>
              </details>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TeamCard({
  team,
  isTopTeam = false,
  metroName,
}: {
  team: {
    sport: string;
    league: string;
    team: string;
    city: string;
    major: boolean;
    level?: string;
    wikipediaUrl?: string;
    gold?: boolean;
  };
  isTopTeam?: boolean;
  metroName?: string;
}) {
  const isFootball = team.sport === "Soccer" || team.sport === "Football/Soccer";

  // Resolve team-page link, logo, and monogram via lib/teamLinks. Returns
  // null for any team that's not a known league franchise (minor-league,
  // NCAA, soccer clubs, etc.); those rows stay plain text.
  //
  // To add a new league, extend lib/teamLinks.ts — this card auto-picks
  // it up. The chip block below uses the league discriminator to surface
  // sport-appropriate stats (NFL: titles + div titles; MLB: WS titles +
  // pennants).
  // College Football (FBS now, or once-major FCS) resolves to the CFB hub with a
  // team-colored monogram. resolveTeamLink returns null for these (its NFL branch
  // short-circuits on sport "American Football"), so the link is built here.
  const cfbTeam =
    team.sport === "American Football" && (team.league === "FBS" || team.league === "FCS")
      ? getCfbTeamForName(team.team)
      : undefined;
  // NPB clubs come through the workbook tagged "Minor Lg Base"; resolve them to
  // the NPB hub so metro cards link correctly and show the right division.
  const npbTeam = team.sport === "Baseball" ? getNpbTeamByName(team.team) : null;
  const link: TeamLink | null = cfbTeam
    ? {
        slug: cfbTeam.slug,
        league: "cfb",
        href: `/teams/cfb/${cfbTeam.slug}`,
        logoUrl: null,
        monogram: { bg: cfbTeam.color || "#444", fg: "#ffffff", mono: cfbMonogram(cfbTeam.name) },
        displayName: cfbTeam.name,
      }
    : npbTeam
    ? {
        slug: npbTeam.slug,
        league: "npb",
        href: `/teams/baseball/npb/${npbTeam.slug}`,
        logoUrl: null,
        monogram: { bg: "#444", fg: "#ffffff", mono: rugbyMonogram(npbTeam.name) },
        displayName: npbTeam.name,
      }
    : resolveTeamLink(team.sport, team.team, team.league);

  // Pull franchise records for chip rendering. Either may resolve depending
  // on which league this team belongs to; both null for unsupported leagues.
  const nflFranchise = link?.league === "nfl" ? getNflFranchiseByTeamName(team.team) : undefined;
  // NFL title-game appearances (pre-Super Bowl championship games + Super Bowls),
  // one entry per appearance in the championship-appearances ledger.
  const nflTitleApps = nflFranchise ? getNflChampApps(team.team).length : 0;
  const mlbFranchise = link?.league === "mlb" ? getMlbFranchiseByTeamName(team.team) : undefined;
  const nbaFranchise = link?.league === "nba" ? getNbaFranchiseByTeamName(team.team) : undefined;
  const nhlFranchise = link?.league === "nhl" ? getNhlFranchiseByTeamName(team.team) : undefined;
  const iplFranchise = link?.league === "ipl" ? getIplFranchiseByTeamName(team.team) : undefined;
  const footballClub  = link?.league === "football" ? getFootballClubByName(team.team) : undefined;
  const clTitles = footballClub ? getClTitlesForClub(footballClub.slug) : 0;
  // Long-tail football clubs (those without a dedicated league-hub page) get
  // honour chips from the Domestic Leagues data, joined by name + metro.
  const domesticClub = isFootball && !footballClub ? getDomesticClubByName(team.team, metroName) : undefined;
  const wnbaFranchise = link?.league === "wnba" ? getWnbaFranchiseByTeamName(team.team) : undefined;
  const cflFranchise = link?.league === "cfl" ? getCflFranchiseByTeamName(team.team) : undefined;
  const aflFranchise = link?.league === "afl" ? getAflFranchiseByTeamName(team.team) : undefined;
  const nrlFranchise = link?.league === "nrl" ? getNrlFranchiseByTeamName(team.team) : undefined;
  const footyFranchise = aflFranchise ?? nrlFranchise;
  const wfootballClub = link?.league === "wfootball" ? getWClubByName(team.team) : undefined;
  const wHonor = (slug: string) => wfootballClub?.honors.find((h) => h.competition_slug === slug);
  // Foreign/minor baseball arrives tagged "Minor Lg Base" from the workbook;
  // restore the real league (KBO, NPB, International League, ...) from all-teams.json.
  const baseballLeague = team.sport === "Baseball" ? getBaseballLeagueByName(team.team) : null;
  // College baseball: label the card "College Baseball" and surface its CWS record.
  const collegeBaseball = team.sport === "Baseball" && team.level === "College";
  const cwsRec = collegeBaseball ? getCwsForSchool(team.team) : null;
  const displayLeague = wnbaFranchise ? "WNBA" : npbTeam ? "NPB" : collegeBaseball ? "College Baseball" : (baseballLeague ?? team.league);
  // For football, Gold Standard only applies to Level 1 (Big 5 top flight).
  // Lower-tier clubs in England/Spain/etc. share the same league label but
  // are not Gold — gate on level === "Major" (the ETL value for tier 1).
  // team.gold is the workbook-precomputed flag; it rescues umbrella-league
  // sports (e.g. WNBA stored as "Int'l W Basketball") whose display league
  // does not match the gold set.
  const isGold = (team.gold === true || isGoldStandardLeague(team.sport, team.league)) &&
    (!isFootball || team.level === "1");

  // Club rugby honours (winners-only layer): gold title chips per competition.
  const sportLower = (team.sport || "").toLowerCase();
  const isRugbyUnionClub = sportLower.includes("rugby") && !sportLower.includes("league");
  const rugbyHonours = isRugbyUnionClub
    ? getRugbyClubHonours(team.team, team.league)
    : [];
  const t20Honours = sportLower.includes("cricket")
    ? getT20Honours(team.team)
    : [];
  const rugbyColor = isRugbyUnionClub ? rugbyClubColor(team.team) : null;
  const cricketColor = sportLower.includes("cricket") && t20Honours.length >= 0
    ? cricketClubColor(team.team)
    : null;
  const elColor = sportLower.includes("basket") ? euroleagueClubColor(team.team) : null;
  const clubColor = rugbyColor
    ?? (elColor && elColor.known ? elColor : null)
    ?? (cricketColor && cricketColor.known ? cricketColor : null);
  const cardMono = sportLower.includes("basket")
    ? euroleagueMonogram(team.team)
    : rugbyMonogram(team.team);
  const elHonours = sportLower.includes("basket")
    ? getEuroleagueHonours(team.team)
    : null;
  // Domestic winners-roll honours for rugby league / volleyball / handball /
  // KHL hockey / CBA / county cricket clubs (lib/domesticHonours).
  const domesticHonours = getDomesticHonours(team.sport, team.team);
  // Cross-sport British RL title for a club tracked under another sport
  // (Bradford Park Avenue won the 1903-04 title as a football club).
  const crossRL = getBritishRLTitlesForClub(team.team);

  // Reigning-champion pill (lib/champions). Matched on team name: champion club
  // names are unique across the ledger, so this avoids the workbook's sport-label
  // quirks (Soccer vs Football, WNBA stored as "Int'l W Basketball", etc.).
  const cardChamps = getCurrentChampionships(team.team);
  const cardCrest = getCrest(team.team);

  return (
    <div
      className={`border rounded-lg p-4 hover:border-[var(--accent)] transition ${
        team.major
          ? "bg-[var(--bg-card)] border-[var(--border)]"
          : "bg-[var(--bg-card)] border-[var(--border)]"
      }`}
    >
      <p className="text-xs text-[var(--text-muted)] mb-1">
        {sportIcon(team.sport) && <span aria-hidden className="mr-1">{sportIcon(team.sport)}</span>}
        {normalizeTeamSport(team.sport)} • {displayLeague}{isGold && <span className="ml-1 cursor-default" title="Gold Standard league — the apex competition in its sport on this site" aria-label="Gold Standard league">🥇</span>}{isTopTeam && <span className="ml-1 cursor-default" title="Top Team for this metro — the franchise that most defines this city's sports identity" aria-label="Top Team">👑</span>}
      </p>
      <ChampionBadge items={cardChamps} />
      {elHonours && (elHonours.titles > 0 || elHonours.f4 > 0) && (
        <div className="flex gap-1.5 mb-1.5 flex-wrap">
          {elHonours.titles > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide"
                  style={{ background: "rgba(212,175,55,0.16)", color: "#d4af37" }}
                  title={`EuroLeague titles: ${elHonours.years.join(", ")}`}>
              {elHonours.titles}× EuroLeague
            </span>
          )}
          {elHonours.f4 > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium tracking-wide"
                  style={{ background: "rgba(120,140,170,0.16)", color: "var(--text-muted)" }}
                  title="EuroLeague Final Four appearances">
              {elHonours.f4} Final Four{elHonours.f4 === 1 ? "" : "s"}
            </span>
          )}
        </div>
      )}
      {t20Honours.length > 0 && (
        <div className="flex gap-1.5 mb-1.5 flex-wrap">
          {t20Honours.slice(0, 2).map((h) => (
            <span key={h.league} className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide"
                  style={{ background: "rgba(212,175,55,0.16)", color: "#d4af37" }}
                  title={`${h.league}: ${h.years.join(", ")}`}>
              {h.titles}× {h.league} title{h.titles === 1 ? "" : "s"}
            </span>
          ))}
        </div>
      )}
      {rugbyHonours.length > 0 && (
        <div className="flex gap-1.5 mb-1.5 flex-wrap">
          {rugbyHonours.slice(0, 3).map((h) => (
            <span key={h.comp} className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide"
                  style={{ background: "rgba(212,175,55,0.16)", color: "#d4af37" }}
                  title={`${h.comp}: ${h.years.join(", ")}`}>
              {h.titles}× {h.comp}
            </span>
          ))}
        </div>
      )}
      {domesticHonours.length > 0 && (
        <div className="flex gap-1.5 mb-1.5 flex-wrap">
          {domesticHonours.map((h) => (
            <Link key={h.label} href={h.href}
                  className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide hover:opacity-80 transition-opacity"
                  style={h.count > 0
                    ? { background: "rgba(212,175,55,0.16)", color: "#d4af37" }
                    : { background: "rgba(120,120,140,0.16)", color: "var(--text-dim)" }}
                  title={h.count > 0 ? `${h.count}× ${h.label}` : `No ${h.label} titles — connected to the roll, none yet`}>
              {h.count > 0 ? `${h.count}× ${h.label}` : `No ${h.label} titles`}
            </Link>
          ))}
        </div>
      )}
      {crossRL && (
        <div className="flex gap-1.5 mb-1.5 flex-wrap">
          <Link href={crossRL.href}
                className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide hover:opacity-80 transition-opacity"
                style={{ background: "rgba(212,175,55,0.16)", color: "#d4af37" }}
                title={`British rugby league titles: ${crossRL.years.join(", ")}`}>
            {crossRL.count}× British RL
          </Link>
        </div>
      )}
      {cwsRec && (cwsRec.titles > 0 || cwsRec.apps > 0) && (
        <div className="flex gap-1.5 mb-1.5 flex-wrap">
          {cwsRec.titles > 0 && (
            <Link href="/teams/baseball/college" className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide hover:opacity-80 transition-opacity"
                  style={{ background: "rgba(212,175,55,0.16)", color: "#d4af37" }}
                  title={`College World Series titles${cwsRec.last_title ? ` — last in ${cwsRec.last_title}` : ""}`}>
              {cwsRec.titles}× CWS title{cwsRec.titles === 1 ? "" : "s"}
            </Link>
          )}
          <Link href="/teams/baseball/college" className="text-[10px] px-1.5 py-0.5 rounded font-medium tracking-wide hover:opacity-80 transition-opacity"
                style={{ background: "rgba(120,140,170,0.16)", color: "var(--text-muted)" }}
                title="College World Series appearances">
            {cwsRec.apps} CWS appearance{cwsRec.apps === 1 ? "" : "s"}
          </Link>
        </div>
      )}
      <div className="flex items-center gap-2.5">
        {cardCrest ? <img src={cardCrest.src} alt="" className="w-8 h-8 flex-shrink-0 object-contain" loading="lazy" /> : null}
        {!cardCrest && !link && clubColor ? (
          <span
            className="inline-grid place-items-center rounded-full flex-shrink-0"
            style={{
              background: clubColor.bg,
              color: clubColor.fg,
              width: 28, height: 28, fontSize: 10, fontWeight: 700, letterSpacing: "-0.02em",
            }}
            title={clubColor.known ? undefined : "Club colors pending"}
            aria-hidden
          >
            {cardMono}
          </span>
        ) : null}
        {!cardCrest && link ? (
          link.logoUrl ? (
            <img
              src={link.logoUrl}
              alt=""
              className="w-8 h-8 flex-shrink-0 object-contain" loading="lazy" decoding="async"
            />
          ) : (
            <span
              className="inline-grid place-items-center rounded-full flex-shrink-0"
              style={{
                background: link.monogram.bg,
                color: link.monogram.fg,
                width: 28, height: 28, fontSize: 10, fontWeight: 700, letterSpacing: "-0.02em",
              }}
              aria-hidden
            >
              {link.monogram.mono}
            </span>
          )
        ) : null}
        <p className="font-semibold text-[var(--text)] flex items-center gap-1.5 min-w-0">
          {link ? (
            <Link href={link.href} className="hover:text-[var(--accent)] transition truncate">
              {team.team}
            </Link>
          ) : (
            <span className="truncate">{team.team}</span>
          )}
          {/* Tiny outbound Wikipedia mark. Renders only when team.wikipediaUrl is
              populated so partial coverage never produces dangling icons. The
              same URL is also emitted in SportsTeam.sameAs JSON-LD above so the
              visible UX matches the structured data. */}
          {team.wikipediaUrl && (
            <a
              href={team.wikipediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Read ${team.team} on Wikipedia`}
              title="Wikipedia"
              className="text-[var(--text-muted)] hover:text-[var(--accent)] transition text-[10px] font-bold leading-none border border-[var(--border)] hover:border-[var(--accent)] rounded px-1 py-0.5 flex-shrink-0"
            >
              W
            </a>
          )}

        </p>
      </div>
      <p className="text-xs text-[var(--text-dim)] mt-1">
        {team.city}
        {isFootball && team.level && <> • <span className="text-[var(--text-muted)]">Level: {team.level}</span></>}
      </p>
      {nflFranchise && (
        <div className="flex gap-1.5 mt-2 flex-wrap">
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide"
            style={{
              background: nflFranchise.championships > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)",
              color: nflFranchise.championships > 0 ? "#d4af37" : "var(--text-dim)",
            }}
            title="League championships (pre-Super Bowl + Super Bowl era)"
          >
            {nflFranchise.championships === 0
              ? "No titles"
              : nflFranchise.championships === 1
              ? "1 title"
              : `${nflFranchise.championships} titles`}
          </span>
          {nflTitleApps > 0 && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: "rgba(110,138,166,0.18)", color: "#a9b8cc" }}
              title="Title-game appearances (NFL Championship + Super Bowl, won or lost)"
            >
              {nflTitleApps} Title App{nflTitleApps === 1 ? "" : "s"}
            </span>
          )}
          <span
            className="text-[10px] px-1.5 py-0.5 rounded"
            style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }}
            title="All-time regular-season win pct"
          >
            {nflFranchise.win_pct.toFixed(3)} W%
          </span>
          {nflFranchise.division_titles > 0 && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }}
              title="Division titles"
            >
              {nflFranchise.division_titles} div
            </span>
          )}
        </div>
      )}
      {mlbFranchise && (
        <div className="flex gap-1.5 mt-2 flex-wrap">
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide"
            style={{
              background: mlbFranchise.championships > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)",
              color: mlbFranchise.championships > 0 ? "#d4af37" : "var(--text-dim)",
            }}
            title="World Series titles"
          >
            {mlbFranchise.championships === 0
              ? "No WS"
              : mlbFranchise.championships === 1
              ? "1 WS"
              : `${mlbFranchise.championships} WS`}
          </span>
          {mlbFranchise.ws_appearances > 0 && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: "rgba(110,138,166,0.18)", color: "#a9b8cc" }}
              title="Pennants — World Series appearances (won or lost)"
            >
              {mlbFranchise.ws_appearances} pennant{mlbFranchise.ws_appearances === 1 ? "" : "s"}
            </span>
          )}
          <span
            className="text-[10px] px-1.5 py-0.5 rounded"
            style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }}
            title="All-time regular-season win pct"
          >
            {mlbFranchise.win_pct.toFixed(3)} W%
          </span>
        </div>
      )}
      {npbTeam && (
        <div className="flex gap-1.5 mt-2 flex-wrap">
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide"
            style={{
              background: npbTeam.js_titles > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)",
              color: npbTeam.js_titles > 0 ? "#d4af37" : "var(--text-dim)",
            }}
            title="Japan Series titles (includes earlier franchise identities)"
          >
            {npbTeam.js_titles === 0
              ? "No JS"
              : npbTeam.js_titles === 1
              ? "1 Japan Series"
              : `${npbTeam.js_titles} Japan Series`}
          </span>
          {npbTeam.pennants > 0 && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: "rgba(110,138,166,0.18)", color: "#a9b8cc" }}
              title="Central/Pacific League pennants"
            >
              {npbTeam.pennants} pennant{npbTeam.pennants === 1 ? "" : "s"}
            </span>
          )}
          <span
            className="text-[10px] px-1.5 py-0.5 rounded"
            style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }}
            title="All-time regular-season win pct"
          >
            {npbTeam.win_pct.toFixed(3)} W%
          </span>
        </div>
      )}
      {nbaFranchise && (
        <div className="flex gap-1.5 mt-2 flex-wrap">
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide"
            style={{
              background: nbaFranchise.championships > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)",
              color: nbaFranchise.championships > 0 ? "#d4af37" : "var(--text-dim)",
            }}
            title="NBA championships (BAA + NBA + ABA era)"
          >
            {nbaFranchise.championships === 0
              ? "No titles"
              : nbaFranchise.championships === 1
              ? "1 title"
              : `${nbaFranchise.championships} titles`}
          </span>
          {nbaFranchise.championship_appearances > 0 && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: "rgba(110,138,166,0.18)", color: "#a9b8cc" }}
              title="NBA Finals appearances (won or lost)"
            >
              {nbaFranchise.championship_appearances} Finals App{nbaFranchise.championship_appearances === 1 ? "" : "s"}
            </span>
          )}
          <span
            className="text-[10px] px-1.5 py-0.5 rounded"
            style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }}
            title="All-time regular-season win percentage"
          >
            {nbaFranchise.win_pct.toFixed(3)} W%
          </span>
          {nbaFranchise.division_titles > 0 && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }}
              title="Division titles"
            >
              {nbaFranchise.division_titles} div
            </span>
          )}
        </div>
      )}
      {nhlFranchise && (
        <div className="flex gap-1.5 mt-2 flex-wrap">
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide"
            style={{
              background: nhlFranchise.championships > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)",
              color: nhlFranchise.championships > 0 ? "#d4af37" : "var(--text-dim)",
            }}
            title="Stanley Cup championships"
          >
            {nhlFranchise.championships === 0
              ? "No Cups"
              : nhlFranchise.championships === 1
              ? "1 Cup"
              : `${nhlFranchise.championships} Cups`}
          </span>
          {nhlFranchise.champ_appearances > 0 && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: "rgba(110,138,166,0.18)", color: "#a9b8cc" }}
              title="Stanley Cup Final appearances (won or lost)"
            >
              {nhlFranchise.champ_appearances} Finals App{nhlFranchise.champ_appearances === 1 ? "" : "s"}
            </span>
          )}
          <span
            className="text-[10px] px-1.5 py-0.5 rounded"
            style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }}
            title="All-time points percentage (pts / 2×GP)"
          >
            {nhlFranchise.pts_pct.toFixed(3)} Pts%
          </span>
          {nhlFranchise.division_titles > 0 && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }}
              title="Division titles"
            >
              {nhlFranchise.division_titles} div
            </span>
          )}
        </div>
      )}
      {iplFranchise && (
        <div className="flex gap-1.5 mt-2 flex-wrap">
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide"
            style={{
              background: iplFranchise.titles > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)",
              color: iplFranchise.titles > 0 ? "#d4af37" : "var(--text-dim)",
            }}
            title="IPL titles"
          >
            {iplFranchise.titles === 0
              ? "No titles"
              : iplFranchise.titles === 1
              ? "1 title"
              : `${iplFranchise.titles} titles`}
          </span>
          {iplFranchise.finals > 0 && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: "rgba(110,138,166,0.18)", color: "#a9b8cc" }}
              title="Final appearances (won or lost)"
            >
              {iplFranchise.finals} final{iplFranchise.finals === 1 ? "" : "s"}
            </span>
          )}
          <span
            className="text-[10px] px-1.5 py-0.5 rounded"
            style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }}
            title="Seasons played"
          >
            {iplFranchise.seasons} seasons
          </span>
        </div>
      )}
      {footballClub && (
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {footballClub.is_mls ? (
            <>
              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide" style={{ background: "rgba(212,175,55,0.16)", color: "#d4af37" }} title="MLS Cup titles">
                {footballClub.totals.mls_cups ?? 0} {(footballClub.totals.mls_cups ?? 0) === 1 ? "Cup" : "Cups"}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide" style={{ background: "rgba(99,102,241,0.16)", color: "#818cf8" }} title="Supporters' Shields (best regular-season record)">
                {footballClub.totals.supporters_shields ?? 0} Sup. Shield{(footballClub.totals.supporters_shields ?? 0) === 1 ? "" : "s"}
              </span>
              {(footballClub.totals.cont_trophies ?? 0) > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }} title="Continental trophies (CONCACAF Champions Cup / League)">
                  {footballClub.totals.cont_trophies} Cont.
                </span>
              )}
            </>
          ) : (
            <>
              {(footballClub.totals.titles ?? 0) > 0 ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide" style={{ background: "rgba(212,175,55,0.16)", color: "#d4af37" }} title="Top-flight league titles">
                  {footballClub.totals.titles} title{footballClub.totals.titles === 1 ? "" : "s"}
                </span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide" style={{ background: "rgba(85,85,106,0.16)", color: "var(--text-dim)" }} title="Top-flight league titles">
                  No titles
                </span>
              )}
              {(footballClub.totals.cont_trophies ?? 0) > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide" style={{ background: "rgba(212,175,55,0.16)", color: "#d4af37" }} title="Continental trophies (Champions League / Copa Libertadores / continental champions cups)">
                  {footballClub.totals.cont_trophies} Cont.
                </span>
              )}
              {(footballClub.totals.major_cups ?? 0) > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }} title="Major trophies (domestic cups + continental trophies)">
                  {footballClub.totals.major_cups} maj. trophies
                </span>
              )}
              {footballClub.top_flight_seasons > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }} title="Top-flight seasons">
                  {footballClub.top_flight_seasons} yrs top-flight
                </span>
              )}
            </>
          )}
        </div>
      )}
      {domesticClub && (
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {domesticClub.allTime.titles > 0 ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide" style={{ background: "rgba(212,175,55,0.16)", color: "#d4af37" }} title="Top-flight league titles (all-time)">
              {domesticClub.allTime.titles} title{domesticClub.allTime.titles === 1 ? "" : "s"}
            </span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide" style={{ background: "rgba(85,85,106,0.16)", color: "var(--text-dim)" }} title="Top-flight league titles (all-time)">
              No titles
            </span>
          )}
          {domesticClub.allTime.contTitles > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide" style={{ background: "rgba(212,175,55,0.16)", color: "#d4af37" }} title="Continental trophies (Champions League / Copa Libertadores / continental champions cups)">
              {domesticClub.allTime.contTitles} Cont.
            </span>
          )}
          {domesticClub.allTime.cups > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }} title="Domestic cups (all-time)">
              {domesticClub.allTime.cups} cup{domesticClub.allTime.cups === 1 ? "" : "s"}
            </span>
          )}
          <Link href="/teams/football/domestic" className="text-[10px] px-1.5 py-0.5 rounded hover:opacity-80 transition-opacity" style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }} title="Open the Domestic Leagues Worldwide table">
            Domestic leagues →
          </Link>
        </div>
      )}
      {wnbaFranchise && (
        <div className="flex gap-1.5 mt-2 flex-wrap">
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide"
            style={{ background: wnbaFranchise.titles > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)", color: wnbaFranchise.titles > 0 ? "#d4af37" : "var(--text-dim)" }}
            title="WNBA championships"
          >
            {wnbaFranchise.titles === 0 ? "No titles" : wnbaFranchise.titles === 1 ? "1 title" : `${wnbaFranchise.titles} titles`}
          </span>
          {wnbaFranchise.win_pct != null && (
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }} title="All-time regular-season win percentage">
              {wnbaFranchise.win_pct.toFixed(3)} W%
            </span>
          )}
          {wnbaFranchise.division_titles > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }} title="Conference titles">
              {wnbaFranchise.division_titles} div
            </span>
          )}
        </div>
      )}
      {footyFranchise && (
        <div className="flex gap-1.5 mt-2 flex-wrap">
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide"
            style={{ background: footyFranchise.premierships > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)", color: footyFranchise.premierships > 0 ? "#d4af37" : "var(--text-dim)" }}
            title="Premierships"
          >
            {footyFranchise.premierships === 0 ? "No premierships" : footyFranchise.premierships === 1 ? "1 premiership" : `${footyFranchise.premierships} premierships`}
          </span>
          {footyFranchise.minor_premierships > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(110,138,166,0.18)", color: "#a9b8cc" }} title="Minor premierships (finished top of the ladder)">
              {footyFranchise.minor_premierships} minor prem
            </span>
          )}
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }} title="Seasons in the competition">
            {footyFranchise.seasons} seasons
          </span>
        </div>
      )}
      {cflFranchise && (
        <div className="flex gap-1.5 mt-2 flex-wrap">
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide"
            style={{ background: cflFranchise.grey_cups > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)", color: cflFranchise.grey_cups > 0 ? "#d4af37" : "var(--text-dim)" }}
            title="Grey Cup championships"
          >
            {cflFranchise.grey_cups === 0 ? "No Grey Cups" : cflFranchise.grey_cups === 1 ? "1 Grey Cup" : `${cflFranchise.grey_cups} Grey Cups`}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }} title="All-time regular-season win percentage (1945–)">
            {cflFranchise.win_pct.toFixed(3)} W%
          </span>
          {cflFranchise.gc_finals > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(110,138,166,0.18)", color: "#a9b8cc" }} title="Grey Cup final appearances (won or lost)">
              {cflFranchise.gc_finals} final{cflFranchise.gc_finals === 1 ? "" : "s"}
            </span>
          )}
        </div>
      )}
      {wfootballClub && (() => {
        const goldPill = (n: number, tip: string) => (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide"
            style={{ background: n > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)", color: n > 0 ? "#d4af37" : "var(--text-dim)" }}
            title={tip}
          >
            {n === 0 ? "No titles" : n === 1 ? "1 title" : `${n} titles`}
          </span>
        );
        if (team.league === "NWSL") {
          const champ = wHonor("nwsl-championship");
          const titles = champ?.titles ?? 0;
          const finals = (champ?.titles ?? 0) + (champ?.runner_ups ?? 0);
          return (
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {goldPill(titles, "NWSL Championships")}
              {finals > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(110,138,166,0.18)", color: "#a9b8cc" }} title="NWSL Championship final appearances (won or lost)">
                  {finals} final{finals === 1 ? "" : "s"}
                </span>
              )}
            </div>
          );
        }
        if (team.league === "WSL" || team.league === "Liga F") {
          const lt = wHonor(team.league === "WSL" ? "wsl" : "liga-f")?.titles ?? 0;
          const wcl = wHonor("uwcl")?.titles ?? 0;
          return (
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {goldPill(lt, "League titles")}
              {wcl > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide" style={{ background: "rgba(212,175,55,0.16)", color: "#d4af37" }} title="UEFA Women's Champions League titles">
                  {wcl} WCL
                </span>
              )}
            </div>
          );
        }
        return null;
      })()}
      {cfbTeam && (
        <div className="flex gap-1.5 mt-2 flex-wrap">
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide"
            style={{ background: cfbTeam.nat_champ_count > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)", color: cfbTeam.nat_champ_count > 0 ? "#d4af37" : "var(--text-dim)" }}
            title="National championships"
          >
            {cfbTeam.nat_champ_count === 0 ? "No titles" : `${cfbTeam.nat_champ_count} Natl Champ${cfbTeam.nat_champ_count === 1 ? "" : "s"}`}
          </span>
          {cfbTeam.maj_conf_champ > 0 && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }}
              title="Conference championships"
            >
              {cfbTeam.maj_conf_champ} Conf
            </span>
          )}
          <span
            className="text-[10px] px-1.5 py-0.5 rounded"
            style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }}
            title="Major (top-division) seasons"
          >
            {cfbTeam.maj_seasons} maj season{cfbTeam.maj_seasons === 1 ? "" : "s"}
          </span>
        </div>
      )}
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

  // 1. Annual Sporting Events : Culture-Infra "Sporting Event" rows flagged annual
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

  // 2. Multi-Sport Events : Olympics (Summer & Winter) plus the Pan American,
  //    Asian, and Commonwealth Games. Identified by Culture-Infra subtype
  //    "Olympics" or "Multi-sport Event". Pulled out of the Championship
  //    Finals catch-all so the metro page surfaces them as their own category.
  const multiSportSubtypes = new Set(["Olympics", "Multi-sport Event"]);
  const nonAnnualSporting = sportingEvents.filter((se) => !se.annual);
  const multiSportEvents = nonAnnualSporting
    .filter((se) => multiSportSubtypes.has(se.subtype))
    .map((se) => ({
      event: se.name,
      year: extractYear(se.name),
      venue: se.city,
      type: se.subtype,
    }))
    .sort((a, b) => (parseInt(b.year) || 0) - (parseInt(a.year) || 0));
  if (multiSportEvents.length > 0) {
    grouped["Multi-Sport Events"] = multiSportEvents;
  }

  // 3. Championship Finals : one-off championship moments from two sources:
  //    (a) Culture-Infra Sporting Events without the annual flag (year in the name),
  //        excluding Olympics and Multi-sport Events which now have their own bucket.
  //    (b) Golf-Tennis-F1 rows with Event Type = "US Sports Finals" (NBA/NHL/MLB finals).
  const finalsFromCulture = nonAnnualSporting
    .filter((se) => !multiSportSubtypes.has(se.subtype))
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

  // 8. Complete Event Timeline : every one-off event from the buckets above,
  //    merged into a single chronological view sorted year-descending. Annual
  //    Sporting Events are deliberately excluded because they recur every
  //    year and would dominate the timeline. Each entry carries its origin
  //    category in the `type` field so the merged view stays interpretable
  //    when scanning across decades. Title is "Complete Event Timeline" so
  //    the section reads as the master cross-bucket view.
  const TIMELINE_TITLE = "Complete Event Timeline";
  const ANNUAL_BUCKET = "Annual Sporting Events";
  const timelineEntries: EventItem[] = [];
  for (const cat of Object.keys(grouped)) {
    if (cat === ANNUAL_BUCKET || cat === TIMELINE_TITLE) continue;
    for (const it of grouped[cat]) {
      timelineEntries.push({
        event: it.event,
        year: it.year,
        venue: it.venue,
        // Surface the bucket name in the type slot so each row tells the
        // reader which category it came from. The original ev.type/subtype
        // is intentionally dropped here because it duplicates the bucket
        // label for most buckets and adds noise in a mixed timeline.
        type: cat,
      });
    }
  }
  timelineEntries.sort(
    (a, b) => (parseInt(b.year) || 0) - (parseInt(a.year) || 0)
  );
  if (timelineEntries.length > 0) {
    grouped[TIMELINE_TITLE] = timelineEntries;
  }

  const categoryOrder = [
    "Annual Sporting Events",
    "Multi-Sport Events",
    "Championship Finals",
    "All-Star Games",
    "Golf Majors",
    "Tennis Majors",
    "F1 Races",
    "Major Fights",
    TIMELINE_TITLE,
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
              {grouped[category].map((ev, idx) => {
                const olySlug =
                  category === "Multi-Sport Events"
                    ? olympicEditionSlugFromName(ev.event)
                    : null;
                const f1r =
                  ev.type === "F1 Race" || category === "F1 Races"
                    ? getF1RaceResultByName(ev.event, ev.year)
                    : null;
                const inner = (
                  <>
                    <p className="font-medium text-[var(--text)]">{ev.event}</p>
                    {ev.type && (
                      <p className="text-xs text-[var(--accent)]">{ev.type}</p>
                    )}
                    <p className="text-xs text-[var(--text-muted)]">
                      {ev.year} {"\u2022"} {ev.venue}
                    </p>
                    {f1r && f1r.winner && (
                      <p className="text-xs text-[var(--text-muted)]">
                        Won by <span className="text-[var(--text)]">{f1r.winner}</span>
                        {f1r.constructor ? ` (${f1r.constructor})` : ""}
                      </p>
                    )}
                  </>
                );
                return olySlug ? (
                  <Link
                    key={idx}
                    href={`/teams/olympics/games/${olySlug}`}
                    className="block py-2 rounded-md transition hover:bg-[var(--bg-card-hover)] hover:text-[var(--accent)]"
                  >
                    {inner}
                  </Link>
                ) : f1r ? (
                  <Link
                    key={idx}
                    href={`/teams/f1/${f1r.circuit_id}`}
                    className="block py-2 rounded-md transition hover:bg-[var(--bg-card-hover)] hover:text-[var(--accent)]"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div key={idx} className="py-2">
                    {inner}
                  </div>
                );
              })}
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
    universities: "universities",
    topUniHospResearch: "universities",
    museumsLandmarks: "culture",
    portsExchangesInfra: "infrastructure",
    airportScore: "infrastructure",
    luxuryStars: "luxury",
    metroStations: "infrastructure",
    suburbStations: "infrastructure",
    trainHubs: "infrastructure",
    // skyscrapers is handled inline in the Dimension Breakdown: it links to the
    // Supertall Structures block (#skyline) only when the metro has 350m+ towers.
  };
  return anchors[key] || null;
}
function getStatLabel(key: string): string {
  const names: Record<string, string> = {
    majorLeagueTeams: "Major League Teams",
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
