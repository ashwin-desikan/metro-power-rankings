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

// api-football sometimes serves the SAME table twice under two group-label
// spellings ("Premier Division" + "Premier League", "K League 1" + "K-League",
// seen across ~12 leagues 2026-08-02), and occasionally pads a table with a
// nameless duplicate row (Brazil's double rank-20). Normalize at read time so
// every consumer heals, whatever the refresh wrote: drop nameless rows, drop
// same-team duplicate rows inside a group, then drop any group whose team
// sheet duplicates an earlier group's (first label wins — it matches the
// league's own name in the observed cases). Genuine multi-group leagues (MLS
// conferences, Apertura/Clausura, promotion splits) have different sheets and
// are untouched.
function dedupeLeague(l: LiveLeague): LiveLeague {
  const seenSheets = new Set<string>();
  const groups: LiveGroup[] = [];
  for (const g of l.groups ?? []) {
    const seenTeams = new Set<string>();
    const rows = (g.rows ?? []).filter((r) => {
      const name = (r.name ?? "").trim();
      if (!name) return false;
      const key = name.toLowerCase();
      if (seenTeams.has(key)) return false;
      seenTeams.add(key);
      return true;
    });
    if (rows.length === 0) continue;
    const sheet = rows.map((r) => (r.name ?? "").toLowerCase()).sort().join("|");
    if (seenSheets.has(sheet)) continue;
    seenSheets.add(sheet);
    groups.push({ ...g, rows });
  }
  return { ...l, groups };
}

export async function getClubStandings(): Promise<LiveLeague[]> {
  const doc = await load<{ leagues: LiveLeague[] }>("live-standings-2026.json");
  return (doc?.leagues ?? []).map(dedupeLeague);
}

export async function getClubCompetitions(): Promise<LiveComp[]> {
  const doc = await load<{ competitions: LiveComp[] }>("live-competitions-2026.json");
  return doc?.competitions ?? [];
}

// International (national-team) competitions — UEFA Nations League (league_id
// 5) and AFC Asian Cup (league_id 7) — exported by the same bundle under their
// own key. The set is INTERNATIONAL in scripts/apifootball/refresh.py; keep the
// two in step. Empty until the mini's refresh first sees the comp; the frontend
// sections arm themselves from it.
export async function getInternationalComps(): Promise<LiveComp[]> {
  const doc = await load<{ international?: LiveComp[] }>("live-competitions-2026.json");
  return doc?.international ?? [];
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

// ---- Super cups + domestic cups (result-only; team names soft-resolved) --------

export type CupFixture = {
  fixture_id: number; kickoff: string | null; round: string | null;
  home: LiveTeamRef; away: LiveTeamRef; home_goals: number | null; away_goals: number | null;
  status: string | null; winner?: string | null;
};
export type SuperCup = { comp_id: number; country: string; name: string; category: string; season: number; fixtures: CupFixture[] };
export type DomesticCup = { comp_id: number; country: string; name: string; season: number; fixtures: CupFixture[] };

export async function getSuperCups(): Promise<SuperCup[]> {
  const doc = await load<{ super_cups: SuperCup[] }>("live-supercups-2026.json");
  return doc?.super_cups ?? [];
}
export async function getDomesticCups(): Promise<DomesticCup[]> {
  const doc = await load<{ cups: DomesticCup[] }>("live-cups-2026.json");
  return doc?.cups ?? [];
}
// team_id (as string) -> names of the domestic cups the club is still ALIVE in.
export async function getCupAlive(): Promise<Record<string, string[]>> {
  const doc = await load<{ cup_alive?: Record<string, string[]> }>("live-cups-2026.json");
  return doc?.cup_alive ?? {};
}
