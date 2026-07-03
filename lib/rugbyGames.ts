import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

export type RugbyGame = {
  comp: "RWC" | "6N" | "RC" | "NC" | "TEST";
  date: string;
  team: string; teamSlug: string;
  opp: string; oppSlug: string;
  winner: string;
  pf: number; pa: number; draw: boolean;
  competition: string;
  stage: string;
  city: string; country: string;
  gs: number; norm: number;
  editorPick: boolean;
  cl: number; st: number; q: number;
};

export type RugbyGames = {
  generated: string;
  method: string;
  count: number;
  top: RugbyGame[];
  by_team: Record<string, RugbyGame[]>;
  by_decade: Record<string, RugbyGame[]>;
};

let _cache: RugbyGames | null = null;
export function getRugbyGames(): RugbyGames {
  if (!_cache) {
    _cache = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "rugby-union", "top-games.json"), "utf-8"),
    ) as RugbyGames;
  }
  return _cache;
}

export function getRugbyGamesForTeam(slug: string): RugbyGame[] {
  return getRugbyGames().by_team[slug] ?? [];
}
