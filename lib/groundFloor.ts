import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// The Ground Floor (/ground-floor) data layer.
//
// A SECOND scoreboard, deliberately separate from the power ranking. The power
// ranking measures accumulation: what a metro has gathered. This measures
// conditions: what it is like to live there. The two are never merged, because
// the distance between them is the only thing worth publishing.
//
// Built by scripts/groundfloor/*.py:
//   public/data/ground-floor/air-quality.json      annual mean PM2.5 (SatPM2.5)
//   public/data/ground-floor/no2.json              annual mean NO2 (GlobalNO2_AiT)
//   public/data/ground-floor/water-sanitation.json unimproved water + sanitation (Aqueduct)
//   public/data/ground-floor/index.json            median-of-ranks + the gap
//
// Read at BUILD time rather than via GitHub-raw ISR (the lib/business.ts
// pattern) because every input is an ANNUAL figure. There is nothing to
// refresh between builds, and public/data is in the Vercel build-path list, so
// a data refresh triggers a build on its own.

const DIR = join(process.cwd(), "public", "data", "ground-floor");

export type GfDimensionMeta = {
  key: string;
  label: string;
  unit: string;
  year: number | null;
  lowerIsBetter: boolean;
  metros: number;
};

export type GfMeta = {
  dimensions: GfDimensionMeta[];
  metrosRanked: number;
  provisional: boolean;
  correlations: {
    populationVsConditionsRank: number | null;
    accumulationVsConditionsRank: number | null;
  };
  generatedAt: string;
};

export type GfRow = {
  slug: string;
  name: string;
  country: string;
  conditionsRank: number;
  accumulationRank: number | null;
  /** percentile points; positive = accumulates more than it delivers */
  gap: number | null;
  conditionsPct: number | null;
  accumulationPct: number | null;
  pm25: number | null;
  no2: number | null;
  water: number | null;
};

type IndexFile = {
  _meta: GfMeta;
  metros: Record<string, {
    conditionsRank: number;
    accumulationRank: number | null;
    gap: number | null;
    conditionsPct: number | null;
    accumulationPct: number | null;
  }>;
};

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(join(DIR, file), "utf8")) as T;
  } catch {
    return null;
  }
}

type ValueFile = { _meta: Record<string, unknown>; metros: Record<string, number> };

let cache: { meta: GfMeta; rows: GfRow[] } | null = null;

/** Everything the page needs, joined to metro names. Cached per process. */
export function getGroundFloor(): { meta: GfMeta; rows: GfRow[] } | null {
  if (cache) return cache;

  const index = readJson<IndexFile>("index.json");
  if (!index || !index.metros) return null;

  const pm = readJson<ValueFile>("air-quality.json");
  const no2 = readJson<ValueFile>("no2.json");
  const water = readJson<ValueFile>("water-sanitation.json");

  type MetroLite = { slug: string; name: string; country: string };
  let metros: MetroLite[] = [];
  try {
    metros = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "metros.json"), "utf8"),
    ) as MetroLite[];
  } catch {
    return null;
  }
  const bySlug = new Map(metros.map((m) => [m.slug, m]));

  const rows: GfRow[] = [];
  for (const [slug, r] of Object.entries(index.metros)) {
    const m = bySlug.get(slug);
    if (!m) continue; // a metro dropped from the workbook since the last build
    rows.push({
      slug,
      name: m.name,
      country: m.country,
      conditionsRank: r.conditionsRank,
      accumulationRank: r.accumulationRank,
      gap: r.gap,
      conditionsPct: r.conditionsPct,
      accumulationPct: r.accumulationPct,
      pm25: pm?.metros?.[slug] ?? null,
      no2: no2?.metros?.[slug] ?? null,
      water: water?.metros?.[slug] ?? null,
    });
  }

  cache = { meta: index._meta, rows };
  return cache;
}

/**
 * The editorial payload: among metros that actually accumulate, the ones
 * whose conditions sit furthest below their accumulation.
 *
 * Restricted to the top `withinAccumulation` accumulators on purpose. The gap
 * is BOUNDED BY POSITION -- a metro ranked 4,000th on accumulation cannot have
 * a large positive gap however bad it is to live in -- so ranking the whole
 * field by gap would just surface the top of the power ranking again.
 */
export function biggestGaps(withinAccumulation = 100, take = 15): GfRow[] {
  const gf = getGroundFloor();
  if (!gf) return [];
  return gf.rows
    .filter((r) => r.accumulationRank !== null && r.accumulationRank <= withinAccumulation)
    .filter((r) => r.gap !== null)
    .sort((a, b) => (b.gap as number) - (a.gap as number))
    .slice(0, take);
}

/** The same set, from the other end: delivering closest to what they accumulate. */
export function smallestGaps(withinAccumulation = 100, take = 15): GfRow[] {
  const gf = getGroundFloor();
  if (!gf) return [];
  return gf.rows
    .filter((r) => r.accumulationRank !== null && r.accumulationRank <= withinAccumulation)
    .filter((r) => r.gap !== null)
    .sort((a, b) => (a.gap as number) - (b.gap as number))
    .slice(0, take);
}

/** Best conditions outright, any size. Population floor keeps out hamlets. */
export function bestConditions(take = 20, minAccumulationRank = 1500): GfRow[] {
  const gf = getGroundFloor();
  if (!gf) return [];
  return gf.rows
    .filter((r) => r.accumulationRank !== null && r.accumulationRank <= minAccumulationRank)
    .sort((a, b) => a.conditionsRank - b.conditionsRank)
    .slice(0, take);
}

/** Rounded for display. The stored precision is grid precision, not accuracy. */
export function fmtPm(v: number | null): string {
  return v === null ? "—" : v.toFixed(1);
}

export function fmtShare(v: number | null): string {
  if (v === null) return "—";
  if (v < 0.001) return "<0.1%";
  return `${(v * 100).toFixed(1)}%`;
}

export function fmtGap(v: number | null): string {
  return v === null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
}
