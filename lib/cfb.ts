import "server-only";
import { readFileSync } from "fs";
import { join } from "path";
import type { CfbTeam, CfbSeason, CfbGame, CfbAward, CfbRivalry } from "./cfbShared";
import { cfbMonogram as monogram } from "./cfbShared";

export type { CfbTeam, CfbSeason, CfbGame, CfbAward, CfbRivalry } from "./cfbShared";
export { cfbColor, cfbMonogram } from "./cfbShared";

type DataFile = {
  teams: CfbTeam[]; seasons_by_team: Record<string, CfbSeason[]>;
  awards_by_team: Record<string, CfbAward[]>; rivalries_by_team: Record<string, CfbRivalry[]>;
  national_champions?: CfbNatChamp[];
};
type GamesFile = { top_overall: CfbGame[]; by_decade: Record<string, CfbGame[]>; by_team: Record<string, CfbGame[]> };

let _d: DataFile | null = null;
let _g: GamesFile | null = null;
function d(): DataFile { if (!_d) _d = JSON.parse(readFileSync(join(process.cwd(), "public", "data", "cfb", "data.json"), "utf-8")) as DataFile; return _d; }
function gm(): GamesFile { if (!_g) _g = JSON.parse(readFileSync(join(process.cwd(), "public", "data", "cfb", "games.json"), "utf-8")) as GamesFile; return _g; }

export function getAllCfbTeams(): CfbTeam[] { return d().teams; }
export function getAllCfbSlugs(): string[] { return d().teams.map((t) => t.slug); }
export function getCfbTeamBySlug(slug: string): CfbTeam | null { return d().teams.find((t) => t.slug === slug) ?? null; }
export function getCfbSeasons(slug: string): CfbSeason[] { return d().seasons_by_team[slug] ?? []; }
export function getCfbAwards(slug: string): CfbAward[] { return d().awards_by_team[slug] ?? []; }
export function getCfbRivalries(slug: string): CfbRivalry[] { return d().rivalries_by_team[slug] ?? []; }
export function getCfbTopGames(): CfbGame[] { return gm().top_overall; }
export function getCfbGamesByDecade(): Record<string, CfbGame[]> { return gm().by_decade; }
export function getCfbTeamGames(slug: string): CfbGame[] { return gm().by_team[slug] ?? []; }

let _byName: Map<string, CfbTeam> | null = null;
function nameKey(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
// Resolve a TOP_TEAMS-style team name to its CFB program (for /top-teams links).
export function getCfbTeamForName(name: string): CfbTeam | null {
  if (!_byName) { _byName = new Map(); for (const t of d().teams) _byName.set(nameKey(t.name), t); }
  return _byName.get(nameKey(name)) ?? null;
}

// Former major programs: were major at some point, now neither FBS nor FCS.
// Grouped by metro slug for the Defunct Teams section on metro pages.
export type FormerCfbCard = {
  slug: string; name: string; href: string; color: string; mono: string; years: string; lastYear: number;
  nat_champ: number; conf: number; maj_seasons: number; pct: number; w: number; l: number; t: number;
};
let _formerByMetro: Map<string, FormerCfbCard[]> | null = null;
export function getFormerMajorCfbForMetro(metroSlug: string): FormerCfbCard[] {
  if (!_formerByMetro) {
    _formerByMetro = new Map();
    const seasonsByTeam = d().seasons_by_team;
    for (const t of d().teams) {
      if (t.current_fbs) continue;
      if ((t.fbs_fcs || "").toUpperCase() === "FCS") continue;
      if (t.maj_seasons <= 0 || !t.metro_slug) continue;
      const yrs = (seasonsByTeam[t.slug] ?? []).map((s) => s.year).filter((y) => y > 0);
      const years = yrs.length
        ? (Math.min(...yrs) === Math.max(...yrs) ? `${Math.min(...yrs)}` : `${Math.min(...yrs)}\u2013${Math.max(...yrs)}`)
        : "";
      const card: FormerCfbCard = {
        slug: t.slug, name: t.name, href: `/teams/cfb/${t.slug}`, color: t.color || "#444",
        mono: monogram(t.name), years, lastYear: yrs.length ? Math.max(...yrs) : 0, nat_champ: t.nat_champ_count, conf: t.maj_conf_champ,
        maj_seasons: t.maj_seasons, pct: t.pct, w: t.w, l: t.l, t: t.tie,
      };
      const arr = _formerByMetro.get(t.metro_slug);
      if (arr) arr.push(card); else _formerByMetro.set(t.metro_slug, [card]);
    }
    for (const arr of _formerByMetro.values())
      arr.sort((a, b) => b.nat_champ - a.nat_champ || b.maj_seasons - a.maj_seasons || a.name.localeCompare(b.name));
  }
  return _formerByMetro.get(metroSlug) ?? [];
}

// National champions by year (curated). Each school carries its CFB slug
// (or null if it is not a tracked program) plus the selectors (AP, CFP, ...).
export type CfbNatChampSchool = { name: string; slug: string | null; sel: string };
export type CfbNatChamp = { year: number; heisman: string; champs: CfbNatChampSchool[] };
export function getCfbNationalChampions(): CfbNatChamp[] { return d().national_champions ?? []; }
