import type { MetadataRoute } from "next";
import { getAllMetros } from "@/lib/data";
import { getLiveBadgeSlugs } from "@/lib/badges";
import { getAllCountrySlugs } from "@/lib/countries";
import { getAllCompSlugs } from "@/lib/championsHistory";
import { competitionHasHub } from "@/lib/competitionLinks";
import { getStateSlugsWithMetros } from "@/lib/states";
import { MARKET_PAGE_SLUGS } from "@/lib/marketPages";
import { CURRENCY_PAGE_CODES } from "@/lib/currencyPages";
import { getAllFranchiseSlugs as getNflSlugs } from "@/lib/nfl";
import { getAllFranchiseSlugs as getNbaSlugs } from "@/lib/nba";
import { getAllFranchiseSlugs as getMlbSlugs } from "@/lib/mlb";
import { getAllFranchiseSlugs as getNhlSlugs } from "@/lib/nhl";
import { BASE_URL } from "@/lib/seo";
import { getOlympicEditionsIndex } from "@/lib/olympics";

// Read lastUpdate from meta.json to stamp sitemap entries.
import { readFileSync } from "fs";
import { join } from "path";

function lastUpdateIso(): string {
  try {
    const raw = readFileSync(
      join(process.cwd(), "public", "data", "meta.json"),
      "utf-8",
    );
    const meta = JSON.parse(raw) as { lastUpdate?: string };
    if (meta.lastUpdate) return new Date(meta.lastUpdate).toISOString();
  } catch {}
  return new Date().toISOString();
}

export default function sitemap(): MetadataRoute.Sitemap {
  const stamp = lastUpdateIso();
  const metros = getAllMetros();

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${BASE_URL}/`,
      lastModified: stamp,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/methodology`,
      lastModified: stamp,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/#regions`,
      lastModified: stamp,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/compare`,
      lastModified: stamp,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/neighborhoods`,
      lastModified: stamp,
      changeFrequency: "monthly",
      priority: 0.85,
    },
    {
      url: `${BASE_URL}/top-teams`,
      lastModified: stamp,
      changeFrequency: "monthly",
      priority: 0.85,
    },
    {
      url: `${BASE_URL}/sports`,
      lastModified: stamp,
      changeFrequency: "weekly",
      priority: 0.85,
    },
    {
      url: `${BASE_URL}/sports/games`,
      lastModified: stamp,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/teams/nfl`,
      lastModified: stamp,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/teams/nba`,
      lastModified: stamp,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/teams/mlb`,
      lastModified: stamp,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/teams/nhl`,
      lastModified: stamp,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/teams/nfl/historical`,
      lastModified: stamp,
      changeFrequency: "monthly",
      priority: 0.55,
    },
    {
      url: `${BASE_URL}/teams/nba/historical`,
      lastModified: stamp,
      changeFrequency: "monthly",
      priority: 0.55,
    },
    {
      url: `${BASE_URL}/teams/mlb/historical`,
      lastModified: stamp,
      changeFrequency: "monthly",
      priority: 0.55,
    },
    {
      url: `${BASE_URL}/teams/nhl/historical`,
      lastModified: stamp,
      changeFrequency: "monthly",
      priority: 0.55,
    },
    {
      url: `${BASE_URL}/badges`,
      lastModified: stamp,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/countries`,
      lastModified: stamp,
      changeFrequency: "monthly",
      priority: 0.85,
    },
    {
      url: `${BASE_URL}/updates`,
      lastModified: stamp,
      changeFrequency: "weekly",
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/activity`,
      lastModified: stamp,
      changeFrequency: "daily",
      priority: 0.4,
    },
    {
      url: `${BASE_URL}/about`,
      lastModified: stamp,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];

  const badgeEntries: MetadataRoute.Sitemap = getLiveBadgeSlugs().map(
    (slug) => ({
      url: `${BASE_URL}/badges/${slug}`,
      lastModified: stamp,
      changeFrequency: "monthly",
      priority: 0.75,
    }),
  );

  const countryEntries: MetadataRoute.Sitemap = getAllCountrySlugs().map(
    (slug) => ({
      url: `${BASE_URL}/countries/${slug}`,
      lastModified: stamp,
      changeFrequency: "monthly",
      priority: 0.6,
    }),
  );

  const metroEntries: MetadataRoute.Sitemap = metros.map((m) => ({
    url: `${BASE_URL}/rankings/${m.slug}`,
    lastModified: stamp,
    changeFrequency: "monthly",
    // Top-ranked metros get higher priority to signal canonical authority.
    priority:
      m.rank <= 25 ? 0.9 : m.rank <= 100 ? 0.7 : m.rank <= 500 ? 0.5 : 0.3,
  }));

  // Matchup pages: pre-rendered for the top 25 metros (300 unique pairs).
  // Mirrors the static set generated at build time by app/matchups/[slug].
  const top25Slugs = metros
    .filter((m) => m.rank > 0 && m.rank <= 25)
    .map((m) => m.slug);
  const matchupEntries: MetadataRoute.Sitemap = [];
  for (let i = 0; i < top25Slugs.length; i++) {
    for (let j = i + 1; j < top25Slugs.length; j++) {
      const [a, b] =
        top25Slugs[i] < top25Slugs[j]
          ? [top25Slugs[i], top25Slugs[j]]
          : [top25Slugs[j], top25Slugs[i]];
      matchupEntries.push({
        url: `${BASE_URL}/matchups/${a}-vs-${b}`,
        lastModified: stamp,
        changeFrequency: "monthly",
        priority: 0.7,
      });
    }
  }

  // Per-state pages. Only states that have at least one tracked metro get
  // indexed; pure admin-only rows are excluded by getStateSlugsWithMetros.
  const stateEntries: MetadataRoute.Sitemap = getStateSlugsWithMetros().map(
    (slug) => ({
      url: `${BASE_URL}/states/${slug}`,
      lastModified: stamp,
      changeFrequency: "monthly",
      priority: 0.55,
    }),
  );

  // Per-franchise team pages across the four leagues. Each franchise gets
  // its own /teams/{league}/{slug} entry. Priority slightly below metro
  // detail pages, since each team also surfaces inside the metro graph.
  const franchiseEntries: MetadataRoute.Sitemap = [
    ...getNflSlugs().map((slug) => ({
      url: `${BASE_URL}/teams/nfl/${slug}`,
      lastModified: stamp,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...getNbaSlugs().map((slug) => ({
      url: `${BASE_URL}/teams/nba/${slug}`,
      lastModified: stamp,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...getMlbSlugs().map((slug) => ({
      url: `${BASE_URL}/teams/mlb/${slug}`,
      lastModified: stamp,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...getNhlSlugs().map((slug) => ({
      url: `${BASE_URL}/teams/nhl/${slug}`,
      lastModified: stamp,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];

  const olympicsEntries: MetadataRoute.Sitemap = [
    {
      url: `${BASE_URL}/teams/olympics`,
      lastModified: stamp,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    ...getOlympicEditionsIndex().map((e) => ({
      url: `${BASE_URL}/teams/olympics/games/${e.slug}`,
      lastModified: stamp,
      changeFrequency: "yearly" as const,
      priority: 0.55,
    })),
  ];

  const championsEntries: MetadataRoute.Sitemap = [
    {
      url: `${BASE_URL}/sports/champions`,
      lastModified: stamp,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...getAllCompSlugs().filter((slug) => !competitionHasHub(slug)).map((slug) => ({
      url: `${BASE_URL}/sports/champions/${slug}`,
      lastModified: stamp,
      changeFrequency: "monthly" as const,
      priority: 0.55,
    })),
  ];

  // Business of the Metros. The whole hub was missing from the sitemap until
  // 2026-08-13 - not just the new market pages but Overview, Companies, Owners,
  // Currencies and the twenty currency charts, none of which were ever
  // submitted. Added here as one block so a new board is one line, not a
  // rediscovery of the same gap.
  const businessTabs = [
    "", "/companies", "/private", "/sp500", "/owners",
    "/markets", "/markets/compare", "/currencies", "/leaders", "/crossovers",
  ];
  const businessEntries: MetadataRoute.Sitemap = [
    ...businessTabs.map((t) => ({
      url: `${BASE_URL}/business${t}`,
      lastModified: stamp,
      changeFrequency: "daily" as const,
      priority: t === "" ? 0.8 : 0.7,
    })),
    ...MARKET_PAGE_SLUGS.map((slug) => ({
      url: `${BASE_URL}/business/markets/${slug}`,
      lastModified: stamp,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
    ...CURRENCY_PAGE_CODES.map((code) => ({
      url: `${BASE_URL}/business/currencies/${code}`,
      lastModified: stamp,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
  ];

  return [
    ...staticEntries,
    ...businessEntries,
    ...championsEntries,
    ...olympicsEntries,
    ...badgeEntries,
    ...countryEntries,
    ...stateEntries,
    ...franchiseEntries,
    ...metroEntries,
    ...matchupEntries,
  ];
}
