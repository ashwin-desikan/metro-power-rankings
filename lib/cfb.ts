import "server-only";
import { readFileSync } from "fs";
import { join } from "path";
import type { CfbTeam, CfbSeason, CfbGame, CfbAward, CfbRivalry } from "./cfbShared";

export type { CfbTeam, CfbSeason, CfbGame, CfbAward, CfbRivalry } from "./cfbShared";
export { cfbColor, cfbMonogram } from "./cfbShared";

type DataFile = {
  teams: CfbTeam[]; seasons_by_team: Record<string, CfbSeason[]>;
  awards_by_team: Record<string, CfbAward[]>; rivalries_by_team: Record<string, CfbRivalry[]>;
};
type GamesFile = { top_overall: CfbGame[]; by_decade: Record<string, CfbGame[]>; by_team: Record<string, CfbGame[]> };

let _d: DataFile | null = null;
let _g: GamesFile | null = null;
function d(): DataFile { if (!_d) _d = JSON.parse(readFileSync(join(process.cwd(), "public", "data", "cfb", "data.json"), "utf-8")) as DataFile; return _d; }
function gm(): GamesFile { if (!_g) _g = JSON.parse(readFileSync(join(process.cwd(), "public", "data", "cfb", "games.json"), "utf-8")) as GamesFile; return _g; }

export function getAllCfbTeams(): CfbTeam[] { return d().teams; }
export function getAllCfbSlugs(): string[] { return d().teams.map((t) => t.slug); }
export function getCfbTeamBySlug(slug: string): CfbTeam | null { return d().teams.find((t) => t.slug === slug) ?? null; }
export function getCfbSeasons(slug: string): CfbSeason[] { return d().seasons_by_team[slug] ?? []; }
export function getCfbAwards(slug: string): CfbAward[] { return d().awards_by_team[slug] ?? []; }
export function getCfbRivalries(slug: string): CfbRivalry[] { return d().rivalries_by_team[slug] ?? []; }
export function getCfbTopGames(): CfbGame[] { return gm().top_overall; }
export function getCfbGamesByDecade(): Record<string, CfbGame[]> { return gm().by_decade; }
export function getCfbTeamGames(slug: string): CfbGame[] { return gm().by_team[slug] ?? []; }

let _byName: Map<string, CfbTeam> | null = null;
function nameKey(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
// Resolve a TOP_TEAMS-style team name to its CFB program (for /top-teams links).
export function getCfbTeamForName(name: string): CfbTeam | null {
  if (!_byName) { _byName = new Map(); for (const t of d().teams) _byName.set(nameKey(t.name), t); }
  return _byName.get(nameKey(name)) ?? null;
}
