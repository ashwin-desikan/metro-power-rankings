import "server-only";

// College World Series data: per-year champions roll and an all-time aggregate
// (titles / finals / appearances), built by scripts/build-cws-data.py from the
// "CWS Standings" sheet of OtherLeagues.xlsx. Powers /teams/baseball/college and
// the CWS chips on college-baseball metro cards. Registered in
// scripts/check-client-imports.mjs.

import { readFileSync } from "fs";
import { join } from "path";

export type CwsChampion = { year: number; champion: string | null; runner_up: string | null };
export type CwsTeam = { name: string; titles: number; finals: number; apps: number; last_title: number | null };
export type CwsData = {
  generated: string; first_year: number; last_year: number; editions: number;
  champions: CwsChampion[]; teams: CwsTeam[];
};

let _d: CwsData | null = null;
function data(): CwsData {
  if (_d) return _d;
  try {
    _d = JSON.parse(readFileSync(join(process.cwd(), "public", "data", "baseball", "cws.json"), "utf-8")) as CwsData;
  } catch {
    _d = { generated: "", first_year: 0, last_year: 0, editions: 0, champions: [], teams: [] };
  }
  return _d;
}

export function getCwsData(): CwsData { return data(); }

function norm(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

let _byName: Map<string, CwsTeam> | null = null;
// CWS record for a school (by name), or null. Used by college-baseball metro cards.
export function getCwsForSchool(name: string): CwsTeam | null {
  if (!_byName) {
    _byName = new Map();
    for (const t of data().teams) _byName.set(norm(t.name), t);
  }
  return _byName.get(norm(name)) ?? null;
}
