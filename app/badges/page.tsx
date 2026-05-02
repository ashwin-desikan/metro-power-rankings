import type { Metadata } from "next";
import Link from "next/link";
import { BADGES, getQualifyingMetros } from "@/lib/badges";
import {
  AUTHOR,
  BASE_URL,
  PUBLISHER,
  SITE_NAME,
  serializeJsonLd,
} from "@/lib/seo";

export const dynamicParams = false;

const PAGE_PATH = "/badges";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "Badges";
const PAGE_DESCRIPTION =
  "Categorical lenses over the global metro composite. Each badge reframes the same dataset through a different question — university towns, megacities, finance capitals, sports meccas, and more.";

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

export default function BadgesIndexPage() {
  // Pre-compute counts for live badges so the index can show "N qualifying metros"
  const counts = new Map<string, number>();
  for (const b of BADGES) {
    if (b.status === "live") {
      counts.set(b.slug, getQualifyingMetros(b).length);
    }
  }

  const collectionLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    isPartOf: {
      "@type": "WebSite",
      name: SITE_NAME,
      url: BASE_URL,
      publisher: PUBLISHER,
    },
    author: AUTHOR,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(collectionLd) }}
      />
      <main className="min-h-screen pt-24 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <nav className="mb-8">
            <Link
              href="/"
              className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
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
              BADGES
            </p>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
              The same dataset, asked different questions.
            </h1>
            <p className="text-lg text-[var(--text-muted)] leading-relaxed max-w-3xl">
              {PAGE_DESCRIPTION} Each badge is a deterministic view over the
              composite ranking, not a separate dataset.
            </p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {BADGES.map((badge) => {
              const isLive = badge.status === "live";
              const count = counts.get(badge.slug);
              const card = (
                <article
                  className="border rounded-lg p-6 h-full flex flex-col transition-colors hover:border-[var(--accent)]"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border)",
                    opacity: isLive ? 1 : 0.65,
                  }}
                >
                  <div className="flex items-baseline justify-between gap-3 mb-3">
                    <div className="flex items-baseline gap-3">
                      <span className="text-3xl" aria-hidden="true">
                        {badge.emoji}
                      </span>
                      <h2 className="text-xl font-bold">{badge.name}</h2>
                    </div>
                    {isLive && count !== undefined ? (
                      <span
                        className="text-xs px-2 py-1 rounded uppercase tracking-wider"
                        style={{
                          backgroundColor: "rgba(78, 205, 196, 0.16)",
                          color: "var(--accent)",
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      >
                        {count} metros
                      </span>
                    ) : (
                      <span
                        className="text-xs px-2 py-1 rounded uppercase tracking-wider"
                        style={{
                          backgroundColor: "rgba(85, 85, 106, 0.2)",
                          color: "var(--text-dim)",
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      >
                        Coming soon
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[var(--text-muted)] flex-grow">
                    {badge.shortDesc}
                  </p>
                  {isLive ? (
                    <span
                      className="text-xs text-[var(--accent)] mt-4 inline-flex items-center gap-1"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      Open the badge &rarr;
                    </span>
                  ) : null}
                </article>
              );
              return isLive ? (
                <Link key={badge.slug} href={`/badges/${badge.slug}`} className="block">
                  {card}
                </Link>
              ) : (
                <div key={badge.slug}>{card}</div>
              );
            })}
          </div>

          <footer className="mt-16 pt-8 border-t border-[var(--border)] text-sm text-[var(--text-muted)]">
            <p>
              Badges are computed deterministically from the metros dataset. Each
              one&apos;s rule is documented on its detail page and on{" "}
              <Link href="/methodology" className="text-[var(--accent)] hover:underline">
                /methodology
              </Link>
              .
            </p>
          </footer>
        </div>
      </main>
    </>
  );
}
