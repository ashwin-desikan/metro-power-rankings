import "server-only";

// Women's College Basketball data layer (/teams/cbb-w).
//
// Source: scripts/build-wcbb-data.py emits public/data/wcbb/{data.json,
// slug-lookup.json} from the master NCAA Tournament workbook (Totals (W),
// Conf_Teams (W), NCAA W Tournament). Slug = slugify(name)+"-ncaaw".
//
// Server-only. Registered in scripts/check-client-imports.mjs.

import { existsSync, readFileSync } from "fs";
import { join } from "path";

export type WcbbTeam = {
  slug: string; name: string; conference: string | null; current_d1: boolean;
  city: string | null; metro: string | null; metro_slug: string | null;
  state: string | null; lat: number | null; long: number | null; region: string | null;
  color: string; color2: string;
  games: number; w: number; l: number; pct: number; seasons: number;
  tour_app: number; seed1: number; top4_seed: number;
  sweet16: number; elite8: number; final4: number; champ_app: number; titles: number;
  tour_w: number; tour_l: number;
  weeks_ranked: number; weeks_t5: number; weeks_at_1: number;
  last_year: number; last_app: number; last_title: number; title_years: number[];
};
export type WcbbSeason = {
  year: number; w: number; l: number; conference: string | null;
  conf_w: number; conf_l: number; ap_high: number | null; ap_final: number | null;
  reg_champ: boolean; conf_tour_champ: boolean; ncaa: boolean; final4: boolean; champ: boolean;
};
export type WcbbTourYear = {
  year: number; seed: number | null; w: number; l: number;
  sweet16: boolean; elite8: boolean; final4: boolean; champ_app: boolean; champ: boolean;
};
export type WcbbChampYear = {
  year: number;
  champs: { name: string; slug: string | null }[];
  runner_up: { name: string; slug: string | null }[];
  final_four: { name: string; slug: string | null }[];
};

// A metro college card (women's basketball): titles, Final Fours, tournament apps.
export type WcbbCard = {
  name: string; slug: string; href: string; color: string; mono: string;
  conference: string | null; titles: number; finalFours: number; tourApps: number;
};

type Data = {
  teams: WcbbTeam[];
  seasons_by_team: Record<string, WcbbSeason[]>;
  tournament_by_team: Record<string, WcbbTourYear[]>;
  national_champions: WcbbChampYear[];
};

const DIR = join(process.cwd(), "public", "data", "wcbb");
let _data: Data | null = null;
function data(): Data {
  if (_data) return _data;
  const p = join(DIR, "data.json");
  _data = existsSync(p)
    ? (JSON.parse(readFileSync(p, "utf-8")) as Data)
    : { teams: [], seasons_by_team: {}, tournament_by_team: {}, national_champions: [] };
  return _data;
}

function normName(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
export function wcbbMonogram(name: string): string {
  const n = name.replace(/\s*\(W\)\s*$/, "");
  const w = n.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  if (w.length >= 2) return (w[0][0] + w[1][0]).toUpperCase();
  return n.slice(0, 2).toUpperCase();
}

export function getAllWcbbTeams(): WcbbTeam[] { return data().teams; }
let _bySlug: Map<string, WcbbTeam> | null = null;
export function getWcbbTeamBySlug(slug: string): WcbbTeam | null {
  if (!_bySlug) _bySlug = new Map(data().teams.map((t) => [t.slug, t]));
  return _bySlug.get(slug) ?? null;
}
export function getAllWcbbSlugs(): string[] { return data().teams.map((t) => t.slug); }
let _byName: Map<string, WcbbTeam> | null = null;
export function getWcbbTeamForName(name: string): WcbbTeam | null {
  if (!_byName) _byName = new Map(data().teams.map((t) => [normName(t.name), t]));
  return _byName.get(normName(name)) ?? null;
}
export function getWcbbSeasons(slug: string): WcbbSeason[] { return data().seasons_by_team[slug] ?? []; }
export function getWcbbTournament(slug: string): WcbbTourYear[] { return data().tournament_by_team[slug] ?? []; }
export function getWcbbNationalChampions(): WcbbChampYear[] { return data().national_champions; }

// Programs in a metro, split by the 5+ Final Four card gate.
export function getWcbbForMetro(metroSlug: string): { major: WcbbCard[]; other: WcbbCard[] } {
  const card = (t: WcbbTeam): WcbbCard => ({
    name: t.name, slug: t.slug, href: `/teams/cbb-w/${t.slug}`, color: t.color,
    mono: wcbbMonogram(t.name), conference: t.conference,
    titles: t.titles, finalFours: t.final4, tourApps: t.tour_app,
  });
  const inMetro = data().teams.filter(
    (t) => t.metro_slug === metroSlug && t.current_d1 && t.tour_app > 0
  );
  const sortFn = (a: WcbbCard, b: WcbbCard) =>
    b.titles - a.titles || b.finalFours - a.finalFours || b.tourApps - a.tourApps || a.name.localeCompare(b.name);
  return {
    major: inMetro.filter((t) => t.titles >= 1).map(card).sort(sortFn),
    other: inMetro.filter((t) => t.titles < 1).map(card).sort(sortFn),
  };
}

// A former-program card for the metro "Defunct & Relocated" section: women's
// programs no longer in Division I, placed in their campus metro.
export type FormerWcbbCard = {
  slug: string; href: string; name: string; color: string; mono: string;
  years: string | null; lastYear: number;
  titles: number; finalFours: number; tourApps: number; seasons: number; pct: number;
};
export function getFormerWcbbForMetro(metroSlug: string): FormerWcbbCard[] {
  const d = data();
  return d.teams
    .filter((t) => !t.current_d1 && t.metro_slug === metroSlug)
    .map((t) => {
      const ss = d.seasons_by_team[t.slug] ?? [];
      const ys = ss.map((s) => s.year).filter((y) => y > 0);
      const first = ys.length ? Math.min(...ys) : 0;
      const last = ys.length ? Math.max(...ys) : t.last_year;
      return {
        slug: t.slug, href: `/teams/cbb-w/${t.slug}`, name: t.name, color: t.color, mono: wcbbMonogram(t.name),
        years: first && last ? `${first}–${last}` : null, lastYear: last,
        titles: t.titles, finalFours: t.final4, tourApps: t.tour_app, seasons: t.seasons, pct: t.pct,
      };
    })
    .sort((a, b) => b.lastYear - a.lastYear || b.finalFours - a.finalFours || a.name.localeCompare(b.name));
}
