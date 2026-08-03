import type { Metadata } from "next";
import Link from "next/link";
import { getLeadersMaster, getMonarchTimeline } from "@/lib/leadersAll";
import {
  AUTHOR,
  BASE_URL,
  PUBLISHER,
  SITE_NAME,
  serializeJsonLd,
} from "@/lib/seo";
import LeadersDirectory from "./LeadersDirectory";

const PAGE_PATH = "/leaders";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "Leaders";
const PAGE_DESCRIPTION =
  "Every current head of state and government we track — sovereign states, constituents, territories, and intergovernmental organisations — in one filterable table, with a time machine to look up who held each office in any month and year.";

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

export default async function LeadersIndexPage() {
  const entities = await getLeadersMaster();
  const monarchTimeline = getMonarchTimeline();

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
    numberOfItems: entities.length,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(collectionLd) }}
      />
      <main className="min-h-screen pt-8 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <nav className="mb-8 flex flex-wrap gap-x-4 gap-y-1">
            <Link
              href="/"
              className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              &larr; Back to rankings
            </Link>
            <Link
              href="/countries"
              className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              Countries directory &rarr;
            </Link>
            <Link
              href="/leaders/changes"
              className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              Leadership changes &rarr;
            </Link>
          </nav>

          <header className="mb-10 border-b border-[var(--border)] pb-8">
            <p
              className="text-xs tracking-widest text-[var(--text-muted)] mb-3"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              LEADERS
            </p>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
              Who leads the world, right now — and who did then.
            </h1>
            <p className="text-lg text-[var(--text-muted)] leading-relaxed max-w-3xl">
              Every current head of state and government we track, from sovereign
              states and their constituents and territories to the
              intergovernmental bodies they belong to. Filter by continent, type,
              or membership, or flip on the time machine to see who held any office
              in a given month and year.
            </p>
          </header>

          <LeadersDirectory entities={entities} monarchTimeline={monarchTimeline} />
        </div>
      </main>
    </>
  );
}
