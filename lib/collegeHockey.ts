import "server-only";

// College (men's NCAA D-I) ice hockey data layer. Used for metro cards only
// (no standalone hub in v1). Source: scripts/build-college-hockey-data.py emits
// public/data/college-hockey/{data.json,skipped.json} from Frozenfour.txt,
// joining metros from the men's Totals sheet.
//
// Server-only. Registered in scripts/check-client-imports.mjs.

import { existsSync, readFileSync } from "fs";
import { join } from "path";

export type CollegeHockeyTeam = {
  name: string; slug: string; frozen_fours: number; ff_years: number[];
  w: number; l: number; champ_app: number; titles: number;
  metro: string | null; metro_slug: string | null; state: string | null;
  color: string; color2: string;
};
export type CollegeHockeyChamp = { year: number; champion: string; runner_up: string | null };

// A metro college card (hockey): titles (gold) and Frozen Fours. No team page
// in v1, so cards do not link.
export type CollegeHockeyCard = {
  name: string; color: string; mono: string; titles: number; frozenFours: number;
};

type Data = { teams: CollegeHockeyTeam[]; champions: CollegeHockeyChamp[] };

const DIR = join(process.cwd(), "public", "data", "college-hockey");
let _data: Data | null = null;
function data(): Data {
  if (_data) return _data;
  const p = join(DIR, "data.json");
  _data = existsSync(p) ? (JSON.parse(readFileSync(p, "utf-8")) as Data) : { teams: [], champions: [] };
  return _data;
}

export function hockeyMonogram(name: string): string {
  const w = name.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  if (w.length >= 2) return (w[0][0] + w[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function getAllCollegeHockeyTeams(): CollegeHockeyTeam[] { return data().teams; }
export function getCollegeHockeyChampions(): CollegeHockeyChamp[] { return data().champions; }

// Programs in a metro, split by the 5+ titles card gate.
export function getCollegeHockeyForMetro(metroSlug: string): { major: CollegeHockeyCard[]; other: CollegeHockeyCard[] } {
  const card = (t: CollegeHockeyTeam): CollegeHockeyCard => ({
    name: t.name, color: t.color, mono: hockeyMonogram(t.name), titles: t.titles, frozenFours: t.frozen_fours,
  });
  const inMetro = data().teams.filter((t) => t.metro_slug === metroSlug);
  const sortFn = (a: CollegeHockeyCard, b: CollegeHockeyCard) =>
    b.titles - a.titles || b.frozenFours - a.frozenFours || a.name.localeCompare(b.name);
  return {
    major: inMetro.filter((t) => t.titles >= 5).map(card).sort(sortFn),
    other: inMetro.filter((t) => t.titles < 5).map(card).sort(sortFn),
  };
}
