import "server-only";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

// Barbarian F.C. matches against national teams (men's), from the uploaded
// Wikipedia list. An invitational club, not a nation, so it lives on the
// Invitational Teams hub alongside the British & Irish Lions.

export type BarbariansMatch = {
  opponent: string; for: number; against: number; result: "W" | "L" | "D";
  date: string; year: number | null; venue: string; city: string; competition: string;
};
export type BarbariansRec = { P: number; W: number; L: number; D: number };
export type BarbariansData = {
  matches: BarbariansMatch[];
  overall: BarbariansRec;
  byOpponent: Array<{ opponent: string } & BarbariansRec>;
};

let _d: BarbariansData | null | undefined;
export function getBarbariansHistory(): BarbariansData | null {
  if (_d !== undefined) return _d;
  const p = join(process.cwd(), "public", "data", "rugby", "barbarians.json");
  _d = existsSync(p) ? (JSON.parse(readFileSync(p, "utf-8")) as BarbariansData) : null;
  return _d;
}
