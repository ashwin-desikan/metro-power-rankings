import "server-only";

// Domestic T20 league champions layer (winners only, mirroring Domestic
// Rugby). Source: scripts/cricket/build_t20_leagues.py over the local
// cricsheet archive. Honours matched to Team List franchises; defunct
// champions (Deccan Chargers, Comilla Victorians, ...) appear in rolls only.
//
// Server-only. Listed in scripts/check-client-imports.mjs SERVER_ONLY_MODULES.

import { existsSync, readFileSync } from "fs";
import { join } from "path";

export type T20RollRow = { season: string; winner: string; ru: string };

export type T20Data = {
  rolls: Record<string, T20RollRow[]>;
  most_titled: Record<string, { winner: string; titles: number }[]>;
  labels: Record<string, string>;
  honours: { name: string; league: string; titles: number; years: string[] }[];
};

const P = join(process.cwd(), "public", "data", "cricket", "t20-leagues.json");

let _data: T20Data | null = null;

export function getT20Leagues(): T20Data | null {
  if (!_data && existsSync(P)) {
    _data = JSON.parse(readFileSync(P, "utf-8")) as T20Data;
  }
  return _data;
}

let _byName: Map<string, { league: string; titles: number; years: string[] }[]> | null = null;

// Some counties play a T20 competition under a different brand than their
// Team List franchise name (e.g. Warwickshire Bears contest the Vitality
// Blast as "Birmingham Bears"). The honours layer is keyed by the brand used
// in the cricsheet finals, so an exact metro-card lookup on the Team List
// name misses those Blast titles. Map Team List name -> honours-brand name.
const T20_NAME_ALIASES: Record<string, string> = {
  "Warwickshire Bears": "Birmingham Bears",
  "Essex": "Essex Eagles",
  "Northamptonshire Steelbacks": "Northants Steelbacks",
};

// Metro-card lookup: name-first (the metro extract's league label is a
// workbook display value, not the competition name).
export function getT20Honours(name: string): { league: string; titles: number; years: string[] }[] {
  if (!_byName) {
    _byName = new Map();
    const d = getT20Leagues();
    for (const h of d?.honours ?? []) {
      const list = _byName.get(h.name) ?? [];
      list.push({ league: h.league, titles: h.titles, years: h.years });
      _byName.set(h.name, list);
    }
  }
  return _byName.get(name) ?? _byName.get(T20_NAME_ALIASES[name] ?? "") ?? [];
}
