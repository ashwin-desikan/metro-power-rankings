import "server-only";
import { readFileSync } from "fs";
import { join } from "path";
import type { MovesData } from "./movesShared";

// Typed loader for public/data/sports/moves.json (built by
// scripts/build-moves.py). A single literal path, per
// scripts/DATA-READS-RECIPE.md rule 1: this file is only ever read as a
// whole, never by a dynamic leaf, so a bare readFileSync call is safe for
// Vercel's file tracer.
//
// Types and the client-safe leagueLabel() helper live in lib/movesShared.ts
// (no `server-only`, no fs import) so client components can use them too;
// this file re-exports them for server-side callers' convenience.

export type {
  Move, MoveEnd, ViaStop, TemporaryHome, MetroTally, MoveSummaryEntry, MovesSummary, MovesData,
} from "./movesShared";
export { LEAGUE_LABEL, leagueLabel } from "./movesShared";

let cache: MovesData | null = null;

export function getMoves(): MovesData {
  if (cache) return cache;
  const raw = readFileSync(
    join(process.cwd(), "public", "data", "sports", "moves.json"),
    "utf-8",
  );
  cache = JSON.parse(raw) as MovesData;
  return cache;
}
