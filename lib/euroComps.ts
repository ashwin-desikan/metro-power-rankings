import "server-only";
import { readFile } from "fs/promises";
import { join } from "path";

// UEFA club competition live/upcoming/recent fixtures (Champions League,
// Europa League, Conference League). The data is produced by a scheduled job
// (scripts/football/build-euro-comps.py, API-Football) that commits
// public/data/football/euro-comps.json with [vercel skip]. This lib reads that
// committed JSON from GitHub raw at runtime via ISR (revalidate 1800), so the
// qualifying results and fixtures refresh without a deploy — the same pattern
// as lib/wc2026Standings.ts. It falls back to the on-disk copy in public/ when
// raw is unavailable (local dev before the file is on main; a raw outage; the
// first deploy before the refresh job has run). Fail-soft: any error hides the
// block.

export type EuroPhase = "qualifying" | "league" | "knockout";

export type EuroMatch = {
  date: string;
  round: string;
  phase: EuroPhase;
  home: string;
  away: string;
  homeGoals: number | null;
  awayGoals: number | null;
  status: "live" | "upcoming" | "recent";
  statusShort: string;
};

export type EuroComp = {
  label: string;
  season: number;
  live: EuroMatch[];
  upcoming: EuroMatch[];
  recent: EuroMatch[];
};

type EuroDoc = {
  generated: string;
  season: number;
  comps: Record<string, EuroComp>;
};

const GH_RAW =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data/football";

async function fromRaw(): Promise<EuroDoc | null> {
  try {
    const res = await fetch(`${GH_RAW}/euro-comps.json`, { next: { revalidate: 1800 } });
    if (!res.ok) return null;
    return (await res.json()) as EuroDoc;
  } catch {
    return null;
  }
}

async function fromDisk(): Promise<EuroDoc | null> {
  try {
    const p = join(process.cwd(), "public", "data", "football", "euro-comps.json");
    return JSON.parse(await readFile(p, "utf-8")) as EuroDoc;
  } catch {
    return null;
  }
}

export async function getEuroCompFixtures(slug: string): Promise<EuroComp | null> {
  const doc = (await fromRaw()) ?? (await fromDisk());
  const c = doc?.comps?.[slug];
  if (!c) return null;
  if (!c.live?.length && !c.upcoming?.length && !c.recent?.length) return null;
  return c;
}
