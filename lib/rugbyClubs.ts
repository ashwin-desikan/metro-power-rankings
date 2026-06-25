import "server-only";

// Club rugby honours layer: winners-only rolls for seven competitions
// (Champions Cup incl. Heineken era, Top 14, Premiership, Super Rugby,
// Currie Cup, URC lineage, Japan Top League/League One), matched to the
// Team List's rugby union clubs by scripts/rugby/build_club_honours.py.
// Winners only by design (user decision 2026-06-12) — no tables.
//
// Server-only. Listed in scripts/check-client-imports.mjs SERVER_ONLY_MODULES.

import { existsSync, readFileSync } from "fs";
import { join } from "path";

export type ClubHonour = { comp: string; titles: number; years: string[] };

export type RugbyClub = {
  name: string;
  league: string;
  metro: string;
  honours: ClubHonour[];
};

export type ClubRollRow = {
  season: string; winner: string; ru: string; shared?: boolean | null;
  // Set by the ETL when the winner matches a Team List club.
  team?: string | null; metro_slug?: string | null;
};

export type ClubRolls = {
  rolls: Record<string, ClubRollRow[]>;
  most_titled: Record<string, { winner: string; titles: number; team?: string | null }[]>;
  labels: Record<string, string>;
};

const DATA_DIR = join(process.cwd(), "public", "data", "rugby-union");

function loadJson<T>(rel: string): T | null {
  const p = join(DATA_DIR, rel);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8")) as T;
}

let _clubs: RugbyClub[] | null = null;
let _rolls: ClubRolls | null = null;
let _byKey: Map<string, RugbyClub> | null = null;

export function getAllRugbyClubs(): RugbyClub[] {
  if (!_clubs) _clubs = loadJson<RugbyClub[]>("clubs.json") ?? [];
  return _clubs;
}

export function getRugbyClubRolls(): ClubRolls | null {
  if (!_rolls) _rolls = loadJson<ClubRolls>("club-rolls.json");
  return _rolls;
}

// Lookup for metro team cards. The metro extract's league label is the
// workbook display value ("Dom. Rugby Union"), not the competition, so we
// match by name: exact league match wins when present, otherwise all
// same-name entities merge (the Sharks' URC and Currie Cup rows are one
// organization on Durban's card).
let _byName: Map<string, RugbyClub[]> | null = null;

export function getRugbyClubHonours(name: string, league: string | undefined): ClubHonour[] {
  if (!_byKey) {
    _byKey = new Map();
    _byName = new Map();
    for (const c of getAllRugbyClubs()) {
      _byKey.set(`${c.name}::${c.league}`, c);
      const list = _byName.get(c.name) ?? [];
      list.push(c);
      _byName.set(c.name, list);
    }
  }
  if (league) {
    const exact = _byKey.get(`${name}::${league}`);
    if (exact) return exact.honours;
  }
  const matches = _byName!.get(name) ?? [];
  const merged: ClubHonour[] = [];
  for (const m of matches) {
    for (const h of m.honours) {
      if (!merged.some((x) => x.comp === h.comp)) merged.push(h);
    }
  }
  return merged.sort((a, b) => b.titles - a.titles);
}
