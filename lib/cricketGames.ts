import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

export type CricketGame = {
  fmt: "Test" | "ODI" | "T20I";
  date: string;
  end: string;
  team: string; teamSlug: string;
  opp: string; oppSlug: string;
  winner: string;
  detail: string;
  major: string | null;
  round: string | null;
  tournament: string | null;
  venue: string | null;
  city: string | null;
  country: string | null;
  gs: number;
  norm: number;
  editorPick: boolean;
  cl: number; st: number; q: number;
};

export type CricketGames = {
  generated: string;
  method: string;
  Test: CricketGame[];
  ODI: CricketGame[];
  T20I: CricketGame[];
  combined: CricketGame[];
  by_team: Record<string, CricketGame[]>;
  by_decade: Record<string, Record<string, CricketGame[]>>;
};

let _cache: CricketGames | null = null;
export function getCricketGames(): CricketGames {
  if (!_cache) {
    _cache = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "cricket", "top-games.json"), "utf-8"),
    ) as CricketGames;
  }
  return _cache;
}

export function getCricketGamesForTeam(slug: string): CricketGame[] {
  return getCricketGames().by_team[slug] ?? [];
}
