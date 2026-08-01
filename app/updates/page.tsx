import type { Metadata } from "next";
import Link from "next/link";
import ActivityPreview from "@/app/ActivityPreview";
import { RELEASES, type Release } from "@/lib/releases";
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

// Article + WebPage co-emission. Article anchors the page as a recurring
// release-notes feed for entity-resolving AI crawlers; WebPage carries the
// breadcrumb. datePublished is pinned to the first ship date; dateModified
// tracks the most recent release entry so freshness signals stay accurate.
const FIRST_RELEASE_DATE = RELEASES[RELEASES.length - 1]?.date ?? "2026-04-10";
const LATEST_RELEASE_DATE = RELEASES[0]?.date ?? FIRST_RELEASE_DATE;

const articleJsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  "@id": `${PAGE_URL}#article`,
  mainEntityOfPage: PAGE_URL,
  url: PAGE_URL,
  headline: `${PAGE_TITLE} - Global Metro Power Rankings`,
  alternativeHeadline: "What shipped and when on the Global Metro Power Rankings",
  description: PAGE_DESCRIPTION,
  datePublished: FIRST_RELEASE_DATE,
  dateModified: LATEST_RELEASE_DATE,
  inLanguage: "en",
  isPartOf: { "@id": `${BASE_URL}/#website` },
  author: { "@id": `${AUTHOR.url}/#author` },
  publisher: { "@id": `${PUBLISHER.url}/#publisher` },
  keywords: [
    "release notes",
    "changelog",
    "global metro power rankings",
    "civic geography",
    "product updates",
  ],
};

const webPageJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  "@id": `${PAGE_URL}#webpage`,
  url: PAGE_URL,
  name: `${PAGE_TITLE} | ${SITE_NAME}`,
  description: PAGE_DESCRIPTION,
  isPartOf: { "@id": `${BASE_URL}/#website` },
  dateModified: LATEST_RELEASE_DATE,
  author: { "@id": `${AUTHOR.url}/#author` },
  publisher: { "@id": `${PUBLISHER.url}/#publisher` },
  breadcrumb: breadcrumbJsonLd,
  mainEntity: { "@id": `${PAGE_URL}#article` },
};

export default function UpdatesPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd({ "@context": "https://schema.org", "@graph": [articleJsonLd, webPageJsonLd] }) }}
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

          <ActivityPreview />

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
