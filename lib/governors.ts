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
