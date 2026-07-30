import type { Metadata } from "next";
import Link from "next/link";
import { getActivityFeed, type ActivityEntry, type ActivityCategory } from "@/lib/activity";
import { RELEASES } from "@/lib/releases";
import {
  AUTHOR,
  BASE_URL,
  PUBLISHER,
  SITE_NAME,
  serializeJsonLd,
} from "@/lib/seo";

// The feed is regenerated + committed daily with [vercel skip]; read it from
// GitHub raw on an hourly revalidate so new entries appear without a build.
export const revalidate = 3600;
export const dynamicParams = false;

const PAGE_PATH = "/activity";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "Site Activity";
const PAGE_DESCRIPTION =
  "A running log of everything that changes on the Global Metro Power Rankings — data refreshes, hub edits, new hubs, and fixes — newest first.";

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

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${MONTHS[parseInt(m[2], 10) - 1]} ${parseInt(m[3], 10)}, ${m[1]}`;
}

const CATEGORY_META: Record<ActivityCategory, { label: string; className: string }> = {
  "new-hub": { label: "New hub", className: "text-[var(--accent)] border-[var(--accent)]" },
  hub: { label: "Hub", className: "text-[var(--text)] border-[var(--border)]" },
  data: { label: "Data", className: "text-[var(--text-muted)] border-[var(--border)]" },
  fix: { label: "Fix", className: "text-[var(--text-muted)] border-[var(--border)]" },
};

function CategoryChip({ category }: { category: ActivityCategory }) {
  const meta = CATEGORY_META[category] ?? CATEGORY_META.hub;
  return (
    <span
      className={`inline-block text-[10px] uppercase tracking-widest border rounded px-1.5 py-0.5 ${meta.className}`}
      style={MONO}
    >
      {meta.label}
    </span>
  );
}

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: SITE_NAME, item: BASE_URL },
    { "@type": "ListItem", position: 2, name: PAGE_TITLE, item: PAGE_URL },
  ],
};

export default async function ActivityPage() {
  const feed = await getActivityFeed();
  const entries: ActivityEntry[] = feed?.entries ?? [];
  const releaseDates = new Set(RELEASES.map((r) => r.date));

  // group consecutive entries by date, preserving the newest-first order
  const byDate: { date: string; items: ActivityEntry[] }[] = [];
  for (const e of entries) {
    const last = byDate[byDate.length - 1];
    if (last && last.date === e.date) last.items.push(e);
    else byDate.push({ date: e.date, items: [e] });
  }

  const firstDate = entries[entries.length - 1]?.date ?? "2026-04-10";
  const latestDate = entries[0]?.date ?? firstDate;

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${PAGE_URL}#article`,
    mainEntityOfPage: PAGE_URL,
    url: PAGE_URL,
    headline: `${PAGE_TITLE} - Global Metro Power Rankings`,
    alternativeHeadline: "What changed on the site and when — the full activity log",
    description: PAGE_DESCRIPTION,
    datePublished: firstDate,
    dateModified: latestDate,
    inLanguage: "en",
    isPartOf: { "@id": `${BASE_URL}/#website` },
    author: { "@id": `${AUTHOR.url}/#author` },
    publisher: { "@id": `${PUBLISHER.url}/#publisher` },
    keywords: ["activity log", "changelog", "data updates", "global metro power rankings"],
  };
  const webPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${PAGE_URL}#webpage`,
    url: PAGE_URL,
    name: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    isPartOf: { "@id": `${BASE_URL}/#website` },
    dateModified: latestDate,
    author: { "@id": `${AUTHOR.url}/#author` },
    publisher: { "@id": `${PUBLISHER.url}/#publisher` },
    breadcrumb: breadcrumbJsonLd,
    mainEntity: { "@id": `${PAGE_URL}#article` },
  };

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
              style={MONO}
            >
              &larr; Back to rankings
            </Link>
          </nav>

          <header className="mb-12 border-b border-[var(--border)] pb-10">
            <p className="text-xs tracking-widest text-[var(--text-muted)] mb-3" style={MONO}>
              SITE ACTIVITY
            </p>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
              Everything that changed, and when.
            </h1>
            <p className="text-lg text-[var(--text-muted)] leading-relaxed">
              The granular log: data refreshes from the automated jobs, edits to any
              hub, new hubs, and fixes. Newest at the top. For curated highlights of
              major releases, see the{" "}
              <Link href="/updates" className="text-[var(--accent)] hover:underline">
                release notes
              </Link>
              .
            </p>
            {entries.length > 0 && (
              <p className="mt-4 text-xs text-[var(--text-muted)]" style={MONO}>
                {entries.length} changes logged
                {feed?.generatedAt ? ` · updated ${formatDate(feed.generatedAt)}` : ""}
              </p>
            )}
          </header>

          {byDate.length === 0 ? (
            <p className="text-[var(--text-muted)]">The activity feed is being generated. Check back shortly.</p>
          ) : (
            <div className="space-y-10">
              {byDate.map((day) => (
                <article key={day.date} className="flex flex-col sm:flex-row gap-3 sm:gap-10">
                  <div className="sm:w-32 flex-shrink-0">
                    <time
                      dateTime={day.date}
                      className="block text-sm font-semibold text-[var(--accent)]"
                      style={MONO}
                    >
                      {formatDate(day.date)}
                    </time>
                    {releaseDates.has(day.date) && (
                      <Link
                        href="/updates"
                        className="mt-1 inline-block text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)]"
                        style={MONO}
                      >
                        release note ↗
                      </Link>
                    )}
                  </div>
                  <ul className="flex-1 min-w-0 space-y-3">
                    {day.items.map((e, i) => (
                      <li key={`${e.commit}-${i}`} className="flex gap-3 items-baseline leading-relaxed">
                        <span className="flex-shrink-0 pt-0.5">
                          <CategoryChip category={e.category} />
                        </span>
                        <span className="text-[var(--text)]">
                          {e.hub && (
                            <span className="font-semibold text-[var(--text)]">{e.hub}: </span>
                          )}
                          {e.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          )}

          <footer className="mt-16 pt-8 border-t border-[var(--border)] text-sm text-[var(--text-muted)]">
            <p>
              This log is generated automatically from the site&rsquo;s change history, so it
              records both the automated data jobs and every hand edit. Spot something wrong?
              Leave a comment at{" "}
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
