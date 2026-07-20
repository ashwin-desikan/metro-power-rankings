import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// The Cup is regenerated weekly by scripts/zzc_v1_multipillar.py and committed
// with [vercel skip]. Reading it from GitHub raw with ISR (instead of
// readFileSync at build time) means a weekly regeneration surfaces within the
// revalidate window with NO Vercel build, matching lib/powerRanking.ts. The
// bundled copy stays as the dev path and the fallback.

export type ZzcTopSport = { sport: string; pts: number };

export type ZzcNation = {
  slug: string;
  countrySlug: string | null;
  name: string;
  continent: string | null;
  merit: number;
  rank: number;
  meritPerCapita: number | null;
  rankPerCapita: number | null;
  meritPerGdp: number | null;
  rankPerGdp: number | null;
  population: number | null;
  majorTitles: number;
  bestRank: number | null;
  bestRankSport: string | null;
  topSports: ZzcTopSport[];
  sportMerit: Record<string, number>;
  sportRank: Record<string, number>;
  nationalSports: ZzcTopSport[];
  suspended: boolean;
  defunct: boolean;
};

export type ZzcMethod = {
  halflife: number;
  cap: number;
  winterWeight: number;
  flagshipBoost: number;
  diminishGamma: number;
  suspendHalflife: number;
  rankTop: number;
  prestige: Record<string, number>;
  suspended: Record<string, number>;
};

export type ZzcMeta = {
  title: string;
  generated: number;
  method: ZzcMethod;
  count: number;
};

type ZzcFile = { _meta: ZzcMeta; nations: ZzcNation[] };

const GH_RAW =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data/zone-zero-cup.json";

const EMPTY: ZzcFile = {
  _meta: {
    title: "Zone Zero Cup",
    generated: 0,
    method: {
      halflife: 0, cap: 0, winterWeight: 0, flagshipBoost: 0, diminishGamma: 0,
      suspendHalflife: 0, rankTop: 0, prestige: {}, suspended: {},
    },
    count: 0,
  },
  nations: [],
};

function readLocal(): ZzcFile | null {
  try {
    return JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "zone-zero-cup.json"), "utf-8"),
    ) as ZzcFile;
  } catch {
    return null;
  }
}

async function d(): Promise<ZzcFile> {
  // In development prefer the local working copy so an unpushed regeneration
  // renders on localhost. In production the GitHub raw copy leads, preserving
  // the weekly no-deploy refresh; the bundled file is the fallback.
  if (process.env.NODE_ENV !== "production") {
    const local = readLocal();
    if (local) return local;
  }
  try {
    const r = await fetch(GH_RAW, { next: { revalidate: 3600 } });
    if (r.ok) return (await r.json()) as ZzcFile;
  } catch {
    /* fall through to the bundled copy */
  }
  return readLocal() ?? EMPTY;
}

export async function getZoneZeroCup(): Promise<ZzcFile> {
  return d();
}

export async function getZoneZeroNations(): Promise<ZzcNation[]> {
  return (await d()).nations;
}

export async function getZoneZeroMeta(): Promise<ZzcMeta> {
  return (await d())._meta;
}

/** Distinct continents present, in a stable display order. */
export async function getZoneZeroRegions(): Promise<string[]> {
  const order = ["North America", "South America", "Europe", "Africa", "Asia", "Oceania"];
  const present = new Set(
    (await d()).nations.map((n) => n.continent).filter((c): c is string => !!c),
  );
  return order.filter((c) => present.has(c));
}
