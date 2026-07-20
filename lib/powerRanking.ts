import "server-only";
import fs from "fs";
import path from "path";

export type PowerEntry = {
  name: string; role: string; category: string;
  jurisdiction: string; jurisdictionHref?: string; transition?: string; metro: string; metroSlug: string; jscore: number; weight: number; power: number;
  prevRank?: number | null; delta?: number | null; isNew?: boolean;
};
export type DroppedEntry = { name: string; prevRank: number; category: string; jurisdiction: string };
export type PowerRanking = { weights: Record<string, number>; asOf?: string; prevSnapshotDate?: string | null; ranking: PowerEntry[]; dropped?: DroppedEntry[] };

const GH_RAW = "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data/power-ranking.json";

function readLocalPowerRanking(): PowerRanking | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "power-ranking.json"), "utf-8"));
  } catch {
    return null;
  }
}

export async function getPowerRanking(): Promise<PowerRanking | null> {
  // In development, prefer the local working copy so unpushed data (e.g. the
  // metro column before it is pushed to GitHub) renders on localhost. In
  // production the deployed GitHub raw copy leads, preserving the weekly
  // no-deploy data refresh; the bundled file is the fallback.
  if (process.env.NODE_ENV !== "production") {
    const local = readLocalPowerRanking();
    if (local) return local;
  }
  try {
    const r = await fetch(GH_RAW, { next: { revalidate: 3600 } });
    if (r.ok) return (await r.json()) as PowerRanking;
  } catch {
    /* fall through */
  }
  return readLocalPowerRanking();
}
