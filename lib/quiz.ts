// Quiz render layer. Composes the live clue text, reveal-card factoid,
// tier badge, dimension chart spec, and adjacent metros from the queue
// record at public/data/quiz_queue.json plus current metros + details.
//
// The queue stores ONLY load-bearing fields (answer slug, mode, multiplier,
// clue template, hook dimension, tier band). Everything else composes
// here at render time so the display always reflects current data.
//
// See docs/scoping/daily_quiz_layer.md and docs/scoping/quiz_factoid_samples.md
// for the design rationale and the freshness model that justifies why this
// module exists rather than the queue carrying the prose.

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { computeTier, tierName } from "./tiers";
import type { Metro } from "./shared";

// ---------- Types ----------

export type QuizMode =
  | "pinpoint"
  | "dimension-capital"
  | "tier-reveal"
  | "top-teams"
  | "badge-holder"
  | "conurbation-member";

export type TierBand = "top-3" | "top-10" | "top-50";

export interface QuizQuestion {
  mode: QuizMode;
  multiplier: 1 | 2 | 3;
  answerSlug: string;
  clueTemplate: string;
  hookDimension?: string;
  tierBand?: TierBand;
  extra?: { [k: string]: string };
}

export interface QuizIssue {
  issue: number;
  date: string;
  lockedAt: string | null;
  questions: QuizQuestion[];
}

export interface AdjacentMetro {
  slug: string;
  name: string;
  country: string;
  distanceKm: number;
  score: number;
}

export interface DimensionRank {
  dim: string;
  label: string;
  rank: number;        // numeric rank (1, 2, 3, ...). Ties shown via tied flag.
  tied: boolean;       // T-prefix in the source means tied
  isHook: boolean;     // true if this is the question's hook dimension
}

export interface RenderedQuestion {
  // Identity
  mode: QuizMode;
  multiplier: 1 | 2 | 3;
  answerSlug: string;
  // Display
  metroName: string;
  country: string;
  population: number;
  score: number;
  tierSlug: string;
  tierName: string;
  // Composed
  clueText: string;            // shown to the player before the guess
  factoid: string;              // shown on the reveal card
  hookDimensionLabel?: string;  // for the dimension spotlight chart
  // Chart spec
  dimensionRanks: DimensionRank[];
  // Adjacents
  adjacents: AdjacentMetro[];
  // Validation flags
  isValid: boolean;             // true if all clue claims hold against current data
  validationWarnings: string[]; // populated if a claim slipped
  // Pin geometry for scoring
  lat: number;
  lon: number;
}

// ---------- Constants ----------

const DIM_LABELS: Record<string, string> = {
  majorLeagueTeams: "major league teams",
  totalTeams: "total sports teams",
  majorSportingEvents: "major sporting events",
  companies: "headquartered companies",
  marketCap: "corporate market cap",
  culturalEvents: "cultural events",
  universities: "top-50 universities",
  topUniHospResearch: "research institutions",
  museumsLandmarks: "museums and landmarks",
  portsExchangesInfra: "ports and exchanges",
  airportScore: "airport score",
  luxuryStars: "Michelin and luxury hospitality",
  metroStations: "metro stations",
  suburbStations: "suburban rail stations",
  trainHubs: "intercity train hubs",
  skyscrapers: "skyscrapers",
};

const BADGE_DISPLAY_NAMES: Record<string, string> = {
  "academic-gravity-wells": "Academic Gravity Wells",
  "conurbations": "Conurbations",
  "cosmopolitan-capital": "Cosmopolitan Capital",
  "culture-capital": "Culture Capital",
  "emerging-standout": "Emerging Standout",
  "finance-capital": "Finance Capital",
  "frozen-conurbations": "Frozen Conurbations",
  "global-gateway": "Global Gateway",
  "greying-power": "Greying Power",
  "isolated-capital": "Isolated Capital",
  "megaregions": "Megaregions",
  "overperformer": "Overperformer",
  "rail-hub": "Rail Hub",
  "skyline-cities": "Skyline Cities",
  "sports-mecca": "Sports Mecca",
  "twin-metros": "Twin Metros",
};

const TIER_BAND_MAX: Record<TierBand, number> = {
  "top-3": 3,
  "top-10": 10,
  "top-50": 50,
};

const ADJ_RADIUS_KM = 400;

// ---------- Loaders ----------

interface MetroDetails {
  teams?: { sport?: string; league?: string; team?: string; level?: string }[];
  universities?: { rank?: number; name?: string }[];
  culture?: Record<string, { name: string; subtype?: string; type?: string }[]>;
  luxury?: { name: string; type?: string }[];
  marketCap?: { total?: number; count?: number; top12?: { name: string; valuation: number }[] };
  metro?: { gawcClass?: string; language?: string };
  dimRanks?: Record<string, string | null>;
}

function readJson<T>(fileName: string): T {
  const path = join(process.cwd(), "public", "data", fileName);
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function readDetails(slug: string): MetroDetails | null {
  const path = join(process.cwd(), "public", "data", "details", `${slug}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as MetroDetails;
  } catch {
    return null;
  }
}

function readCsv(fileName: string): Record<string, string>[] {
  const path = join(process.cwd(), "public", "data", fileName);
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

// ---------- Context (cached per process) ----------

interface QuizContext {
  metros: Metro[];
  bySlug: Map<string, Metro>;
  byCountry: Map<string, Metro[]>;
  badgesByMetro: Map<string, Set<string>>;
  clustersById: Map<string, { id: string; tier: string; members: string[]; size: number; scoreSum: number }>;
  clusterIdBySlug: Map<string, string>;
}

let _ctx: QuizContext | null = null;

const BADGE_FILES: string[] = [
  "academic-gravity-wells", "conurbations", "cosmopolitan-capital",
  "culture-capital", "emerging-standout", "finance-capital",
  "frozen-conurbations", "global-gateway", "greying-power",
  "isolated-capital", "megaregions", "overperformer",
  "rail-hub", "skyline-cities", "sports-mecca", "twin-metros",
];

export function getQuizContext(): QuizContext {
  if (_ctx) return _ctx;
  const metros = readJson<Metro[]>("metros.json");
  const bySlug = new Map<string, Metro>();
  const byCountry = new Map<string, Metro[]>();
  for (const m of metros) {
    bySlug.set(m.slug, m);
    if (!byCountry.has(m.country)) byCountry.set(m.country, []);
    byCountry.get(m.country)!.push(m);
  }
  for (const ms of byCountry.values()) {
    ms.sort((a, b) => b.score - a.score);
  }

  const badgesByMetro = new Map<string, Set<string>>();
  for (const b of BADGE_FILES) {
    const rows = readCsv(`${b}.csv`);
    for (const r of rows) {
      const s = r.slug;
      if (!s) continue;
      if (!badgesByMetro.has(s)) badgesByMetro.set(s, new Set());
      badgesByMetro.get(s)!.add(b);
    }
  }

  const clustersById = new Map<string, { id: string; tier: string; members: string[]; size: number; scoreSum: number }>();
  const clusterIdBySlug = new Map<string, string>();
  for (const r of readCsv("conurbations.csv")) {
    const cid = r.cluster_id;
    if (!cid || clustersById.has(cid)) continue;
    const members = (r.cluster_member_slugs || "").split(";").filter(Boolean);
    clustersById.set(cid, {
      id: cid,
      tier: r.tier || "?",
      members,
      size: parseInt(r.cluster_size || "0", 10),
      scoreSum: parseFloat(r.cluster_score_sum || "0"),
    });
    for (const s of members) clusterIdBySlug.set(s, cid);
  }

  _ctx = { metros, bySlug, byCountry, badgesByMetro, clustersById, clusterIdBySlug };
  return _ctx;
}

// ---------- Helpers ----------

function parseDimRank(raw: string | null | undefined): { rank: number; tied: boolean } | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s || s.toLowerCase() === "none") return null;
  const tied = s.startsWith("T-") || s.startsWith("T") && s !== "T";
  const m = s.match(/(\d+)/);
  if (!m) return null;
  return { rank: parseInt(m[1], 10), tied };
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dlat = (lat2 - lat1) * Math.PI / 180;
  const dlon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dlat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dlon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function computeAdjacents(metro: Metro, ctx: QuizContext): AdjacentMetro[] {
  const out: AdjacentMetro[] = [];
  for (const m of ctx.metros) {
    if (m.slug === metro.slug) continue;
    const d = haversineKm(metro.lat, metro.lon, m.lat, m.lon);
    if (d <= ADJ_RADIUS_KM) {
      out.push({ slug: m.slug, name: m.name, country: m.country, distanceKm: d, score: m.score });
    }
  }
  out.sort((a, b) => a.distanceKm - b.distanceKm);
  // Top 3, but trim to 2 if the third is weak (< composite 2.0)
  const top3 = out.slice(0, 3);
  if (top3.length === 3 && top3[2].score < 2.0) return top3.slice(0, 2);
  return top3;
}

function topDimensionRanks(details: MetroDetails | null, hook?: string): DimensionRank[] {
  if (!details?.dimRanks) return [];
  const out: DimensionRank[] = [];
  for (const [dim, raw] of Object.entries(details.dimRanks)) {
    const parsed = parseDimRank(raw);
    if (!parsed) continue;
    out.push({
      dim,
      label: DIM_LABELS[dim] ?? dim,
      rank: parsed.rank,
      tied: parsed.tied,
      isHook: dim === hook,
    });
  }
  // Sort by rank ascending (best first)
  out.sort((a, b) => a.rank - b.rank);
  return out;
}

function fmtRank(r: { rank: number; tied: boolean }): string {
  return r.tied ? `T-${r.rank}` : `#${r.rank}`;
}

function fmtBillions(value: number): string {
  return `$${(value / 1e9).toFixed(0)}B`;
}

// ---------- Per-mode renderers ----------

function renderPinpoint(metro: Metro, details: MetroDetails | null, ctx: QuizContext): {
  clueText: string;
  factoid: string;
  warnings: string[];
} {
  const warnings: string[] = [];
  const tier = computeTier(metro.score);
  const dims = topDimensionRanks(details);
  const top3 = dims.slice(0, 3);
  const dimsLine = top3.length
    ? top3.map((d) => `${fmtRank(d)} on ${d.label}`).join(", ")
    : "";
  const entities: string[] = [];
  if (details?.universities?.[0]) {
    const u = details.universities[0];
    if (u.rank && u.name) entities.push(`${u.name} (#${u.rank} global)`);
  }
  if (details?.marketCap?.top12?.[0]) {
    const c = details.marketCap.top12[0];
    if (c.name && c.valuation) entities.push(`${c.name} HQ (${fmtBillions(c.valuation)})`);
  }
  const lux = details?.luxury || [];
  const stars = lux.filter((x) => /Michelin/i.test(x.type ?? "")).length;
  if (stars > 0) entities.push(`${stars} Michelin-starred restaurants`);
  const gawc = details?.metro?.gawcClass;

  const sentences: string[] = [];
  sentences.push(`${tier.name} (composite ${metro.score.toFixed(1)}). Population ${formatPop(metro.pop)}.`);
  if (dimsLine) sentences.push(`Strongest dimensions: ${dimsLine}.`);
  if (entities.length) sentences.push(entities.join("; ") + ".");
  if (gawc && gawc !== "10") sentences.push(`GaWC class ${gawc}.`);

  return {
    clueText: `Where is ${metro.name}?`,
    factoid: sentences.join(" "),
    warnings,
  };
}

function renderDimensionCapital(
  metro: Metro,
  details: MetroDetails | null,
  question: QuizQuestion,
  ctx: QuizContext,
): { clueText: string; factoid: string; warnings: string[] } {
  const warnings: string[] = [];
  const hook = question.hookDimension || "";
  const band = question.tierBand || "top-50";
  const dimLabel = DIM_LABELS[hook] ?? hook;
  const rank = parseDimRank(details?.dimRanks?.[hook] ?? null);
  if (!rank) {
    warnings.push(`No rank found for hook dimension ${hook}; clue may be stale`);
  } else if (rank.rank > TIER_BAND_MAX[band]) {
    warnings.push(`${metro.slug} is ${fmtRank(rank)} on ${hook} but clue claims ${band}`);
  }
  const clueText = `This metro ranks ${band} globally on ${dimLabel}.`;

  // Build factoid
  const tier = computeTier(metro.score);
  const dims = topDimensionRanks(details, hook);
  const otherStrong = dims.filter((d) => !d.isHook).slice(0, 2);
  const sentences: string[] = [];
  if (rank) {
    sentences.push(`Ranked ${fmtRank(rank)} globally on ${dimLabel}.`);
  } else {
    sentences.push(`Strong on ${dimLabel}.`);
  }
  if (otherStrong.length) {
    sentences.push(
      "Also " + otherStrong.map((d) => `${fmtRank(d)} on ${d.label}`).join(", ") + "."
    );
  }
  const entityBits: string[] = [];
  if (details?.universities?.[0]?.rank && details.universities[0].rank <= 200) {
    entityBits.push(`${details.universities[0].name} (#${details.universities[0].rank} global)`);
  }
  if (details?.marketCap?.top12?.[0]) {
    const c = details.marketCap.top12[0];
    entityBits.push(`${c.name} HQ (${fmtBillions(c.valuation)})`);
  }
  if (entityBits.length) sentences.push(entityBits.join("; ") + ".");
  sentences.push(`${tier.name} tier overall.`);
  return { clueText, factoid: sentences.join(" "), warnings };
}

function renderTierReveal(
  metro: Metro,
  details: MetroDetails | null,
  question: QuizQuestion,
  ctx: QuizContext,
): { clueText: string; factoid: string; warnings: string[] } {
  const warnings: string[] = [];
  const variant = question.extra?.variant || question.clueTemplate.split(":").pop() || "";
  let clueText = `This metro stands out within ${metro.country}.`;
  const sameCountry = (ctx.byCountry.get(metro.country) || []).slice();
  sameCountry.sort((a, b) => b.score - a.score);
  if (variant === "second-ranked-in-country") {
    if (sameCountry.length >= 2 && sameCountry[1].slug === metro.slug) {
      const top = sameCountry[0];
      clueText = `This metro is the second-ranked metro in ${metro.country}, after ${top.name}.`;
    } else {
      warnings.push(`${metro.slug} is no longer second-ranked in ${metro.country}`);
      clueText = `This metro is among the highest-ranked in ${metro.country}.`;
    }
  } else if (variant.startsWith("only-")) {
    const tierLabelLower = variant.replace(/^only-/, "").replace(/-in-country$/, "").replace(/-/g, " ");
    const myTier = computeTier(metro.score);
    if (myTier.name.toLowerCase() === tierLabelLower) {
      const peersAtOrAbove = sameCountry.filter((m) => m.score >= myTier.lowerBound);
      if (peersAtOrAbove.length === 1) {
        clueText = `This metro is the only ${myTier.name} in ${metro.country}.`;
      } else {
        warnings.push(`${metro.slug} no longer the only ${myTier.name} in ${metro.country}`);
        clueText = `This metro is one of the highest-ranked in ${metro.country}.`;
      }
    } else {
      warnings.push(`${metro.slug} tier shifted; clue softened`);
      clueText = `This metro is among the highest-ranked in ${metro.country}.`;
    }
  }

  const tier = computeTier(metro.score);
  const dims = topDimensionRanks(details).slice(0, 3);
  const sentences: string[] = [];
  sentences.push(`${tier.name} (composite ${metro.score.toFixed(1)}).`);
  if (dims.length) {
    sentences.push("Top dimensions: " + dims.map((d) => `${fmtRank(d)} on ${d.label}`).join(", ") + ".");
  }
  const myBadges = ctx.badgesByMetro.get(metro.slug);
  if (myBadges && myBadges.size > 0) {
    const names = Array.from(myBadges).map((b) => BADGE_DISPLAY_NAMES[b] ?? b).slice(0, 3);
    sentences.push("Carries the " + names.join(", ") + " badge" + (names.length > 1 ? "s" : "") + ".");
  }
  return { clueText, factoid: sentences.join(" "), warnings };
}

function renderTopTeams(
  metro: Metro,
  details: MetroDetails | null,
  question: QuizQuestion,
  ctx: QuizContext,
): { clueText: string; factoid: string; warnings: string[] } {
  const warnings: string[] = [];
  const team = question.extra?.team || "";
  const teams = details?.teams ?? [];
  const found = teams.find((t) => t.team === team);
  if (!found) {
    warnings.push(`Team '${team}' no longer in ${metro.slug} details`);
  }
  const sport = found?.sport ?? "sport";
  const league = found?.league ?? "a top-flight league";
  const clueText = `The dominant team in this metro plays in ${league}.`;

  const tier = computeTier(metro.score);
  const totalTeams = parseDimRank(details?.dimRanks?.totalTeams ?? null);
  const majorTeams = parseDimRank(details?.dimRanks?.majorLeagueTeams ?? null);
  const sentences: string[] = [];
  if (team && league && league !== "Notable Venues") {
    sentences.push(`${team} (${league}) is a marquee Tier 1 franchise.`);
  } else if (team) {
    sentences.push(`${team} is a marquee Tier 1 franchise.`);
  }
  if (totalTeams) sentences.push(`${fmtRank(totalTeams)} globally on total sports teams.`);
  if (majorTeams) sentences.push(`${fmtRank(majorTeams)} on major league teams.`);
  if (ctx.badgesByMetro.get(metro.slug)?.has("sports-mecca")) {
    sentences.push("Carries the Sports Mecca badge.");
  }
  sentences.push(`${tier.name} tier overall.`);
  return { clueText, factoid: sentences.join(" "), warnings };
}

function renderBadgeHolder(
  metro: Metro,
  details: MetroDetails | null,
  question: QuizQuestion,
  ctx: QuizContext,
): { clueText: string; factoid: string; warnings: string[] } {
  const warnings: string[] = [];
  const badgeSlug = question.extra?.badge || "";
  const badgeName = BADGE_DISPLAY_NAMES[badgeSlug] ?? badgeSlug;
  const myBadges = ctx.badgesByMetro.get(metro.slug);
  if (!myBadges?.has(badgeSlug)) {
    warnings.push(`${metro.slug} no longer holds badge ${badgeSlug}`);
  }
  const clueText = `This metro carries the ${badgeName} badge.`;

  const tier = computeTier(metro.score);
  const dims = topDimensionRanks(details).slice(0, 2);
  const sentences: string[] = [];
  sentences.push(`${tier.name} (composite ${metro.score.toFixed(1)}). Population ${formatPop(metro.pop)}.`);
  if (dims.length) {
    sentences.push("Top dimensions: " + dims.map((d) => `${fmtRank(d)} on ${d.label}`).join(", ") + ".");
  }
  const otherBadges = Array.from(myBadges || []).filter((b) => b !== badgeSlug);
  if (otherBadges.length) {
    const names = otherBadges.map((b) => BADGE_DISPLAY_NAMES[b] ?? b).slice(0, 3);
    sentences.push("Also holds: " + names.join(", ") + ".");
  }
  return { clueText, factoid: sentences.join(" "), warnings };
}

function renderConurbationMember(
  metro: Metro,
  details: MetroDetails | null,
  question: QuizQuestion,
  ctx: QuizContext,
): { clueText: string; factoid: string; warnings: string[] } {
  const warnings: string[] = [];
  const cid = question.extra?.clusterId || ctx.clusterIdBySlug.get(metro.slug) || "";
  const cluster = ctx.clustersById.get(cid);
  if (!cluster) {
    warnings.push(`Cluster ${cid} not found`);
    return {
      clueText: `This metro belongs to a multi-metro conurbation.`,
      factoid: `${computeTier(metro.score).name} tier; cluster data missing.`,
      warnings,
    };
  }
  const otherMembers = cluster.members
    .filter((s) => s !== metro.slug)
    .map((s) => ctx.bySlug.get(s)?.name)
    .filter((n): n is string => Boolean(n));
  const tierLabel = cluster.tier === "A" ? "Tier A" :
                    cluster.tier === "B" ? "Tier B" :
                    cluster.tier === "C" ? "Tier C" : "Tier D";
  let clueText: string;
  if (cluster.size === 2 && otherMembers.length === 1) {
    clueText = `This metro pairs with ${otherMembers[0]} in a ${tierLabel} conurbation cluster.`;
  } else if (cluster.size <= 4) {
    clueText = `This metro belongs to a ${tierLabel} conurbation cluster including ${otherMembers.join(", ")}.`;
  } else {
    const named = otherMembers.slice(0, 3).join(", ");
    const remaining = otherMembers.length - 3;
    clueText = `This metro anchors a ${cluster.size}-metro ${tierLabel} conurbation cluster including ${named}${remaining > 0 ? ` and ${remaining} more` : ""}.`;
  }

  const tier = computeTier(metro.score);
  const dims = topDimensionRanks(details).slice(0, 2);
  const sentences: string[] = [];
  sentences.push(`${tier.name} (composite ${metro.score.toFixed(1)}).`);
  sentences.push(
    `Anchors a ${cluster.size}-metro cluster (cluster score ${cluster.scoreSum.toFixed(1)}, ${tierLabel}).`
  );
  if (dims.length) {
    sentences.push("Top dimensions: " + dims.map((d) => `${fmtRank(d)} on ${d.label}`).join(", ") + ".");
  }
  return { clueText, factoid: sentences.join(" "), warnings };
}

function formatPop(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2).replace(/\.?0+$/, "")}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return `${n}`;
}

// ---------- Public render ----------

export function renderQuestion(question: QuizQuestion, ctx?: QuizContext): RenderedQuestion {
  const c = ctx ?? getQuizContext();
  const metro = c.bySlug.get(question.answerSlug);
  if (!metro) {
    throw new Error(`Quiz question references unknown metro slug: ${question.answerSlug}`);
  }
  const details = readDetails(metro.slug);
  const tier = computeTier(metro.score);
  const adjacents = computeAdjacents(metro, c);
  const dimensionRanks = topDimensionRanks(details, question.hookDimension);

  let composed: { clueText: string; factoid: string; warnings: string[] };
  switch (question.mode) {
    case "pinpoint":
      composed = renderPinpoint(metro, details, c);
      break;
    case "dimension-capital":
      composed = renderDimensionCapital(metro, details, question, c);
      break;
    case "tier-reveal":
      composed = renderTierReveal(metro, details, question, c);
      break;
    case "top-teams":
      composed = renderTopTeams(metro, details, question, c);
      break;
    case "badge-holder":
      composed = renderBadgeHolder(metro, details, question, c);
      break;
    case "conurbation-member":
      composed = renderConurbationMember(metro, details, question, c);
      break;
    default:
      throw new Error(`Unknown quiz mode: ${(question as QuizQuestion).mode}`);
  }

  return {
    mode: question.mode,
    multiplier: question.multiplier,
    answerSlug: metro.slug,
    metroName: metro.name,
    country: metro.country,
    population: metro.pop,
    score: metro.score,
    tierSlug: tier.slug,
    tierName: tier.name,
    clueText: composed.clueText,
    factoid: composed.factoid,
    hookDimensionLabel: question.hookDimension ? DIM_LABELS[question.hookDimension] : undefined,
    dimensionRanks,
    adjacents,
    isValid: composed.warnings.length === 0,
    validationWarnings: composed.warnings,
    lat: metro.lat,
    lon: metro.lon,
  };
}

export function loadQueue(): { issues: QuizIssue[]; generatedAt: string; schemaVersion: number } {
  const path = join(process.cwd(), "public", "data", "quiz_queue.json");
  if (!existsSync(path)) {
    return { issues: [], generatedAt: "", schemaVersion: 1 };
  }
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function getIssueForDate(dateIso: string): QuizIssue | null {
  const queue = loadQueue();
  return queue.issues.find((i) => i.date === dateIso) ?? null;
}

export function renderIssue(issue: QuizIssue): RenderedQuestion[] {
  const ctx = getQuizContext();
  return issue.questions.map((q) => renderQuestion(q, ctx));
}
