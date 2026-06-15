import "server-only";
import { readFileSync } from "fs";
import { join } from "path";
import type { CbbTeam, CbbSeason, CbbGame, CbbAward, CbbNba } from "./cbbShared";
import { cbbMonogram as monogram } from "./cbbShared";

export type { CbbTeam, CbbSeason, CbbGame, CbbAward, CbbNba } from "./cbbShared";
export { cbbColor, cbbMonogram } from "./cbbShared";

export type CbbNatChampSchool = { name: string; slug: string | null; sel: string };
export type CbbNatChampPair = { name: string; slug: string | null };
export type CbbNatChamp = { year: number; champs: CbbNatChampSchool[]; runner_up?: CbbNatChampPair[]; final_four?: CbbNatChampPair[] };

type DataFile = {
  teams: CbbTeam[]; seasons_by_team: Record<string, CbbSeason[]>;
  awards_by_team: Record<string, CbbAward[]>; nba_by_team: Record<string, CbbNba[]>;
  national_champions?: CbbNatChamp[];
};
type GamesFile = { top_overall: CbbGame[]; by_decade: Record<string, CbbGame[]>; by_team: Record<string, CbbGame[]> };

let _d: DataFile | null = null;
let _g: GamesFile | null = null;
function d(): DataFile { if (!_d) _d = JSON.parse(readFileSync(join(process.cwd(), "public", "data", "cbb", "data.json"), "utf-8")) as DataFile; return _d; }
function gm(): GamesFile { if (!_g) _g = JSON.parse(readFileSync(join(process.cwd(), "public", "data", "cbb", "games.json"), "utf-8")) as GamesFile; return _g; }

export function getAllCbbTeams(): CbbTeam[] { return d().teams; }
export function getAllCbbSlugs(): string[] { return d().teams.map((t) => t.slug); }
export function getCbbTeamBySlug(slug: string): CbbTeam | null { return d().teams.find((t) => t.slug === slug) ?? null; }
export function getCbbSeasons(slug: string): CbbSeason[] { return d().seasons_by_team[slug] ?? []; }
export function getCbbAwards(slug: string): CbbAward[] { return d().awards_by_team[slug] ?? []; }
export function getCbbNba(slug: string): CbbNba[] { return d().nba_by_team[slug] ?? []; }
export function getCbbTopGames(): CbbGame[] { return gm().top_overall; }
export function getCbbGamesByDecade(): Record<string, CbbGame[]> { return gm().by_decade; }
export function getCbbTeamGames(slug: string): CbbGame[] { return gm().by_team[slug] ?? []; }
export function getCbbNationalChampions(): CbbNatChamp[] { return d().national_champions ?? []; }

let _byName: Map<string, CbbTeam> | null = null;
function nameKey(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
// Resolve a TOP_TEAMS-style team name to its CBB program (for /top-teams links).
export function getCbbTeamForName(name: string): CbbTeam | null {
  if (!_byName) { _byName = new Map(); for (const t of d().teams) _byName.set(nameKey(t.name), t); }
  return _byName.get(nameKey(name)) ?? null;
}

// Former D-I programs (no longer Division I), grouped by metro slug for the
// "Defunct and relocated" section on metro pages. The basketball equivalent of
// the former-FBS cards.
export type FormerCbbCard = {
  slug: string; name: string; href: string; color: string; mono: string; years: string; lastYear: number;
  titles: number; final4: number; tour_app: number; pct: number; w: number; l: number; seasons: number;
};
let _formerByMetro: Map<string, FormerCbbCard[]> | null = null;
export function getFormerMajorCbbForMetro(metroSlug: string): FormerCbbCard[] {
  if (!_formerByMetro) {
    _formerByMetro = new Map();
    const seasonsByTeam = d().seasons_by_team;
    for (const t of d().teams) {
      if (t.current_d1) continue;
      if (!t.metro_slug || t.seasons <= 0) continue;
      const yrs = (seasonsByTeam[t.slug] ?? []).map((s) => s.year).filter((y) => y > 0);
      const years = yrs.length
        ? (Math.min(...yrs) === Math.max(...yrs) ? `${Math.min(...yrs)}` : `${Math.min(...yrs)}–${Math.max(...yrs)}`)
        : (t.last_year ? `${t.last_year}` : "");
      const card: FormerCbbCard = {
        slug: t.slug, name: t.name, href: `/teams/cbb/${t.slug}`, color: t.color || "#444",
        mono: monogram(t.name), years, lastYear: yrs.length ? Math.max(...yrs) : (t.last_year || 0),
        titles: t.titles, final4: t.final4, tour_app: t.tour_app, pct: t.pct, w: t.w, l: t.l, seasons: t.seasons,
      };
      const arr = _formerByMetro.get(t.metro_slug);
      if (arr) arr.push(card); else _formerByMetro.set(t.metro_slug, [card]);
    }
    for (const arr of _formerByMetro.values())
      arr.sort((a, b) => b.titles - a.titles || b.tour_app - a.tour_app || a.name.localeCompare(b.name));
  }
  return _formerByMetro.get(metroSlug) ?? [];
}

// Dynasty leaders: seasons spent as the consensus #1 program on the 15-year
// rolling rankings. The truest measure of sustained reign.
export function getCbbDynastyLeaders(n = 15): { name: string; slug: string; val: number }[] {
  const sb = d().seasons_by_team;
  return d().teams
    .map((t) => ({ name: t.name, slug: t.slug, val: (sb[t.slug] ?? []).filter((s) => s.rank15 === 1).length }))
    .filter((x) => x.val > 0)
    .sort((a, b) => b.val - a.val || a.name.localeCompare(b.name))
    .slice(0, n);
}
