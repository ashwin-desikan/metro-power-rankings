import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// Club football "greatest games", computed by the WP3 Game Score over the
// unified club Elo (Supabase football_gamescore) and emitted by
// scripts/football/build_club_top_games.py. Universe: top-flight league
// matches plus every UEFA competition match plus the ten major domestic cups
// (WP5), 1871-present.
export type ClubGame = {
  date: string;
  comp: string;
  // EC European Cup, CL Champions League, UC UEFA Cup, EL Europa League,
  // CWC Cup Winners' Cup, FCUP Fairs Cup, ECL Conference League, LG league,
  // CUP domestic cup (comp carries which one).
  cls: "EC" | "CL" | "UC" | "EL" | "CWC" | "FCUP" | "ECL" | "LG" | "CUP";
  round: string | null;
  // home/away are the ERA names (as played that season); the *Canon fields
  // carry the canonical identity for crest lookup, and the slug links the
  // club page. Atletico Aviacion displays; Atletico de Madrid links.
  home: string; homeCanon: string; homeSlug: string | null;
  away: string; awayCanon: string; awaySlug: string | null;
  hg: number; ag: number; pens: string | null;
  // curated rivalry name for the pair (e.g. "Merseyside derby"), or null;
  // rivalry league matches also carry a stakes floor in the scorer
  rivalry: string | null;
  // leg 1|2 for two-legged European ties (null otherwise); agg is the
  // aggregate score after a second leg, home-perspective; neutral marks a
  // neutral venue (finals). Home side is always listed first in hg-ag.
  leg: number | null; agg: string | null; neutral: boolean;
  // gs is the published score; on floored rows the curated floor set it and
  // base carries the model's own number, so the page can be honest about
  // which rows the model earned and which were placed by hand.
  gs: number; base: number; floored: boolean;
  cl: number; st: number; q: number; u: number;
};

// Per-decade boards are emitted per class so the decade filter composes with
// the All / European nights / League / Cups views.
export type ClubDecade = { all: ClubGame[]; europe: ClubGame[]; league: ClubGame[]; cups: ClubGame[] };

export type ClubGames = {
  generated: string;
  method: string;
  count: number;
  top: ClubGame[];
  europe: ClubGame[];
  league: ClubGame[];
  cups: ClubGame[];
  by_decade: Record<string, ClubDecade>;
};

let _cache: ClubGames | null = null;
export function getClubGames(): ClubGames {
  if (!_cache) {
    _cache = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "football", "top-club-games.json"), "utf-8"),
    ) as ClubGames;
  }
  return _cache;
}

let _teamCache: Record<string, ClubGame[]> | null = null;
export function getClubGamesForTeam(slug: string): ClubGame[] {
  if (!_teamCache) {
    _teamCache = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "football", "top-club-games-by-team.json"), "utf-8"),
    ) as Record<string, ClubGame[]>;
  }
  return _teamCache[slug] ?? [];
}
