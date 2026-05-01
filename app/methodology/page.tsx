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
  "How the Global Metro Power Rankings composite is built. Sixteen dimensions, the full formula, the editorial choices behind it, and what it can and cannot tell you.";

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
// linear, capped, log-scaled, or tier-bonused. Source column points at the
// underlying spreadsheet sheet so the reader can audit any single line.
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
      "Sets a baseline floor: a metro with thirty million people deserves credit for that scale alone, even before you measure what it does. The 3M divisor keeps the contribution moderate so a megacity does not drown out everything else.",
    source: "Municipality and Counties sheets, aggregated by metro",
  },
  {
    id: "major-league-teams",
    name: "Major league teams",
    weight: "raw count, capped at 10",
    shape: "capped",
    rationale:
      "Top-tier sporting franchises are a strong signal of civic identity, broadcast economy, and cultural reach. The cap prevents a city with eight major-league teams plus seven honorary entries from running away with the score.",
    source: "Team List sheet, Major League column",
  },
  {
    id: "other-teams",
    name: "Other professional teams",
    weight: "(total teams − major league) × 0.25, capped at 10",
    shape: "capped, low weight",
    rationale:
      "Second-tier and minor-league teams matter, but materially less than the marquee franchises. The 0.25 multiplier and the 40-row pre-cap reflect that.",
    source: "Team List sheet, all rows minus major-league",
  },
  {
    id: "market-cap",
    name: "Market capitalization",
    weight: "USD / 700,000,000,000",
    shape: "linear",
    rationale:
      "The total enterprise value of public and large-private companies headquartered in the metro. The $700B divisor calibrates so that a metro hosting a single trillion-dollar company adds ~1.4 to its score, not 14.",
    source: "MktCap_Data sheet, refreshed from companiesmarketcap.com",
  },
  {
    id: "companies-count",
    name: "Number of major companies",
    weight: "implicit, via market cap accumulation",
    shape: "linear",
    rationale:
      "The corpus counts every company above the inclusion threshold. The score does not weight count separately because count and total market cap are highly correlated and double-counting would bias toward US tech-heavy metros.",
    source: "MktCap_Data sheet",
  },
  {
    id: "cultural-events",
    name: "Major cultural events",
    weight: "× 0.65 (combined with museums and infrastructure)",
    shape: "linear",
    rationale:
      "World expos, NATO summits, G7/G20 hostings, World's Fairs, royal weddings, papal events. These are one-off cultural moments that make a city the center of global attention for a period of days.",
    source: "Culture-Infra sheet, type = 'Cultural Event'",
  },
  {
    id: "museums-landmarks",
    name: "Museums and landmarks",
    weight: "× 0.65 (combined with cultural events and infrastructure)",
    shape: "linear",
    rationale:
      "Museums, opera houses, concert halls, parks, religious sites, theme parks, world heritage. These are the durable cultural infrastructure that brings tourists and signals civic priority.",
    source: "Culture-Infra sheet, type = 'Museum/Landmark'",
  },
  {
    id: "infrastructure",
    name: "Ports, exchanges, and other infrastructure",
    weight: "× 0.65 (combined with cultural events and museums)",
    shape: "linear",
    rationale:
      "Container ports, stock exchanges, internet exchanges, military bases, central banks, data center hubs, agricultural extraction hubs, trade venues. The connective tissue of a globally significant city.",
    source: "Culture-Infra sheet, types Port through Trade Venue",
  },
  {
    id: "airport-score",
    name: "Airport score",
    weight: "× 0.25",
    shape: "linear, low weight",
    rationale:
      "Tier-1 mega-hubs (JFK, Heathrow, Hong Kong) score higher than tier-2 international gateways than tier-3 regional airports. International connectivity matters but is already partially captured by other dimensions.",
    source: "Culture-Infra sheet, type = 'Airport'",
  },
  {
    id: "universities-top50",
    name: "Top-50 universities",
    weight: "× 3.5 per qualifying institution",
    shape: "linear, high weight",
    rationale:
      "A top-50 global university is a generational asset. Boston punches above its size primarily because of the Harvard-MIT cluster, and the formula reflects that.",
    source: "Universities sheet, CWUR rank ≤ 50",
  },
  {
    id: "universities-top500",
    name: "Other top-500 universities, hospitals, research",
    weight: "× 2.2 per institution (top-500 minus top-50)",
    shape: "linear",
    rationale:
      "Universities ranked 51 to 500, top-250 hospitals, and major research institutions. Hospitals and research institutes are weighted at 0.5 of a university because they cluster less into a single peak measure.",
    source: "Universities sheet plus Culture-Infra Hospital and Research rows",
  },
  {
    id: "metro-stations",
    name: "Metro and subway stations",
    weight: "log(stations)",
    shape: "log-scaled",
    rationale:
      "Log-scaled because the marginal value of station 200 is much less than station 20. Tokyo at 1,000+ stations shouldn't overwhelm London at 270.",
    source: "Culture-Infra sheet, type = 'Metro System'",
  },
  {
    id: "suburb-stations",
    name: "Commuter rail stations",
    weight: "log(stations) × 0.5",
    shape: "log-scaled, low weight",
    rationale:
      "Suburban rail extends a metro's effective catchment. The 0.5 multiplier is half the metro-stations weight because suburban rail is functionally less central to daily urban life.",
    source: "Culture-Infra sheet, type = 'Suburban Rail'",
  },
  {
    id: "train-hubs",
    name: "Intercity train hubs",
    weight: "log(hubs) × 2",
    shape: "log-scaled, high weight",
    rationale:
      "Major intercity rail hubs (London King's Cross, Tokyo Station, Gare du Nord) are signal-rich because they require dense national rail and a city worth converging on.",
    source: "Culture-Infra sheet, type = 'Train Station'",
  },
  {
    id: "skyscrapers",
    name: "Skyscrapers and towers",
    weight: "log(150m+ count) × 5.7",
    shape: "log-scaled, high weight",
    rationale:
      "150m+ tall buildings are a near-universal indicator of capital concentration and land-value pressure. The high multiplier reflects that this metric is hard to fake — building skyscrapers requires sustained economic and political consensus.",
    source: "Skyscrapers sheet, CTBUH/Skyscraper Center data",
  },
  {
    id: "luxury-stars",
    name: "Luxury hospitality (Michelin and Forbes Travel Guide)",
    weight: "log(stars) × 3",
    shape: "log-scaled",
    rationale:
      "Michelin 2- and 3-star restaurants plus Forbes Travel Guide 4- and 5-star hotels. A measure of high-end consumption density that correlates with discretionary income, tourism, and cultural prestige.",
    source: "Luxury Hospitality sheet plus Culture-Infra Michelin entries",
  },
  {
    id: "major-sporting-events",
    name: "Major sporting events",
    weight: "× 0.2, capped at 4",
    shape: "capped, low weight",
    rationale:
      "Olympic and Multi-Sport hosting plus championship finals. Capped at 4 because a city that hosted three Olympics in the last century shouldn't outrank a finance capital on this dimension alone.",
    source: "Culture-Infra Sporting Event rows",
  },
  {
    id: "annual-events",
    name: "Annual recurring events",
    weight: "raw count",
    shape: "linear",
    rationale:
      "F1 Grands Prix, marathons, tennis Grand Slams, the Cannes Film Festival. Each annual draw is one point, no cap — because a city that hosts five different annual marquee events deserves the cumulative credit.",
    source: "Culture-Infra rows flagged Annual Event = Y",
  },
  {
    id: "gdp",
    name: "GDP tier bonus",
    weight: "+3 / +2 / +1 / +0.5 / 0",
    shape: "tiered bonus",
    rationale:
      "Economic mass that the rest of the formula does not directly capture. Above $500B GDP gets +3, $200-500B gets +2, $50-200B gets +1, $10-50B gets +0.5. Tiered rather than linear so we do not over-reward US and Japanese metros that have unusually generous metro-GDP estimates.",
    source: "Estimated GDP from Sheet2",
  },
  {
    id: "gawc-class",
    name: "GaWC class adjustment",
    weight: "12 × (1 / GaWC class)",
    shape: "inverse, capped",
    rationale:
      "The Globalization and World Cities Research Network's tier (1, 2, 3, 4, 5, 6) is a 25-year academic standard for ranking cities by global integration. Class 1 metros get +12, class 2 get +6, and so on. This is the only externally-sourced rank that feeds the composite, and it serves as a check against the dimension-level math.",
    source: "GaWC 2024 World Cities Index, manually entered",
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
  dateModified: "2026-05-01",
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
              dimensions. This page explains every input, every weight, every
              cap, and every editorial choice that shapes the result. If you
              disagree with a ranking, this page is where you can find out
              exactly why the formula produced it.
            </p>
          </header>

          <article className="prose-styles space-y-12">
            <section id="premise">
              <h2 className="text-2xl font-bold mb-4">The premise</h2>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                What counts as a global metro depends on what you are measuring.
                A finance-only ranking puts London, New York, Hong Kong, and
                Singapore at the top. A tourism-only ranking promotes Paris,
                Tokyo, Bangkok, and Istanbul. A sports-only ranking surfaces a
                very different set again. None of these single-axis rankings
                describes the whole picture, and that is the gap this project
                exists to fill.
              </p>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                I picked sixteen dimensions because that is the number where
                each axis is materially load-bearing without any one of them
                being able to swing the result. The composite is built so that
                a metro can earn its way into the upper tiers through any
                combination of strengths. New York is rank 1 because it
                competes on every dimension; Boston is in the top thirteen
                largely because of the Harvard-MIT cluster; Houston earns top
                25 mostly through energy-sector market cap. The formula
                respects all three paths.
              </p>
              <p className="text-[var(--text)] leading-relaxed">
                The rankings are not a popularity contest, and they are not
                a forecast. They are a current-state inventory of what each
                metro actually has, expressed on a continuous scale.
              </p>
            </section>

            <section id="dimensions">
              <h2 className="text-2xl font-bold mb-4">The sixteen dimensions</h2>
              <p className="text-[var(--text)] leading-relaxed mb-6">
                Every dimension below has a weight and a shape. Linear means
                the contribution scales directly with the input. Capped means
                the contribution stops growing past a ceiling so a single
                outsized input cannot dominate. Log-scaled means the
                contribution grows fast at low values and slows at high values,
                which is appropriate for counts where the marginal value of the
                hundredth station is much smaller than the marginal value of
                the tenth.
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

            <section id="formula">
              <h2 className="text-2xl font-bold mb-4">The full composite formula</h2>
              <p className="text-[var(--text)] leading-relaxed mb-4">
                Every metro&apos;s score is the sum of every dimension above. In
                literal terms, the formula reads:
              </p>
              <pre
                className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4 overflow-x-auto text-xs leading-relaxed"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
{`score = pop/3M
      + marketCap/700B
      + min(majorTeams, 10)
      + min((totalTeams − majorTeams) × 0.25, 10)
      + (culturalEvents + museums + infrastructure) × 0.65
      + airportScore × 0.25
      + top50Universities × 3.5
      + (top500Universities − top50Universities) × 2.2
      + log(metroStations)
      + log(suburbStations) × 0.5
      + log(trainHubs) × 2
      + log(skyscrapers) × 5.7
      + log(luxuryStars) × 3
      + min(majorSportingEvents × 0.2, 4)
      + count(annualEvents)
      + gdpTierBonus(gdp)        // +3 / +2 / +1 / +0.5 / 0
      + 12 × (1 / gawcClass)`}
              </pre>
              <p className="text-[var(--text)] leading-relaxed mt-4">
                The formula lives in cell BG of the Metro Areas sheet in the
                source spreadsheet and is the single source of truth. The
                website never recalculates the score; it reads the precomputed
                value from the spreadsheet and displays it. That keeps the
                composite auditable from a single cell rather than scattered
                across application code.
              </p>
            </section>

            <section id="tiers">
              <h2 className="text-2xl font-bold mb-4">Score tiers</h2>
              <p className="text-[var(--text)] leading-relaxed mb-6">
                Raw scores are continuous, but readers need categorical labels
                to talk about. The seven tiers below carve the distribution
                into bands that match the way urban economists already group
                cities. The boundaries echo the GaWC alpha/beta/gamma
                convention without requiring readers to learn the academic
                shorthand.
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
                Three families of adjustment apply across the formula and are
                worth calling out so the choices are transparent rather than
                buried in code.
              </p>
              <h3 className="text-lg font-semibold mt-6 mb-2">Caps on counted dimensions</h3>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                Major league teams are capped at ten and major sporting events
                at four. These caps prevent a single dimension from running
                away with the score in the rare metros where one input is
                multiplied. New York with thirty-plus teams could outscore
                everyone on team count alone without the cap; the cap forces
                its score to come from breadth across dimensions.
              </p>
              <h3 className="text-lg font-semibold mt-6 mb-2">Log scaling on count metrics</h3>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                Metro stations, suburban rail stations, intercity hubs,
                skyscrapers, and luxury stars are all log-scaled. The
                substantive claim is that the marginal value of the
                two-hundredth station or the fortieth Michelin star is much
                less than the value of the tenth. Linear scaling would over-
                reward Tokyo and Hong Kong specifically, two metros where
                count metrics are unusually high.
              </p>
              <h3 className="text-lg font-semibold mt-6 mb-2">Tier bonuses for GDP and GaWC class</h3>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                GDP is tiered (+3 / +2 / +1 / +0.5 / 0) rather than linear so
                that the rest of the formula does most of the work and GDP
                acts as a sanity check. The GaWC class adjustment uses the
                academic 2024 GaWC tier as an external benchmark; class 1
                metros get +12, class 2 get +6, etc. The GaWC bonus is the
                only externally-sourced rank that feeds the composite, and
                its purpose is to keep the formula honest against an
                independent yardstick.
              </p>
            </section>

            <section id="editorial">
              <h2 className="text-2xl font-bold mb-4">Declared editorial decisions</h2>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                The formula is deterministic, but the input data is not. Below
                are the editorial choices I made when building the corpus,
                each one documented so a reader can decide whether they agree.
              </p>
              <h3 className="text-lg font-semibold mt-6 mb-2">Metro corridor consolidation</h3>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                Several entries in the rankings represent multi-city corridors
                rather than single-municipality metros. Examples: Washington-
                Baltimore, Rhine-Ruhr (Cologne / D&uuml;sseldorf / Essen),
                Saxon Triangle (Leipzig / Dresden / Chemnitz), San Francisco-
                San Jose (the Bay Area), Osaka-Kyoto-Kobe, Padua-Venice,
                Boston-Cambridge, Hannover-Brunswick. Each was consolidated
                because the underlying labor market and infrastructure is
                genuinely shared, and treating them as separate metros would
                misrepresent reality.
              </p>
              <h3 className="text-lg font-semibold mt-6 mb-2">Continent assignment overrides</h3>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                A handful of countries are assigned to a continent that
                differs from strict geographic convention so the regional
                aggregates make economic and political sense. Australia and
                New Zealand are grouped with Asia. Turkey, Israel, Russia,
                Ukraine, Belarus, Kazakhstan, Georgia, Armenia, and Azerbaijan
                are all grouped with Europe. The reasoning is that economic
                gravity and political alignment are stronger signals than
                tectonic geography for the purposes of regional rankings.
              </p>
              <h3 className="text-lg font-semibold mt-6 mb-2">Naming conventions and disambiguation</h3>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                Where multiple metros share a name, the rankings use a
                disambiguating suffix or an ASCII variant: Cordova
                (Argentina) versus C&oacute;rdoba (Spain), Toledo (Spain)
                versus Toledo (Ohio), Naples (Italy) versus Naples (Florida).
                Sao Paulo is rendered without the diacritic because the
                spreadsheet is the source of truth and that is how the row
                is keyed. These are stable choices, not bugs.
              </p>
              <h3 className="text-lg font-semibold mt-6 mb-2">Bloated municipality counts in some Spanish metros</h3>
              <p className="text-[var(--text)] leading-relaxed">
                Some Spanish metros aggregate a large number of small
                municipalities (Burgos with 371, Salamanca with 362, Zaragoza
                with 293). The Municipality sheet is the source. I reviewed
                each one and chose to leave the structure as the Spanish
                national statistics agency defines it, rather than imposing a
                US-style core-cluster approach.
              </p>
            </section>

            <section id="limitations">
              <h2 className="text-2xl font-bold mb-4">Known limitations</h2>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                Three places where the rankings are weakest, in descending
                order of how much it bothers me.
              </p>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                <strong className="font-semibold">Developing-world coverage is uneven.</strong>{" "}
                Sub-Saharan Africa, parts of Central Asia, and rural China and
                India have municipality and county data that is much sparser
                than the OECD comparison set. The result is that some metros in
                these regions are likely under-counted on dimensions that
                require granular sub-metro data. I am working to close this
                gap but the source data simply does not exist at parity.
              </p>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                <strong className="font-semibold">Cultural events skew toward Western recognition.</strong>{" "}
                The Cultural Events corpus reflects the events I know about,
                which is biased toward NATO summits, world expos, papal
                events, and English-language coverage. A South American or
                African counterpart event of equal scale may be missing simply
                because I have not yet sourced it.
              </p>
              <p className="text-[var(--text)] leading-relaxed">
                <strong className="font-semibold">The formula is opinionated.</strong>{" "}
                The weights are mine. A reader who thinks luxury hospitality
                should not be a dimension at all, or that GDP should be
                weighted three times higher, will produce a different
                ranking. The transparency on this page is offered so you can
                disagree with specific choices rather than the project as a
                whole.
              </p>
            </section>

            <section id="vintage">
              <h2 className="text-2xl font-bold mb-4">Data vintage and refresh cadence</h2>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                Most dimensions are refreshed when the source spreadsheet is
                edited; that timestamp drives the &quot;Updated&quot; chip in the site
                navigation and the lastUpdate field in the dataset metadata.
                Market cap data is sourced from companiesmarketcap.com and
                refreshed independently; its age is exposed on every metro
                page&apos;s Top Companies block as &quot;Source data as of
                YYYY-MM-DD.&quot;
              </p>
              <p className="text-[var(--text)] leading-relaxed">
                The composite is licensed CC-BY for reuse. If you cite the
                rankings, the canonical attribution is &quot;Global Metro Power
                Rankings, Citizen of Nowhere, [date],&quot; and a link to the
                relevant metro page or to this methodology page. Third-party
                source data retains its original license; the CC-BY scope
                covers the composite score and its derived rankings only.
              </p>
            </section>

            <section id="version">
              <h2 className="text-2xl font-bold mb-4">This methodology version</h2>
              <p className="text-[var(--text)] leading-relaxed">
                This page documents the methodology as of the date of last
                refresh. Material changes to the formula will be recorded on
                the{" "}
                <Link
                  href="/updates"
                  className="text-[var(--accent)] hover:underline"
                >
                  release notes
                </Link>
                {" "}page, and historical versions of the methodology will be
                preserved when material changes occur. Minor calibration of
                weights does not constitute a material change; introduction or
                removal of a dimension does.
              </p>
            </section>
          </article>

          <footer className="mt-16 pt-8 border-t border-[var(--border)] text-sm text-[var(--text-muted)]">
            <p>
              Have a methodology objection or a missing dimension you think
              should be included? Leave a comment on any post at{" "}
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
