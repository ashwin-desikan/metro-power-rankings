import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// ─── Types ───────────────────────────────────────────────────────────────────

export type IplFranchise = {
  slug: string;
  name: string;
  abbr: string;
  city: string;
  state: string;
  metro: string;
  founded: number;
  active: boolean;
  color: string;
  color2: string;
  seasons: number;
  playoff_appearances: number;
  finals: number;
  titles: number;
  title_years: number[];
  runner_up_count: number;
  runner_up_years: number[];
  last_title: number | null;
  last_final: number | null;
};

export type IplStanding = {
  pos: number;
  team: string;       // historical name used that season
  name: string;       // canonical current name
  slug: string;
  m: number;
  w: number;
  l: number;
  nr: number;
  pts: number;
  nrr: number;
  playoffs: boolean;
  finalist: boolean;
  champion: boolean;
  active: boolean;
};

export type IplPlayoffMatch = {
  round: string;
  team1: string;
  team2: string;
  result: string;
};

export type IplSeason = {
  year: number;
  teams: number;
  champion: string | null;
  champion_slug: string | null;
  runner_up: string | null;
  runner_up_slug: string | null;
  standings: IplStanding[];
  playoffs: IplPlayoffMatch[];
};

export type IplMeta = {
  league: string;
  abbr: string;
  sport: string;
  format: string;
  founded: number;
  latest_season: number;
  total_seasons: number;
  active_teams: number;
};

export type ChampionEntry = {
  year: number;
  champion: string;
  champion_slug: string | null;
  runner_up: string | null;
  runner_up_slug: string | null;
  final_result: string | null;
};

export type PlayoffOpponent = { round: string; opponent: string; result: string };

export type FranchiseSeason = IplStanding & {
  year: number;
  playoff_result: string | null;   // "Champion" | "Runner-up" | "Q2" | "Eliminator" | "Semi-final" | null
  playoff_matches: PlayoffOpponent[];
};

// ─── Data loading (cached) ────────────────────────────────────────────────────

type IplData = { meta: IplMeta; franchises: IplFranchise[]; seasons: IplSeason[] };
let _cache: IplData | null = null;
function loadData(): IplData {
  if (_cache) return _cache;
  const file = join(process.cwd(), "public", "data", "ipl", "data.json");
  _cache = JSON.parse(readFileSync(file, "utf8")) as IplData;
  return _cache;
}

// ─── Playoff round sort order ─────────────────────────────────────────────────

const ROUND_ORDER: Record<string, number> = {
  "Qualifier 1": 1, "Semifinal 1": 1,
  "Eliminator": 2, "Semifinal 2": 2,
  "Qualifier 2": 3, "Third-Place Playoff": 3,
  "Final": 4,
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

function computePlayoffResult(st: IplStanding, season: IplSeason): string | null {
  if (!st.playoffs) return null;
  if (st.champion) return "Champion";
  if (st.finalist) return "Runner-up";
  const names = new Set([st.team, st.name]);
  const seen = new Set<string>();
  for (const m of season.playoffs) {
    if (names.has(m.team1) || names.has(m.team2)) seen.add(m.round);
  }
  if (seen.has("Qualifier 2"))  return "Q2";
  if (seen.has("Eliminator"))   return "Eliminator";
  if (seen.has("Qualifier 1"))  return "Q1";
  if (seen.has("Semifinal 1") || seen.has("Semifinal 2")) return "Semi-final";
  return "Playoffs";
}

function computePlayoffMatches(st: IplStanding, season: IplSeason): PlayoffOpponent[] {
  const names = new Set([st.team, st.name]);
  return season.playoffs
    .filter(m => names.has(m.team1) || names.has(m.team2))
    .sort((a, b) => (ROUND_ORDER[a.round] ?? 9) - (ROUND_ORDER[b.round] ?? 9))
    .map(m => ({
      round: m.round,
      opponent: names.has(m.team1) ? m.team2 : m.team1,
      result: m.result,
    }));
}

// ─── Public helpers ───────────────────────────────────────────────────────────

export function getIplMeta(): IplMeta { return loadData().meta; }
export function getAllFranchises(): IplFranchise[] { return loadData().franchises; }
export function getActiveFranchises(): IplFranchise[] { return loadData().franchises.filter(f => f.active); }
export function getAllFranchiseSlugs(): string[] { return loadData().franchises.map(f => f.slug); }
export function getFranchiseBySlug(slug: string): IplFranchise | null {
  return loadData().franchises.find(f => f.slug === slug) ?? null;
}
export function getAllSeasons(): IplSeason[] { return loadData().seasons; }
export function getLatestSeason(): IplSeason {
  const s = loadData().seasons; return s[s.length - 1];
}

export function getFranchiseSeasons(slug: string): FranchiseSeason[] {
  const result: FranchiseSeason[] = [];
  for (const season of loadData().seasons) {
    const st = season.standings.find(s => s.slug === slug);
    if (!st) continue;
    result.push({
      ...st,
      year: season.year,
      playoff_result: computePlayoffResult(st, season),
      playoff_matches: computePlayoffMatches(st, season),
    });
  }
  return result.reverse(); // most recent first
}

export function getChampionshipHistory(): ChampionEntry[] {
  return loadData().seasons.map(s => ({
    year: s.year,
    champion: s.champion ?? "—",
    champion_slug: s.champion_slug,
    runner_up: s.runner_up,
    runner_up_slug: s.runner_up_slug,
    final_result: s.playoffs.find(p => p.round === "Final")?.result ?? null,
  })).reverse();
}

export function monogramFor(f: IplFranchise): { mono: string; bg: string; fg: string } {
  return { mono: f.abbr, bg: f.color, fg: "#FFFFFF" };
}

// ─── Metro slug lookup ────────────────────────────────────────────────────────

const METRO_SLUG: Record<string, string> = {
  "mumbai-indians":         "mumbai",
  "chennai-super-kings":    "chennai",
  "kolkata-knight-riders":  "calcutta",
  "rcb":                    "bangalore",
  "sunrisers-hyderabad":    "hyderabad",
  "delhi-capitals":         "delhi",
  "rajasthan-royals":       "jaipur",
  "punjab-kings":           "chandigarh",
  "gujarat-titans":         "ahmedabad",
  "lucknow-super-giants":   "lucknow",
  "deccan-chargers":        "hyderabad",
  "kochi-tuskers":          "kochi",
  "pune-warriors":          "pune",
  "gujarat-lions":          "rajkot",
  "rising-pune-supergiant": "pune",
};

export function getMetroSlugForFranchise(slug: string): string | null {
  return METRO_SLUG[slug] ?? null;
}

export function getIplFranchiseByTeamName(name: string): IplFranchise | null {
  const norm = name.trim().toLowerCase();
  return loadData().franchises.find(f => f.name.toLowerCase() === norm) ?? null;
}
