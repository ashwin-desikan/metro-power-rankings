import "server-only";
import fs from "fs";
import path from "path";

export type StateRow = {
  slug: string;
  name: string;
  country: string;
  countrySlug: string;
  type: string;
  continent: string | null;
  pop: number | null;
  metroCount: number;
  score: number;
  weighted: boolean;
};

export function getStatesDirectory(): StateRow[] {
  try {
    const file = path.join(process.cwd(), "public", "data", "states-directory.json");
    return JSON.parse(fs.readFileSync(file, "utf-8")) as StateRow[];
  } catch {
    return [];
  }
}

export type StateLeader = { name: string; title: string; party: string; second?: { name: string; role: string } };
export function getStateLeaders(): Record<string, StateLeader> {
  try {
    const file = path.join(process.cwd(), "public", "data", "state-leaders.json");
    return JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, StateLeader>;
  } catch {
    return {};
  }
}
