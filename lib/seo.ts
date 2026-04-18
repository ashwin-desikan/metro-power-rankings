// Site-wide SEO constants and JSON-LD helpers.
// Keep BASE_URL in sync with the deployed domain (and update when moving
// to a custom domain such as metropowerrankings.com).

export const BASE_URL = "https://metro-power-rankings.vercel.app";

export const SITE_NAME = "Global Metro Power Rankings";

export const AUTHOR = {
  name: "Ashwin Dharmadhikari",
  email: "ashwind@gmail.com",
  url: "https://citizenofnowhere.substack.com",
};

export const PUBLISHER = {
  name: "Citizen of Nowhere",
  url: "https://citizenofnowhere.substack.com",
};

export const DATASET_KEYWORDS = [
  "global city rankings",
  "metropolitan areas",
  "urban index",
  "city power score",
  "sports business markets",
  "location intelligence",
  "world cities",
  "metro power rankings",
];

export const DIMENSION_KEYS = [
  "Population",
  "Market Capitalization",
  "Major League Teams and Venues",
  "Minor and College Teams",
  "Cultural and Civic Assets",
  "Top-50 Universities",
  "Other Research Institutions",
  "Metro Transit",
  "GaWC Global Connectivity",
  "Suburban Rail",
  "Intercity Train Hubs",
  "Skyscrapers",
  "Airport Score",
  "Major Sporting Events",
  "Annual Cultural Events",
  "Michelin and Luxury Hospitality",
];

/**
 * Schema.org Dataset describing the ranking corpus itself.
 * Emitted on the homepage and /#methodology section.
 */
export function datasetJsonLd(opts: { lastUpdate: string; metroCount: number }) {
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: SITE_NAME,
    alternateName: "GMPR",
    description:
      "A composite ranking of every metropolitan area on Earth. 4,200+ metros, 237 countries, 16 dimensions, 70,000+ individually verified parameters. Hand-curated over three years.",
    url: BASE_URL,
    identifier: BASE_URL,
    keywords: DATASET_KEYWORDS,
    // The composite ranking, scores, and methodology are released under CC-BY
    // 4.0 by the author. Underlying source data (CWUR, GaWC, CTBUH, UEFA,
    // TEA/AECOM, Michelin Guide, etc.) remains the property of its respective
    // rights holders and is not redistributed here.
    license: "https://creativecommons.org/licenses/by/4.0/",
    usageInfo: `${BASE_URL}/#methodology`,
    isAccessibleForFree: true,
    conditionsOfAccess:
      "The composite ranking, scores, and methodology are released by the author under CC-BY 4.0. Underlying third-party source data (including but not limited to CWUR, GaWC, CTBUH, UEFA, TEA/AECOM, and the Michelin Guide) is not redistributed and remains the property of its respective rights holders.",
    inLanguage: "en",
    dateModified: opts.lastUpdate,
    datePublished: "2026-04-10",
    version: "0.1",
    creator: {
      "@type": "Person",
      name: AUTHOR.name,
      email: AUTHOR.email,
      url: AUTHOR.url,
    },
    publisher: {
      "@type": "Organization",
      name: PUBLISHER.name,
      url: PUBLISHER.url,
    },
    variableMeasured: DIMENSION_KEYS.map((k) => ({
      "@type": "PropertyValue",
      name: k,
    })),
    measurementTechnique:
      "Composite index: sixteen weighted terms combining linear, logarithmic, and capped scaling across population, finance, sport, culture, education, transit, connectivity, infrastructure, and hospitality.",
    distribution: [
      {
        "@type": "DataDownload",
        encodingFormat: "application/json",
        contentUrl: `${BASE_URL}/data/metros.json`,
      },
      {
        "@type": "DataDownload",
        encodingFormat: "application/json",
        contentUrl: `${BASE_URL}/data/regions.json`,
      },
    ],
    spatialCoverage: {
      "@type": "Place",
      name: "Global (237 countries)",
    },
    citation:
      "Dharmadhikari, A. (2026). Global Metro Power Rankings. Citizen of Nowhere.",
  };
}

/**
 * Schema.org ItemList of ranked metros. Used for the Top 100 on the homepage.
 */
export function itemListJsonLd(
  metros: Array<{ rank: number; name: string; slug: string; country: string }>,
  listName = "Top 100 Global Metros",
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: listName,
    numberOfItems: metros.length,
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    itemListElement: metros.map((m) => ({
      "@type": "ListItem",
      position: m.rank,
      url: `${BASE_URL}/rankings/${m.slug}`,
      name: `${m.name}, ${m.country}`,
    })),
  };
}

/**
 * Schema.org Place + aggregateRating for a single metro.
 * Score is expressed on a 0-to-180 scale (roughly the live distribution).
 */
export function placeJsonLd(opts: {
  name: string;
  country: string;
  region: string;
  slug: string;
  rank: number;
  score: number;
  pop: number;
  lat?: number;
  lon?: number;
  bestScore?: number;
}) {
  const bestScore = opts.bestScore ?? 180;
  const url = `${BASE_URL}/rankings/${opts.slug}`;

  return {
    "@context": "https://schema.org",
    "@type": ["Place", "AdministrativeArea"],
    name: opts.name,
    url,
    identifier: url,
    description: `${opts.name}, ${opts.country}. Rank #${opts.rank} in the Global Metro Power Rankings, scoring ${opts.score.toFixed(1)} across 16 dimensions covering finance, culture, sport, education, and infrastructure.`,
    address: {
      "@type": "PostalAddress",
      addressCountry: opts.country,
      addressRegion: opts.region,
    },
    ...(opts.lat && opts.lon
      ? {
          geo: {
            "@type": "GeoCoordinates",
            latitude: opts.lat,
            longitude: opts.lon,
          },
        }
      : {}),
    additionalProperty: [
      {
        "@type": "PropertyValue",
        name: "Population",
        value: opts.pop,
      },
      {
        "@type": "PropertyValue",
        name: "Global rank",
        value: opts.rank,
      },
      {
        "@type": "PropertyValue",
        name: "World region",
        value: opts.region,
      },
    ],
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: opts.score.toFixed(1),
      bestRating: bestScore,
      worstRating: 0,
      ratingCount: 1,
      reviewCount: 1,
    },
    isPartOf: {
      "@type": "Dataset",
      name: SITE_NAME,
      url: BASE_URL,
    },
  };
}

/**
 * Wrap a JSON-LD object for safe inline <script> emission.
 * Prevents </script> injection if any string contains the literal tag.
 */
export function serializeJsonLd(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}
