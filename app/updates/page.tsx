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
// shipping into a single date block.
//
// === BREVITY RULES (enforced at build time, see end of file) ===
// This is a PUBLIC release notes page, not an internal changelog.
//   - At most 4 bullets per release. No exceptions.
//   - Each bullet is ONE short sentence. No "including X, Y, Z" enumerations.
//   - Headline: 4-8 words ideal, 12 word ceiling.
//   - No internal mechanics: no script names, file paths, ETL details.
//   - Long-form belongs in commit messages and Substack posts, not here.
// If your edit makes `next build` fail with RELEASE_NOTES_VIOLATION,
// your entry is too long. Cut bullets, not just words.
type Release = {
  date: string; // ISO yyyy-mm-dd
  headline: string;
  items: string[];
};

const RELEASES: Release[] = [
  {
    date: "2026-05-10",
    headline: "498 new boundaries plus football markers and Tokyo refresh",
    items: [
      "Real polygons now render for Brazil (218), China (172), Switzerland (32), Australia (31), Austria (27), and South Korea (18); 498 new boundaries in total.",
      "Football clubs plot as Major League markers on every metro map, with stadium coordinates backfilled for 499 top-flight clubs.",
      "Tokyo polygon rebuilt with the 23 special wards correctly inside the metro footprint; new refreshment protocol catches this kind of staleness automatically.",
    ],
  },
  {
    date: "2026-05-09",
    headline: "Frozen Conurbations badge and Substack auto-sync",
    items: [
      "New /badges/frozen-conurbations surfaces five paired cities severed by border, missing bridge, or political division: Lahore-Amritsar, Nicosia-North Nicosia, Kinshasa-Brazzaville, Detroit-Windsor, San Diego-Tijuana.",
      "Chips appear on each affected metro page, linking back to the case set.",
      "Home page Featured Articles strip now auto-syncs with Substack so new posts appear within 24 hours without a manual deploy.",
      "Internal: BACKLOG.md reconciled, news peg watchlist seeded, Greater Bay Area conurbation audit documented.",
    ],
  },
  {
    date: "2026-05-08",
    headline: "Boundary expansion staged for 43 new countries",
    items: [
      "Real polygon boundaries unlocked for 555 metros across 43 new countries, led by India, Romania, Portugal, Turkey, Colombia, and Nigeria.",
      "Builder routing wired in code; polygons render once the next boundary build runs.",
    ],
  },
  {
    date: "2026-05-07",
    headline: "Methodology peer-index comparison plus three archetype badges",
    items: [
      "New peer-comparison section on /methodology positions this index against Oxford Economics GCI, GaWC, Mori GPCI, EIU Liveability, Mercer, and Z/Yen GFCI.",
      "Three new badges launch: Greying Power (21 metros), Cosmopolitan Capital (20), and Emerging Standout (18), inspired by the Oxford Economics city archetypes.",
    ],
  },
  {
    date: "2026-05-05",
    headline: "Country pages, state pages, team markers, six more countries",
    items: [
      "Every country and every state with metros now has its own page, with a tier-colored map of all member metros and a full ranked table.",
      "Metro maps now show team and venue markers (Major League gold, other teams slate, venues magenta) with a sport filter, and Football/Soccer is unified as one label everywhere.",
      "Real administrative boundaries added for Italy (84 metros), Spain (103), Poland (71), Andorra, San Marino, and Vatican City; the polygon map now spans 12 countries.",
      "Country, state, and region names across the site now link to their canonical pages; Warrington merges into Liverpool (UK 179 metros, total 4,283).",
    ],
  },
  {
    date: "2026-05-04",
    headline: "Real boundaries for North America, the UK, France, and Germany",
    items: [
      "Maps now render true administrative polygons for 595 US, 93 Mexican, 83 Canadian, 179 UK, 113 French, and 73 German metros (1,136 total) instead of city-center pins.",
      "Lewes merges into Brighton & Hove and Warrington into Liverpool; three Newfoundland metros still fall back to a city pin until source data is populated.",
      "Boundaries come straight from Overture Maps, so editorial updates flow through with one rebuild.",
      "Honolulu and similar metros no longer drag thousand-mile administrative tails into the map; remote oceanic outposts are trimmed automatically.",
    ],
  },
  {
    date: "2026-05-03",
    headline: "Conurbations get proper editorial names",
    items: [
      "60+ conurbations now display under their civic, geographic, or political names: Bodensee, Lowcountry, SIJORI Triangle, Tuscany, Côte d'Azur, Borderplex, Mälardalen, Mindong, Greater Golden Horseshoe, plus many more.",
      "Tier B for Conurbations renamed Continental (was World); the metro tier World City likewise becomes Continental City to sharpen the editorial vocabulary.",
      "Davos cluster fixed: the 138 km transitive bridge-chain is replaced by Bodensee, a real cross-border Lake Constance conurbation. Davos and St. Moritz now solo.",
      "Leaflet maps embed on matchup pages (two-point derby view), metro detail pages (cluster context or single-point location pin), and the conurbations badge page (click-to-expand per cluster).",
    ],
  },
  {
    date: "2026-05-02",
    headline: "Badges launch: 11 categorical lenses on the dataset",
    items: [
      "New /badges section launches with 11 categorical lenses including University Town (103 metros), Skyline City (82), Megacity, Overperformer, and the seven below.",
      "Conurbations groups metros by 75 km clustering with 5 named megaregions, ~55 editorial overrides with civic names, tiers aligned with the metro scale (Global / World / Major / Regional).",
      "Isolated Capital lists national capitals more than 240 km from any peer in the same composite tier or higher; surfaces deliberate planned capitals and continental-gravity capitals.",
      "Global Gateway, Finance Capital, Culture Capital, Sports Mecca, Rail Hub launch with significance thresholds in place of top-100 caps; Culture Capital adds a regional top-3 fallback.",
    ],
  },
  {
    date: "2026-05-01",
    headline: "Methodology, score tiers, share cards, matchup pages, big data refresh",
    items: [
      "New /methodology page documents every dimension, weight, source, and editorial choice; score tiers (Global Capital through Local City) now appear on every metro page.",
      "Per-metro and comparison Open Graph share cards now generate automatically, with Reddit and LinkedIn share buttons on every metro and matchup page.",
      "New /matchups/[a-vs-b] route with 300 pre-rendered head-to-head pages for the top 25 metros, each with a tier verdict and dimension-by-dimension winner grid.",
      "Data refresh: Multi-Sport Events bucket, Eurovision and Historical Events surfaced, Euroleague teams added, Top Teams expanded to 312 metros, Wikidata coverage to Top 156.",
    ],
  },
  {
    date: "2026-04-28",
    headline: "Top Teams reference",
    items: [
      "Launched the Top Teams page: one defining sporting franchise per metro, with co-equal tags for contested calls.",
      "Top Team card now appears on metro profiles alongside Walkable Elite Quarters.",
    ],
  },
  {
    date: "2026-04-24",
    headline: "Wikidata linking on Top 25 metros and US major leagues",
    items: [
      "Top 25 metro profiles now carry Wikidata and Wikipedia structured data.",
      "All US major league teams plus Canadian NHL and Toronto MLB/NBA franchises emit SportsTeam schema; 124 teams linked.",
    ],
  },
  {
    date: "2026-04-23",
    headline: "Historic Venues, Annual Events",
    items: [
      "New Historic Venues collapsible on metro profiles (41 sites).",
      "Annual Sporting Events route into their own category.",
    ],
  },
  {
    date: "2026-04-22",
    headline: "All-Star Games category, NCAA bucketing",
    items: [
      "All-Star Games now their own category, separated from championship finals.",
      "NCAA minor-sport teams routed correctly into College and University Teams.",
    ],
  },
  {
    date: "2026-04-21",
    headline: "Walkable Elite Quarters card",
    items: [
      "Walkable Elite Quarters card now appears on profiles for the 103 qualifying metros.",
    ],
  },
  {
    date: "2026-04-20",
    headline: "Neighborhoods reference, nav restructure",
    items: [
      "Launched the Neighborhoods page: 103 walkable-elite quarters out of 4,200+ metros.",
      "Articles dropdown added to top nav.",
    ],
  },
  {
    date: "2026-04-18",
    headline: "Supertall Structures, venue dedupe",
    items: [
      "New Supertall Structures (350m+) section on metro profiles.",
      "Multi-sport venues no longer duplicated in the Notable Venues block.",
      "Annual events split from one-off championships; subgroups collapsed by default.",
    ],
  },
  {
    date: "2026-04-17",
    headline: "Compare tool, AI/LLM discoverability",
    items: [
      "Launched the Compare tool: pick 2-3 metros and see their dimensional ranks side by side.",
      "Top-level navigation with last-updated chip.",
      "Full AI/LLM discoverability shipped (robots.txt, llms.txt, sitemap, JSON-LD).",
      "Composite score licensed CC-BY.",
    ],
  },
  {
    date: "2026-04-15",
    headline: "Breakdown table, continent filter",
    items: [
      "Breakdown table now searchable by state and dimension rank.",
      "Continent filter on rankings; primary city and event aggregations on profiles.",
    ],
  },
  {
    date: "2026-04-14",
    headline: "Bug fixes",
    items: [
      "Team badges, percentage displays, events aggregation, and football team naming corrected.",
    ],
  },
  {
    date: "2026-04-13",
    headline: "Launch",
    items: [
      "Initial release: 4,200+ metros, 16 dimensions, ranked by composite score.",
      "Metro profile pages with company names, sources, market cap, GDP, and dimension breakdowns.",
    ],
  },
];
// Build-time enforcement of the brevity rules above. Runs at module load,
// which means `next build` fails if any release breaks the limits. The
// rules are deliberately strict: the file dropped from 19KB to 9KB after
// two rounds of trimming, and the goal is to keep it that way.
const RELEASE_LIMITS = {
  maxBulletsPerRelease: 4,
  maxCharsPerBullet: 220,
  maxHeadlineWords: 12,
} as const;

function enforceReleaseBrevity(releases: Release[]): void {
  for (const r of releases) {
    if (r.items.length > RELEASE_LIMITS.maxBulletsPerRelease) {
      throw new Error(
        `RELEASE_NOTES_VIOLATION (${r.date}): ${r.items.length} bullets exceeds max ${RELEASE_LIMITS.maxBulletsPerRelease}. Cut bullets, not just words.`,
      );
    }
    const headlineWords = r.headline.trim().split(/\s+/).length;
    if (headlineWords > RELEASE_LIMITS.maxHeadlineWords) {
      throw new Error(
        `RELEASE_NOTES_VIOLATION (${r.date}): headline ${headlineWords} words exceeds max ${RELEASE_LIMITS.maxHeadlineWords}: "${r.headline}".`,
      );
    }
    for (const item of r.items) {
      if (item.length > RELEASE_LIMITS.maxCharsPerBullet) {
        throw new Error(
          `RELEASE_NOTES_VIOLATION (${r.date}): bullet is ${item.length} chars (max ${RELEASE_LIMITS.maxCharsPerBullet}). One short sentence only. Starts: "${item.slice(0, 80)}..."`,
        );
      }
    }
  }
}

enforceReleaseBrevity(RELEASES);

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
