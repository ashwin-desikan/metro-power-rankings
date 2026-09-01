import type { Metadata } from "next";
import Link from "next/link";
import ActivityPreview from "@/app/ActivityPreview";
import { RELEASES, type Release } from "@/lib/releases";
import { Disclosure } from "@/app/_shared/Disclosure";
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
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    type: "website",
  },
  twitter: { images: ["/og-default.png"],
    card: "summary_large_image",
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
  },
};

// Hand-curated release log. Add new entries at the top. Same-day work that is
// genuinely one story shares a date block; genuinely separate stories get their
// own, which is why the render keys on date PLUS index rather than date alone.
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

// --- Month grouping -----------------------------------------------------
//
// 125 entries rendered flat measured 88.7 phone screens on 2026-09-01, the
// longest route on the site, and probe:mobile flagged it as long on DESKTOP
// too. The standard's answer to a length warning is in-page navigation rather
// than truncation (DESIGN-STANDARDS "The number to watch"), so nothing is cut:
// entries are grouped by the month they shipped, the current month stays open
// on every viewport, and older months collapse EVERYWHERE. desktopOpen={false}
// rather than the usual default because the desktop reading is the one the
// probe called out; a release archive from four months ago is exactly the
// "genuinely optional appendix" that option exists for.
const FULL_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type MonthGroup = { key: string; label: string; releases: Release[] };

const monthAnchorId = (key: string) => `m-${key}`;

function monthLabel(key: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return key;
  return `${FULL_MONTHS[parseInt(m[2], 10) - 1]} ${m[1]}`;
}

// RELEASES is newest-first, so a single pass keeps both the group order and
// the order within each group without sorting anything.
function groupByMonth(releases: Release[]): MonthGroup[] {
  const out: MonthGroup[] = [];
  for (const r of releases) {
    const key = r.date.slice(0, 7);
    const last = out[out.length - 1];
    if (last && last.key === key) last.releases.push(r);
    else out.push({ key, label: monthLabel(key), releases: [r] });
  }
  return out;
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
  const groups = groupByMonth(RELEASES);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd({ "@context": "https://schema.org", "@graph": [articleJsonLd, webPageJsonLd] }) }}
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
              RELEASE NOTES
            </p>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
              What shipped, and when.
            </h1>
            <p className="text-lg text-[var(--text-muted)] leading-relaxed">
              A running log of new sections, new data, methodology changes, and
              fixes on the Global Metro Power Rankings. Newest at the top,
              grouped by the month it shipped.
            </p>
          </header>

          <ActivityPreview />

          {/* Jump index. Six chips, so it stays one or two rows even at 390px. */}
          <Disclosure
            title="Jump to a month"
            meta={`${groups.length} months \u00b7 ${RELEASES.length} entries`}
            className="mb-8"
          >
            <div className="flex flex-wrap gap-2 p-4">
              {groups.map((g) => (
                <a
                  key={`jump-${g.key}`}
                  href={`#${monthAnchorId(g.key)}`}
                  className="inline-flex items-center min-h-11 rounded-full border px-3 text-xs transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                >
                  {g.label}
                  <span className="ml-1.5 text-[var(--text-dim)] tabular-nums">{g.releases.length}</span>
                </a>
              ))}
            </div>
          </Disclosure>

          <div className="space-y-4">
            {groups.map((g, gi) => (
              <Disclosure
                key={g.key}
                id={monthAnchorId(g.key)}
                title={g.label}
                meta={`${g.releases.length} ${g.releases.length === 1 ? "entry" : "entries"}`}
                // Newest month open everywhere; the rest closed everywhere, and
                // marked jump-open so an anchor still reveals what it landed on.
                defaultOpen={gi === 0}
                desktopOpen={gi === 0}
                className={gi === 0 ? "" : "jump-open"}
                bodyClassName="px-4 sm:px-6 py-8"
              >
                <div className="space-y-12">
                  {g.releases.map((release, ri) => (
                    // Keyed on date PLUS index: two entries have shared
                    // 2026-09-01 since the club-ranking launch, and a duplicate
                    // React key is a reconciliation bug waiting to happen.
                    <article key={`${release.date}-${ri}`} className="flex flex-col sm:flex-row gap-6 sm:gap-10">
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
              </Disclosure>
            ))}
          </div>

          <footer className="mt-16 pt-8 border-t border-[var(--border)] text-sm text-[var(--text-muted)]">
            <p>
              Have a correction, a feature request, or a city you think is
              miscategorized? Use the &ldquo;Spot an error?&rdquo; control at the
              foot of any page, which tells us which page you were reading. For
              anything longer, the comments are open on every post at{" "}
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
