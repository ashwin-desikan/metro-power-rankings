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
  // Added 2026-08-30, all optional so a top-games.json built before that date
  // still parses. vol: scoring volume 0-1, a proxy for open rugby. up: how far
  // the result beat the pre-match Elo expectation, 0-1. base: the score before
  // any curated floor, and floor: the floor itself, so the page can be honest
  // about which rows the model earned and which were placed by hand.
  vol?: number;
  up?: number;
  base?: number;
  floor?: number | null;
  // Added 2026-08-30. A curated rank: the row was placed at this position by
  // hand, not by score. A floor can only lift a match to whatever its number
  // happens to buy, so it cannot express "eleventh"; a pin can. `base` still
  // carries the model score, and the page says so on hover.
  pin?: number | null;
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
