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

let _cache: GovData | null = null;

function load(): GovData {
  if (_cache) return _cache;
  try {
    const file = path.join(process.cwd(), "public", "data", "governors.json");
    _cache = JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    _cache = { states: {}, territories: {} };
  }
  return _cache!;
}

export function getStateGovernor(slug: string): StateGovernor | null {
  return load().states[slug] ?? null;
}
export function getAllStateGovernors(): Record<string, StateGovernor> {
  return load().states;
}
export function getTerritoryGovernors(): Record<string, TerritoryGovernor> {
  return load().territories;
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
/** Population-weighted sum of metro scores for a US state: each metro's score
 * apportioned by the share of its population living in the state (Municipality
 * sheet), so cross-state metros are split rather than double-counted. */
export function getStateMetroScore(slug: string): StateScore | null {
  return loadScores()[slug] ?? null;
}
