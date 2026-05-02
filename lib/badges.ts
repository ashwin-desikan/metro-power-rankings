// Badges layer. Each badge is a categorical lens over the existing metros
// dataset — no new data ingestion. Each live badge becomes an indexable
// long-tail destination that reframes the same data through a different
// question. See BACKLOG.md "Badges layer" for the full design spec.

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { getAllMetros } from "./data";
import type { Metro } from "./shared";

// ---------- Editorial overrides ----------

// Metros at or above the World City tier that are inherently conurbations
// even when the workbook treats them as a single row. Each entry adds a
// cluster row with a hand-curated member-name list (the satellite cities
// that physically comprise the metro). The metro's own composite score
// drives its position; satellites are not double-counted.
const _CONURBATION_OVERRIDES: { slug: string; displayName?: string; satellites: string[] }[] = [
  // Global Capitals (score >= 100)
  { slug: "new-york", displayName: "Tri-State Area", satellites: ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island", "Newark", "Jersey City", "Long Island", "Westchester"] },
  { slug: "london", satellites: ["Westminster", "Camden", "Croydon", "Watford", "Reading", "St Albans"] },
  { slug: "paris", displayName: "Île-de-France", satellites: ["Paris", "Boulogne-Billancourt", "Saint-Denis", "Argenteuil", "Versailles", "Créteil"] },
  { slug: "tokyo", displayName: "Greater Tokyo", satellites: ["Tokyo", "Yokohama", "Kawasaki", "Saitama", "Chiba"] },
  { slug: "san-francisco-san-jose", displayName: "Bay Area", satellites: ["San Francisco", "San Jose", "Oakland", "Fremont", "Berkeley", "Palo Alto"] },
  { slug: "los-angeles", displayName: "Greater Los Angeles", satellites: ["Los Angeles", "Long Beach", "Anaheim", "Riverside-San Bernardino", "Santa Ana", "Glendale"] },
  { slug: "seoul", displayName: "Sudogwon", satellites: ["Seoul", "Incheon", "Suwon", "Bucheon", "Goyang", "Seongnam"] },
  { slug: "shanghai", displayName: "Yangtze River Delta", satellites: ["Shanghai", "Suzhou", "Wuxi", "Nantong", "Jiaxing"] },
  // World Cities (50 <= score < 100) not already on the cluster list
  { slug: "washington-baltimore", displayName: "Capital Region (DMV)", satellites: ["Washington DC", "Baltimore", "Arlington VA", "Alexandria", "Bethesda"] },
  { slug: "chicago", displayName: "Chicagoland", satellites: ["Chicago", "Naperville", "Aurora", "Joliet", "Gary IN"] },
  { slug: "osaka-kyoto-kobe", displayName: "Keihanshin", satellites: ["Osaka", "Kyoto", "Kobe", "Nara", "Sakai"] },
  { slug: "moscow", displayName: "Greater Moscow", satellites: ["Moscow", "Khimki", "Mytishchi", "Balashikha", "Lyubertsy", "Podolsk"] },
  { slug: "madrid", displayName: "Comunidad de Madrid", satellites: ["Madrid", "Móstoles", "Alcalá de Henares", "Getafe", "Leganés", "Fuenlabrada"] },
  { slug: "milan", satellites: ["Milan", "Monza", "Bergamo", "Sesto San Giovanni", "Cinisello Balsamo"] },
  { slug: "houston", displayName: "Greater Houston", satellites: ["Houston", "Sugar Land", "The Woodlands", "Pasadena", "Pearland", "Galveston"] },
  { slug: "istanbul", displayName: "Greater Istanbul", satellites: ["Istanbul", "Beyoğlu", "Kadıköy", "Ümraniye", "Bağcılar"] },
  { slug: "rhine-ruhr", displayName: "Rhine-Ruhr", satellites: ["Cologne", "Düsseldorf", "Essen", "Dortmund", "Duisburg", "Bochum", "Wuppertal", "Gelsenkirchen"] },
  { slug: "miami", displayName: "South Florida", satellites: ["Miami", "Fort Lauderdale", "West Palm Beach", "Hollywood FL", "Pembroke Pines"] },
  { slug: "mexico-city", displayName: "Valle de México", satellites: ["Mexico City", "Naucalpan", "Ecatepec", "Tlalnepantla", "Nezahualcóyotl"] },
  { slug: "philadelphia", displayName: "Delaware Valley", satellites: ["Philadelphia", "Camden NJ", "Wilmington DE", "Chester PA", "Trenton"] },
  { slug: "berlin", displayName: "Berlin-Brandenburg", satellites: ["Berlin", "Potsdam", "Brandenburg an der Havel", "Eberswalde"] },
  { slug: "seattle", displayName: "Puget Sound", satellites: ["Seattle", "Tacoma", "Bellevue", "Everett", "Renton", "Kent"] },
  { slug: "dallas", displayName: "DFW Metroplex", satellites: ["Dallas", "Fort Worth", "Arlington TX", "Plano", "Irving", "Garland", "Frisco"] },
  { slug: "barcelona", displayName: "Greater Barcelona", satellites: ["Barcelona", "Sabadell", "Terrassa", "Mataró", "L'Hospitalet", "Badalona"] },
  { slug: "atlanta", displayName: "Metro Atlanta", satellites: ["Atlanta", "Sandy Springs", "Roswell", "Marietta", "Alpharetta", "Smyrna"] },
  { slug: "dubai-sharjah", displayName: "Northern Emirates", satellites: ["Dubai", "Sharjah", "Ajman", "Umm Al Quwain"] },
  { slug: "mumbai", displayName: "Mumbai Metropolitan Region", satellites: ["Mumbai", "Thane", "Navi Mumbai", "Mira-Bhayandar", "Vasai-Virar", "Kalyan-Dombivli"] },
  { slug: "munich", satellites: ["Munich", "Augsburg", "Ingolstadt", "Rosenheim", "Landshut", "Freising"] },
  // Major Metros (score 20-50) that are inherently conurbations
  { slug: "jakarta", displayName: "Jabodetabek", satellites: ["Jakarta", "Bogor", "Depok", "Tangerang", "Bekasi"] },
  { slug: "frankfurt", displayName: "Rhein-Main", satellites: ["Frankfurt", "Offenbach", "Wiesbaden", "Mainz", "Hanau"] },
  { slug: "johannesburg", displayName: "Gauteng", satellites: ["Johannesburg", "Soweto", "Sandton", "Roodepoort", "Randburg"] },
  { slug: "cairo", displayName: "Greater Cairo", satellites: ["Cairo", "Giza", "6th of October City", "Helwan", "Shubra El Kheima"] },
  { slug: "montreal", displayName: "Greater Montreal", satellites: ["Montreal", "Laval", "Longueuil", "Brossard"] },
  { slug: "denver", satellites: ["Denver", "Aurora", "Lakewood CO", "Boulder", "Centennial"] },
  { slug: "vancouver", displayName: "Metro Vancouver", satellites: ["Vancouver", "Burnaby", "Surrey", "Richmond BC", "Coquitlam"] },
  { slug: "wuhan", displayName: "Wuhan Tri-City", satellites: ["Hankou", "Hanyang", "Wuchang"] },
  { slug: "las-vegas", displayName: "Las Vegas Valley", satellites: ["Las Vegas", "Henderson", "North Las Vegas", "Paradise", "Spring Valley"] },
  { slug: "lisbon", displayName: "Greater Lisbon", satellites: ["Lisbon", "Cascais", "Sintra", "Loures", "Almada", "Amadora"] },
  { slug: "hangzhou", satellites: ["Hangzhou", "Yuhang", "Xiaoshan", "Lin'an", "Tonglu"] },
  { slug: "minneapolis", displayName: "Twin Cities", satellites: ["Minneapolis", "St. Paul", "Bloomington MN", "Plymouth"] },
  { slug: "doha", displayName: "Greater Doha", satellites: ["Doha", "Al Wakrah", "Al Rayyan", "Al Khor"] },
  { slug: "changsha", displayName: "Chang-Zhu-Tan", satellites: ["Changsha", "Zhuzhou", "Xiangtan"] },
  { slug: "st-louis", satellites: ["St. Louis", "East St. Louis", "Belleville IL", "St. Charles MO"] },
  { slug: "busan-ulsan", satellites: ["Busan", "Ulsan", "Gimhae", "Yangsan"] },
  { slug: "phoenix", displayName: "Valley of the Sun", satellites: ["Phoenix", "Mesa", "Scottsdale", "Tempe", "Chandler", "Gilbert", "Glendale AZ"] },
  { slug: "athens", displayName: "Attica", satellites: ["Athens", "Piraeus", "Acharnes", "Peristeri", "Kallithea"] },
  { slug: "dublin", displayName: "Greater Dublin Area", satellites: ["Dublin", "Tallaght", "Swords", "Dún Laoghaire", "Blanchardstown"] },
  { slug: "nagoya", displayName: "Chukyo", satellites: ["Nagoya", "Toyota", "Toyohashi", "Okazaki", "Kasugai"] },
  { slug: "portland", satellites: ["Portland", "Vancouver WA", "Beaverton", "Gresham", "Hillsboro"] },
  { slug: "hamburg", satellites: ["Hamburg", "Lübeck", "Norderstedt", "Pinneberg"] },
  { slug: "calcutta", displayName: "Kolkata Metro", satellites: ["Kolkata", "Howrah", "Bidhannagar", "Hooghly", "Barrackpore"] },
  { slug: "cleveland", satellites: ["Cleveland", "Akron", "Lorain", "Lakewood OH", "Parma"] },
  { slug: "raleigh-durham", displayName: "Research Triangle", satellites: ["Raleigh", "Durham", "Cary", "Chapel Hill"] },
  { slug: "tehran", displayName: "Greater Tehran", satellites: ["Tehran", "Karaj", "Eslamshahr", "Rey", "Varamin"] },
  { slug: "stuttgart", displayName: "Stuttgart Region", satellites: ["Stuttgart", "Esslingen", "Ludwigsburg", "Sindelfingen", "Tübingen"] },
  { slug: "salt-lake-city-provo", displayName: "Wasatch Front", satellites: ["Salt Lake City", "Provo", "Ogden", "West Valley"] },
  { slug: "padua-venice", displayName: "Veneto Triangle", satellites: ["Venice", "Padua", "Mestre", "Treviso"] },
  { slug: "kansas-city", satellites: ["Kansas City MO", "Kansas City KS", "Overland Park", "Olathe", "Independence"] },
  { slug: "shenyang", displayName: "Mid-Liaoning", satellites: ["Shenyang", "Anshan", "Fushun", "Benxi", "Liaoyang"] },
  { slug: "liverpool", displayName: "Merseyside", satellites: ["Liverpool", "Birkenhead", "Wallasey", "St Helens", "Bootle"] },
  { slug: "cincinnati", satellites: ["Cincinnati", "Covington KY", "Newport KY", "Florence KY"] },
  { slug: "helsinki", satellites: ["Helsinki", "Espoo", "Vantaa", "Kauniainen"] },
  { slug: "lima", displayName: "Lima-Callao", satellites: ["Lima", "Callao", "San Juan de Lurigancho", "Comas"] },
  { slug: "hannover-brunswick", satellites: ["Hannover", "Braunschweig", "Salzgitter", "Wolfsburg"] },
];

// Named megaregions: hand-curated multi-metro clusters that the auto algorithm
// either fragments (Randstad split into Amsterdam-east-NL and Rotterdam-Leiden)
// or buries inside oversized regional belts (Brussels-Antwerp lost in an
// 11-metro Flemish-Walloon-Northern-French cluster). Each entry claims its
// listed memberSlugs; any auto cluster touching a claimed slug is dropped so
// each metro lives in exactly one cluster. The displayName drives the lead
// row's identity. extraSatellites adds non-dataset labels to the member list.
const _NAMED_MEGAREGIONS: {
  slug: string;
  displayName: string;
  leadSlug: string;
  memberSlugs: string[];
  extraSatellites?: string[];
  country?: string;  // override the lead's country when needed (e.g. PRD spans HK + China)
}[] = [
  {
    slug: "randstad",
    displayName: "Randstad",
    leadSlug: "amsterdam",
    memberSlugs: ["amsterdam", "rotterdam-the-hague", "utrecht", "leiden"],
    extraSatellites: ["The Hague", "Haarlem", "Almere", "Zaanstad", "Hilversum"],
  },
  {
    slug: "flemish-diamond",
    displayName: "Flemish Diamond",
    leadSlug: "brussels",
    memberSlugs: ["brussels", "antwerp", "mechelen", "leuven", "aalst", "gent"],
    extraSatellites: ["Vilvoorde", "Asse"],
  },
  {
    slug: "pearl-river-delta",
    displayName: "Pearl River Delta",
    leadSlug: "guangzhou",
    memberSlugs: ["guangzhou", "hong-kong", "macau"],
    extraSatellites: ["Shenzhen", "Dongguan", "Foshan", "Zhuhai"],
  },
  {
    slug: "jing-jin-ji",
    displayName: "Jing-Jin-Ji",
    leadSlug: "beijing",
    memberSlugs: ["beijing", "tianjin"],
    extraSatellites: ["Langfang", "Baoding", "Tangshan", "Cangzhou"],
  },
];

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
    // componentMetro: when the row's name is an editorial alias (e.g.,
    // "Twin Cities", "Jabodetabek"), this points to the workbook metro the
    // row links to so the connection is explicit on the page.
    componentMetro?: { slug: string; name: string; rank: number };
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

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371.0088;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dp / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}


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

// Shared helper for the Conurbations cluster CSV. Reads any
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
  // contextValue = sum of composite scores across all members so the table
  // sorts heaviest-first; the diameter is shown inline beneath the lead name.
  const leads = new Map<string, { qm: QualifyingMetro; bestRank: number; scoreSum: number }>();
  for (const row of csv) {
    const meta = bySlug.get(row.slug);
    if (!meta) continue;
    const size = parseInt(row.cluster_size, 10);
    const diameter = parseFloat(row.cluster_diameter_km);
    const scoreSum = parseFloat(row.cluster_score_sum);
    if (isNaN(size) || isNaN(diameter) || isNaN(scoreSum)) continue;
    const cid = row.cluster_id;
    const memberSlugs = row.cluster_member_slugs ? row.cluster_member_slugs.split(";").filter(Boolean) : [meta.slug];
    const memberNames = row.cluster_member_names ? row.cluster_member_names.split(";").filter(Boolean) : [meta.name];
    const existing = leads.get(cid);
    if (existing && meta.rank >= existing.bestRank) continue;
    const otherSlugs = memberSlugs.filter((s) => s !== meta.slug);
    const otherNames = memberNames.filter((_, i) => memberSlugs[i] !== meta.slug);
    const qm: QualifyingMetro = {
      slug: meta.slug, name: meta.name, country: meta.country,
      rank: meta.rank, score: meta.score,
      contextValue: scoreSum, contextLabel: "Cluster score",
      tier: row.tier || undefined,
      cluster: { id: cid, size, diameterKm: diameter, otherSlugs, otherNames, memberSlugs, memberNames },
    };
    leads.set(cid, { qm, bestRank: meta.rank, scoreSum });
  }
  // Sort heaviest cluster first
  return [...leads.values()].sort((a, b) => b.scoreSum - a.scoreSum).map((e) => e.qm);
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
      contextValue: value, contextLabel: "km to nearest tier-comparable peer",
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
function computeConurbations(): QualifyingMetro[] {
  const { bySlug } = getMetroIndex();

  // 1. Build named megaregion rows. Each claims its listed memberSlugs.
  const namedRows: QualifyingMetro[] = [];
  const claimedByNamed = new Set<string>();
  for (const ng of _NAMED_MEGAREGIONS) {
    const memberMetas = ng.memberSlugs.map((s) => bySlug.get(s)).filter((m): m is Metro => m !== undefined);
    if (memberMetas.length === 0) continue;
    for (const s of ng.memberSlugs) claimedByNamed.add(s);
    const lead = bySlug.get(ng.leadSlug) ?? memberMetas[0];
    const scoreSum = Math.round(memberMetas.reduce((acc, m) => acc + (m.score ?? 0), 0) * 10) / 10;
    const memberNames = memberMetas.map((m) => m.name).concat(ng.extraSatellites ?? []);
    const otherSlugs = ng.memberSlugs.filter((s) => s !== lead.slug);
    const otherNames = memberMetas.filter((m) => m.slug !== lead.slug).map((m) => m.name).concat(ng.extraSatellites ?? []);
    // Diameter: max pairwise haversine among workbook member metros that have coords.
    let diameterKm = 0;
    const withCoords = memberMetas.filter((m) => (m.lat ?? 0) !== 0 && (m.lon ?? 0) !== 0);
    for (let i = 0; i < withCoords.length; i++) {
      for (let j = i + 1; j < withCoords.length; j++) {
        const d = haversineKm(withCoords[i].lat, withCoords[i].lon, withCoords[j].lat, withCoords[j].lon);
        if (d > diameterKm) diameterKm = d;
      }
    }
    const tier = scoreSum >= 100 ? "A" : scoreSum >= 50 ? "B" : scoreSum >= 20 ? "C" : "D";
    // Derive the country list from members (dedupe preserving first-appearance order).
    // The explicit `country` override still wins if set.
    const memberCountries: string[] = [];
    for (const m of memberMetas) {
      if (m.country && !memberCountries.includes(m.country)) memberCountries.push(m.country);
    }
    const countryDisplay = ng.country ?? memberCountries.join(" / ");
    namedRows.push({
      slug: lead.slug, name: ng.displayName, country: countryDisplay,
      rank: lead.rank, score: lead.score,
      contextValue: scoreSum, contextLabel: "Cluster score",
      tier,
      cluster: {
        id: `n-${ng.slug}`,
        size: memberNames.length,
        diameterKm: Math.round(diameterKm * 10) / 10,
        otherSlugs,
        otherNames,
        memberSlugs: ng.memberSlugs,
        memberNames,
        componentMetro: ng.displayName !== lead.name ? { slug: lead.slug, name: lead.name, rank: lead.rank } : undefined,
      },
    });
  }

  // 2. Auto clusters: drop any whose membership intersects a named megaregion.
  const autoRaw = computeClustersFromCsv("public/data/conurbations.csv");
  const auto = autoRaw.filter((q) => {
    if (!q.cluster) return true;
    return !q.cluster.memberSlugs.some((s) => claimedByNamed.has(s));
  });
  const autoSlugs = new Set<string>();
  for (const q of auto) {
    if (q.cluster) for (const s of q.cluster.memberSlugs) autoSlugs.add(s);
    else autoSlugs.add(q.slug);
  }

  // 3. Single-metro overrides: skip if covered by auto OR a named megaregion.
  const overrides: QualifyingMetro[] = [];
  for (const ov of _CONURBATION_OVERRIDES) {
    if (autoSlugs.has(ov.slug) || claimedByNamed.has(ov.slug)) continue;
    const meta = bySlug.get(ov.slug);
    if (!meta) continue;
    const score = meta.score;
    const tier = score >= 100 ? "A" : score >= 50 ? "B" : score >= 20 ? "C" : "D";
    overrides.push({
      slug: meta.slug, name: ov.displayName ?? meta.name, country: meta.country,
      rank: meta.rank, score: meta.score,
      contextValue: score, contextLabel: "Cluster score",
      tier,
      cluster: {
        id: `o-${meta.slug}`,
        size: ov.satellites.length,
        diameterKm: 0,
        otherSlugs: [],
        otherNames: ov.satellites,
        memberSlugs: [meta.slug],
        memberNames: ov.satellites,
        componentMetro: ov.displayName ? { slug: meta.slug, name: meta.name, rank: meta.rank } : undefined,
      },
    });
  }

  return [...namedRows, ...auto, ...overrides].sort((a, b) => b.contextValue - a.contextValue);
}
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

const CLUSTER_TIERS: BadgeTier[] = [
  { slug: "A", name: "Tier A — Global", description: "Cluster score of 100 or more, mirroring the Global Capital threshold for individual metros. The gravitationally heaviest conurbations on Earth: Pearl River Delta, New York, London, Jing-Jin-Ji, Paris, Tokyo, San Francisco-San Jose, Los Angeles, Seoul, Shanghai, Boston-Providence, Randstad, Toronto.", accentHex: "#7c3aed" },
  { slug: "B", name: "Tier B — World", description: "Cluster score between 50 and 100, mirroring the World City band. Substantial multi-metro networks that anchor a continent or region: Washington-Baltimore, Chicago, Flemish Diamond, Singapore-Johor Bahru-Batam, Zurich-Basel-Freiburg, Sydney-Wollongong, Osaka-Kyoto-Kobe, Moscow, Madrid, Houston, Istanbul.", accentHex: "#2563eb" },
  { slug: "C", name: "Tier C — Major", description: "Cluster score between 20 and 50, mirroring the Major Metro band. Regionally meaningful conurbations where multiple metros stack into a real network: Edinburgh-Central Scotland, Detroit-Windsor, Vienna-Bratislava, Florence-Pisa-Siena-Lucca, Bilbao-Bayonne, Helsinki, Cardiff-Bristol-Bath.", accentHex: "#0d9488" },
  { slug: "D", name: "Tier D — Regional", description: "Cluster score under 20, mirroring the Regional Hub and lower bands. The long tail of small-but-real conurbations that satisfy the distance rule without contributing major economic weight on their own.", accentHex: "#059669" },
];

const ISOLATED_CAPITAL_TIERS: BadgeTier[] = [
  { slug: "A", name: "Tier A — Continental remoteness", description: "More than 800 km from the nearest tier-comparable metro. The next peer of similar weight is across a continent, an ocean, or both.", accentHex: "#92400E" },
  { slug: "B", name: "Tier B — Deeply isolated", description: "Between 500 and 800 km from the nearest tier-comparable metro. Reachable, never near. Many of these are deliberately inland or symbolic capitals.", accentHex: "#B45309" },
  { slug: "C", name: "Tier C — Isolated", description: "Between 240 and 500 km from the nearest tier-comparable metro. Beyond a day's commute but inside the regional sphere of a larger neighbor.", accentHex: "#D97706" },
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
    shortDesc: "Metros with airport scores at or above the global-gateway floor.",
    longDesc: "Metros whose airport dimension clears 5.0, the floor that separates a continental gateway from a regional hub. The composite blends passenger traffic, intercontinental connectivity, and hub capacity. Sixty-two metros qualify, ranging from London and New York at the apex through the regional gateways that anchor a continent's air network. Below the threshold, airports are large enough to be regionally important but not the kind of node that defines the global air network.",
    methodologyAnchor: "#airport-score", status: "live", compute: computeGlobalGateway,
  },
  {
    slug: "finance-capital", name: "Finance Capital", emoji: "💼",
    shortDesc: "Metros where headquartered listed companies sum to $300 billion or more.",
    longDesc: "Metros where the public-equity market capitalization of headquartered companies clears $300 billion. The gravitational centers of global capital: San Francisco-San Jose at the top, then New York, Seattle, Beijing, Tokyo, London, Paris. Eighty-four metros qualify. Below the threshold a metro might host meaningful regional capital but not the kind of capital pool that anchors a global financial network.",
    methodologyAnchor: "#market-cap", status: "live", compute: computeFinanceCapital,
  },
  {
    slug: "culture-capital", name: "Culture Capital", emoji: "🎭",
    shortDesc: "Metros with deep cultural infrastructure (composite ≥ 30) plus regional top-3 representatives.",
    longDesc: "Metros whose combined cultural composite (cultural events, museums and landmarks, luxury hospitality) clears 30. London leads on every component; Paris and New York follow. The list also surfaces the unexpected (Macau, Dubai-Sharjah) where the cultural infrastructure is the product of recent and deliberate investment. To prevent the badge from over-rewarding wealthy regions, each of the 11 world regions also contributes its top three metros by culture score, even if those metros fall below the threshold. The result is roughly 90 entries, with the long tail capturing the editorially-strongest cultural metro in each region rather than only the global elite.",
    methodologyAnchor: "#cultural-events", status: "live", compute: computeCultureCapital,
  },
  {
    slug: "sports-mecca", name: "Sports Mecca", emoji: "🏟️",
    shortDesc: "Metros with a combined sports composite at or above the major-league-anchor floor.",
    longDesc: "Metros whose combined sports composite (major league teams weighted double, total professional teams across all leagues, major sporting events weighted triple) clears 40. Captures the cities where sport is part of the civic identity, from London at the top through the second-tier metros that punch above their weight on a single league. Fifty-three metros qualify. Below the threshold a metro might have a couple of teams but not the volume or marquee-event presence that defines a sports city.",
    methodologyAnchor: "#major-league-teams", status: "live", compute: computeSportsMecca,
  },
  {
    slug: "rail-hub", name: "Rail Hub", emoji: "🚆",
    shortDesc: "Metros with extensive rail infrastructure (composite ≥ 130).",
    longDesc: "Metros whose combined rail composite (metro stations, suburban stations weighted half, intercity train hubs weighted 5x for the network-effect value) clears 130. Tokyo leads at over a thousand composite points, followed by London, Shanghai, Guangzhou, Toronto, Osaka-Kyoto-Kobe, Rhine-Ruhr. Seventy-five metros qualify. Below the threshold a metro might have a single subway line or a stretch of commuter rail but not the layered network that defines a true rail hub.",
    methodologyAnchor: "#metro-stations", status: "live", compute: computeRailHub,
  },
  {
    slug: "overperformer", name: "Overperformer", emoji: "📈",
    shortDesc: "Score rank punches well above population rank.",
    longDesc: "Metros where the composite score sits much higher than the population rank: concentrated capital, talent, or institutional gravity that does not require scale. San Francisco-San Jose punches 17.6x above its weight, London 14.5x, New York 14.0x. The list also surfaces less-obvious overperformers like Monaco, Macau, Geneva, Edinburgh — cities where a small population supports an outsized footprint of capital, institutions, or both. Top 100 by pop-rank-to-score-rank multiple.",
    methodologyAnchor: "#population", status: "live", compute: computeOverperformer,
  },
  {
    slug: "conurbations", name: "Conurbations", emoji: "🔗",
    shortDesc: "Connected metro clusters and named megaregions, ranked by combined cluster score.",
    longDesc: "Conurbations are multi-metro networks ranked by the sum of composite scores across their members. Three layers feed the list. Named megaregions surface the canonical multi-city groupings the workbook can't form on its own (Pearl River Delta, Jing-Jin-Ji, Randstad, Flemish Diamond). Editorial overrides give each Global Capital, World City, and Major Metro that's structurally a conurbation its true civic name (Tri-State Area, Bay Area, Sudogwon, Île-de-France, Twin Cities, DFW Metroplex, Wasatch Front, Chukyo, Jabodetabek, Chang-Zhu-Tan, Research Triangle, Merseyside, and 40 others). Auto-clustered networks fill the long tail: connected components formed at a 75 km link distance, recursively split when a cluster exceeds its size-dependent average-pairwise ceiling so transitive chains can't masquerade as whole-country belts. Tiers mirror the individual metro scale exactly: Global (cluster score ≥100), World (50-100), Major (20-50), Regional (<20). The top of the list is Pearl River Delta at 188.5, Tri-State Area at 181.1, Greater London at 180.1, Jing-Jin-Ji at 144.3, Île-de-France at 142.6. The middle tier captures the canonical cross-border twins (Detroit-Windsor, San Diego-Tijuana, Vienna-Bratislava, Kinshasa-Brazzaville, Nice-Monaco) and tight regional networks (Florence-Pisa-Siena-Lucca, Hartford-New Haven-Springfield-New London, Prague-Pardubice-Liberec, Edinburgh-Central Scotland, the Caribbean Sint Maarten cluster, the upstate New York belt).",
    methodologyAnchor: "#population", status: "live", tiers: CLUSTER_TIERS, compute: computeConurbations,
  },
  {
    slug: "isolated-capital", name: "Isolated Capital", emoji: "🏔️",
    shortDesc: "National capitals more than 240 km from any metro in the same or higher score tier.",
    longDesc: "National capitals whose nearest peer in the same composite tier or higher sits more than 240 km away. The tier filter is the analytical pivot. A Local City village 30 km from a capital should not count against the badge; only metros at or above the capital's own tier do. The question the badge answers becomes who is your nearest peer of comparable weight, and how far is it.\n\nThree archetypes share the list. The geographically-isolated capitals are the obvious set: Reykjavík, Honiara, Papeete, Hamilton Bermuda, Avarua, Nuuk, Port Moresby, Ulan Bator, sitting on islands, peninsulas, or thin populations where the next World City is hundreds of kilometres of ocean or steppe away. The continental-gravity capitals are the more interesting set: Nairobi, Lima, Buenos Aires, Santiago, Mexico City, Cape Town, Dakar, Bogotá. These are countries so dominated by their capital that the next tier-comparable metro sits across an ocean or a sub-continent, not because the capital is geographically remote but because the country has only one true urban centre. The thin-peer-tier capitals round out the list: London, Paris, Tokyo, Beijing, Seoul, Moscow. The Global Capital tier has so few members worldwide that even London and Paris, 344 km apart across the Channel, both qualify because no other Global Capital is within 240 km of either. Tokyo's nearest is Seoul at 1,153 km. Beijing's is Seoul at 952 km. Moscow, sitting one tier down at World City, has Berlin 1,609 km away.\n\nSorted by distance descending, most-isolated first.",
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
      // Conurbations is the marquee multi-metro lens; pin it first.
      if (a.badge.slug === "conurbations" && b.badge.slug !== "conurbations") return -1;
      if (b.badge.slug === "conurbations" && a.badge.slug !== "conurbations") return 1;
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
