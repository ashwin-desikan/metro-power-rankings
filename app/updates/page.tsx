import type { Metadata } from "next";
import Link from "next/link";
import {
  AUTHOR,
  BASE_URL,
  PUBLISHER,
  SITE_NAME,
  serializeJsonLd,
} from "@/lib/seo";

export const dynamicParams = false;

const PAGE_PATH = "/updates";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "Release Notes";
const PAGE_DESCRIPTION =
  "What shipped and when on the Global Metro Power Rankings. A running log of new sections, new data, methodology changes, and fixes.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: {
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
  },
};

// Hand-curated release log. Add new entries at the top. Group same-day
// shipping into a single date block. Keep each item readable to a
// non-developer: what changed on the site, not what moved in the diff.
type Release = {
  date: string; // ISO yyyy-mm-dd
  headline: string;
  items: string[];
};

const RELEASES: Release[] = [
  {
    date: "2026-04-28",
    headline: "Top Teams reference, civic-identity card on metro profiles",
    items: [
      "Launched the Top Teams page: \"The Team That Wins the City,\" a single-pick taxonomy of the sporting franchise that defines each of 236 global metros. Cards include the team, sport, full rationale, and a Co-equal tag for contested rows like London, Milan, Istanbul, and Glasgow.",
      "Metros with a top-team pick now surface a Top Team card on their profile alongside the Walkable Elite Quarters card, linking back to the relevant entry on the taxonomy page.",
      "Refreshed featured-articles section on the home page to reflect both the Marylebones and Top Teams pieces; placeholders for unwritten essays removed.",
      "Sitemap, llms.txt, and articles dropdown updated so the new piece is discoverable to crawlers, LLM agents, and human readers.",
    ],
  },
  {
    date: "2026-04-24",
    headline: "Wikidata and Wikipedia linking on Top 25 metros and US major leagues",
    items: [
      "Top 25 metro profiles now carry Wikidata and Wikipedia links in structured data. Search engines and LLM crawlers can resolve each metro to its canonical entity, strengthening citation and entity-graph signals.",
      "All US major league teams (NFL, MLB, NBA, NHL) plus every Canadian NHL franchise and the Toronto MLB and NBA sides now emit their own SportsTeam schema with Wikidata and Wikipedia references. 124 teams linked in total.",
      "Coverage is intentionally partial in this pass. Metros ranked 26 and below and overseas leagues will follow in subsequent tranches; schema is additive and degrades gracefully where links are not yet present.",
    ],
  },
  {
    date: "2026-04-23",
    headline: "Historic Venues, Annual Events, analytics",
    items: [
      "Metro profiles now render a Historic Venues collapsible under Notable Venues. 41 sites across 40 metros, including the Astrodome, Korakuen Hall, Kooyong Stadium, and the Panathenaic Stadium.",
      "Annual Sporting Events (F1 Grands Prix, NASCAR races, Sail Grand Prix regattas) route exclusively into their own category on the metro page rather than being mixed into major-league or other-teams buckets. 81 events across the site.",
      "Section labels clarified: \"Museums & Landmarks\" is now \"Notable Museums & Landmarks\" and \"Infrastructure\" is now \"Notable Infrastructure,\" signalling that these are curated highlights rather than complete inventories.",
      "Google Analytics 4 instrumented on both the rankings site and the citizenofnowhere.org brand hub so I can tell what people actually look at.",
    ],
  },
  {
    date: "2026-04-22",
    headline: "All-Star Games category, NCAA bucketing fix, data refresh",
    items: [
      "All-Star Games now appear as their own category on metro profiles, separated from championship finals and major fights.",
      "NCAA minor-sport teams (wrestling, women's soccer, baseball) that had been labeled with generic \"Other Sports\" league names now route correctly into the College and University Teams bucket.",
      "Added a link back to the Citizen of Nowhere apex from the rankings header.",
      "Published the project backlog so anyone can see what's queued next.",
      "Refreshed underlying data from the latest source spreadsheet.",
    ],
  },
  {
    date: "2026-04-21",
    headline: "Walkable Elite Quarters card",
    items: [
      "Metros that contain one of the 103 qualifying walkable-elite neighborhoods now surface a Walkable Elite Quarters card on their profile, linking to the full taxonomy.",
      "Data refreshed to the April 21 source dataset.",
    ],
  },
  {
    date: "2026-04-20",
    headline: "Neighborhoods reference, nav restructure",
    items: [
      "Launched the Neighborhoods page: \"The Last of the Marylebones,\" a global taxonomy of dense, historic, walkable, elite residential quarters. 103 qualifiers out of 4,200+ metros, with criteria, rationales, and the hard skips.",
      "Consolidated long-form essays behind an Articles dropdown in the top nav.",
      "Corpus-size language standardized to \"4,200+ metros\" so the positioning stays stable as the dataset grows.",
    ],
  },
  {
    date: "2026-04-18",
    headline: "Supertall Structures, venue dedupe, restructured profiles",
    items: [
      "New Supertall Structures (350m+) section on metro profiles, nested alongside Museums & Landmarks.",
      "Venues that host multiple teams no longer appear as duplicates in the Notable Venues block. Sports for each shared venue now list inline.",
      "Transit station counts now render per entry rather than rolled up to the metro level.",
      "Major subgroups on metro profiles collapsed by default to make the page easier to scan.",
      "Annual sporting events separated from one-off championship events so recurring fixtures and discrete finals are no longer conflated.",
      "Data refreshed to the April 18 source dataset.",
    ],
  },
  {
    date: "2026-04-17",
    headline: "AI/LLM discoverability, Compare tool, site navigation",
    items: [
      "Launched the Compare tool: pick any two or three metros and see their dimensional ranks side by side with a shareable URL.",
      "Added a top-level site navigation with a last-updated chip so the freshness of the underlying data is visible at a glance.",
      "Shipped full AI/LLM discoverability: robots.txt, llms.txt, sitemap, and structured data (Dataset, ItemList, Place, AggregateRating, Breadcrumb JSON-LD) so the rankings surface cleanly in large-language-model tools and search engines.",
      "License scope clarified: the composite score is CC-BY; third-party source data retains its original license.",
      "Boxing moved into the Major Fights event group so heavyweight bouts sit alongside MMA title fights.",
      "\"Major League Teams\" renamed to \"Major League Teams/Venues\" with teams rendered before venues; dimension count corrected to 16 with \"70,000+ individually verified parameters\" as the hero descriptor.",
      "Footer rebuilt with real links and a dedicated methodology section; placeholder social links removed.",
    ],
  },
  {
    date: "2026-04-15",
    headline: "Breakdown table, continent filter, profile enhancements",
    items: [
      "Breakdown table now supports state and dimension-rank search, so you can find every metro in, say, Texas or every metro in the global top 20 for Airport Score.",
      "Continent filter added on the home page rankings.",
      "Metro profiles now show the primary city, football team levels, and event aggregations.",
      "Data regenerated with state2/state3 fields and precomputed dimension ranks.",
    ],
  },
  {
    date: "2026-04-14",
    headline: "Bug fixes",
    items: [
      "Team badges, percentage displays, events aggregation, and football team naming all corrected after bug reports from early readers.",
    ],
  },
  {
    date: "2026-04-13",
    headline: "Launch",
    items: [
      "Initial release of the Global Metro Power Rankings. 4,200+ metros, 16 dimensions, ranked by composite score.",
      "Metro profile pages with company names, sources, market cap, GDP, and breakdown by dimension.",
      "Rankings table rows link through to each metro's profile.",
      "Top 12 companies per metro on each profile.",
    ],
  },
];

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatReleaseDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[parseInt(m[2], 10) - 1];
  const day = parseInt(m[3], 10);
  const year = m[1];
  return `${month} ${day}, ${year}`;
}

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
  "@type": "WebPage",
  "@id": `${PAGE_URL}#webpage`,
  url: PAGE_URL,
  name: `${PAGE_TITLE} | ${SITE_NAME}`,
  description: PAGE_DESCRIPTION,
  isPartOf: { "@id": `${BASE_URL}/#website` },
  dateModified: RELEASES[0]?.date,
  author: { "@id": `${AUTHOR.url}/#author` },
  publisher: { "@id": `${PUBLISHER.url}/#publisher` },
  breadcrumb: breadcrumbJsonLd,
};

export default function UpdatesPage() {
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
              RELEASE NOTES
            </p>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
              What shipped, and when.
            </h1>
            <p className="text-lg text-[var(--text-muted)] leading-relaxed">
              A running log of new sections, new data, methodology changes, and
              fixes on the Global Metro Power Rankings. Newest at the top.
              Same-day shipping collapses into one entry.
            </p>
          </header>

          <div className="space-y-12">
            {RELEASES.map((release) => (
              <article key={release.date} className="flex flex-col sm:flex-row gap-6 sm:gap-10">
                <div className="sm:w-36 flex-shrink-0">
                  <time
                    dateTime={release.date}
                    className="block text-sm font-semibold text-[var(--accent)]"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {formatReleaseDate(release.date)}
                  </time>
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-bold mb-4 text-[var(--text)]">
                    {release.headline}
                  </h2>
                  <ul className="space-y-3">
                    {release.items.map((item, idx) => (
                      <li
                        key={idx}
                        className="text-[var(--text)] leading-relaxed flex gap-3"
                      >
                        <span
                          className="text-[var(--accent)] flex-shrink-0 mt-1"
                          aria-hidden="true"
                        >
                          &middot;
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>

          <footer className="mt-16 pt-8 border-t border-[var(--border)] text-sm text-[var(--text-muted)]">
            <p>
              Have a correction, a feature request, or a city you think is
              miscategorized? Leave a comment on any post at{" "}
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
