import type { Metadata } from "next";
import Link from "next/link";
import {
  AUTHOR,
  BASE_URL,
  PUBLISHER,
  SITE_NAME,
  serializeJsonLd,
} from "@/lib/seo";
import { TIERS } from "@/lib/tiers";

export const dynamicParams = false;

const PAGE_PATH = "/methodology";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "Methodology";
const PAGE_DESCRIPTION =
  "How the Global Metro Power Rankings composite is built. Sixteen dimensions, their source data, the editorial choices behind them, and what the rankings can and cannot tell you.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: {
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    type: "article",
  },
  twitter: {
    card: "summary",
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
  },
};

// Each dimension is a row in the composite. Weight column is the literal
// multiplier applied in the formula; "shape" describes whether the value is
// linear, capped, log-scaled, or tier-bonused. Source column names the
// upstream third-party dataset that the dimension relies on; internal
// spreadsheet structure is intentionally not exposed in the public copy.
type Dimension = {
  id: string;
  name: string;
  weight: string;
  shape: string;
  rationale: string;
  source: string;
};

const DIMENSIONS: Dimension[] = [
  {
    id: "population",
    name: "Population",
    weight: "pop / 3,000,000",
    shape: "linear",
    rationale:
      "Sets a baseline floor. A metro with thirty million people gets credit for that scale before any other dimension is counted. The 3M divisor keeps the contribution moderate so population alone never decides the ranking.",
    source: "citypopulation.de for both municipality-level data (the set of countries with full municipality coverage: US, Canada, UK, Germany, France, Spain, Italy, Japan, South Korea, Australia, Brazil, Mexico, China, India, Russia, Turkey, Poland, Netherlands, Belgium, Austria, Switzerland, Sweden, Norway, Denmark, Finland, Czech Republic, Portugal, Ireland, New Zealand, South Africa, Argentina, Colombia, Chile) and county/district-level data used as the secondary lookup for everywhere else. Country-level totals reconciled against Wikipedia's 'List of countries and dependencies by population' (en.wikipedia.org/wiki/List_of_countries_and_dependencies_by_population).",
  },
  {
    id: "major-league-teams",
    name: "Major league teams",
    weight: "raw count, capped at 10",
    shape: "capped",
    rationale:
      "Top-tier franchises signal civic identity, broadcast economy, and cultural reach. The cap stops a metro with eight or more major-league teams from sweeping the score on this dimension alone.",
    source: "Official league websites for NFL, NBA, NHL, MLB, and MLS, plus Wikipedia season articles for every other tracked competition: European top-flight football (Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Eredivisie, Primeira Liga, and equivalents), EuroLeague basketball, AFL, CFL, top-flight rugby union (Premiership, Top 14, URC, Super Rugby Pacific), top-flight rugby league (NRL, Super League), and IPL plus other major T20 cricket leagues.",
  },
  {
    id: "other-teams",
    name: "Other professional teams",
    weight: "(total teams − major league) × 0.25, capped at 10",
    shape: "capped, low weight",
    rationale:
      "Second-tier and minor-league teams count, but at a fraction of the marquee franchises. The 0.25 multiplier and the 40-team pre-cap reflect that.",
    source: "Wikipedia season articles for second-division and minor-league rosters across every sport listed above, plus Wikipedia NCAA program lists by conference (FBS, FCS, basketball).",
  },
  {
    id: "market-cap",
    name: "Market capitalization",
    weight: "USD / 700,000,000,000",
    shape: "linear",
    rationale:
      "Total enterprise value of public and large private companies headquartered in the metro. The $700B divisor is calibrated so a single trillion-dollar company adds roughly 1.4 points to the score, not 14.",
    source: "Three upstream sources by company type. Public companies: companiesmarketcap.com. Private companies: Wikipedia's 'List of largest private non-governmental companies by revenue' and the Forbes Largest Private Companies list (forbes.com). Unicorns: CB Insights' Research Unicorn Companies (cbinsights.com). Refreshed roughly weekly.",
  },
  {
    id: "companies-count",
    name: "Number of major companies",
    weight: "implicit, via market cap accumulation",
    shape: "linear",
    rationale:
      "Every company above the inclusion threshold is in the corpus. Count is not weighted separately because count and total market cap are tightly correlated, and double-counting would bias the result toward US tech-heavy metros.",
    source: "Same three upstream sources as Market capitalization above (companiesmarketcap.com, Wikipedia / Forbes for private companies, CB Insights for unicorns). Count is informational only; the score uses cumulative market cap, not the count, to avoid double-rewarding metros with many small public companies.",
  },
  {
    id: "cultural-events",
    name: "Major cultural events",
    weight: "× 0.65 (combined with museums and infrastructure)",
    shape: "linear",
    rationale:
      "World expos, NATO summits, G7 and G20 hostings, World's Fairs, royal weddings, papal events. One-off cultural moments that put a metro at the center of global attention for a period of days.",
    source: "Manually compiled from Wikipedia lists for World Expos, World's Fairs, NATO summits, G7 and G20 hostings, plus Vatican press records for papal events, royal-wedding press records, the World Marathon Majors organizers, the Cannes Film Festival, Oktoberfest, the Tour de France, the Masters Tournament, the Tennis Grand Slam organizers, and individual festival/biennial organizers. Historical Events sub-category (added 2026-05-01) is sourced manually from Wikipedia and primary historical references.",
  },
  {
    id: "museums-landmarks",
    name: "Museums and landmarks",
    weight: "× 0.65 (combined with cultural events and infrastructure)",
    shape: "linear",
    rationale:
      "Museums, opera houses, concert halls, parks, religious sites, theme parks, world heritage sites, plus iconic bridges, tunnels, dams, and canals. The durable cultural and engineering assets that draw visitors and signal civic priority.",
    source: "museumworldranking.net (Top 426 museums globally), TEA/AECOM Global Experience Index 2024 (theme parks), TripAdvisor plus TEA plus AZA/EAZA accreditation (zoos and aquariums), Wikipedia 'List of contemporary amphitheatres', Wikipedia 'List of concert halls', Wikipedia 'List of opera houses', Wikipedia 'List of the world's largest libraries' (10M+ items), and US National Park Service 2024 visitor data for US national parks. Bridges, tunnels, dams, and canals from Wikipedia (longest bridges, longest tunnels, largest dams, ship canals), ASCE Monuments of the Millennium (asce.org), and ICOLD for major dams. UNESCO World Heritage Sites integration is in progress.",
  },
  {
    id: "infrastructure",
    name: "Ports, exchanges, and other infrastructure",
    weight: "× 0.65 (combined with cultural events and museums)",
    shape: "linear",
    rationale:
      "Container ports, stock exchanges, internet exchanges, military bases, central banks, data center hubs, agricultural and extraction hubs, and trade venues. The plumbing of a globally relevant metro.",
    source: "Container ports: Lloyd's List Top 100, World Shipping Council Top 50, and AJOT Top 100. Passenger ports: CLIA State of the Cruise Industry Report 2025 plus AAA Cruise Forecast 2025. Trade venues: UFI World Map of Exhibition Venues 2025 (80,000 square metre minimum). Stock exchanges: World Federation of Exchanges (WFE) member list (world-exchanges.org) plus Wikipedia commodity-exchange lists. Internet exchanges: DE-CIX (de-cix.net), AMS-IX (ams-ix.net), IX.br, PeeringDB (peeringdb.com), Internet Society Pulse (pulse.internetsociety.org), and the Newby Ventures IXP directory. Data center hubs: Cushman & Wakefield Global Data Center Market Comparison (cushmanwakefield.com) plus Cloudscene (cloudscene.com). Central banks: BIS member directory (bis.org) plus Wikipedia 'List of central banks'. Military bases: DMDC (dmdc.osd.mil), Pentagon Base Structure Report 2024, Congressional Research Service reports, plus Wikipedia country-specific lists. Agriculture and extraction: FAO GIAHS Programme (fao.org/giahs), OriGIn geographic indications (origin-gi.com), CGIAR research centres (cgiar.org), MINING.com, USGS, plus company filings.",
  },
  {
    id: "airport-score",
    name: "Airport score",
    weight: "× 0.25",
    shape: "linear, low weight",
    rationale:
      "Tier-1 mega-hubs (JFK, Heathrow, Hong Kong) score higher than tier-2 international gateways, which score higher than tier-3 regional airports. The weight is low because international connectivity is already partly captured by other dimensions.",
    source: "ACI World Airport Traffic Dataset 2024 (final, released July 2025), supplemented by Wikipedia 'List of busiest airports by passenger traffic' and FAA classifications. Each entry is tier-classified 1 (mega-hub) through 5 (regional) using a composite of passenger volume, freight volume, and international destination count.",
  },
  {
    id: "universities-top50",
    name: "Top-50 universities",
    weight: "× 3.5 per qualifying institution",
    shape: "linear, high weight",
    rationale:
      "A top-50 global university is a generational asset. Boston ranks far higher than its population would predict because of the Harvard and MIT cluster, and the formula reflects that.",
    source: "Center for World University Rankings 2024 (cwur.org), filtered to global rank ≤ 50.",
  },
  {
    id: "universities-top500",
    name: "Other top-500 universities, hospitals, research",
    weight: "× 2.2 per institution (top-500 minus top-50)",
    shape: "linear",
    rationale:
      "Universities ranked 51 to 500, top-250 hospitals, and major research institutions. Hospitals and research institutes carry half the weight of a university because they cluster less around a single peak ranking.",
    source: "Center for World University Rankings 2024 (cwur.org) for ranks 51 to 500, Newsweek World's Best Hospitals 2024 (Top 250), and a manually-curated set of research institutions (47 entries across biomedical research institutes, applied research labs, national laboratories, independent think tanks, and policy research institutes) verified against each institution's own publicly-published profile.",
  },
  {
    id: "metro-stations",
    name: "Metro and subway stations",
    weight: "log(stations)",
    shape: "log-scaled",
    rationale:
      "Log-scaled because adding the 200th station matters much less than adding the 20th. Tokyo at over 1,000 stations should not overwhelm London at 270.",
    source: "Wikipedia 'List of metro systems' (en.wikipedia.org/wiki/List_of_metro_systems). Subway, light rail, and tram lines all counted; per-line station counts preserved.",
  },
  {
    id: "suburb-stations",
    name: "Commuter rail stations",
    weight: "log(stations) × 0.5",
    shape: "log-scaled, low weight",
    rationale:
      "Suburban rail extends a metro's effective catchment. The 0.5 multiplier is half the metro-stations weight because commuter rail is functionally less central to daily urban life than the subway.",
    source: "Wikipedia 'List of suburban and commuter rail systems' (en.wikipedia.org/wiki/List_of_suburban_and_commuter_rail_systems).",
  },
  {
    id: "train-hubs",
    name: "Intercity train hubs",
    weight: "log(hubs) × 2",
    shape: "log-scaled, high weight",
    rationale:
      "Major intercity rail hubs (London King's Cross, Tokyo Station, Gare du Nord) require both a dense national rail network and a metro worth converging on, which is why they sit at high weight.",
    source: "Wikipedia 'List of busiest railway stations' (en.wikipedia.org/wiki/List_of_busiest_railway_stations). Threshold is roughly 30 million or more passengers per year.",
  },
  {
    id: "skyscrapers",
    name: "Skyscrapers and towers",
    weight: "log(150m+ count) × 5.7",
    shape: "log-scaled, high weight",
    rationale:
      "Buildings over 150m are a near-universal indicator of capital concentration and land-value pressure. The high multiplier reflects how hard this metric is to fake. Building tall requires sustained economic and political consensus.",
    source: "Council on Tall Buildings and Urban Habitat (CTBUH) via skyscrapercenter.com. 150m+ buildings only; tier counts (150m+ / 200m+ / 300m+) preserved per metro.",
  },
  {
    id: "luxury-stars",
    name: "Luxury hospitality (Michelin and Forbes Travel Guide)",
    weight: "log(stars) × 3",
    shape: "log-scaled",
    rationale:
      "Michelin 2- and 3-star restaurants plus Forbes Travel Guide 4- and 5-star hotels. A density measure of high-end consumption that tracks discretionary income, tourism, and cultural prestige.",
    source: "Michelin Guide 2025 (442 two- and three-star restaurants across 105 metros) plus Forbes Travel Guide 2026 Star Awards (forbestravelguide.com): 343 Five-Star and 708 Four-Star hotels. Star count weighted 3-star × 3 + 2-star × 2 for restaurants; Five-Star × 3 + Four-Star × 2 for hotels.",
  },
  {
    id: "major-sporting-events",
    name: "Major sporting events",
    weight: "× 0.2, capped at 4",
    shape: "capped, low weight",
    rationale:
      "Olympic and multi-sport hosting plus championship finals. Capped at 4 so a metro that hosted three Olympics last century cannot outrank a finance capital on this dimension alone.",
    source: "Wikipedia season and event articles for Olympic Games, FIFA World Cup, tennis Grand Slams, Formula 1 Grands Prix, and NASCAR Cup Series, plus continental finals (UEFA Champions League, Copa Libertadores, AFC Champions League, CAF Champions League, and equivalents).",
  },
  {
    id: "annual-events",
    name: "Annual recurring events",
    weight: "raw count",
    shape: "linear",
    rationale:
      "F1 Grands Prix, marathons, tennis Grand Slams, the Cannes Film Festival. Each annual draw is one point, with no cap, because a metro hosting five different marquee fixtures should get the cumulative credit.",
    source: "Per-fixture official sources: the Formula 1 official calendar, the Wikipedia NASCAR Cup Series season articles, the World Marathon Majors organizers, the Tennis Grand Slam organizers, the BWF World Tour calendar (badminton), WTT (table tennis), Riot Games (esports), evo.gg (fighting games), the Cannes Film Festival, and the European Broadcasting Union for Eurovision.",
  },
  {
    id: "gdp",
    name: "GDP tier bonus",
    weight: "+3 / +2 / +1 / +0.5 / 0",
    shape: "tiered bonus",
    rationale:
      "Economic mass that the rest of the formula does not directly capture. Above $500B gets +3, $200B to $500B gets +2, $50B to $200B gets +1, $10B to $50B gets +0.5. Tiered rather than linear because US and Japanese metro-GDP estimates run unusually high and a linear bonus would skew the result.",
    source: "Wikipedia 'List of cities by GDP' (en.wikipedia.org/wiki/List_of_cities_by_GDP). Reference years vary 2019-2025 by metro; each figure is in billions USD.",
  },
  {
    id: "gawc-class",
    name: "GaWC class adjustment",
    weight: "12 × (1 / GaWC class)",
    shape: "inverse, capped",
    rationale:
      "The Globalization and World Cities Research Network's tier (1, 2, 3, 4, 5, 6) is a 25-year academic standard for ranking cities by global integration. Class 1 metros get +12, class 2 get +6, and so on. It is the only externally-sourced rank that feeds the composite, and it acts as a check on the dimension-level math.",
    source: "Globalization and World Cities Research Network 2024 World Cities Index (lboro.ac.uk/microsites/geography/gawc). Class 1 = Alpha++ down to Class 12 = Sufficiency. Approximately 280 metros classified.",
  },
];

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: SITE_NAME,
      item: BASE_URL,
    },
    {
      "@type": "ListItem",
      position: 2,
      name: PAGE_TITLE,
      item: PAGE_URL,
    },
  ],
};

const articleJsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  "@id": `${PAGE_URL}#article`,
  headline: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  url: PAGE_URL,
  isPartOf: { "@id": `${BASE_URL}/#website` },
  author: { "@id": `${AUTHOR.url}/#author` },
  publisher: { "@id": `${PUBLISHER.url}/#publisher` },
  datePublished: "2026-05-01",
  dateModified: "2026-05-07",
  breadcrumb: breadcrumbJsonLd,
};

export default function MethodologyPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(articleJsonLd) }}
      />
      <main className="min-h-screen pt-24 pb-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <nav className="text-xs mb-8" aria-label="Breadcrumb">
            <Link
              href="/"
              className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              &larr; Back to rankings
            </Link>
          </nav>

          <header className="mb-12 border-b border-[var(--border)] pb-10">
            <p
              className="text-xs tracking-widest text-[var(--text-muted)] mb-3"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              METHODOLOGY
            </p>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
              How the rankings are built.
            </h1>
            <p className="text-lg text-[var(--text-muted)] leading-relaxed">
              The Global Metro Power Rankings score is a composite of sixteen
              dimensions. This page sets out every input, every weight, every
              cap, and every editorial choice behind the result. If you
              disagree with a ranking, this is where you can find out why the
              formula produced it.
            </p>
          </header>

          <article className="prose-styles space-y-12">
            <section id="premise">
              <h2 className="text-2xl font-bold mb-4">The premise</h2>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                What counts as a global metro depends on what you are measuring.
                A finance-only ranking puts London, New York, Hong Kong, and
                Singapore at the top. A tourism-only ranking promotes Paris,
                Tokyo, Bangkok, and Istanbul. A sports-only ranking produces
                a different list again. None of these single-axis views
                describes the whole picture, which is the gap this project
                addresses.
              </p>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                I settled on sixteen dimensions because that is where each
                axis is meaningful without any single one being able to swing
                the result. A metro can reach the upper tiers through any
                combination of strengths. New York is rank 1 because it
                competes on every dimension. Boston sits in the top thirteen
                largely on the Harvard and MIT cluster. Houston earns top 25
                mostly on energy-sector market cap. All three routes count.
              </p>
              <p className="text-[var(--text)] leading-relaxed">
                The rankings are not a popularity contest and not a
                forecast. They are an inventory of what each metro currently
                has, expressed on a continuous scale.
              </p>
            </section>

            <section id="dimensions">
              <h2 className="text-2xl font-bold mb-4">The sixteen dimensions</h2>
              <p className="text-[var(--text)] leading-relaxed mb-6">
                Every dimension below has a weight, a shape, and a source.
                Linear means the contribution scales directly with the input.
                Capped means the contribution stops growing past a ceiling, so
                an outsized input cannot dominate. Log-scaled means the
                contribution grows fast at low values and slows at high
                values, which fits counts where the hundredth station is worth
                much less than the tenth.
              </p>
              <p className="text-[var(--text)] leading-relaxed mb-6">
                The Source line on each dimension names the upstream third-
                party dataset, ranking, or organisation behind it. Where a
                recognised ranking is the truth (CWUR, GaWC, CTBUH, ACI, WFE,
                BIS, Lloyd's List, UFI, Newsweek, ICOLD, the Michelin Guide,
                Forbes Travel Guide), it is named so any number on the page
                can be traced back to its origin.
              </p>
              <div className="space-y-6">
                {DIMENSIONS.map((d) => (
                  <div
                    key={d.id}
                    id={d.id}
                    className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-5"
                  >
                    <h3 className="text-lg font-semibold text-[var(--accent)] mb-2">
                      {d.name}
                    </h3>
                    <p
                      className="text-xs text-[var(--text-muted)] mb-3"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      Weight: {d.weight} &middot; {d.shape}
                    </p>
                    <p className="text-[var(--text)] leading-relaxed mb-3">
                      {d.rationale}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Source: {d.source}
                    </p>
                  </div>
                ))}
              </div>
            </section>

<section id="tiers">
              <h2 className="text-2xl font-bold mb-4">Score tiers</h2>
              <p className="text-[var(--text)] leading-relaxed mb-6">
                Raw scores are continuous, but readers need categorical
                labels to talk about. The seven tiers below carve the
                distribution into bands that align with the way urban
                economists already group metros. The boundaries echo the GaWC
                alpha, beta, and gamma convention without requiring readers
                to know the academic shorthand.
              </p>
              <div className="space-y-3">
                {TIERS.map((t) => (
                  <div
                    key={t.slug}
                    id={`tier-${t.slug}`}
                    className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4 flex flex-col sm:flex-row sm:items-baseline gap-3"
                  >
                    <span
                      className="font-semibold text-base whitespace-nowrap"
                      style={{ color: t.accentHex }}
                    >
                      {t.name}
                    </span>
                    <span
                      className="text-xs text-[var(--text-muted)] whitespace-nowrap"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      score &ge; {t.lowerBound}
                    </span>
                    <span className="text-sm text-[var(--text)] flex-1">
                      {t.tagline}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section id="adjustments">
              <h2 className="text-2xl font-bold mb-4">Adjustments and design choices</h2>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                Three families of adjustment apply across the formula. Each
                is worth surfacing so the choices are visible rather than
                hidden inside the spreadsheet.
              </p>
              <h3 className="text-lg font-semibold mt-6 mb-2">Caps on counted dimensions</h3>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                Major league teams are capped at ten and major sporting
                events at four. The caps stop a single dimension from running
                away with the score in the rare metros where one input is
                multiplied. New York with thirty-plus teams could otherwise
                clear everyone on team count alone. The cap forces its score
                to come from breadth across dimensions.
              </p>
              <h3 className="text-lg font-semibold mt-6 mb-2">Log scaling on count metrics</h3>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                Metro stations, commuter rail stations, intercity hubs,
                skyscrapers, and luxury stars are all log-scaled. The claim
                is simple: the two-hundredth station or fortieth Michelin
                star is worth much less than the tenth. Linear scaling would
                over-reward Tokyo and Hong Kong, two metros where count
                metrics are unusually high.
              </p>
              <h3 className="text-lg font-semibold mt-6 mb-2">Tier bonuses for GDP and GaWC class</h3>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                GDP is tiered (+3 / +2 / +1 / +0.5 / 0) rather than linear
                so that the rest of the formula does most of the work and
                GDP acts as a sanity check. The GaWC adjustment uses the
                2024 GaWC tier as an external benchmark: class 1 metros get
                +12, class 2 get +6, and so on. GaWC is the only outside
                ranking that feeds the composite, and it is there to test
                the dimension math against an independent yardstick.
              </p>
            </section>

            <section id="editorial">
              <h2 className="text-2xl font-bold mb-4">Declared editorial decisions</h2>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                The formula is deterministic. The input data is not. Below
                are the editorial choices behind the corpus, each one
                documented so you can decide whether you agree.
              </p>
              <h3 className="text-lg font-semibold mt-6 mb-2">Metro corridor consolidation</h3>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                Several entries in the rankings are multi-metro corridors
                rather than single-municipality metros: Washington-Baltimore,
                Rhine-Ruhr (Cologne, D&uuml;sseldorf, Essen), Saxon Triangle
                (Leipzig, Dresden, Chemnitz), San Francisco-San Jose (the
                Bay Area), Osaka-Kyoto-Kobe, Padua-Venice, Boston-Cambridge,
                Hannover-Brunswick. Each was consolidated because the labor
                market and infrastructure are genuinely shared. Treating
                them as separate metros would misrepresent reality.
              </p>
              <h3 className="text-lg font-semibold mt-6 mb-2">Continent assignment overrides</h3>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                A handful of countries are assigned to a continent that
                differs from strict geography so the regional aggregates
                make economic and political sense. Australia and New Zealand
                are grouped with Asia. Turkey, Israel, Russia, Ukraine,
                Belarus, Kazakhstan, Georgia, Armenia, and Azerbaijan are
                all grouped with Europe. For the purposes of regional
                rankings, economic gravity and political alignment carry
                more signal than tectonic geography.
              </p>
              <h3 className="text-lg font-semibold mt-6 mb-2">Naming conventions and disambiguation</h3>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                Where multiple metros share a name, the rankings use a
                disambiguating suffix or an ASCII variant: Cordova
                (Argentina) versus C&oacute;rdoba (Spain), Toledo (Spain)
                versus Toledo (Ohio), Naples (Italy) versus Naples
                (Florida). Sao Paulo appears without the diacritic for
                keying consistency. These are deliberate.
              </p>
              <h3 className="text-lg font-semibold mt-6 mb-2">Bloated municipality counts in some Spanish metros</h3>
              <p className="text-[var(--text)] leading-relaxed">
                Some Spanish metros aggregate a large number of small
                municipalities (Burgos at 371, Salamanca at 362, Zaragoza at
                293). The structure follows the Spanish national statistics
                agency (INE) definitions. I reviewed each one and left them
                intact rather than impose a US-style core-cluster approach.
              </p>
            </section>

            <section id="limitations">
              <h2 className="text-2xl font-bold mb-4">Known limitations</h2>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                Three places where the rankings are weakest, in order of
                how much it bothers me.
              </p>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                <strong className="font-semibold">Developing-world coverage is uneven.</strong>{" "}
                Sub-Saharan Africa, parts of Central Asia, and rural China
                and India have municipality and county data far sparser than
                the OECD comparison set. Some metros in these regions are
                likely under-counted on dimensions that need granular
                sub-metro data. I am working to close the gap, but the
                source data does not yet exist at parity.
              </p>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                <strong className="font-semibold">Cultural events skew toward Western recognition.</strong>{" "}
                The Cultural Events corpus reflects the events I know
                about, which biases toward NATO summits, world expos, papal
                visits, and English-language coverage. A South American or
                African counterpart of equal scale may be missing simply
                because I have not sourced it yet.
              </p>
              <p className="text-[var(--text)] leading-relaxed">
                <strong className="font-semibold">The formula is opinionated.</strong>{" "}
                The weights are mine. A reader who thinks luxury hospitality
                should not be a dimension at all, or that GDP should weigh
                three times more, will produce a different ranking. This
                page exists so the disagreement can land on a specific
                choice rather than on the project as a whole.
              </p>
            </section>

            <section id="peers">
              <h2 className="text-2xl font-bold mb-4">How this index relates to other major metro rankings</h2>
              <p className="text-[var(--text)] leading-relaxed mb-6">
                Several established indices score the world&apos;s metropolitan areas.
                Each one answers a slightly different question. The summary
                below sets out what each measures, where it is genuinely
                stronger than this project, and where this project diverges.
                The Globalization and World Cities Research Network (GaWC)
                is treated separately because it is already an input to this
                composite rather than a peer ranking.
              </p>

              <h3 className="text-lg font-semibold mt-6 mb-2">Oxford Economics Global Cities Index (OEGCI)</h3>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                Covers the 1,000 largest urban economies across 27 indicators
                grouped into five categories (Economics, Human Capital,
                Quality of Life, Environment, Governance) weighted
                30/25/25/10/10. Built on OECD Functional Urban Area
                definitions and Oxford Economics&apos; Global Cities
                Forecasting Service, which means the indicators sit on top
                of an active forecasting model rather than a static
                snapshot. The 2025 edition adds an eight-archetype
                classification (Global Leaders, Regional Leaders, Cultural
                Capitals, Sustainable Cities, Industrial Hubs, Legacy
                Cities, Developing Megacities, Emerging Standouts).
              </p>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                <strong className="font-semibold">Where OEGCI is stronger:</strong>{" "}
                forward-looking five-year projections, OECD-grade
                geographic units, indicator depth on income inequality,
                housing burden, life expectancy, and air quality.
              </p>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                <strong className="font-semibold">Where this index differs:</strong>{" "}
                broader coverage (the full global metro corpus versus the top thousand), free
                public access, transparent and opinionated weights rather
                than a fixed 30/25/25/10/10 split, plus state-level and
                country-level rollups OEGCI does not publish. OEGCI&apos;s
                Governance category is measured at the national level, so
                every metro in a given country shares the same governance
                score, which this index avoids.
              </p>

              <h3 className="text-lg font-semibold mt-6 mb-2">GaWC World Cities Index</h3>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                The Globalization and World Cities Research Network at
                Loughborough University publishes the longest-running
                academic classification of metros, based on the office
                networks of advanced producer service firms (law,
                accounting, finance, advertising, management consulting).
                Its alpha, beta, gamma, sufficiency tiers are the standard
                shorthand in urban geography. GaWC is already an input to
                this composite (see the GaWC class adjustment above), not
                a competing ranking. Its strength is the rigor of its
                methodology on a single dimension; its limit is that it
                only describes a metro&apos;s integration into the global
                service economy, which is one slice of what makes a metro
                significant.
              </p>

              <h3 className="text-lg font-semibold mt-6 mb-2">Mori Memorial Foundation Global Power City Index (GPCI)</h3>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                A Tokyo-based ranking of 48 leading metros across six
                functions (Economy, Research and Development, Cultural
                Interaction, Liveability, Environment, Accessibility) using
                roughly 70 indicators. London, New York, Tokyo, Paris, and
                Singapore typically lead. GPCI is the most balanced of the
                global rankings on quality and competitiveness, with
                particular strength in cultural interaction and
                accessibility metrics that other indices undercount.
              </p>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                <strong className="font-semibold">Where this index differs:</strong>{" "}
                GPCI&apos;s 48-metro ceiling is by design, since each
                indicator is hand-curated. This project trades that depth
                for two orders of magnitude more breadth, with thinner
                per-metro data on the long tail.
              </p>

              <h3 className="text-lg font-semibold mt-6 mb-2">Economist Intelligence Unit Global Liveability Index</h3>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                Annual ranking of 173 metros across five categories
                (Stability, Healthcare, Culture and Environment, Education,
                Infrastructure) on roughly 30 qualitative and quantitative
                indicators. Vienna, Copenhagen, Zurich, and Melbourne
                typically lead. Built for international assignment
                planning, with stability metrics that capture conflict
                exposure, terrorism risk, and civil unrest.
              </p>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                <strong className="font-semibold">Where this index differs:</strong>{" "}
                EIU optimises for &quot;where is it pleasant and safe to be
                posted as an expat,&quot; which systematically underweights
                economic mass, cultural reach, and infrastructure scale.
                Vienna scores higher than New York for liveability;
                Citizen of Nowhere does not.
              </p>

              <h3 className="text-lg font-semibold mt-6 mb-2">Mercer Quality of Living Survey</h3>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                Annual ranking of 230-plus metros across 39 factors covering
                political and social environment, economic environment,
                socio-cultural environment, medical and health
                considerations, schools and education, public services and
                transport, recreation, consumer goods, housing, and natural
                environment. Used by multinational HR teams to set expat
                hardship and cost-of-living allowances. Vienna has led for
                more than a decade.
              </p>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                <strong className="font-semibold">Where this index differs:</strong>{" "}
                Mercer&apos;s lens is functionally the same as EIU&apos;s
                (expat suitability), with more granular sub-categories
                covering the practical mechanics of relocation. It is not
                designed to capture global influence, financial weight, or
                cultural reach.
              </p>

              <h3 className="text-lg font-semibold mt-6 mb-2">Z/Yen Global Financial Centres Index (GFCI)</h3>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                Biannual ranking (March and September) of more than 120
                financial centres on five areas (Business Environment,
                Human Capital, Infrastructure, Financial Sector Development,
                Reputational and General Factors). Built from instrumental
                factors plus a rolling survey of finance professionals.
                New York, London, Hong Kong, Singapore, and San Francisco
                typically occupy the top spots.
              </p>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                <strong className="font-semibold">Where this index differs:</strong>{" "}
                GFCI is single-purpose by design, scoring only how
                competitive a metro is as a finance hub. It is the
                authoritative source on that question and an excellent
                cross-check for the Market Capitalization and
                Infrastructure dimensions above, but it does not attempt
                the broader composite this project does.
              </p>

              <h3 className="text-lg font-semibold mt-6 mb-2">In summary</h3>
              <p className="text-[var(--text)] leading-relaxed">
                Each of these indices is the right tool for a specific
                question. Use OEGCI for forward-looking economic
                forecasting, GaWC for service-economy integration, GPCI
                for balanced metro competitiveness in the top 48, EIU and
                Mercer for relocation suitability, GFCI for finance-hub
                competitiveness. This project answers a different
                question: across every dimension that signals a globally
                relevant metro, where does each one stand right now, on
                the same continuous scale, with the formula visible.
              </p>
            </section>

            <section id="velvet-rock">
              <h2 className="text-2xl font-bold mb-4">The Velvet Rock Index</h2>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                A curated index, not a composite-derived lens. The{" "}
                <Link href="/badges/velvet-rock-capital" className="text-[var(--accent)] hover:underline">
                  Velvet Rock Capital
                </Link>{" "}
                badge identifies the eight metros that anchored the
                producer-driven recording economy of 1974 to 1989: three
                primary capitals (Los Angeles, New York, London), three
                satellites (Bath and Somerset, Philadelphia, Stockholm), and
                two offshore island branches (Nassau via Compass Point
                Studios, and Montserrat via AIR Studios at Salem). The
                window opens at 1974 with the maturation of the post-
                Wrecking-Crew session economy and closes on September 17,
                1989, when Hurricane Hugo destroyed AIR Studios Montserrat.
              </p>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                The score for each metro is a 0 to 100 composite across
                four dimensions, each weighted equally at 0 to 25. Studio
                infrastructure counts flagship rooms operating in the
                window, weighted by share of canonical tracking and mixing
                work. Anchor records counts canonical long-players
                substantially produced in the metro, crediting both tracking
                and final mix where the metro did one but not the other.
                Producer and session-musician concentration measures the
                resident or semi-resident production talent based in the
                metro across the window. Capital disproportion measures how
                exposed the metro&apos;s claim is to this single industry under
                non-recurring conditions; the two island branches score the
                full 25 here because their global cultural footprint during
                the period rested on one building each.
              </p>
              <p className="text-[var(--text)] leading-relaxed">
                Unlike the composite ranking, the Velvet Rock Index is an
                editorial frame, not a data-derived lens. It is intended as
                a portable model for similar indices on offshore financial
                centers, free-port logistics hubs, and other industries where
                a small number of metros carried disproportionate weight
                under specific and non-recurring capital conditions. The
                accompanying essay,{" "}
                <em>Velvet Rock: The Map Yacht Rock Erased</em>,
                is published on the Citizen of Nowhere Substack.
              </p>
            </section>

            <section id="vintage">
              <h2 className="text-2xl font-bold mb-4">Data vintage and refresh cadence</h2>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                Most dimensions refresh when their source dataset is
                updated, and that timestamp drives the &quot;Updated&quot; chip in
                the site navigation and the lastUpdate field in the dataset
                metadata. Market cap data refreshes on its own cadence, and
                its age is shown on every metro page&apos;s Top Companies
                block as &quot;Source data as of YYYY-MM-DD.&quot;
              </p>
              <p className="text-[var(--text)] leading-relaxed">
                The composite is licensed CC-BY for reuse. If you cite
                the rankings, use &quot;Global Metro Power Rankings, Citizen of
                Nowhere, [date]&quot; with a link to the relevant metro page or
                to this methodology page. Third-party source data keeps its
                original license; the CC-BY scope covers the composite score
                and its derived rankings only.
              </p>
            </section>

            <section id="version">
              <h2 className="text-2xl font-bold mb-4">This methodology version</h2>
              <p className="text-[var(--text)] leading-relaxed">
                This page documents the methodology as of the last
                refresh. Material changes to the formula are logged on the{" "}
                <Link
                  href="/updates"
                  className="text-[var(--accent)] hover:underline"
                >
                  release notes
                </Link>
                {" "}page, and prior versions of the methodology are kept
                when material changes occur. Minor weight calibration is not
                a material change. Adding or removing a dimension is.
              </p>
            </section>
          </article>

          <footer className="mt-16 pt-8 border-t border-[var(--border)] text-sm text-[var(--text-muted)]">
            <p>
              Have a methodology objection or think a dimension is
              missing? Leave a comment on any post at{" "}
              <a
                href="https://citizenofnowhere.substack.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent)] hover:underline"
              >
                Citizen of Nowhere
              </a>
              .
            </p>
          </footer>
        </div>
      </main>
    </>
  );
}
