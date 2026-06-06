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

export type ContinentTournamentCode = "EUROS" | "COPA" | "AFCON" | "ASIAN" | "GOLD" | "OFC";

export type HonorsBreakdown = {
  wc_champ: number;
  wc_finals_lost: number;
  wc_sf_only: number;
  continental_champ: number;
  continental_finals_lost: number;
  intercontinental_champ: number;
  per_continent_champ: Record<ContinentTournamentCode, number>;
  per_continent_runner_up: Record<ContinentTournamentCode, number>;
};

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
  // Weighted honors index plus the per-category breakdown used to defend
  // the score. Populated by build-international-data.py. See HONORS_WEIGHTS
  // and CONTINENT_TOURNAMENT_WEIGHTS in that script for the math.
  honors_index: number;
  honors_breakdown: HonorsBreakdown;
  // Longevity signals used by the similar-teams engine. Tournament span is
  // last_year - first_year across all categorized appearances; decade
  // coverage is the count of distinct decades with at least one appearance.
  tournament_span_years: number;
  decade_coverage: number;
};

export type HonorsLeaderboardEntry = {
  rank: number;
  slug: string;
  cur_name: string;
  continent: string | null;
  honors_index: number;
  honors_breakdown: HonorsBreakdown;
  elo_rank: number | null;
  fifa_rank: number | null;
  active: boolean;
};

export type HonorsLeaderboardPayload = {
  weights: Record<string, number>;
  leaderboard: HonorsLeaderboardEntry[];
  leaderboard_size: number;
};

export type SimilarTeamNeighbor = {
  slug: string;
  cur_name: string;
  continent: string | null;
  distance: number;
  shared_axis: string | null;
  honors_index: number | null;
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

export type WorldCup2026GroupRow = {
  cur_name: string;
  slug: string | null;
  w: number;
  d: number;
  l: number;
  gs: number;
  ga: number;
  gd: number;
  pts: number;
  matches: number;
};

export type WorldCup2026KnockoutMatch = {
  team_cur_name: string;
  team_slug: string | null;
  opp_cur_name: string;
  opp_slug: string | null;
  team_score: number | null;
  opp_score: number | null;
  penalty_kicks: number | null;
  result: string | null;
  stadium: string | null;
  stad_country: string | null;
  stad_metro: string | null;
  date: string | null;
  played: boolean;
};

export type WorldCup2026SimRow = {
  exp_points: number;
  p_advance: number;
  p_win_group: number;
};

export type WorldCup2026DeepRow = {
  slug: string;
  name: string;
  group: string;
  p_r16: number;
  p_qf: number;
  p_sf: number;
  p_final: number;
  p_title: number;
  market_prob: number;
};

export type WorldCup2026Sim = {
  meta: {
    sims: number;
    generated_at: string;
    blend_market_weight: number;
    odds_source: string;
    odds_as_of: string;
  };
  by_slug: Record<string, WorldCup2026SimRow>;
  deep_runs: WorldCup2026DeepRow[];
};

export type WorldCup2026Bundle = {
  tournament: { name: string; year: number; starts_iso: string };
  group_stage: Record<string, WorldCup2026GroupRow[]>;
  knockout: Record<string, WorldCup2026KnockoutMatch[]>;
  sim?: WorldCup2026Sim | null;
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
    // Per-edition tournament label, populated only for variable-name hubs
    // (Intercontinental Tournaments, Other Tournaments) where the workbook
    // lumps several distinct competitions under one flag. Null for hubs
    // whose name is fixed (the hub label itself names the tournament).
    tournament_label: string | null;
  }>;
  finalists: Array<{
    year: number;
    cur_name: string;
    slug: string | null;
    tournament_label: string | null;
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
let _wc2026Cache: WorldCup2026Bundle | null = null;
let _wc2026Checked = false;
let _honorsCache: HonorsLeaderboardPayload | null = null;
let _similarCache: Record<string, SimilarTeamNeighbor[]> | null = null;

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

export function getHonorsLeaderboard(): HonorsLeaderboardPayload {
  if (!_honorsCache) {
    _honorsCache = loadJson<HonorsLeaderboardPayload>("honors-leaderboard.json", {
      weights: {},
      leaderboard: [],
      leaderboard_size: 0,
    });
  }
  return _honorsCache;
}

export function getSimilarTeamsForTeam(slug: string): SimilarTeamNeighbor[] {
  if (!_similarCache) {
    _similarCache = loadJson<Record<string, SimilarTeamNeighbor[]>>("similar-teams.json", {});
  }
  return _similarCache[slug] ?? [];
}

type RawWc2026Sim = {
  meta: WorldCup2026Sim["meta"];
  groups: Record<string, Array<{ slug: string; exp_points: number; p_advance: number; p_win_group: number }>>;
  deep_runs: WorldCup2026DeepRow[];
};

function buildWc2026Sim(): WorldCup2026Sim | null {
  const raw = loadJson<RawWc2026Sim | null>("wc2026-sim.json", null);
  if (!raw || !raw.groups) return null;
  const by_slug: Record<string, WorldCup2026SimRow> = {};
  for (const g of Object.keys(raw.groups)) {
    for (const r of raw.groups[g]) {
      by_slug[r.slug] = {
        exp_points: r.exp_points,
        p_advance: r.p_advance,
        p_win_group: r.p_win_group,
      };
    }
  }
  return { meta: raw.meta, by_slug, deep_runs: raw.deep_runs ?? [] };
}

export function getWorldCup2026(): WorldCup2026Bundle | null {
  if (!_wc2026Checked) {
    const candidate = loadJson<WorldCup2026Bundle | null>("wc2026.json", null);
    _wc2026Cache = candidate && candidate.tournament ? candidate : null;
    if (_wc2026Cache) {
      _wc2026Cache.sim = buildWc2026Sim();
    }
    _wc2026Checked = true;
  }
  return _wc2026Cache;
}

// Resolve a team's deepest stage in the 2026 World Cup so the per-team
// page's WC2026 appearance row shows a live indicator that progresses
// through the tournament. Returns the deepest round the team appears in,
// from "Final" / "Third Place Game" / "Semifinals" / "Quarterfinals" /
// "Round of 16" / "Round of 32" / "Group Stage". Returns null when the
// team isn't in the bracket at all (qualifier-stage casualties, etc.).
const WC2026_DEEPEST_ROUND_PRIORITY = [
  "Final",
  "Third Place Game",
  "Semifinals",
  "Quarterfinals",
  "Round of 16",
  "Round of 32",
];

export function getWorldCup2026StageForTeam(slug: string): string | null {
  const wc = getWorldCup2026();
  if (!wc) return null;
  for (const rn of WC2026_DEEPEST_ROUND_PRIORITY) {
    const matches = wc.knockout[rn] ?? [];
    if (matches.some((m) => m.team_slug === slug || m.opp_slug === slug)) {
      return rn;
    }
  }
  for (const teams of Object.values(wc.group_stage)) {
    if (teams.some((t) => t.slug === slug)) return "Group Stage";
  }
  return null;
}
