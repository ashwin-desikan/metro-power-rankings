import "server-only";
import { readFile } from "fs/promises";
import { join } from "path";

// Live club-football data (api-football -> Supabase -> committed bundles). The mini's
// scripts/apifootball/export_bundles.py writes public/data/football/live-standings-2026.json
// (every tracked DOMESTIC league table) and live-competitions-2026.json (the 5 continental
// comps: group tables + fixtures) and commits them with [vercel skip]. This lib reads those
// from GitHub raw at runtime via ISR (revalidate 1800) — same pattern as lib/euroComps.ts —
// so tables refresh without a deploy, falling back to the on-disk copy when raw is unavailable.
// Server-only (uses fs); listed in scripts/check-client-imports.mjs.

export type LiveTeamRef = { team_id: number | null; name: string | null; lookup: string | null; country: string | null };
export type LiveRow = LiveTeamRef & {
  rank: number | null; played: number | null; win: number | null; draw: number | null; lose: number | null;
  gf: number | null; ga: number | null; gd: number | null; points: number | null; form: string | null;
};
export type LiveGroup = { group_label: string; rows: LiveRow[] };
export type LiveLeague = { league_id: number; name: string | null; country: string | null; level: number | null; confederation?: string | null; groups: LiveGroup[] };
export type LiveFixture = {
  fixture_id: number; round: string | null; kickoff: string | null;
  home: LiveTeamRef; away: LiveTeamRef; home_goals: number | null; away_goals: number | null; status: string | null;
};
export type LiveComp = { league_id: number; name: string | null; groups: LiveGroup[]; fixtures: LiveFixture[] };

const GH_RAW =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data/football";

async function load<T>(file: string): Promise<T | null> {
  try {
    const res = await fetch(`${GH_RAW}/${file}`, { next: { revalidate: 1800 } });
    if (res.ok) return (await res.json()) as T;
  } catch {
    /* fall through to disk */
  }
  try {
    const p = join(process.cwd(), "public", "data", "football", file);
    return JSON.parse(await readFile(p, "utf-8")) as T;
  } catch {
    return null;
  }
}

export async function getClubStandings(): Promise<LiveLeague[]> {
  const doc = await load<{ leagues: LiveLeague[] }>("live-standings-2026.json");
  return doc?.leagues ?? [];
}

export async function getClubCompetitions(): Promise<LiveComp[]> {
  const doc = await load<{ competitions: LiveComp[] }>("live-competitions-2026.json");
  return doc?.competitions ?? [];
}

// team_id (as string) -> current European/Libertadores badge ("UCL"|"UEL"|"UECL"|"LIB")
// for clubs still alive in a competition; eliminated clubs are absent.
export async function getEuropeBadges(): Promise<Record<string, string>> {
  const doc = await load<{ europe_badges?: Record<string, string> }>("live-competitions-2026.json");
  return doc?.europe_badges ?? {};
}

// Find a single league's live table by api-football league id.
export async function getLiveLeague(leagueId: number): Promise<LiveLeague | null> {
  const leagues = await getClubStandings();
  return leagues.find((l) => l.league_id === leagueId) ?? null;
}
