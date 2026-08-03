import type { Metadata } from "next";
import Link from "next/link";
import { getPowerHistory } from "@/lib/powerHistory";
import { AUTHOR, BASE_URL, PUBLISHER, SITE_NAME, serializeJsonLd } from "@/lib/seo";
import PowerHistory from "./PowerHistory";

const PAGE_PATH = "/power-atlas";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "The Power Atlas";
const PAGE_DESCRIPTION =
  "A year-by-year ranking of national power from 1500 to the present. Slide through five centuries and watch empires rise and fall, from Ming China and the Habsburgs through Pax Britannica and the Cold War to today, with every state ranked against its rivals.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: { title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION, url: PAGE_URL, type: "website" },
  twitter: { card: "summary_large_image", title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION },
};

export default function GreatPowersPage() {
  const data = getPowerHistory();
  const ld = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: BASE_URL, publisher: PUBLISHER },
    author: AUTHOR,
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(ld) }} />
      <main className="min-h-screen pt-8 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <nav className="mb-8 flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/" className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors" style={{ fontFamily: "'JetBrains Mono', monospace" }}>&larr; Back to rankings</Link>
            <Link href="/leaders" className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors" style={{ fontFamily: "'JetBrains Mono', monospace" }}>World Leaders &rarr;</Link>
            <Link href="/countries" className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Countries directory &rarr;</Link>
          </nav>
          <header className="mb-8 border-b border-[var(--border)] pb-8">
            <p className="text-xs tracking-widest text-[var(--text-muted)] mb-3" style={{ fontFamily: "'JetBrains Mono', monospace" }}>THE POWER ATLAS</p>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">Who ruled the world, year by year.</h1>
            <p className="text-lg text-[var(--text-muted)] leading-relaxed max-w-3xl">
              A single index of national power, computed for every state from 1500 to today and ranked against its
              contemporaries. Drag the slider and watch the tiers shift: Britain alone atop the 19th century, the
              crowded great-power table of 1900, the US and USSR splitting the Cold War world, and the present day.
            </p>
          </header>
          <PowerHistory data={data} />
        </div>
      </main>
    </>
  );
}
