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
import { DIMENSIONS } from "@/lib/methodology";

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
    card: "summary_large_image",
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
  },
};

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
      <main className="min-h-screen pt-8 pb-24 px-4 sm:px-6 lg:px-8">
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

            <section id="zone-zero-cup">
              <h2 className="text-2xl font-bold mb-4">The Zone Zero Cup</h2>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                The{" "}
                <Link href="/sports/zone-zero-cup" className="text-[var(--accent)] hover:underline">
                  Zone Zero Cup
                </Link>{" "}
                is a national sporting-merit ranking, modelled on the NACDA
                Directors&apos; Cup but built for nations rather than university
                athletic departments. It scores every country across fourteen sport
                pillars: the full Olympic programme (Summer and Winter) plus
                men&apos;s football, women&apos;s football, cricket, rugby union, basketball,
                ice hockey, handball, volleyball, baseball, and rugby league. It is
                deliberately a current-era index, not an all-time honour roll.
              </p>
              <h3 className="text-lg font-semibold mt-6 mb-2">One common scale</h3>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                Every medal, title and final is converted to points on a single
                scale anchored on the Olympic podium, where a gold is worth 4, a
                silver 2, and a bronze 1. A sport&apos;s flagship world title sits
                at the top of that scale. Continental and secondary titles score
                proportionally below it, and in football continental crowns are
                further weighted by the strength of their confederation, so a
                European Championship or Copa Am&eacute;rica counts well above a
                CONCACAF Gold Cup or an OFC title. A nation&apos;s score is the sum of
                its best ten sports, which rewards both breadth and depth while
                stopping any one sport from deciding the table.
              </p>
              <h3 className="text-lg font-semibold mt-6 mb-2">Recency decay</h3>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                Every result is weighted by recency on an exponential decay with
                an eight-year half-life, so a result from roughly fifteen years
                ago is worth about a quarter of a current one, and deep history
                fades quickly. This is what keeps the Cup a measure of how nations
                stand now: a dissolved state like East Germany, or a power coasting
                on mid-century glory, falls down the table as its results age.
              </p>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                Football is the one deliberate exception. Winning the World Cup is
                treated as near-permanent pedigree and decays far more slowly, because
                it is the sport where heritage is the defining measure: this is what
                keeps Brazil, with five World Cups, at the head of the football order
                despite none since 2002. Everything else in football, including
                continental titles and runner-up finishes, stays on the normal recency
                clock. Olympic football is excluded from the men&apos;s football pillar
                entirely, since the medal record cannot separate the men&apos;s and
                women&apos;s tournaments and the men&apos;s event is a minor under-23
                competition; women&apos;s football is scored in its own pillar.
              </p>
              <h3 className="text-lg font-semibold mt-6 mb-2">Five calibrations</h3>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                The flagship world titles of the globally contested team sports
                carry a seven-times weight, because a World Cup is a single
                winner-take-all event rather than one of dozens of Olympic golds.
                Winter Olympic results are weighted at half their summer
                equivalents, reflecting a smaller and less global field.
                High-volume Olympic sports face diminishing returns (each
                sport&apos;s raw total is raised to the power 0.6) so medal count
                alone cannot run away, which is why a swimming superpower no longer
                dwarfs a football nation. A prestige multiplier encodes each
                sport&apos;s global following and competitive depth, so football
                counts for three, cricket and basketball for two, and a sport
                contested seriously by only two to four nations, such as rugby
                league, is discounted well below one. And nations under blanket
                international suspension take a sharp inactivity decay for every
                cycle they miss.
              </p>
              <h3 className="text-lg font-semibold mt-6 mb-2">Current standing, not just titles</h3>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                Discrete titles do not capture a nation that is consistently
                excellent without quite winning, so a present-day strength signal
                from live world rankings (football Elo, the ICC cricket ratings,
                the FIBA and World Rugby rankings) feeds each sport. This is what
                corrects a side like Italy, propped up on old World Cups but
                currently mid-table on Elo and absent from recent tournaments.
              </p>
              <h3 className="text-lg font-semibold mt-6 mb-2">Three views</h3>
              <p className="text-[var(--text)] leading-relaxed mb-3">
                The table is published overall, per capita (merit per million
                people), and per GDP. The efficiency views are where small nations
                surface: New Zealand, Norway, Jamaica, Slovenia and Croatia punch
                far above their size. Defunct and composite entities (East Germany,
                the West Indies cricket side) are scored but excluded from the
                per-capita and per-GDP views, since they have no current
                denominator, and are marked accordingly. The United Kingdom is the
                ranked unit, carrying both its Olympic medals and the home
                nations&apos; team-sport titles.
              </p>
              <h3 className="text-lg font-semibold mt-6 mb-2">Sources and caveats</h3>
              <p className="text-[var(--text)] leading-relaxed">
                Results come from this project&apos;s own validated source-of-truth
                workbooks and ranking engines: the Olympic medal database, the
                international football and cricket records, World Rugby and the
                Rugby and FIBA World Cups, IIHF and the World Cup of Hockey, the
                handball and volleyball World Championships, the World Baseball
                Classic, and the Rugby League World Cup. Every parameter above is
                an editorial judgment, calibrated to make the table read true, and
                the Cup is a model rather than an official record.
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
