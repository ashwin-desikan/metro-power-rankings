import "server-only";

import { fetchEspnJson } from "@/lib/espnFetch";

// Live MLS standings layer (ESPN soccer endpoint usa.1). Mirrors
// lib/nwsl-standings.ts but groups by conference (Eastern/Western) like
// lib/wnba-standings.ts. Build-time fetch with hourly ISR; on any failure it
// returns an empty snapshot and the MLS hub falls back to the workbook.
// Server-only; listed in scripts/check-client-imports.mjs.

export type MlsLiveRow = {
  name: string;        // ESPN displayName, e.g. "Inter Miami CF"
  abbr: string;
  conf: "Eastern" | "Western" | "";
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  gf: number;
  ga: number;
  gd: number;
  rank: number | null;
};

export type MlsStandingsSnapshot = {
  season_year: number;
  fetched_at: string;
  rows: MlsLiveRow[];
  source_label: string;
};

const ESPN_STANDINGS_URL = "https://site.api.espn.com/apis/v2/sports/soccer/usa.1/standings";
const REVALIDATE_SECONDS = 1800;

export async function getCurrentMlsStandings(): Promise<MlsStandingsSnapshot> {
  // Live ESPN first, committed snapshot on failure -- see lib/espnFetch.ts.
  const raw = await fetchEspnJson(ESPN_STANDINGS_URL, "mls", REVALIDATE_SECONDS);
  if (raw == null) return empty();
  return shape(raw);
}

function empty(): MlsStandingsSnapshot {
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

function shape(raw: unknown): MlsStandingsSnapshot {
  const root = asObj(raw);
  if (!root) return empty();
  const seasonYear = pickSeasonYear(root);
  const rows: MlsLiveRow[] = [];

  // MLS standings nest by conference under children[]; fall back to a flat
  // root.standings.entries if ESPN ever returns a single group.
  type Bucket = { conf: "Eastern" | "Western" | ""; entries: unknown[] };
  const buckets: Bucket[] = [];
  const children = asArr(root.children);
  if (children.length) {
    for (const c of children) {
      const child = asObj(c);
      if (!child) continue;
      const nm = asStr(child.name);
      const conf: "Eastern" | "Western" | "" = /east/i.test(nm) ? "Eastern" : /west/i.test(nm) ? "Western" : "";
      buckets.push({ conf, entries: asArr(asObj(child.standings)?.entries) });
    }
  } else {
    buckets.push({ conf: "", entries: asArr(asObj(root.standings)?.entries) });
  }

  for (const b of buckets) {
    for (const entryRaw of b.entries) {
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
      const gf = sn(0, "pointsFor", "goalsFor");
      const ga = sn(0, "pointsAgainst", "goalsAgainst");
      rows.push({
        name,
        abbr: asStr(team.abbreviation),
        conf: b.conf,
        played: sn(0, "gamesPlayed"),
        wins: sn(0, "wins"),
        draws: sn(0, "ties", "draws"),
        losses: sn(0, "losses"),
        points: sn(0, "points"),
        gf, ga, gd: sn(gf - ga, "pointDifferential", "goalDifference"),
        rank: present("rank") ? sn(0, "rank") : null,
      });
    }
  }

  rows.sort((a, b) => (b.points - a.points) || (b.gd - a.gd) || (b.gf - a.gf) || a.name.localeCompare(b.name));
  return {
    season_year: seasonYear,
    fetched_at: new Date().toISOString(),
    rows,
    source_label: seasonYear ? `${seasonYear} MLS` : "MLS",
  };
}
