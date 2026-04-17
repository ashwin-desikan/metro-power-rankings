import type { MetadataRoute } from "next";
import { getAllMetros } from "@/lib/data";
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
      url: `${BASE_URL}/#methodology`,
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
  ];

  const metroEntries: MetadataRoute.Sitemap = metros.map((m) => ({
    url: `${BASE_URL}/rankings/${m.slug}`,
    lastModified: stamp,
    changeFrequency: "monthly",
    // Top-ranked metros get higher priority to signal canonical authority.
    priority:
      m.rank <= 25 ? 0.9 : m.rank <= 100 ? 0.7 : m.rank <= 500 ? 0.5 : 0.3,
  }));

  return [...staticEntries, ...metroEntries];
}
