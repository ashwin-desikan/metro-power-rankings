// Site-wide SEO constants and JSON-LD helpers.
// Keep BASE_URL in sync with the deployed domain (and update when moving
// to a custom domain such as metropowerrankings.com).

export const BASE_URL = "https://rankings.citizenofnowhere.org";

export const SITE_NAME = "Global Metro Power Rankings";

export const AUTHOR = {
  name: "Ashwin Desikan",
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
      "A composite ranking of every metropolitan area on Earth, across sixteen dimensions, hand-curated from individually verified parameters over years.",
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
      name: "Global",
    },
    citation:
      "Desikan, A. (2026). Global Metro Power Rankings. Citizen of Nowhere.",
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
 * Schema.org Place for a single metro.
 * The GMPR composite score is expressed as a PropertyValue in
 * additionalProperty (not AggregateRating, which Google only honors on
 * parent types like Product/Recipe/LocalBusiness). Score is on a 0-to-180
 * scale (roughly the live distribution).
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
  qid?: string;
  wikipediaUrl?: string;
}) {
  const bestScore = opts.bestScore ?? 180;
  const url = `${BASE_URL}/rankings/${opts.slug}`;

  // sameAs: only emit when at least one external identifier is present. Keep
  // the array free of undefined/empty values so rich-result validators do not
  // flag null entries. QID is converted to a full Wikidata entity URL.
  const sameAs: string[] = [];
  if (opts.qid) sameAs.push(`https://www.wikidata.org/entity/${opts.qid}`);
  if (opts.wikipediaUrl) sameAs.push(opts.wikipediaUrl);

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
    ...(sameAs.length ? { sameAs } : {}),
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
      {
        "@type": "PropertyValue",
        name: "GMPR composite score",
        value: Number(opts.score.toFixed(1)),
        minValue: 0,
        maxValue: bestScore,
        unitText: "points",
      },
    ],
    isPartOf: {
      "@type": "Dataset",
      name: SITE_NAME,
      url: BASE_URL,
      description:
        "A composite ranking of every metropolitan area on Earth, across sixteen dimensions, hand-curated from individually verified parameters.",
      creator: {
        "@type": "Person",
        name: AUTHOR.name,
        url: AUTHOR.url,
      },
      license: "https://creativecommons.org/licenses/by/4.0/",
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


/**
 * Schema.org SportsTeam for a professional franchise.
 * Emitted per team on metro detail pages when a Wikidata QID or Wikipedia URL
 * is present. Deliberately minimal: just enough to help entity resolvers
 * (Google, LLM crawlers) link our team references back to canonical entities.
 *
 * League maps to Schema.org SportsOrganization via `memberOf`. Metro is
 * referenced by slug so the team graph connects back to the Place object on
 * the same page.
 */
export function sportsTeamJsonLd(opts: {
  name: string;
  sport: string;
  league: string;
  metroName: string;
  metroSlug: string;
  qid?: string;
  wikipediaUrl?: string;
  // Optional canonical URL for the franchise page (e.g. /teams/nfl/{slug}).
  // When present the schema treats the franchise page as the canonical
  // SportsTeam entity URL; when absent the schema is fragment-shaped and
  // assumes it is being co-emitted on the metro Place page.
  url?: string;
  // Optional founding year, surfaced when known. ISO date string preferred,
  // but a bare year (e.g. "1899") is acceptable per schema.org guidance.
  foundingYear?: number | string;
}) {
  const sameAs: string[] = [];
  if (opts.qid) sameAs.push(`https://www.wikidata.org/entity/${opts.qid}`);
  if (opts.wikipediaUrl) sameAs.push(opts.wikipediaUrl);

  return {
    "@context": "https://schema.org",
    "@type": "SportsTeam",
    name: opts.name,
    ...(opts.url ? { url: opts.url, identifier: opts.url } : {}),
    sport: opts.sport,
    memberOf: {
      "@type": "SportsOrganization",
      name: opts.league,
    },
    location: {
      "@type": "Place",
      name: opts.metroName,
      url: `${BASE_URL}/rankings/${opts.metroSlug}`,
    },
    ...(opts.foundingYear ? { foundingDate: String(opts.foundingYear) } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };
}

export const SOUND_URL = `${BASE_URL}/sound`;

export const SOUND_KEYWORDS = [
  "music by metro",
  "artist hometowns",
  "Billboard Hot 100",
  "UK Singles Chart",
  "number-one singles by city",
  "pop music geography",
  "Grammy prestige by metro",
  "chart history",
];

export const SOUND_DIMENSIONS = [
  "Top-ten chart entries by metro",
  "Number-one singles by metro",
  "Chart points by artist hometown",
  "Grammy prestige by metro",
  "Velvet Rock production affinity",
  "Decade-by-decade metro dominance",
];

/**
 * Schema.org Dataset for the "Sound of the Metros" pillar: chart top-ten
 * success attributed to artists' hometown metros. This is a distinct corpus
 * from the composite metro ranking, so it gets its own Dataset node — its own
 * URL, its own distributions, and its own `dateModified` taken from the
 * pillar's `public/data/sound/summary.json` `generated` stamp (so the markup
 * stays exactly as fresh as the data on every render, no separate upkeep).
 */
export function soundDatasetJsonLd(opts: {
  dateModified: string;
  metros?: number;
  artists?: number;
}) {
  const counts =
    opts.metros && opts.artists
      ? ` Covers ${opts.metros} metros and ${opts.artists} attributed artists.`
      : "";
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "The Sound of the Metros",
    description:
      "Chart top-ten success attributed to artists' hometown metros, across the Billboard Hot 100 and the UK Singles Chart (1958–2026), plus Grammy prestige and record-production geography — aggregated to the metropolitan area." +
      counts,
    url: SOUND_URL,
    identifier: SOUND_URL,
    keywords: SOUND_KEYWORDS,
    // The metro attribution, aggregation, and analysis are the author's, released
    // under CC-BY 4.0. Underlying chart data (Billboard, the Official UK Singles
    // Chart) and Grammy records remain their rights holders' property and are not
    // redistributed — the published files hold only derived metro-level aggregates.
    license: "https://creativecommons.org/licenses/by/4.0/",
    usageInfo: SOUND_URL,
    isAccessibleForFree: true,
    conditionsOfAccess:
      "The metro attribution, aggregation, and analysis are released by the author under CC-BY 4.0. Underlying chart data (Billboard Hot 100, the Official UK Singles Chart) and Grammy records remain the property of their respective rights holders and are not redistributed; the published files contain derived metro-level aggregates only.",
    inLanguage: "en",
    dateModified: opts.dateModified,
    temporalCoverage: "1958-01-01/2026-12-31",
    spatialCoverage: {
      "@type": "Place",
      name: "Global",
    },
    variableMeasured: SOUND_DIMENSIONS.map((k) => ({
      "@type": "PropertyValue",
      name: k,
    })),
    measurementTechnique:
      "Each charting act is attributed to a single canonical hometown metro; top-ten chart runs, number-ones, Grammy prestige, and record-production credits are then aggregated per metro across eras.",
    creator: {
      "@type": "Person",
      name: AUTHOR.name,
      url: AUTHOR.url,
    },
    publisher: {
      "@type": "Organization",
      name: PUBLISHER.name,
      url: PUBLISHER.url,
    },
    isPartOf: {
      "@type": "Dataset",
      name: SITE_NAME,
      url: BASE_URL,
    },
    distribution: [
      {
        "@type": "DataDownload",
        name: "Metro-level aggregates (all lenses)",
        encodingFormat: "application/json",
        contentUrl: `${BASE_URL}/data/sound/metros_unified.json`,
      },
      {
        "@type": "DataDownload",
        name: "Artist-level hometown attributions",
        encodingFormat: "application/json",
        contentUrl: `${BASE_URL}/data/sound/artists.json`,
      },
      {
        "@type": "DataDownload",
        name: "Number-one singles by metro",
        encodingFormat: "application/json",
        contentUrl: `${BASE_URL}/data/sound/metro_number_ones.json`,
      },
      {
        "@type": "DataDownload",
        name: "Decade-by-decade metro dominance",
        encodingFormat: "application/json",
        contentUrl: `${BASE_URL}/data/sound/decades.json`,
      },
    ],
    citation: "Desikan, A. (2026). The Sound of the Metros. Citizen of Nowhere.",
  };
}
