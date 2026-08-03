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

const PAGE_PATH = "/about";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "About";
const PAGE_DESCRIPTION =
  "About the Global Metro Power Rankings: who built it, why it exists, what it borrows from, and how to reach the author.";

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
    card: "summary_large_image",
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
  },
};

export default function AboutPage() {
  const aboutLd = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
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
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(aboutLd) }}
      />
      <main className="min-h-screen pt-8 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
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
              ABOUT
            </p>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
              The Global Metro Power Rankings
            </h1>
            <p className="text-lg text-[var(--text-muted)] leading-relaxed">
              A composite ranking of every metropolitan area on Earth.
              Sixteen dimensions, individually verified parameters,
              hand-curated. The ranking is the product; everything else on
              this site is the apparatus that supports it.
            </p>
          </header>

          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">Why this exists</h2>
            <div className="space-y-4 text-[var(--text)] leading-relaxed">
              <p>
                Most "best metros" rankings rely on subjective livability
                surveys, opaque weighting, and a small reference set of usual
                suspects. They are useful for travel magazines, less useful
                for understanding why one metropolitan area is more globally
                consequential than another.
              </p>
              <p>
                This project measures hard infrastructure: intercity rail,
                airport throughput, listed-company market cap, museums and
                cultural institutions, top universities, professional sports
                teams. The composite score is the sum of those measurements,
                weighted to reflect how much each dimension actually drives
                global gravity. The methodology page documents every weight,
                source, and editorial choice.
              </p>
              <p>
                The dataset is the moat. The reach of the writing depends on
                it. Both compound over time.
              </p>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">Who built it</h2>
            <div className="space-y-4 text-[var(--text)] leading-relaxed">
              <p>
                Ashwin Desikan. Marketing technology and digital
                transformation background, with a long-running interest in
                metros and sports as the two most legible expressions of
                civic identity.
              </p>
              <p>
                The companion essays live at{" "}
                <a
                  href="https://citizenofnowhere.substack.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--accent)] hover:underline"
                >
                  Citizen of Nowhere
                </a>
                . The site you are on is the canonical destination for the
                ranked data; the Substack is where the long-form interpretation
                happens.
              </p>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">With thanks to</h2>
            <div className="space-y-4 text-[var(--text)] leading-relaxed">
              <p>
                Several projects shaped how this site is structured. Credit
                where it is owed.
              </p>
              <ul className="space-y-3 list-none pl-0">
                <li>
                  <a
                    href="https://isitaderby.co.uk"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--accent)] hover:underline font-semibold"
                  >
                    isitaderby.co.uk
                  </a>
                  <span className="text-[var(--text-muted)]">
                    {" "}— Tim Norris-Wiles&apos;s side project on football
                    derbies. The treatment of methodology as a first-class
                    page, the named-tier verdict system, and the willingness
                    to declare editorial overrides openly all came from
                    studying his approach. Recommended reading even if you do
                    not care about football.
                  </span>
                </li>
                <li>
                  <a
                    href="https://www.lboro.ac.uk/microsites/geography/gawc/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--accent)] hover:underline font-semibold"
                  >
                    GaWC
                  </a>
                  <span className="text-[var(--text-muted)]">
                    {" "}— the Globalization and World Cities Research
                    Network at Loughborough University. The alpha/beta/gamma
                    classification convention is a clear academic precedent
                    for the named score tiers used here.
                  </span>
                </li>
                <li>
                  <a
                    href="https://www.citypopulation.de"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--accent)] hover:underline font-semibold"
                  >
                    citypopulation.de
                  </a>
                  <span className="text-[var(--text-muted)]">
                    {" "}— Thomas Brinkhoff&apos;s exhaustive metropolitan
                    population dataset. The population dimension across the
                    full metro corpus would not be tractable without it.
                  </span>
                </li>
                <li>
                  <a
                    href="https://www.wikidata.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--accent)] hover:underline font-semibold"
                  >
                    Wikidata
                  </a>
                  <span className="text-[var(--text-muted)]">
                    {" "}— canonical entity references for metros and sports
                    teams, linked from the structured data emitted on every
                    metro page.
                  </span>
                </li>
              </ul>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">Licensing</h2>
            <div className="space-y-4 text-[var(--text)] leading-relaxed">
              <p>
                The composite scores and rankings are released under{" "}
                <a
                  href="https://creativecommons.org/licenses/by/4.0/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--accent)] hover:underline"
                >
                  CC-BY 4.0
                </a>
                : free to redistribute and build on with attribution to{" "}
                <em>Citizen of Nowhere Rankings</em> and a link back to the
                live site. Editorial copy, essay text, and individual
                rationales remain the author&apos;s own work, not part of the
                CC-BY release.
              </p>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">Get in touch</h2>
            <div className="space-y-4 text-[var(--text)] leading-relaxed">
              <p>
                The fastest way to reach the author is by leaving a comment on
                any post at{" "}
                <a
                  href="https://citizenofnowhere.substack.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--accent)] hover:underline"
                >
                  Citizen of Nowhere
                </a>
                . Corrections, missing metros, contested rankings, and feature
                requests all welcome there.
              </p>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
