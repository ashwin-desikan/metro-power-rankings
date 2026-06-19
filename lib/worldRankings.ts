import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

export type RankingRow = {
  rank: number;
  name: string;
  code?: string;
  points: number;
  slug: string | null;
  engineSlug: string | null;
};

export type WorldRanking = {
  _meta: { sport: string; source: string; asOf: string; count: number };
  rows: RankingRow[];
  suspended?: RankingRow[];
};

const cache: Record<string, WorldRanking> = {};

/** key is the file stem under public/data/rankings, e.g. "hockey-men". */
export function getWorldRanking(key: string): WorldRanking {
  if (!cache[key]) {
    cache[key] = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "rankings", `${key}.json`), "utf-8"),
    ) as WorldRanking;
  }
  return cache[key];
}
