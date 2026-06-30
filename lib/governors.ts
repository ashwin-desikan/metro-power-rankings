import "server-only";
import fs from "fs";
import path from "path";

export type StateGovernor = { name: string; party: string; since: string };
export type TerritoryGovernor = {
  name: string;
  title: string;
  party: string;
  since: string;
  countryName: string;
};
type GovData = {
  states: Record<string, StateGovernor>;
  territories: Record<string, TerritoryGovernor>;
};

const GH_RAW =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data/governors.json";

// ISR from GitHub raw (weekly refresh updates with no build); committed file is
// the build-time fallback.
async function load(): Promise<GovData> {
  try {
    const res = await fetch(GH_RAW, { next: { revalidate: 3600 } });
    if (res.ok) return (await res.json()) as GovData;
  } catch {
    /* fall through */
  }
  try {
    const file = path.join(process.cwd(), "public", "data", "governors.json");
    return JSON.parse(fs.readFileSync(file, "utf-8")) as GovData;
  } catch {
    return { states: {}, territories: {} };
  }
}

export async function getStateGovernor(slug: string): Promise<StateGovernor | null> {
  return (await load()).states[slug] ?? null;
}
export async function getAllStateGovernors(): Promise<Record<string, StateGovernor>> {
  return (await load()).states;
}
export async function getTerritoryGovernors(): Promise<Record<string, TerritoryGovernor>> {
  return (await load()).territories;
}

export type StateScore = { score: number; metros: number };
let _scoreCache: Record<string, StateScore> | null = null;
function loadScores(): Record<string, StateScore> {
  if (_scoreCache) return _scoreCache;
  try {
    const file = path.join(process.cwd(), "public", "data", "state-metro-scores.json");
    _scoreCache = JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    _scoreCache = {};
  }
  return _scoreCache!;
}
/** Population-weighted sum of metro scores for a US state (static; build-time). */
export function getStateMetroScore(slug: string): StateScore | null {
  return loadScores()[slug] ?? null;
}
