import "server-only";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

// British & Irish Lions Test history (public/data/rugby/lions.json, generated
// from the Wikipedia match list). The Lions are a periodic composite of the four
// home unions, not a ranked nation, so they live as a hub feature rather than in
// the nation-vs-nation rugby_results database.

export type LionsMatch = {
  date: string; location: string; opponent: string;
  lions: number; opp: number; result: "W" | "L" | "D"; test: boolean;
};
export type LionsTour = { year: number; title: string; matches: LionsMatch[] };
export type LionsSeries = {
  year: number; opponent: string; tests: number; w: number; l: number; d: number; series: "W" | "L" | "D";
};
export type LionsRecord = { P: number; W: number; L: number; D: number; seriesW: number; seriesL: number; seriesD: number };
export type LionsData = { tours: LionsTour[]; series: LionsSeries[]; allTime: Record<string, LionsRecord> };

let _d: LionsData | null | undefined;
export function getLionsHistory(): LionsData | null {
  if (_d !== undefined) return _d;
  const p = join(process.cwd(), "public", "data", "rugby", "lions.json");
  _d = existsSync(p) ? (JSON.parse(readFileSync(p, "utf-8")) as LionsData) : null;
  return _d;
}
