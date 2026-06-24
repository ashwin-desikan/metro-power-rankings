import "server-only";

// Live NWSL (National Women's Soccer League) standings layer. Mirrors
// lib/wnba-standings.ts / lib/nba-standings.ts but for ESPN's soccer
// standings endpoint (league code usa.nwsl). Build-time fetch with hourly
// ISR; on any failure it returns an empty snapshot and the page hides the
// block. Server-only; listed in scripts/check-client-imports.mjs.

export type NwslRow = {
  name: string;        // ESPN displayName, e.g. "Portland Thorns FC"
  abbr: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  gf: number;          // goals for
  ga: number;          // goals against
  gd: number;          // goal difference
  rank: number | null;
};

export type NwslStandingsSnapshot = {
  season_year: number;
  fetched_at: string;
  rows: NwslRow[];
  source_label: string;
};

const ESPN_STANDINGS_URL = "https://site.api.espn.com/apis/v2/sports/soccer/usa.nwsl/standings";
const REVALIDATE_SECONDS = 1800;

export async function getNwslStandings(): Promise<NwslStandingsSnapshot> {
  let raw: unknown = null;
  try {
    const res = await fetch(ESPN_STANDINGS_URL, {
      signal: AbortSignal.timeout(5000),
      next: { revalidate: REVALIDATE_SECONDS },
      headers: { "User-Agent": "rankings-citizen-of-nowhere/1.0", Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`espn http ${res.status}`);
    raw = await res.json();
  } catch {
    return empty();
  }
  return shape(raw);
}

function empty(): NwslStandingsSnapshot {
  return { season_year: 0, fetched_at: new Date().toISOString(), rows: [], source_label: "" };
}

type AnyObj = Record<string, unknown>;
const asObj = (v: unknown): AnyObj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as AnyObj) : null);
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asNum = (v: unknown, f = 0): number => { const n = Number(v); return Number.isFinite(n) ? n : f; };
const asStr = (v: unknown): string => (typeof v === "string" ? v : "");

function pickSeasonYear(root: AnyObj): number {
  const season = asObj(root.season);
  if (season) { const yr = asNum(season.year, 0); if (yr) return yr; }
  return asNum(root.season, 0) || 0;
}

// ESPN soccer standings nest entries either directly under root.standings or
// under children[].standings (single group for NWSL). Collect whichever exists.
function collectEntries(root: AnyObj): unknown[] {
  const direct = asArr(asObj(root.standings)?.entries);
  if (direct.length) return direct;
  return asArr(root.children).flatMap((c) => asArr(asObj(asObj(c)?.standings)?.entries));
}

function shape(raw: unknown): NwslStandingsSnapshot {
  const root = asObj(raw);
  if (!root) return empty();
  const seasonYear = pickSeasonYear(root);
  const rows: NwslRow[] = [];

  for (const entryRaw of collectEntries(root)) {
    const entry = asObj(entryRaw);
    if (!entry) continue;
    const team = asObj(entry.team);
    if (!team) continue;
    const name = asStr(team.displayName) || asStr(team.name) || asStr(team.shortDisplayName);
    if (!name) continue;
    const stats = asArr(entry.stats).map(asObj);
    const stat = (...names: string[]) => stats.find((s) => s && names.includes(asStr(s.name)));
    const sn = (def: number, ...names: string[]) => { const s = stat(...names); return s ? asNum(s.value, def) : def; };
    const present = (...names: string[]) => stat(...names) !== undefined;

    rows.push({
      name,
      abbr: asStr(team.abbreviation),
      played: sn(0, "gamesPlayed"),
      wins: sn(0, "wins"),
      draws: sn(0, "ties", "draws"),
      losses: sn(0, "losses"),
      points: sn(0, "points"),
      gf: sn(0, "pointsFor", "goalsFor"),
      ga: sn(0, "pointsAgainst", "goalsAgainst"),
      gd: sn(0, "pointDifferential", "goalDifference"),
      rank: present("rank") ? sn(0, "rank") : null,
    });
  }

  // Order by table position: rank if present, else points / GD / GF.
  rows.sort((a, b) => {
    if (a.rank != null && b.rank != null && a.rank !== b.rank) return a.rank - b.rank;
    return b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name);
  });

  return {
    season_year: seasonYear,
    fetched_at: new Date().toISOString(),
    rows,
    source_label: seasonYear ? `${seasonYear} NWSL` : "NWSL",
  };
}
