// Shared comparison logic for the /compare page and the MCP server's
// compare_metros tool, so both read from a single source of truth.

import { getMetroDetail, type MetroDetail } from "./data";

export const MAX_COMPARE_METROS = 4;

export const DIMENSION_ORDER: { key: string; label: string; group: string }[] = [
  { key: "marketCap", label: "Market Cap", group: "Economy" },
  { key: "companies", label: "Major Companies", group: "Economy" },
  { key: "majorLeagueTeams", label: "Major League Teams/Venues", group: "Sports" },
  { key: "totalTeams", label: "Total Teams", group: "Sports" },
  { key: "majorSportingEvents", label: "Major Sporting Events", group: "Sports" },
  { key: "universities", label: "Universities", group: "Education" },
  { key: "topUniHospResearch", label: "Top Universities, Hospitals, & Research", group: "Education" },
  { key: "culturalEvents", label: "Annual Cultural Events", group: "Culture" },
  { key: "museumsLandmarks", label: "Notable Museums & Landmarks", group: "Culture" },
  { key: "luxuryStars", label: "Michelin & Luxury Stars", group: "Culture" },
  { key: "airportScore", label: "Airport Score", group: "Notable Infrastructure" },
  { key: "portsExchangesInfra", label: "Ports, Exchanges, Infra", group: "Notable Infrastructure" },
  { key: "metroStations", label: "Metro Stations", group: "Notable Infrastructure" },
  { key: "suburbStations", label: "Commuter Rail", group: "Notable Infrastructure" },
  { key: "trainHubs", label: "Intercity Train Hubs", group: "Notable Infrastructure" },
  { key: "skyscrapers", label: "Skyscrapers (150m+)", group: "Notable Infrastructure" },
];

function parseRank(rankStr: string | null | undefined): number {
  if (!rankStr) return Infinity;
  const clean = rankStr.replace(/^T-/, "");
  const n = parseInt(clean, 10);
  return Number.isFinite(n) ? n : Infinity;
}

export function computeWinners(details: MetroDetail[]): Record<string, Set<string>> {
  const winners: Record<string, Set<string>> = {};
  if (details.length < 2) return winners;
  for (const { key } of DIMENSION_ORDER) {
    let bestRank = Infinity;
    for (const d of details) {
      const r = parseRank(d.dimRanks?.[key]);
      if (r < bestRank) bestRank = r;
    }
    if (!Number.isFinite(bestRank)) continue;
    const set = new Set<string>();
    for (const d of details) {
      if (parseRank(d.dimRanks?.[key]) === bestRank) set.add(d.metro.slug);
    }
    winners[key] = set;
  }
  return winners;
}

export function normalizeCompareSlugs(raw: string[]): string[] {
  const cleaned = raw.map((s) => s.trim().toLowerCase()).filter(Boolean);
  return Array.from(new Set(cleaned)).slice(0, MAX_COMPARE_METROS);
}

export interface CompareMetroRow {
  slug: string;
  name: string;
  country: string;
  rank: number;
  score: number;
  pop: number;
  gdp: number;
}

export interface CompareDimensionRow {
  key: string;
  label: string;
  group: string;
  values: Record<string, { value: number | null; rank: string | null; isWinner: boolean }>;
}

export interface CompareResult {
  metros: CompareMetroRow[];
  dimensions: CompareDimensionRow[];
  missing: string[];
}

// The MCP-facing (and reusable) entry point: given up to MAX_COMPARE_METROS
// slugs, returns a plain-data comparison across all sixteen dimensions.
export function compareMetros(rawSlugs: string[]): CompareResult {
  const slugs = normalizeCompareSlugs(rawSlugs);
  const details: MetroDetail[] = [];
  const missing: string[] = [];
  for (const slug of slugs) {
    const d = getMetroDetail(slug);
    if (d) details.push(d);
    else missing.push(slug);
  }

  const winners = computeWinners(details);

  const metros: CompareMetroRow[] = details.map((d) => ({
    slug: d.metro.slug,
    name: d.metro.name,
    country: d.metro.country,
    rank: d.metro.rank,
    score: d.metro.score,
    pop: d.metro.pop,
    gdp: d.metro.gdp,
  }));

  const dimensions: CompareDimensionRow[] = DIMENSION_ORDER.map((dim) => ({
    key: dim.key,
    label: dim.label,
    group: dim.group,
    values: Object.fromEntries(
      details.map((d) => {
        const raw = d.metro.dims?.[dim.key];
        return [
          d.metro.slug,
          {
            value: typeof raw === "number" ? raw : null,
            rank: d.dimRanks?.[dim.key] ?? null,
            isWinner: winners[dim.key]?.has(d.metro.slug) ?? false,
          },
        ];
      }),
    ),
  }));

  return { metros, dimensions, missing };
}
