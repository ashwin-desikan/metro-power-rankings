import "server-only";
// NFL Europe / WLAF data layer for the NFL International hub
// (/teams/nfl/international) and the metro-page defunct-team cards.
//
// Source: public/data/nfl/europe.json, emitted by
// scripts/build-nfl-europe-data.py from the 'NFL Europe' sheet of
// OtherLeagues.xlsx. Server-only — uses fs.readFileSync.
//
// Canonical model: a franchise is keyed by the workbook's "Name" column.
// The "Team" column is the contemporaneous name in a given metro, so a
// franchise can span multiple metros ("stints"). The 1991-92 Birmingham
// Fire and the 1995-2007 Rhein Fire are one franchise that relocated in
// 1995; the Scottish Claymores span Edinburgh then Glasgow.

import { readFileSync } from "fs";
import { join } from "path";

export type WorldBowl = {
  season: number;
  game: string;
  date: string | null;
  venue: string | null;
  city: string | null;
  champion: string | null;
  runner_up: string | null;
  score: string | null;
};

export type NflEuropeStint = {
  metro: string;
  metro_slug: string | null;
  team: string;
  first_year: number;
  last_year: number;
  seasons: number;
  w: number; l: number; t: number; win_pct: number;
  wb_apps: number;
  wb_titles: number;
};

export type NflEuropeFranchise = {
  canonical: string;
  first_year: number;
  last_year: number;
  seasons: number;
  w: number; l: number; t: number; win_pct: number;
  wb_apps: number;
  wb_titles: number;
  metros: NflEuropeStint[];
  relocated: boolean;
};

export type NflEuropeStanding = {
  season: number;
  division: string | null;
  pos: number | null;
  team: string;
  w: number; l: number; t: number;
  pct: number | null;
  pf: number | null; pa: number | null;
  playoff: boolean;
  wb_app: boolean;
  wb_champ: boolean;
  canonical: string;
  metro: string | null;
  metro_slug: string | null;
};

export type NflEuropeData = {
  meta: {
    name: string; aka: string; years: string;
    championship: string; source: string;
  };
  world_bowls: WorldBowl[];
  franchises: NflEuropeFranchise[];
  standings: NflEuropeStanding[];
};

let _data: NflEuropeData | null = null;
function load(): NflEuropeData {
  if (!_data) {
    const path = join(process.cwd(), "public", "data", "nfl", "europe.json");
    _data = JSON.parse(readFileSync(path, "utf-8")) as NflEuropeData;
  }
  return _data;
}

export function getNflEurope(): NflEuropeData { return load(); }
export function getNflEuropeFranchises(): NflEuropeFranchise[] { return load().franchises; }
export function getNflEuropeWorldBowls(): WorldBowl[] { return load().world_bowls; }
export function getNflEuropeStandings(): NflEuropeStanding[] { return load().standings; }

// Stable anchor/slug for a franchise on the hub page.
export function nflEuropeFranchiseSlug(canonical: string): string {
  return canonical
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// Seasons grouped by year, newest first — used for the standings tables.
export function getNflEuropeSeasonsByYear(): { year: number; rows: NflEuropeStanding[] }[] {
  const byYear = new Map<number, NflEuropeStanding[]>();
  for (const s of load().standings) {
    const arr = byYear.get(s.season) ?? [];
    arr.push(s);
    byYear.set(s.season, arr);
  }
  return [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, rows]) => ({
      year,
      rows: rows.slice().sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99)),
    }));
}

// ---------- Metro-page defunct-team cards ----------

export type NflEuropeMetroCard = {
  canonical: string;     // canonical franchise name (for the hub anchor)
  name: string;          // contemporaneous name in THIS metro
  firstYear: number;
  lastYear: number;
  titles: number;        // World Bowls won while in THIS metro
  apps: number;          // World Bowl appearances while in THIS metro
  relocated: boolean;    // franchise also played in another metro
  also: string[];        // other metros the franchise played in (display)
  slug: string;          // hub anchor slug
};

const normName = (s: string) => s.trim().toLowerCase();

let _byMetro: Map<string, NflEuropeMetroCard[]> | null = null;
export function getNflEuropeForMetro(metroName: string | null | undefined): NflEuropeMetroCard[] {
  if (!metroName) return [];
  if (!_byMetro) {
    _byMetro = new Map();
    for (const f of load().franchises) {
      for (const st of f.metros) {
        if (!st.metro) continue;
        const also = f.metros
          .filter((o) => o.metro !== st.metro)
          .map((o) => `${o.team} (${o.metro}, ${o.first_year}–${o.last_year})`);
        const card: NflEuropeMetroCard = {
          canonical: f.canonical,
          name: st.team,
          firstYear: st.first_year,
          lastYear: st.last_year,
          titles: st.wb_titles,
          apps: st.wb_apps,
          relocated: f.relocated,
          also,
          slug: nflEuropeFranchiseSlug(f.canonical),
        };
        const k = normName(st.metro);
        const arr = _byMetro.get(k) ?? [];
        arr.push(card);
        _byMetro.set(k, arr);
      }
    }
  }
  return _byMetro.get(normName(metroName)) ?? [];
}

// ---------- Modern NFL International Series ----------
// Built by scripts/build-nfl-international-data.py from the Wikipedia
// "NFL International Series" results into public/data/nfl/international-series.json.

export type NflIntlTeam = { name: string; slug: string | null };
export type NflIntlGame = {
  season: number;
  date: string;          // ISO yyyy-mm-dd
  date_display: string;  // e.g. "October 28, 2007"
  visitor: NflIntlTeam;
  home: NflIntlTeam;
  stadium: string;
  metro: { name: string; slug: string | null };
  country: { name: string | null; slug: string | null };
};
export type NflInternationalData = {
  meta: {
    name: string; blurb: string; source: string;
    count: number; countries: string[];
    first_season: number; last_season: number;
  };
  games: NflIntlGame[];
};

let _intl: NflInternationalData | null = null;
export function getNflInternationalSeries(): NflInternationalData {
  if (!_intl) {
    const path = join(process.cwd(), "public", "data", "nfl", "international-series.json");
    _intl = JSON.parse(readFileSync(path, "utf-8")) as NflInternationalData;
  }
  return _intl;
}
