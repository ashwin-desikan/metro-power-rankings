import "server-only";

import { fetchEspnJson } from "@/lib/espnFetch";

// Live NBA standings layer.
//
// Mirrors lib/mlb-standings.ts and lib/standings.ts. Pulls ESPN's public
// /nba/standings endpoint at build time so the static franchise pages can
// surface a "current season" in-progress row once regular-season games are
// played in a new season.
//
// NOTE: The NBA team-pages v1 (2026-05-14) ships during the postseason. For
// the in-progress 2026 row we use public/data/nba/playoff-state.json, NOT
// this adapter. ESPN's snapshot is the fallback for next-season transitions
// once the 2026-27 preseason ends and regular-season games start logging.
//
// Server-only — scripts/check-client-imports.mjs should list @/lib/nba-standings.

export type SeasonType =
  | "preseason"
  | "regular"
  | "postseason"
  | "offseason"
  | "unknown";

export type TeamStanding = {
  canonical: string;     // workbook canonical (Lakers, Celtics, ...)
  espn_team_id: string;
  abbr: string;
  display_name: string;

  wins: number;
  losses: number;
  win_pct: number;
  games_played: number;

  points_for: number;
  points_against: number;
  point_diff: number;

  division_rank: number | null;
  conf_rank: number | null;
  playoff_seed: number | null;

  streak: string | null;

  conf: "Eastern" | "Western" | "";
  division: string;
};

export type StandingsSnapshot = {
  league: "NBA";
  season_year: number;
  season_type: SeasonType;
  fetched_at: string;
  is_offseason: boolean;
  by_canonical: Record<string, TeamStanding>;
  source_label: string;
};

const ESPN_STANDINGS_URL =
  "https://site.api.espn.com/apis/v2/sports/basketball/nba/standings";

const REVALIDATE_SECONDS = 1800;

// ESPN team name -> workbook canonical. ESPN's `name` matches the workbook
// canonical for the modern 30 almost everywhere; overrides for edge cases.
const CANONICAL_OVERRIDE: Record<string, string> = {
  "Trail Blazers": "Trail Blazers",
};

export async function getCurrentNbaStandings(): Promise<StandingsSnapshot> {
  // Live ESPN first, committed snapshot on failure -- see lib/espnFetch.ts.
  const raw = await fetchEspnJson(ESPN_STANDINGS_URL, "nba", REVALIDATE_SECONDS);
  if (raw == null) return emptySnapshot();
  return shapeStandings(raw);
}

function emptySnapshot(): StandingsSnapshot {
  return {
    league: "NBA",
    season_year: 0,
    season_type: "unknown",
    fetched_at: new Date().toISOString(),
    is_offseason: true,
    by_canonical: {},
    source_label: "",
  };
}

type AnyObj = Record<string, unknown>;
function asObj(v: unknown): AnyObj | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as AnyObj) : null;
}
function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function asNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function asStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function pickSeasonYear(root: AnyObj): number {
  const season = asObj(root.season);
  if (season) {
    const yr = asNum(season.year, 0);
    if (yr) return yr;
  }
  const seasonShort = asNum(root.season, 0);
  if (seasonShort) return seasonShort;
  return 0;
}

function pickSeasonType(root: AnyObj): SeasonType {
  const season = asObj(root.season);
  const t = asNum(season?.type, 0);
  // ESPN season-type mapping: 1=preseason, 2=regular, 3=postseason, 4=offseason
  if (t === 1) return "preseason";
  if (t === 2) return "regular";
  if (t === 3) return "postseason";
  if (t === 4) return "offseason";
  return "unknown";
}

function shapeStandings(raw: unknown): StandingsSnapshot {
  const root = asObj(raw);
  if (!root) return emptySnapshot();

  const seasonYear = pickSeasonYear(root);
  const seasonType = pickSeasonType(root);

  const byCanonical: Record<string, TeamStanding> = {};

  // ESPN nests standings under children[].standings.entries
  const children = asArr(root.children);
  for (const childRaw of children) {
    const child = asObj(childRaw);
    if (!child) continue;
    const groupName = asStr(child.name);
    const conf: "Eastern" | "Western" | "" =
      /east/i.test(groupName) ? "Eastern" :
      /west/i.test(groupName) ? "Western" : "";

    const standingsBlock = asObj(child.standings);
    const entries = asArr(standingsBlock?.entries);

    for (const entryRaw of entries) {
      const entry = asObj(entryRaw);
      if (!entry) continue;
      const team = asObj(entry.team);
      if (!team) continue;
      const id = asStr(team.id);
      const espnName = asStr(team.name);
      const abbr = asStr(team.abbreviation);
      const displayName = asStr(team.displayName);
      const canonical = CANONICAL_OVERRIDE[espnName] || espnName;

      const stats = asArr(entry.stats);
      let wins = 0, losses = 0, pf = 0, pa = 0, gp = 0;
      let winPct = 0, divRank: number | null = null, confRank: number | null = null;
      let seed: number | null = null, streak: string | null = null;
      for (const sRaw of stats) {
        const s = asObj(sRaw);
        if (!s) continue;
        const name = asStr(s.name);
        const value = asNum(s.value, 0);
        const display = asStr(s.displayValue);
        switch (name) {
          case "wins":        wins = value; break;
          case "losses":      losses = value; break;
          case "winPercent":  winPct = value; break;
          case "gamesPlayed": gp = value; break;
          case "pointsFor":   pf = value; break;
          case "pointsAgainst": pa = value; break;
          case "divisionRank": divRank = value || null; break;
          case "conferenceRank": confRank = value || null; break;
          case "playoffSeed": seed = value || null; break;
          case "streak":      streak = display || null; break;
        }
      }

      if (!canonical) continue;
      byCanonical[canonical] = {
        canonical,
        espn_team_id: id,
        abbr,
        display_name: displayName,
        wins,
        losses,
        win_pct: winPct || (wins + losses ? wins / (wins + losses) : 0),
        games_played: gp || wins + losses,
        points_for: pf,
        points_against: pa,
        point_diff: pf - pa,
        division_rank: divRank,
        conf_rank: confRank,
        playoff_seed: seed,
        streak,
        conf,
        division: groupName,
      };
    }
  }

  return {
    league: "NBA",
    season_year: seasonYear,
    season_type: seasonType,
    fetched_at: new Date().toISOString(),
    is_offseason: seasonType === "offseason" || seasonType === "unknown",
    by_canonical: byCanonical,
    source_label: "ESPN NBA standings",
  };
}
