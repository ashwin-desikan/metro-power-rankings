import "server-only";

// International Football team-pages data layer.
//
// V1 scope: National team pages plus 8 tournament hubs under /teams/national/.
// Source: scripts/build-international-data.py reads Int Totals + Int Summary +
// Int Tournaments from the grand Football workbook and emits the JSONs we
// consume here.
//
// Server-only. Listed in scripts/check-client-imports.mjs SERVER_ONLY_MODULES.
//
// Client-safe display constants and pure helpers live in
// lib/international-display.ts so client components can import them without
// dragging the fs-based loaders into the client bundle. Don't re-export from
// here on purpose — explicit imports keep the boundary obvious.

import { existsSync, readFileSync } from "fs";
import { join } from "path";

// ---------- Types ----------

export type TournamentCategory = "WC" | "EUROS" | "COPA" | "AFCON" | "ASIAN"
  | "GOLD" | "OFC" | "INTER" | "OTHER";

export type FinalsCategory = "WC" | "CON" | "INTER" | "OTHER" | null;

export type NationalTeam = {
  slug: string;
  name: string;          // workbook Name (legacy / English variant)
  cur_name: string;      // workbook Cur. Name (display canonical)
  continent: string | null;
  federation: string | null;  // AFC / CAF / CONCACAF / COMNEBOL / OFC / UEFA
  elo_rank: number | null;
  fifa_rank: number | null;
  totals: {
    tour_app: number;
    trophies: number;
    major_trophies: number;
    last_app: number | null;
    last_sf: number | null;
    last_finals: number | null;
    last_trophy: number | null;
    last_major_trophy: number | null;
  };
  world_cup: {
    app: number;
    sf: number;
    finals: number;
    champ: number;
    last_app: number | null;
    last_finals: number | null;
    last_champ: number | null;
  };
  continental: {
    app: number;
    sf: number;
    finals: number;
    champ: number;
    last_app: number | null;
    last_champ: number | null;
  };
  intercontinental: {
    app: number;
    finals: number;
    champ: number;
  };
  other: {
    app: number;
    champ: number;
  };
  fifa_recognized: boolean;
  subdivision: string | null;
  active: boolean;
};

export type NationalTeamAppearance = {
  year: number;
  continent: string | null;
  category: TournamentCategory;
  tournament_label: string;
  round_reached: "Champion" | "Final" | "Semifinal" | "Quarterfinal" | "Round of 16" | "Group Stage" | "Appearance";
  champion: boolean;
  team_as: string | null;
  group: string | null;
};

export type NationalTeamFinal = {
  year: number;
  season: string | null;
  competition: string;
  category: FinalsCategory;
  result: "W" | "L" | "D" | null;
  for_goals: number | null;
  against_goals: number | null;
  penalty_kicks: number | null;
  opp_cur_name: string | null;
  opp_slug: string | null;
  opp_team_as: string | null;
  team_as: string | null;
  stadium: string | null;
  stad_country: string | null;
  stad_metro: string | null;
};

export type TournamentHub = {
  slug: string;
  label: string;
  category: TournamentCategory;
  year_min: number | null;
  year_max: number | null;
  editions: number;
  champions: Array<{
    year: number;
    champion_cur_name: string;
    champion_slug: string | null;
    champion_as: string | null;
    group: string | null;
  }>;
  finalists: Array<{
    year: number;
    cur_name: string;
    slug: string | null;
  }>;
  most_decorated: Array<{
    cur_name: string;
    slug: string | null;
    champion_count: number;
    last_won: number;
  }>;
};

type IndexPayload = {
  generated_at: string;
  source: string;
  rank_snapshots: { elo: string; fifa: string };
  teams: NationalTeam[];
};

// ---------- File loading ----------

const DATA_DIR = join(process.cwd(), "public", "data", "international");

function loadJson<T>(name: string, fallback: T): T {
  const path = join(DATA_DIR, name);
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (e) {
    console.error(`[lib/international] failed to read ${name}:`, e);
    return fallback;
  }
}

let _indexCache: IndexPayload | null = null;
let _appearancesCache: Record<string, NationalTeamAppearance[]> | null = null;
let _finalsCache: Record<string, NationalTeamFinal[]> | null = null;
let _tournamentsCache: Record<string, TournamentHub> | null = null;

function getIndex(): IndexPayload {
  if (!_indexCache) {
    _indexCache = loadJson<IndexPayload>("index.json", {
      generated_at: "",
      source: "",
      rank_snapshots: { elo: "", fifa: "" },
      teams: [],
    });
  }
  return _indexCache;
}

function getAppearancesMap(): Record<string, NationalTeamAppearance[]> {
  if (!_appearancesCache) {
    _appearancesCache = loadJson("appearances.json", {});
  }
  return _appearancesCache;
}

function getFinalsMap(): Record<string, NationalTeamFinal[]> {
  if (!_finalsCache) {
    _finalsCache = loadJson("finals.json", {});
  }
  return _finalsCache;
}

function getTournamentsMap(): Record<string, TournamentHub> {
  if (!_tournamentsCache) {
    _tournamentsCache = loadJson("tournaments.json", {});
  }
  return _tournamentsCache;
}

// ---------- Public accessors ----------

export function getAllNationalTeams(): NationalTeam[] {
  return getIndex().teams;
}

export function getAllNationalTeamSlugs(): string[] {
  return getIndex().teams.map((t) => t.slug);
}

export function getNationalTeamBySlug(slug: string): NationalTeam | null {
  return getIndex().teams.find((t) => t.slug === slug) ?? null;
}

export function getAppearancesForTeam(slug: string): NationalTeamAppearance[] {
  return getAppearancesMap()[slug] ?? [];
}

export function getFinalsForTeam(slug: string): NationalTeamFinal[] {
  return getFinalsMap()[slug] ?? [];
}

export function getAllTournamentHubs(): TournamentHub[] {
  return Object.values(getTournamentsMap());
}

export function getAllTournamentHubSlugs(): string[] {
  return Object.keys(getTournamentsMap());
}

export function getTournamentHub(slug: string): TournamentHub | null {
  return getTournamentsMap()[slug] ?? null;
}

export function getRankSnapshots(): { elo: string; fifa: string } {
  return getIndex().rank_snapshots;
}
