import type { MetadataRoute } from "next";
import { getAllMetros } from "@/lib/data";
import { getLiveBadgeSlugs } from "@/lib/badges";
import { getAllCountrySlugs } from "@/lib/countries";
import { BASE_URL } from "@/lib/seo";

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

  return [
    ...staticEntries,
    ...badgeEntries,
    ...countryEntries,
    ...metroEntries,
    ...matchupEntries,
  ];
}
