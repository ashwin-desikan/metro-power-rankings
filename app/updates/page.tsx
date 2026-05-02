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
    date: "2026-05-02",
    headline: "Badges launch: categorical lenses on the dataset",
    items: [
      "New /badges section: each badge reframes the metros dataset through a different question, indexable as a standalone destination.",
      "University Town live with 103 metros tiered by how much the universities dimension contributes to the composite score.",
      "Skyline City live with 82 metros where skyscrapers dominate the score, ranging from organic vertical density to municipal-debt-driven construction.",
      "Eight more badges scaffolded for upcoming releases including Global Gateway, Finance Capital, and Sports Mecca.",
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
    headline: "Historic Venues, Annual Events, analytics",
    items: [
      "New Historic Venues collapsible on metro profiles (41 sites).",
      "Annual Sporting Events route into their own category.",
      "Google Analytics 4 instrumented.",
    ],
  },
  {
    date: "2026-04-22",
    headline: "All-Star Games category, NCAA bucketing",
    items: [
      "All-Star Games now their own category, separated from championship finals.",
      "NCAA minor-sport teams routed correctly into College and University Teams.",
      "Data refresh; project backlog published.",
    ],
  },
  {
    date: "2026-04-21",
    headline: "Walkable Elite Quarters card",
    items: [
      "Walkable Elite Quarters card now appears on profiles for the 103 qualifying metros.",
      "Data refresh.",
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
