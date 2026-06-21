import "server-only";

// Current-champions badges. Source of truth: ZoneZero_Champions.xlsx ->
// scripts/build-champions-data.py -> public/data/champions.json. Every reigning
// champion of a Gold Standard or selected competition. A team page calls
// getCurrentChampionships(teamName, sport) and renders <ChampionBadge>.
//
// Server-only. Registered in scripts/check-client-imports.mjs.

import { existsSync, readFileSync } from "fs";
import { join } from "path";

export type Championship = {
  sport: string;
  competition: string;
  team: string;
  year: number | null;
  dateAwarded: string | null;
  scope: string;
  scopeType: "International" | "Continental" | "Domestic" | null;
  nextAwarded: number | null;
  nextAwardedDate: string | null;
  tier: number | null;
};

let _data: Championship[] | null = null;
function all(): Championship[] {
  if (_data) return _data;
  const p = join(process.cwd(), "public", "data", "champions.json");
  _data = existsSync(p) ? (JSON.parse(readFileSync(p, "utf-8")) as Championship[]) : [];
  return _data;
}

function norm(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
// Normalize a sport label so the workbook's Team List labels match the
// champions sheet's. The "W " (women's) prefix stays significant so men's and
// women's titles never cross-match (e.g. Spain men's Euro vs Spain women's WC).
// Cricket formats (Test/T20) collapse to "cricket"; soccer -> football.
function sportNorm(s: string): string {
  const n = norm(s);
  const w = /^w\b/.test(n) || /\bwomen/.test(n);
  let base = n.replace(/^w\s+/, "").replace(/\bwomen'?s?\b/g, "").replace(/^mens?\s+/, "").trim();
  base = base.replace(/\bsoccer\b/, "football");
  if (base.includes("cricket")) base = "cricket";
  return w ? "w " + base : base;
}

let _idx: Map<string, Championship[]> | null = null;
function idx(): Map<string, Championship[]> {
  if (_idx) return _idx;
  _idx = new Map();
  for (const c of all()) {
    const k = norm(c.team);
    (_idx.get(k) ?? _idx.set(k, []).get(k)!).push(c);
  }
  return _idx;
}

// Current championships held by a team. Pass the sport (workbook label, e.g.
// "Football", "W Football", "Basketball", "Hockey", "American Football") to
// disambiguate national teams that win across sports (e.g. United States).
export function getCurrentChampionships(team: string, sport?: string): Championship[] {
  const hits = idx().get(norm(team)) ?? [];
  if (!sport) return hits;
  const sk = sportNorm(sport);
  return hits.filter((c) => sportNorm(c.sport) === sk);
}

export function getAllChampionships(): Championship[] {
  return all();
}

// Distinct team names in the source (for a build-time validation that every
// champion resolves to a team page).
export function getChampionTeamNames(): string[] {
  return Array.from(new Set(all().map((c) => c.team)));
}
