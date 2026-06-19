import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

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

let _d: ZzcFile | null = null;

function d(): ZzcFile {
  if (!_d) {
    _d = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "zone-zero-cup.json"), "utf-8"),
    ) as ZzcFile;
  }
  return _d;
}

export function getZoneZeroCup(): ZzcFile {
  return d();
}

export function getZoneZeroNations(): ZzcNation[] {
  return d().nations;
}

export function getZoneZeroMeta(): ZzcMeta {
  return d()._meta;
}

/** Distinct continents present, in a stable display order. */
export function getZoneZeroRegions(): string[] {
  const order = ["North America", "South America", "Europe", "Africa", "Asia", "Oceania"];
  const present = new Set(
    d().nations.map((n) => n.continent).filter((c): c is string => !!c),
  );
  return order.filter((c) => present.has(c));
}
