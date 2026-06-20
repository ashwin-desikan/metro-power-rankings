import "server-only";

// Tennis & golf majors data layer (/teams/golf and /teams/tennis).
// Source: scripts/build-majors-data.py — reads Majors.xlsx (winners) and joins
// each champion to its host metro via the Golf-Tennis-F1 venue events embedded
// in public/data/details/*.json, on (sport, tournament, year). Emits
// public/data/majors/{golf,tennis}.json. Server-only.
// Listed in scripts/check-client-imports.mjs SERVER_ONLY_MODULES.

import { existsSync, readFileSync } from "fs";
import { join } from "path";

export type Champion = {
  year: number;
  tournament: string;
  gender?: "M" | "W";
  champion: string;
  nation: string | null;
  careerNo: number | null;
  careerTotal: number | null;
  note: string;
  metroSlug?: string;
  metroName?: string;
  venue?: string;
};

export type Leader = { player: string; nation: string | null; total: number; byTour: Record<string, number> };
export type NationTally = { nation: string; titles: number };
export type HostMetro = { metroSlug: string; metroName: string; count: number };

export type RyderEdition = {
  edition: number; year: number; winner: string; score: string;
  host: string; venue: string; usCaptain: string; homeCaptain: string;
  metroSlug?: string; metroName?: string;
};

export type DavisNation = {
  country: string; titles: number; titleYears: string | null;
  runnerUp: number; runnerUpYears: string | null;
};

export type GolfData = {
  sport: string; tournaments: string[]; champions: Champion[];
  leaders: Leader[]; byNation: NationTally[]; hostMetros: HostMetro[];
  ryder: RyderEdition[]; ryderTally: Record<string, number>;
};

export type TennisData = {
  sport: string; tournaments: string[]; champions: Champion[];
  leadersMen: Leader[]; leadersWomen: Leader[];
  byNationMen: NationTally[]; byNationWomen: NationTally[];
  hostMetros: HostMetro[]; davis: DavisNation[];
};

const DATA_DIR = join(process.cwd(), "public", "data", "majors");

function loadJson<T>(rel: string): T | null {
  const p = join(DATA_DIR, rel);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8")) as T;
}

let _golf: GolfData | null = null;
let _tennis: TennisData | null = null;

export function getGolfMajors(): GolfData | null {
  if (!_golf) _golf = loadJson<GolfData>("golf.json");
  return _golf;
}
export function getTennisMajors(): TennisData | null {
  if (!_tennis) _tennis = loadJson<TennisData>("tennis.json");
  return _tennis;
}

// Group a flat champions list by tournament, each sorted most-recent first.
export function byTournament(champs: Champion[], gender?: "M" | "W"): Map<string, Champion[]> {
  const m = new Map<string, Champion[]>();
  for (const c of champs) {
    if (gender && c.gender !== gender) continue;
    if (!m.has(c.tournament)) m.set(c.tournament, []);
    m.get(c.tournament)!.push(c);
  }
  for (const arr of m.values()) arr.sort((a, b) => b.year - a.year);
  return m;
}

// Most-recent champion per tournament (for the hero cards).
export function latestByTournament(champs: Champion[], gender?: "M" | "W"): Map<string, Champion> {
  const grouped = byTournament(champs, gender);
  const out = new Map<string, Champion>();
  for (const [t, arr] of grouped) if (arr.length) out.set(t, arr[0]);
  return out;
}

// Nation display name -> country-page slug, for flags and /countries links.
const NATION_SLUG_OVERRIDE: Record<string, string> = {
  // "United Kingdom" players (Murray, Perry, Wade, Raducanu) need the
  // "great-britain" key, which flagCdnUrl maps to the gb flag; "united-kingdom"
  // has no flag entry. Home nations (England/Scotland/Wales/Northern Ireland)
  // resolve on their own.
  "United Kingdom": "great-britain",
  "United Kingdom of Great Britain and Ireland": "great-britain",
  "West Germany": "germany",
  "Weimar Republic": "germany",
  "Soviet Union": "russia",
  "Czechoslovakia": "czech-republic",
  "Republic of Ireland": "ireland",
  "Socialist Federal Republic of Yugoslavia": "serbia",
  "Federal Republic of Yugoslavia": "serbia",
};

export function nationSlug(name: string | null): string | null {
  if (!name) return null;
  if (NATION_SLUG_OVERRIDE[name]) return NATION_SLUG_OVERRIDE[name];
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
