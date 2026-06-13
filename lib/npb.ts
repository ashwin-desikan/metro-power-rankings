import "server-only";

// Nippon Professional Baseball (NPB) data layer, nested under /teams/baseball.
// Source: scripts/npb/build_npb_data.py from a Wikipedia extract (1950-2025).
// Historical franchises fold into the 12 current clubs; the Japan Series is the
// headline honour, with Central/Pacific regular-season pennants secondary.
//
// Server-only. Listed in scripts/check-client-imports.mjs SERVER_ONLY_MODULES.

import { existsSync, readFileSync } from "fs";
import { join } from "path";

export type NpbTeam = {
  slug: string; name: string; division: string;
  city: string | null; metro: string | null; metro_slug: string | null;
  js_titles: number; js_title_years: number[];
  js_runnerup: number; js_ru_years: number[];
  pennants: number; pennant_years: number[];
  seasons: number; first_season: number | null;
  w: number; l: number; t: number; win_pct: number;
};

export type NpbSeasonRow = {
  year: number; team: string; league: string; pos: string | number;
  w: number; l: number; t: number; pct: string | number | null; gb: string | number | null;
};

export type NpbDetail = {
  slug: string; name: string; division: string;
  city: string | null; metro: string | null; metro_slug: string | null; first_season: number | null;
  js_titles: number; js_title_years: number[];
  pennants: number; pennant_years: number[];
  w: number; l: number; t: number; win_pct: number;
  seasons: NpbSeasonRow[];
};

export type NpbHub = {
  japan_series: { year: number; champion: string; runner_up: string | null }[];
  totals: { teams: number; seasons: number; js_editions: number };
};

export type NpbDefunct = {
  name: string; division: string;
  city: string | null; metro: string | null; metro_slug: string | null;
  first_season: number; last_season: number; seasons: number;
  js_titles: number; pennants: number; js_runnerup: number; js_ru_years: number[];
  w: number; l: number; t: number; win_pct: number;
  successor: string; defunct: true;
};

const DATA_DIR = join(process.cwd(), "public", "data", "npb");

function loadJson<T>(rel: string): T | null {
  const p = join(DATA_DIR, rel);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8")) as T;
}

let _teams: NpbTeam[] | null = null;
let _hub: NpbHub | null = null;
let _bySlug: Map<string, NpbTeam> | null = null;
let _byName: Map<string, NpbTeam> | null = null;

export function getAllNpbTeams(): NpbTeam[] {
  if (!_teams) _teams = loadJson<NpbTeam[]>("teams.json") ?? [];
  return _teams;
}

export function getNpbHub(): NpbHub | null {
  if (!_hub) _hub = loadJson<NpbHub>("hub.json");
  return _hub;
}

export function getNpbTeamBySlug(slug: string): NpbTeam | null {
  if (!_bySlug) _bySlug = new Map(getAllNpbTeams().map((t) => [t.slug, t]));
  return _bySlug.get(slug) ?? null;
}

export function getAllNpbSlugs(): string[] {
  return getAllNpbTeams().map((t) => t.slug);
}

export function getNpbTeamDetail(slug: string): NpbDetail | null {
  return loadJson<NpbDetail>(join("team-detail", `${slug}.json`));
}

// Metro-card join: look up an NPB club by its (current) team name.
export function getNpbTeamByName(name: string): NpbTeam | null {
  if (!_byName) _byName = new Map(getAllNpbTeams().map((t) => [t.name, t]));
  return _byName.get(name) ?? null;
}

let _defunct: NpbDefunct[] | null = null;

// Defunct franchises (Kintetsu, the 1950s Unions/Stars) with no modern club
// under that name. Surfaced under the All filter on the all-time table.
export function getNpbDefunct(): NpbDefunct[] {
  if (!_defunct) _defunct = loadJson<NpbDefunct[]>("defunct.json") ?? [];
  return _defunct;
}
