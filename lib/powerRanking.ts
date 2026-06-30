import "server-only";
import fs from "fs";
import path from "path";

export type PowerEntry = {
  name: string; role: string; category: string;
  jurisdiction: string; jscore: number; weight: number; power: number;
};
export type PowerRanking = { weights: Record<string, number>; ranking: PowerEntry[] };

const GH_RAW = "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data/power-ranking.json";

export async function getPowerRanking(): Promise<PowerRanking | null> {
  try {
    const r = await fetch(GH_RAW, { next: { revalidate: 3600 } });
    if (r.ok) return (await r.json()) as PowerRanking;
  } catch {
    /* fall through */
  }
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "power-ranking.json"), "utf-8"));
  } catch {
    return null;
  }
}
