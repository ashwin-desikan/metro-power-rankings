import type { Metadata } from "next";
import Link from "next/link";
import {
  getAllCountries,
  getMetrosForCountry,
  getTopLevelCountries,
  getChildrenOf,
} from "@/lib/countries";
import {
  AUTHOR,
  BASE_URL,
  PUBLISHER,
  SITE_NAME,
  serializeJsonLd,
} from "@/lib/seo";
import CountriesDirectory, {
  type DirectoryCountry,
} from "./CountriesDirectory";

export const dynamicParams = false;

const PAGE_PATH = "/countries";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "Countries";
const PAGE_DESCRIPTION =
  "Population, metros, and composite score by country. Sovereign states, constituents, territories, and disputed regions, ranked and filterable.";

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

function toDirectoryRow(c: ReturnType<typeof getAllCountries>[number]): DirectoryCountry {
  const children = getChildrenOf(c.name).map((child) => ({
    slug: child.slug,
    name: child.name,
    parent: child.parent,
    parent_slug: child.parent_slug,
    continent: child.continent,
    pop: child.pop,
    metroCount: getMetrosForCountry(child.slug).length,
    scoreTotal: child.scoreTotal,
    capital: child.capital,
    disputed: child.disputed,
    children: [],
  }));
  return {
    slug: c.slug,
    name: c.name,
    parent: c.parent,
    parent_slug: c.parent_slug,
    continent: c.continent,
    pop: c.pop,
    metroCount: getMetrosForCountry(c.slug).length,
    scoreTotal: c.scoreTotal,
    capital: c.capital,
    disputed: c.disputed,
    children,
  };
}

export default function CountriesIndexPage() {
  const tops = getTopLevelCountries();
  const directory: DirectoryCountry[] = tops.map(toDirectoryRow);

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
    numberOfItems: getAllCountries().length,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(collectionLd) }}
      />
      <main className="min-h-screen pt-24 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <nav className="mb-8">
            <Link
              href="/"
              className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              &larr; Back to rankings
            </Link>
          </nav>

          <header className="mb-10 border-b border-[var(--border)] pb-8">
            <p
              className="text-xs tracking-widest text-[var(--text-muted)] mb-3"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              COUNTRIES
            </p>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
              Population, metros, and composite score by country.
            </h1>
            <p className="text-lg text-[var(--text-muted)] leading-relaxed max-w-3xl">
              Sovereign states, constituents, territories, and disputed
              regions. Each row links to a per-country breakdown of every metro
              tracked under that flag. Click the &quot;+&quot; on any parent
              country to see its constituents and territories.
            </p>
          </header>

          <CountriesDirectory countries={directory} />
        </div>
      </main>
    </>
  );
}
