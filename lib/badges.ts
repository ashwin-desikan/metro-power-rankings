// Badges layer. Each badge is a categorical lens over the existing metros
// dataset — no new data ingestion. Each live badge becomes an indexable
// long-tail destination that reframes the same data through a different
// question. See BACKLOG.md "Badges layer" for the full design spec.

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { getAllMetros } from "./data";
import type { Metro } from "./shared";

// ---------- Types ----------

export type BadgeStatus = "live" | "coming-soon";

export type BadgeTier = {
  slug: string;
  name: string;
  description: string;
  accentHex: string;
};

export type QualifyingMetro = {
  slug: string;
  name: string;
  country: string;
  rank: number;
  score: number;
  contextValue: number;
  contextLabel: string;
  tier?: string;
};

export type Badge = {
  slug: string;
  name: string;
  emoji: string;
  shortDesc: string;
  longDesc: string;
  methodologyAnchor?: string;
  status: BadgeStatus;
  tiers?: BadgeTier[];
  compute?: () => QualifyingMetro[];
};

// ---------- Helpers ----------

function loadCsv(relPath: string): Record<string, string>[] {
  const path = join(process.cwd(), relPath);
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf-8");
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ""; });
    return row;
  });
}

// Memoize the metro index so getAllMetros isn't re-walked per compute call.
let _metroIndex: { bySlug: Map<string, Metro>; byName: Map<string, Metro> } | null = null;
function getMetroIndex() {
  if (_metroIndex) return _metroIndex;
  const bySlug = new Map<string, Metro>();
  const byName = new Map<string, Metro>();
  for (const m of getAllMetros()) {
    bySlug.set(m.slug, m);
    byName.set(m.name, m);
  }
  _metroIndex = { bySlug, byName };
  return _metroIndex;
}

function computeFromCsv(csvPath: string, valueColumn: string, contextLabel: string): QualifyingMetro[] {
  const csv = loadCsv(csvPath);
  const { bySlug } = getMetroIndex();
  const out: QualifyingMetro[] = [];
  for (const row of csv) {
    const meta = bySlug.get(row.slug);
    const value = parseFloat(row[valueColumn]);
    if (!meta || isNaN(value)) continue;
    out.push({
      slug: meta.slug, name: meta.name, country: meta.country,
      rank: meta.rank, score: meta.score,
      contextValue: value, contextLabel,
      tier: row.tier || undefined,
    });
  }
  out.sort((a, b) => b.contextValue - a.contextValue);
  return out;
}

// ---------- Live computes ----------

function computeUniversityTown(): QualifyingMetro[] {
  const csv = loadCsv("public/data/academic-gravity-wells.csv");
  const { bySlug, byName } = getMetroIndex();
  const out: QualifyingMetro[] = [];
  for (const row of csv) {
    const meta = bySlug.get(row.slug) || byName.get(row.name);
    const share = parseFloat(row.uni_share_pct);
    if (!meta || isNaN(share)) continue;
    out.push({
      slug: meta.slug, name: meta.name, country: meta.country,
      rank: meta.rank, score: meta.score,
      contextValue: share, contextLabel: "University share",
      tier: row.tier,
    });
  }
  out.sort((a, b) => b.contextValue - a.contextValue);
  return out;
}

function computeSkylineCity(): QualifyingMetro[] {
  const csv = loadCsv("public/data/skyline-cities.csv");
  const { bySlug, byName } = getMetroIndex();
  const out: QualifyingMetro[] = [];
  for (const row of csv) {
    const meta = bySlug.get(row.slug) || byName.get(row.name);
    const share = parseFloat(row.sky_share_pct);
    if (!meta || isNaN(share)) continue;
    out.push({
      slug: meta.slug, name: meta.name, country: meta.country,
      rank: meta.rank, score: meta.score,
      contextValue: share, contextLabel: "Skyscraper share",
      tier: row.tier,
    });
  }
  out.sort((a, b) => b.contextValue - a.contextValue);
  return out;
}

function computeMegacity(): QualifyingMetro[] {
  return getAllMetros()
    .filter((m) => (m.pop ?? 0) >= 5_000_000)
    .map((m) => ({
      slug: m.slug, name: m.name, country: m.country,
      rank: m.rank, score: m.score,
      contextValue: m.pop, contextLabel: "Population",
    }))
    .sort((a, b) => b.contextValue - a.contextValue);
}

function computeGlobalGateway() { return computeFromCsv("public/data/global-gateway.csv", "airport_score", "Airport score"); }
function computeFinanceCapital() { return computeFromCsv("public/data/finance-capital.csv", "marketCap", "Market cap (USD)"); }
function computeCultureCapital() { return computeFromCsv("public/data/culture-capital.csv", "culture_score", "Culture composite"); }
function computeSportsMecca() { return computeFromCsv("public/data/sports-mecca.csv", "sports_score", "Sports composite"); }
function computeRailHub() { return computeFromCsv("public/data/rail-hub.csv", "rail_score", "Rail composite"); }
function computeOverperformer() { return computeFromCsv("public/data/overperformer.csv", "multiple", "Pop-rank to score-rank multiple"); }

// ---------- Tier registries ----------

const UNIVERSITY_TOWN_TIERS: BadgeTier[] = [
  { slug: "A", name: "Tier A — Pure gravity well", description: "Universities contribute 80% or more of the composite. The university IS the city.", accentHex: "#7c3aed" },
  { slug: "B", name: "Tier B — University-defined", description: "Universities contribute 65 to 80% of the composite. The university is most of what the city is.", accentHex: "#7B68EE" },
  { slug: "C", name: "Tier C — University-anchored", description: "Universities contribute 50 to 65% of the composite. The university is the largest single contributor.", accentHex: "#4ECDC4" },
  { slug: "D", name: "Tier D — University-leading", description: "Universities contribute 40 to 50% of the composite. The university is the #1 dimension; the metro has a real second leg.", accentHex: "#82E0AA" },
];

const SKYLINE_CITY_TIERS: BadgeTier[] = [
  { slug: "A", name: "Tier A — Skyline IS the city", description: "Skyscrapers contribute 80% or more of the composite. In most cases this is municipal-debt-driven vertical construction, not organic urban density.", accentHex: "#E74C3C" },
  { slug: "B", name: "Tier B — Skyline-defined", description: "Skyscrapers contribute 65 to 80% of the composite. The skyline is most of what the city is.", accentHex: "#FF8C42" },
  { slug: "C", name: "Tier C — Skyline-anchored", description: "Skyscrapers contribute 50 to 65% of the composite. The vertical buildup is the largest single contributor.", accentHex: "#F0B27A" },
  { slug: "D", name: "Tier D — Skyline-leading", description: "Skyscrapers contribute 40 to 50% of the composite. The skyline is the #1 dimension; the metro has a meaningful second leg.", accentHex: "#F7DC6F" },
];

// ---------- Badge registry ----------

export const BADGES: Badge[] = [
  {
    slug: "university-town", name: "University Town", emoji: "🎓",
    shortDesc: "Cities where one university dominates the score.",
    longDesc: "Metros where the universities dimension is the single largest contributor to the composite score. Includes the pure gravity wells (Uppsala, Leiden, Göttingen) where the university accounts for 80% or more, alongside the diversified university cities where the institution is the anchor without being the entirety. Drawn from the Academic Gravity Wells analysis.",
    methodologyAnchor: "#universities", status: "live", tiers: UNIVERSITY_TOWN_TIERS, compute: computeUniversityTown,
  },
  {
    slug: "skyline-city", name: "Skyline City", emoji: "🏙️",
    shortDesc: "Cities where skyscrapers dominate the entire score.",
    longDesc: "Metros where the skyscrapers dimension is the single largest contributor to the composite score. Some entries reflect organic vertical density (a finance or tourism economy that built upward to match its capital). Most reflect municipal-debt-driven vertical construction outpacing every other dimension of urban infrastructure: second- and third-tier Chinese cities, Gulf marble capitals, tower-tourism enclaves where the skyline is the city. Drawn from the 85% Illusion analysis.",
    methodologyAnchor: "#skyscrapers", status: "live", tiers: SKYLINE_CITY_TIERS, compute: computeSkylineCity,
  },
  {
    slug: "megacity", name: "Megacity", emoji: "🌆",
    shortDesc: "Metros above 5 million population.",
    longDesc: "The conventional 5-million-plus threshold for a megacity. Population alone does not produce score dominance in the composite ranking, but it does set the stage for every other dimension to compound. Sorted by metro population.",
    methodologyAnchor: "#population", status: "live", compute: computeMegacity,
  },
  {
    slug: "global-gateway", name: "Global Gateway", emoji: "✈️",
    shortDesc: "The 100 metros with the strongest airport infrastructure.",
    longDesc: "Metros that lead the world on the airport dimension, a composite of passenger traffic, intercontinental connectivity, and hub capacity. Top 100 by airport score, ranging from London and New York at the apex down through the regional gateways that anchor a continent's air network.",
    methodologyAnchor: "#airport-score", status: "live", compute: computeGlobalGateway,
  },
  {
    slug: "finance-capital", name: "Finance Capital", emoji: "💼",
    shortDesc: "The 100 metros with the largest listed-company market cap.",
    longDesc: "Metros where the public-equity market capitalization of headquartered companies is highest. Captures the gravitational centers of global capital: San Francisco-San Jose at the top, then New York, Seattle, Beijing, Tokyo, London, Paris. Sorted by total market cap of companies headquartered in the metro.",
    methodologyAnchor: "#market-cap", status: "live", compute: computeFinanceCapital,
  },
  {
    slug: "culture-capital", name: "Culture Capital", emoji: "🎭",
    shortDesc: "The 100 metros with the deepest cultural infrastructure.",
    longDesc: "Metros that lead on the combined cultural dimensions: cultural events (festivals, fairs, biennales), museums and landmarks, and luxury hospitality (Michelin-starred dining, Forbes Travel Guide hotels). London leads on every component; Paris and New York follow. The list also surfaces the unexpected (Macau, Dubai-Sharjah) where the cultural infrastructure is the product of recent and deliberate investment.",
    methodologyAnchor: "#cultural-events", status: "live", compute: computeCultureCapital,
  },
  {
    slug: "sports-mecca", name: "Sports Mecca", emoji: "🏟️",
    shortDesc: "The 100 metros with the densest professional sports presence.",
    longDesc: "Metros that lead on the combined sports dimensions: major league teams (weighted double), total professional teams across all leagues, and major sporting events hosted (weighted triple). Captures the cities where sport is part of the civic identity, from London at the top through to the second-tier metros that punch above their weight on a single league.",
    methodologyAnchor: "#major-league-teams", status: "live", compute: computeSportsMecca,
  },
  {
    slug: "rail-hub", name: "Rail Hub", emoji: "🚆",
    shortDesc: "The 100 metros with the most extensive rail infrastructure.",
    longDesc: "Metros that lead on the combined rail dimensions: metro stations (subway/MRT), suburban stations (commuter rail, weighted half), and intercity train hubs (weighted 5x for the network-effect value). Tokyo leads at over a thousand composite points, followed by London, Shanghai, Guangzhou, Toronto, Osaka-Kyoto-Kobe, Rhine-Ruhr.",
    methodologyAnchor: "#metro-stations", status: "live", compute: computeRailHub,
  },
  {
    slug: "overperformer", name: "Overperformer", emoji: "📈",
    shortDesc: "Score rank punches well above population rank.",
    longDesc: "Metros where the composite score sits much higher than the population rank: concentrated capital, talent, or institutional gravity that does not require scale. San Francisco-San Jose punches 17.6x above its weight, London 14.5x, New York 14.0x. The list also surfaces less-obvious overperformers like Monaco, Macau, Geneva, Edinburgh — cities where a small population supports an outsized footprint of capital, institutions, or both. Top 100 by pop-rank-to-score-rank multiple.",
    methodologyAnchor: "#population", status: "live", compute: computeOverperformer,
  },
  {
    slug: "twin-metros", name: "Twin Metros", emoji: "🔗",
    shortDesc: "Within commuting reach of another top-500 metro.",
    longDesc: "Metros that sit within a defined distance of another top-500 metro, sharing a labor market and often a polycentric economy. Coming soon.",
    status: "coming-soon",
  },
  {
    slug: "isolated-capital", name: "Isolated Capital", emoji: "🏔️",
    shortDesc: "No top-500 metro within commuting reach.",
    longDesc: "Metros that are geographically isolated from any peer in the top 500. The opposite of Twin Metros. Coming soon.",
    status: "coming-soon",
  },
];

// ---------- Public API with memoization ----------

export function getAllBadges(): Badge[] { return BADGES; }
export function getLiveBadges(): Badge[] { return BADGES.filter((b) => b.status === "live"); }
export function getBadge(slug: string): Badge | undefined { return BADGES.find((b) => b.slug === slug); }
export function getLiveBadgeSlugs(): string[] { return getLiveBadges().map((b) => b.slug); }

// Memoize each badge's compute() so repeated calls don't re-read CSVs and
// rebuild Maps. During a Vercel build with 4,284 metro page renders, this
// drops badge work from O(badges × metros²) to O(badges × metros).
const _qualifyingCache = new Map<string, QualifyingMetro[]>();

export function getQualifyingMetros(badge: Badge): QualifyingMetro[] {
  if (badge.status !== "live" || !badge.compute) return [];
  const cached = _qualifyingCache.get(badge.slug);
  if (cached) return cached;
  const list = badge.compute();
  _qualifyingCache.set(badge.slug, list);
  return list;
}

export type BadgeForMetro = { badge: Badge; qualifying: QualifyingMetro };

// Lazy-built inverted index: metroSlug -> BadgeForMetro[]. Built once on
// first call to getBadgesForMetro and reused for the rest of the process.
let _badgesByMetro: Map<string, BadgeForMetro[]> | null = null;

function buildBadgesByMetroIndex(): Map<string, BadgeForMetro[]> {
  const idx = new Map<string, BadgeForMetro[]>();
  for (const badge of getLiveBadges()) {
    if (!badge.compute) continue;
    const list = getQualifyingMetros(badge);
    for (const qualifying of list) {
      const arr = idx.get(qualifying.slug);
      if (arr) arr.push({ badge, qualifying });
      else idx.set(qualifying.slug, [{ badge, qualifying }]);
    }
  }
  for (const arr of idx.values()) {
    arr.sort((a, b) => {
      const aTiered = a.badge.tiers ? 1 : 0;
      const bTiered = b.badge.tiers ? 1 : 0;
      return bTiered - aTiered;
    });
  }
  return idx;
}

export function getBadgesForMetro(metroSlug: string): BadgeForMetro[] {
  if (!_badgesByMetro) _badgesByMetro = buildBadgesByMetroIndex();
  return _badgesByMetro.get(metroSlug) ?? [];
}
