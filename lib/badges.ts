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
  // Isolated Capital: the nearest peer at or above the capital's own rank.
  peerSlug?: string;
  peerName?: string;
  peerCountry?: string;
  peerRank?: number;
  // Twin Metros: the connected-component cluster this metro belongs to.
  cluster?: {
    id: string;
    size: number;
    diameterKm: number;
    // otherSlugs/otherNames exclude the lead; memberSlugs/memberNames include it.
    otherSlugs: string[];
    otherNames: string[];
    memberSlugs: string[];
    memberNames: string[];
  };
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

// Shared helper for the Twin Metros + Megaregions cluster CSVs. Reads any
// cluster CSV that follows the schema written by scripts/generate-distance-
// badges.py (slug, name, country, rank, cluster_id, cluster_size,
// cluster_diameter_km, cluster_member_slugs, cluster_member_names,
// cluster_other_slugs, cluster_other_names, tier).
function computeClustersFromCsv(csvPath: string): QualifyingMetro[] {
  const csv = loadCsv(csvPath);
  const { bySlug } = getMetroIndex();
  // Build one QualifyingMetro per cluster: the cluster's lead (lowest-rank
  // member). The cluster's full member list lives on `cluster.memberSlugs`/
  // `cluster.memberNames`; `otherSlugs`/`otherNames` excludes the lead. The
  // inverted index `buildBadgesByMetroIndex` walks `memberSlugs` so every
  // cluster member still gets a chip on its own metro detail page.
  const leads = new Map<string, { qm: QualifyingMetro; bestRank: number; memberSlugs: string[]; memberNames: string[] }>();
  for (const row of csv) {
    const meta = bySlug.get(row.slug);
    if (!meta) continue;
    const size = parseInt(row.cluster_size, 10);
    const diameter = parseFloat(row.cluster_diameter_km);
    if (isNaN(size) || isNaN(diameter)) continue;
    const cid = row.cluster_id;
    const memberSlugs = row.cluster_member_slugs ? row.cluster_member_slugs.split(";").filter(Boolean) : [meta.slug];
    const memberNames = row.cluster_member_names ? row.cluster_member_names.split(";").filter(Boolean) : [meta.name];
    // Skip if this row isn't the cluster's lead (we'll see it later in another row, or already saw it).
    const existing = leads.get(cid);
    if (existing && meta.rank >= existing.bestRank) continue;
    const otherSlugs = memberSlugs.filter((s) => s !== meta.slug);
    const otherNames = memberNames.filter((_, i) => memberSlugs[i] !== meta.slug);
    const qm: QualifyingMetro = {
      slug: meta.slug, name: meta.name, country: meta.country,
      rank: meta.rank, score: meta.score,
      contextValue: diameter, contextLabel: "Cluster diameter",
      tier: row.tier || undefined,
      cluster: { id: cid, size, diameterKm: diameter, otherSlugs, otherNames, memberSlugs, memberNames },
    };
    leads.set(cid, { qm, bestRank: meta.rank, memberSlugs, memberNames });
  }
  return [...leads.values()].sort((a, b) => a.bestRank - b.bestRank).map((e) => e.qm);
}

function computeTwinClusters(): QualifyingMetro[] {
  return computeClustersFromCsv("public/data/twin-metros.csv");
}

function computeMegaregionClusters(): QualifyingMetro[] {
  return computeClustersFromCsv("public/data/megaregions.csv");
}

// Isolated Capital: capitals where the nearest peer at or above the capital's
// own rank is more than 300 km. Sorted by distance descending: most-isolated
// first.
function computeIsolatedCapitalRows(): QualifyingMetro[] {
  const csv = loadCsv("public/data/isolated-capital.csv");
  const { bySlug } = getMetroIndex();
  const out: QualifyingMetro[] = [];
  for (const row of csv) {
    const meta = bySlug.get(row.slug);
    const value = parseFloat(row.distance_km);
    if (!meta || isNaN(value)) continue;
    out.push({
      slug: meta.slug, name: meta.name, country: meta.country,
      rank: meta.rank, score: meta.score,
      contextValue: value, contextLabel: "km to nearest peer of equal or greater rank",
      tier: row.tier || undefined,
      peerSlug: row.peer_slug || undefined,
      peerName: row.peer_name || undefined,
      peerCountry: row.peer_country || undefined,
      peerRank: row.peer_rank ? parseInt(row.peer_rank, 10) : undefined,
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
function computeTwinMetros() { return computeTwinClusters(); }
function computeMegaregions() { return computeMegaregionClusters(); }
function computeIsolatedCapital() { return computeIsolatedCapitalRows(); }

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

const TWIN_METROS_TIERS: BadgeTier[] = [
  { slug: "A", name: "Tier A — Triplet", description: "Three metros connected by 75 km links. The classic three-city cluster (Vatican-Rome-Latina, Singapore-Johor Bahru-Batam, El Paso-Ciudad Juárez-Las Cruces, Tunis-Kinshasa-Brazzaville).", accentHex: "#22D3EE" },
  { slug: "B", name: "Tier B — Pair", description: "Two metros within 75 km. The original twin-city archetype, including the canonical cross-border pairs (Detroit-Windsor, San Diego-Tijuana, Vienna-Bratislava, Hong Kong-Macau, Copenhagen-Malmö, Liège-Maastricht, Manama-Dammam, Amman-Jerusalem).", accentHex: "#60A5FA" },
];

const MEGAREGIONS_TIERS: BadgeTier[] = [
  { slug: "A", name: "Tier A — Megaregion", description: "Fifteen or more metros connected by 75 km links. Trans-national megaregions where economic gravity flows through a network rather than a single core (Rhine-Ruhr-Amsterdam-Brussels at 42 metros, the UK industrial belt at 37, Frankfurt-Zurich-Strasbourg-Luxembourg at 27, the Po Valley at 15, Lyon-Geneva-Alpine at 15).", accentHex: "#0E7490" },
  { slug: "B", name: "Tier B — Large cluster", description: "Eight to fourteen metros connected by 75 km links. Substantial regional clusters that don't quite reach megaregion scale (Aarhus-Jutland at 13, Bilbao-Bayonne at 11, Krakow-Upper Silesia at 9, Edinburgh-Central Scotland at 8, Toulouse-Languedoc at 8).", accentHex: "#0891B2" },
  { slug: "C", name: "Tier C — Small cluster", description: "Four to seven metros connected by 75 km links. Tightly-packed regional pairs and triads that exceed the binary-twin threshold (Toronto-Buffalo-Niagara, Florence-Pisa-Siena-Lucca, Hartford-New Haven-Springfield, Lahore-Amritsar-Gujranwala-Sialkot).", accentHex: "#06B6D4" },
];

const ISOLATED_CAPITAL_TIERS: BadgeTier[] = [
  { slug: "A", name: "Tier A — Continental remoteness", description: "More than 800 km from the nearest peer of equal or greater rank. Capitals where the next comparable metro is on the other side of the country, the continent, or an ocean.", accentHex: "#92400E" },
  { slug: "B", name: "Tier B — Deeply isolated", description: "Between 500 and 800 km from the nearest peer of equal or greater rank. Reachable but never near. Many of these are deliberate inland or symbolic capitals.", accentHex: "#B45309" },
  { slug: "C", name: "Tier C — Isolated", description: "Between 240 and 500 km from the nearest peer of equal or greater rank. Beyond same-day commute, but inside the regional sphere of a larger comparable metro.", accentHex: "#D97706" },
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
    shortDesc: "Pairs and triplets of metros within 75 km of each other.",
    longDesc: "Two- and three-metro clusters connected by 75 km links, the original twin-city archetype. Tier A holds the triplets (Vatican-Rome-Latina, Singapore-Johor Bahru-Batam, El Paso-Ciudad Juárez-Las Cruces, Limassol-Nicosia-Larnaca, Tunis-Kinshasa-Brazzaville). Tier B holds the binary pairs, where the canonical cross-border twins live (Detroit-Windsor at 2 km, El Paso-Ciudad Juárez at 10 km, Kinshasa-Brazzaville at 11 km, Nice-Monaco at 12 km, Jerusalem-Ramallah at 14 km, Maastricht-Genk at 17 km, Singapore-Johor Bahru at 18 km, San Diego-Tijuana at 24 km, Vienna-Bratislava at 55 km, Hong Kong-Macau at 66 km), alongside polycentric same-country pairs (Boston-Providence, Florence-Pisa, Glasgow-Edinburgh, Sydney-Wollongong). Larger clusters of four or more metros are surfaced separately under the Megaregions badge.",
    methodologyAnchor: "#population", status: "live", tiers: TWIN_METROS_TIERS, compute: computeTwinMetros,
  },
  {
    slug: "megaregions", name: "Megaregions", emoji: "🌐",
    shortDesc: "Cluster of four or more metros connected by 75 km links.",
    longDesc: "Connected-component clusters of four or more metros where each member sits within 75 km of at least one other member. The result is a map of the world's polycentric economic networks: the 42-metro Rhine-Ruhr corridor stretching from Amsterdam through Brussels, Antwerp and Lille into the German interior; the 37-metro UK industrial belt anchored on London; the 27-metro Rhine-Alpine corridor centred on Frankfurt-Zurich-Basel; the 15-metro Po Valley from Milan through Bologna; the 15-metro Lyon-Geneva-Alpine cluster; the 13-metro Jutland network; the 11-metro Basque Country/Aquitaine cluster; the 9-metro Krakow-Upper Silesia conurbation; the 8-metro Edinburgh-Central Scotland; the 8-metro Toulouse-Languedoc; the 7-metro Israel-Palestine-Jordan cluster (Tel-Aviv, Jerusalem, Amman, Beer Sheva, Irbid, Gaza, Ramallah). Tier breakdown is by cluster size: A is 15+, B is 8-14, C is 4-7. Each cluster is ranked by its most prominent member.",
    methodologyAnchor: "#population", status: "live", tiers: MEGAREGIONS_TIERS, compute: computeMegaregions,
  },
  {
    slug: "isolated-capital", name: "Isolated Capital", emoji: "🏔️",
    shortDesc: "National capitals more than 240 km from any peer of equal or greater rank.",
    longDesc: "National capitals where no metro at or above the capital's own composite rank sits within 240 km. The peer-comparability rule replaces a hard rank floor: the disqualifying peer must be at least as prominent as the capital itself, so a small domestic neighbour does not knock a major capital off the list. Surfaces the deliberately-isolated planned capitals (Brasília 872 km to São Paulo, Madrid 1053 km to Paris, Buenos Aires 1675 km to São Paulo, Santiago 1139 km to Buenos Aires, Canberra 247 km to Sydney) alongside the geographically-isolated island and continental-gravity capitals (Nuuk, Reykjavík, Honiara, Papeete, Hamilton Bermuda, Avarua, Windhoek, Mogadishu, Port Moresby, Ulan Bator, Bangui, Antananarivo). Top-tier global capitals also surface mathematically because they have very few peers of equal rank anywhere on Earth (London, Tokyo, Paris, Beijing, Moscow). Sorted by distance descending: most-isolated first.",
    methodologyAnchor: "#population", status: "live", tiers: ISOLATED_CAPITAL_TIERS, compute: computeIsolatedCapital,
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
      // For cluster entries, every member of the cluster gets a chip pointing
      // to this same lead-row entry. For non-cluster entries, only the entry
      // itself is indexed.
      const slugsToIndex = qualifying.cluster
        ? qualifying.cluster.memberSlugs
        : [qualifying.slug];
      for (const slug of slugsToIndex) {
        const arr = idx.get(slug);
        if (arr) arr.push({ badge, qualifying });
        else idx.set(slug, [{ badge, qualifying }]);
      }
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
