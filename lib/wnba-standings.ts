import "server-only";

// Live WNBA standings layer. Mirrors lib/nba-standings.ts: pulls ESPN's public
// /wnba/standings endpoint at build time (hourly ISR) so the hub can show the
// current (in-progress) season instead of the last completed workbook season.
// On any failure it returns an empty snapshot and the hub falls back to the
// workbook standings. Server-only; listed in scripts/check-client-imports.mjs.

export type WnbaSeasonType = "preseason" | "regular" | "postseason" | "offseason" | "unknown";

export type WnbaLiveRow = {
  name: string;        // ESPN displayName, e.g. "Las Vegas Aces" (matches workbook franchise name)
  abbr: string;
  wins: number;
  losses: number;
  win_pct: number;
  games_played: number;
  conf: "Eastern" | "Western" | "";
  streak: string | null;
  playoff_seed: number | null;
};

export type WnbaStandingsSnapshot = {
  season_year: number;
  season_type: WnbaSeasonType;
  fetched_at: string;
  rows: WnbaLiveRow[];
  source_label: string;
};

const ESPN_STANDINGS_URL = "https://site.api.espn.com/apis/v2/sports/basketball/wnba/standings";
const REVALIDATE_SECONDS = 3600;

export async function getCurrentWnbaStandings(): Promise<WnbaStandingsSnapshot> {
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

function empty(): WnbaStandingsSnapshot {
  return { season_year: 0, season_type: "unknown", fetched_at: new Date().toISOString(), rows: [], source_label: "" };
}

type AnyObj = Record<string, unknown>;
const asObj = (v: unknown): AnyObj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as AnyObj) : null);
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asNum = (v: unknown, f = 0): number => { const n = Number(v); return Number.isFinite(n) ? n : f; };
const asStr = (v: unknown): string => (typeof v === "string" ? v : "");

function pickSeasonYear(root: AnyObj): number {
  const season = asObj(root.season);
  if (season) { const yr = asNum(season.year, 0); if (yr) return yr; }
  const short = asNum(root.season, 0);
  return short || 0;
}
function pickSeasonType(root: AnyObj): WnbaSeasonType {
  const t = asNum(asObj(root.season)?.type, 0);
  return t === 1 ? "preseason" : t === 2 ? "regular" : t === 3 ? "postseason" : t === 4 ? "offseason" : "unknown";
}

function shape(raw: unknown): WnbaStandingsSnapshot {
  const root = asObj(raw);
  if (!root) return empty();
  const seasonYear = pickSeasonYear(root);
  const seasonType = pickSeasonType(root);
  const rows: WnbaLiveRow[] = [];

  for (const childRaw of asArr(root.children)) {
    const child = asObj(childRaw);
    if (!child) continue;
    const groupName = asStr(child.name);
    const conf: "Eastern" | "Western" | "" = /east/i.test(groupName) ? "Eastern" : /west/i.test(groupName) ? "Western" : "";
    for (const entryRaw of asArr(asObj(child.standings)?.entries)) {
      const entry = asObj(entryRaw);
      if (!entry) continue;
      const team = asObj(entry.team);
      if (!team) continue;
      const name = asStr(team.displayName) || asStr(team.name);
      if (!name) continue;
      const stats = asArr(entry.stats);
      const stat = (k: string) => stats.map(asObj).find((s) => s && asStr(s.name) === k);
      const sn = (k: string, f = 0) => asNum(stat(k)?.value, f);
      const sp = (k: string) => (stat(k) !== undefined ? sn(k) : null);
      const wins = sn("wins"), losses = sn("losses");
      rows.push({
        name, abbr: asStr(team.abbreviation),
        wins, losses,
        win_pct: sn("winPercent") || (wins + losses ? wins / (wins + losses) : 0),
        games_played: sn("gamesPlayed") || wins + losses,
        conf,
        streak: asStr(stat("streak")?.displayValue) || null,
        playoff_seed: sp("playoffSeed"),
      });
    }
  }

  const label = seasonYear
    ? (seasonType === "postseason" ? `${seasonYear} Playoffs`
      : seasonType === "preseason" ? `${seasonYear} Preseason`
      : `${seasonYear} Standings`)
    : "";

  return { season_year: seasonYear, season_type: seasonType, fetched_at: new Date().toISOString(), rows, source_label: label };
}
