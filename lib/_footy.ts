import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// Shared core for the two Australian football codes (AFL / NRL). Both are built
// by scripts/build-afl-nrl-data.py from afltables.com data and share one shape.

export type FootySeason = {
  year: number; league: string; team: string; rank: number | null;
  played: number | null; w: number | null; d: number | null; l: number | null;
  pts: number | null; pf: number | null; pa: number | null;
  minor: boolean; finals: boolean; gf: boolean; prem: boolean; stripped: boolean;
  metro: string | null; state: string | null;
};

export type FootyGrandFinal = {
  year: number | null; date: string; result: string; opponent: string; team: string; opp_team: string;
  pf: number | null; pa: number | null; stadium: string;
  metro: string | null; state: string | null; premiership: boolean; stripped: boolean;
};

export type FootyFranchise = {
  slug: string; name: string; metro_slug: string | null; state: string | null;
  qid: string | null; active: boolean; first_year: number; last_year: number;
  seasons: number; w: number; d: number; l: number; win_pct: number;
  premierships: number; minor_premierships: number; gf_apps: number;
  stripped_premierships: number; stripped_years: number[];
  finals_apps: number; title_years: number[]; minor_years: number[];
  gf_years: number[]; aka: string[]; leagues: string[];
  color: string; color2: string; abbr: string;
};

export type FootyMeta = {
  sport: string; league: string; abbr: string; title: string;
  founded: number; latest_season: number; total_seasons: number;
  active_teams: number; total_teams: number; source: string; source_url: string;
};

export type FootyLadderRow = FootySeason & { slug: string; teamName: string; color: string; abbr: string };
export type FootyLadder = { year: number; rows: FootyLadderRow[] };
export type FootyGFResult = {
  year: number; champion: string; champion_slug: string;
  runner_up: string; runner_up_slug: string | null;
  pf: number | null; pa: number | null; stadium: string; drawn: boolean; stripped: boolean;
};

type FootyData = {
  meta: FootyMeta;
  franchises: FootyFranchise[];
  seasons_by_team: Record<string, FootySeason[]>;
  grand_finals_by_team: Record<string, FootyGrandFinal[]>;
};

// Readable foreground for a hex background (white on dark, near-black on light).
export function fgFor(bg: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(bg.trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#10131a" : "#ffffff";
}

export function makeFooty(league: "afl" | "nrl") {
  let _d: FootyData | null = null;
  const data = (): FootyData => {
    if (!_d) {
      const p = join(process.cwd(), "public", "data", league, "data.json");
      _d = JSON.parse(readFileSync(p, "utf8")) as FootyData;
    }
    return _d;
  };
  const bySlug = (): Map<string, FootyFranchise> => {
    const m = new Map<string, FootyFranchise>();
    for (const f of data().franchises) m.set(f.slug, f);
    return m;
  };
  return {
    getMeta: (): FootyMeta => data().meta,
    getAll: (): FootyFranchise[] => data().franchises,
    getActive: (): FootyFranchise[] => data().franchises.filter((f) => f.active),
    getDefunct: (): FootyFranchise[] => data().franchises.filter((f) => !f.active),
    getAllSlugs: (): string[] => data().franchises.map((f) => f.slug),
    getBySlug: (slug: string): FootyFranchise | null => bySlug().get(slug) ?? null,
    getSeasons: (slug: string): FootySeason[] => data().seasons_by_team[slug] ?? [],
    getGrandFinals: (slug: string): FootyGrandFinal[] =>
      data().grand_finals_by_team[slug] ?? [],
    getByTeamName: (name: string): FootyFranchise | null => {
      const q = (name || "").trim().toLowerCase();
      if (!q) return null;
      for (const f of data().franchises) {
        if (f.name.toLowerCase() === q) return f;
        if (f.aka.some((a) => a.toLowerCase() === q)) return f;
      }
      return null;
    },
    // Final ladder of the most recent season, sorted by finishing rank.
    getLatestLadder: (): FootyLadder => {
      const d = data();
      const yr = d.meta.latest_season;
      const rows: FootyLadderRow[] = [];
      for (const f of d.franchises) {
        const s = (d.seasons_by_team[f.slug] ?? []).find((x) => x.year === yr);
        if (s) rows.push({ ...s, slug: f.slug, teamName: f.name, color: f.color, abbr: f.abbr });
      }
      rows.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
      return { year: yr, rows };
    },
    // Year-by-year grand final honor roll (champion + runner-up).
    getGrandFinalHistory: (): FootyGFResult[] => {
      const d = data();
      const nameToSlug = new Map<string, string>();
      for (const f of d.franchises) {
        nameToSlug.set(f.name.toLowerCase(), f.slug);
        for (const a of f.aka) nameToSlug.set(a.toLowerCase(), f.slug);
      }
      const slugToName = new Map(d.franchises.map((f) => [f.slug, f.name]));
      const byYear = new Map<number, { slug: string; g: FootyGrandFinal }[]>();
      for (const [slug, list] of Object.entries(d.grand_finals_by_team)) {
        for (const g of list) {
          if (g.year == null) continue;
          const arr = byYear.get(g.year) ?? [];
          arr.push({ slug, g });
          byYear.set(g.year, arr);
        }
      }
      const out: FootyGFResult[] = [];
      for (const [year, entries] of byYear) {
        const champ =
          entries.find((e) => e.g.premiership) ?? entries.find((e) => e.g.result === "W");
        if (!champ) continue;
        const runner = champ.g.opponent;
        out.push({
          year,
          champion: champ.g.team || (slugToName.get(champ.slug) ?? champ.slug),
          champion_slug: champ.slug,
          runner_up: champ.g.opp_team || runner,
          runner_up_slug: nameToSlug.get(runner.toLowerCase()) ?? null,
          pf: champ.g.pf, pa: champ.g.pa, stadium: champ.g.stadium,
          drawn: champ.g.result === "D", stripped: !!champ.g.stripped,
        });
      }
      out.sort((a, b) => b.year - a.year);
      return out;
    },
    monogramFor: (f: FootyFranchise) => ({
      mono: f.abbr,
      bg: f.color,
      fg: f.color.startsWith("#") ? fgFor(f.color) : "#ffffff",
      ring: f.color2,
    }),
  };
}
