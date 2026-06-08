import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// ─── Types ───────────────────────────────────────────────────────────────────

export type CflFranchise = {
  slug: string;
  name: string;
  metro_slug: string | null;
  active: boolean;
  first_year: number;
  last_year: number;
  seasons: number;
  w: number;
  l: number;
  t: number;
  win_pct: number;
  playoff_apps: number;
  grey_cups: number;
  gc_finals: number;
  title_years: number[];
  gc_final_years: number[];
  aka: string[];
  divisions: string[];
};

export type CflSeason = {
  year: number;
  division: string;
  team: string;
  w: number;
  l: number;
  t: number;
  pct: number;
  pf: number;
  pa: number;
  play_app: boolean;
  gc_final: boolean;
  grey_cup: boolean;
  playoff_result: string;
};

export type CflGreyCupFinal = {
  game: string;
  year: number;
  result: "W" | "L" | string;
  pf: number;
  pa: number;
  ot: boolean;
  opponent: string;
  opponent_slug: string | null;
  venue: string;
  city: string;
  attendance: number;
};

export type CflGreyCup = {
  year: number;
  game: string;
  champion: string;
  champion_slug: string | null;
  runner_up: string;
  runner_up_slug: string | null;
  score: string;
  ot: boolean;
  venue: string;
  city: string;
  attendance: number;
};

export type CflMeta = {
  league: string;
  abbr: string;
  sport: string;
  founded: number;
  latest_season: number;
  total_seasons: number;
  active_teams: number;
  grey_cup_games: number;
  grey_cup_first_year: number;
};

type CflData = {
  meta: CflMeta;
  franchises: CflFranchise[];
  seasons_by_team: Record<string, CflSeason[]>;
  grey_cup_finals_by_team: Record<string, CflGreyCupFinal[]>;
  grey_cups: CflGreyCup[];
};

// ─── Loader (memoized) ─────────────────────────────────────────────────────────

let _data: CflData | null = null;
function loadData(): CflData {
  if (_data === null) {
    _data = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "cfl", "data.json"), "utf-8")
    ) as CflData;
  }
  return _data;
}

// ─── Public helpers ─────────────────────────────────────────────────────────

export function getCflMeta(): CflMeta { return loadData().meta; }
export function getAllCflFranchises(): CflFranchise[] { return loadData().franchises; }
export function getActiveCflFranchises(): CflFranchise[] { return loadData().franchises.filter(f => f.active); }
export function getDefunctCflFranchises(): CflFranchise[] { return loadData().franchises.filter(f => !f.active); }
export function getAllCflSlugs(): string[] { return loadData().franchises.map(f => f.slug); }

export function getCflFranchiseBySlug(slug: string): CflFranchise | null {
  return loadData().franchises.find(f => f.slug === slug) ?? null;
}

export function getCflSeasons(slug: string): CflSeason[] {
  return (loadData().seasons_by_team[slug] ?? []).slice().sort((a, b) => b.year - a.year);
}

export function getCflGreyCupFinals(slug: string): CflGreyCupFinal[] {
  return loadData().grey_cup_finals_by_team[slug] ?? [];
}

export function getCflGreyCupHistory(): CflGreyCup[] { return loadData().grey_cups; }

// Match a Team List team string (current or historical) to its franchise.
export function getCflFranchiseByTeamName(name: string): CflFranchise | null {
  const norm = name.trim().toLowerCase();
  const fs = loadData().franchises;
  return (
    fs.find(f => f.name.toLowerCase() === norm) ??
    fs.find(f => f.aka.some(a => a.toLowerCase() === norm)) ??
    null
  );
}

// Deterministic monogram (no per-team colors in source): city prefix + hashed hue.
export function monogramFor(f: { slug: string; name: string }): { mono: string; bg: string; fg: string } {
  const first = f.name.split(/\s+/)[0];
  const mono = (first === "BC" ? "BC" : first.slice(0, 3)).toUpperCase();
  let h = 0;
  for (let i = 0; i < f.slug.length; i++) h = (h * 31 + f.slug.charCodeAt(i)) % 360;
  return { mono, bg: `hsl(${h} 55% 32%)`, fg: "#FFFFFF" };
}

// ─── Current-season standings (latest year in the data, grouped by division) ──

export type CflStandingRow = {
  slug: string;
  name: string;
  team: string;        // era name used that season (or current name for live rows)
  division: string;
  gp: number; w: number; l: number; t: number; pts: number;
  pct: number; pf: number; pa: number;
  play_app: boolean; gc_final: boolean; grey_cup: boolean;
};

export type CflStandingsView = {
  year: number;
  source: "workbook" | "cfl.ca";
  fetched_at?: string;
  divisions: { division: string; rows: CflStandingRow[] }[];
};

const DIVISION_ORDER: Record<string, number> = { East: 0, West: 1 };

export function getLatestCflStandings(): CflStandingsView {
  const d = loadData();
  const year = d.meta.latest_season;
  const byDiv = new Map<string, CflStandingRow[]>();
  for (const f of d.franchises) {
    const s = (d.seasons_by_team[f.slug] ?? []).find(x => x.year === year);
    if (!s) continue;
    const row: CflStandingRow = {
      slug: f.slug, name: f.name, team: s.team, division: s.division,
      gp: s.w + s.l + s.t, w: s.w, l: s.l, t: s.t, pts: 2 * s.w + s.t,
      pct: s.pct, pf: s.pf, pa: s.pa,
      play_app: s.play_app, gc_final: s.gc_final, grey_cup: s.grey_cup,
    };
    if (!byDiv.has(s.division)) byDiv.set(s.division, []);
    byDiv.get(s.division)!.push(row);
  }
  const divisions = [...byDiv.entries()]
    .sort((a, b) => (DIVISION_ORDER[a[0]] ?? 99) - (DIVISION_ORDER[b[0]] ?? 99) || a[0].localeCompare(b[0]))
    .map(([division, rows]) => ({
      division,
      rows: rows.sort((x, y) => y.pct - x.pct || y.w - x.w || x.l - y.l),
    }));
  return { year, source: "workbook", divisions };
}
