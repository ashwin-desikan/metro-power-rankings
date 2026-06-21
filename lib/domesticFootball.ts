import "server-only";

// Domestic Leagues Worldwide data layer. One record per club that has ever
// played in a tracked first division, across every tracked league, the nine
// marquee hub leagues plus the long tail. Honours are split per country (era):
// allTime is the roll-up, byCountry holds each state a club played under (Soviet
// Union vs Ukraine, Yugoslavia vs Serbia). The dedicated league hubs remain for
// depth; this is the single all-leagues master table. Source:
// scripts/build-domestic-football.py -> domestic-clubs.json.
//
// Server-only — uses fs.readFileSync. Listed in
// scripts/check-client-imports.mjs SERVER_ONLY_MODULES.

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { getAllClubs } from "@/lib/football";

export type EraHonours = {
  titles: number;
  lastTitle: number | null;
  cups: number;
  majorTrophies: number;
  contTitles: number;
  contApps: number;
  clTitles: number;
  clApps: number;
  lastYear?: number | null;
  firstYear?: number | null;
};

export type DomesticClub = {
  name: string;
  metro: string | null;
  country: string;            // current country (latest first-division season)
  confederation: string;
  status: "current" | "former";
  lastTopFlight: number | null;
  slug: string | null;        // /teams/football/[slug] if the club has a page
  allTime: EraHonours;
  byCountry: Record<string, EraHonours>;
};

type RawClub = Omit<DomesticClub, "confederation" | "slug">;

// FIFA confederation per country (membership, not geography: Israel, Kazakhstan
// and the Caucasus play in UEFA; Australia in the AFC). Legacy states map to the
// confederation of their territory. Anything unlisted defaults to UEFA.
const CONFEDERATION: Record<string, string> = {
  Argentina: "CONMEBOL", Brazil: "CONMEBOL", Uruguay: "CONMEBOL",
  Mexico: "CONCACAF", "United States": "CONCACAF",
  Australia: "AFC", China: "AFC", India: "AFC", Iran: "AFC", Japan: "AFC",
  Qatar: "AFC", "Saudi Arabia": "AFC", "South Korea": "AFC", "United Arab Emirates": "AFC",
  Egypt: "CAF", "South Africa": "CAF",
};
function confederationFor(country: string): string {
  return CONFEDERATION[country] || "UEFA";
}

function normName(s: string): string {
  let out = "";
  for (const ch of s.normalize("NFKD")) {
    const cp = ch.codePointAt(0);
    if (cp === undefined || cp < 0x0300 || cp > 0x036f) out += ch;
  }
  return out.replace(/['’.]/g, "").toLowerCase().trim();
}

// Map a domestic club to its /teams/football/[slug] page, where one exists.
let _slugMap: Map<string, { slug: string; metro: string | null }[]> | null = null;
function slugFor(name: string, metro: string | null): string | null {
  if (!_slugMap) {
    _slugMap = new Map();
    for (const c of getAllClubs()) {
      const k = normName(c.cur_name);
      const arr = _slugMap.get(k) ?? [];
      arr.push({ slug: c.slug, metro: c.metro });
      _slugMap.set(k, arr);
    }
  }
  const arr = _slugMap.get(normName(name));
  if (!arr || arr.length === 0) return null;
  if (arr.length === 1) return arr[0].slug;
  const m = metro ? arr.find((x) => x.metro === metro) : undefined;
  return (m ?? arr[0]).slug;
}

let _cache: { meta: Record<string, unknown>; clubs: DomesticClub[] } | null = null;
function load(): { meta: Record<string, unknown>; clubs: DomesticClub[] } {
  if (_cache) return _cache;
  const path = join(process.cwd(), "public", "data", "football", "domestic-clubs.json");
  if (!existsSync(path)) {
    _cache = { meta: {}, clubs: [] };
    return _cache;
  }
  const raw = JSON.parse(readFileSync(path, "utf-8")) as {
    _meta?: Record<string, unknown>;
    clubs?: RawClub[];
  };
  const clubs: DomesticClub[] = (raw.clubs ?? []).map((c) => ({
    ...c,
    confederation: confederationFor(c.country),
    slug: slugFor(c.name, c.metro),
  }));
  _cache = { meta: raw._meta ?? {}, clubs };
  return _cache;
}

export function getDomesticClubs(): DomesticClub[] {
  return load().clubs;
}

// Look up a club by name (and metro, to disambiguate same-named clubs in
// different cities) for metro-page card enrichment.
let _byName: Map<string, DomesticClub[]> | null = null;
export function getDomesticClubByName(name: string, metro?: string | null): DomesticClub | null {
  if (!_byName) {
    _byName = new Map();
    for (const c of load().clubs) {
      const k = normName(c.name);
      const arr = _byName.get(k) ?? [];
      arr.push(c);
      _byName.set(k, arr);
    }
  }
  const arr = _byName.get(normName(name));
  if (!arr || arr.length === 0) return null;
  if (arr.length === 1) return arr[0];
  if (metro) {
    const m = arr.find((c) => c.metro && normName(c.metro) === normName(metro));
    if (m) return m;
  }
  return arr[0];
}

export function getDomesticMeta(): Record<string, unknown> {
  return load().meta;
}

// Defunct pre-1985 NASL clubs (the original North American Soccer League, 1968-
// 1984), keyed by metro for the metro-page defunct-team cards. These are former
// United States top-flight clubs whose last top flight is 1985 or earlier.
export type DefunctNaslClub = {
  name: string;
  firstYear: number | null;
  lastYear: number | null;
  titles: number;
  slug: string | null;
};
let _naslByMetro: Map<string, DefunctNaslClub[]> | null = null;
export function getDefunctNaslForMetro(metroName: string | null | undefined): DefunctNaslClub[] {
  if (!metroName) return [];
  if (!_naslByMetro) {
    _naslByMetro = new Map();
    for (const c of load().clubs) {
      if (c.country !== "United States" || c.status !== "former") continue;
      if ((c.lastTopFlight ?? 9999) > 1985 || !c.metro) continue;
      const us = c.byCountry["United States"];
      const rec: DefunctNaslClub = {
        name: c.name,
        firstYear: (us && us.firstYear) ?? c.lastTopFlight,
        lastYear: c.lastTopFlight,
        titles: us ? us.titles : c.allTime.titles,
        slug: c.slug,
      };
      const k = normName(c.metro);
      const arr = _naslByMetro.get(k) ?? [];
      arr.push(rec);
      _naslByMetro.set(k, arr);
    }
    for (const arr of _naslByMetro.values()) {
      arr.sort((a, b) => b.titles - a.titles || (b.lastYear ?? 0) - (a.lastYear ?? 0) || a.name.localeCompare(b.name));
    }
  }
  return _naslByMetro.get(normName(metroName)) ?? [];
}

export function getDomesticFacets(): { confederations: string[]; countries: string[] } {
  const clubs = load().clubs;
  const conf = new Set<string>();
  const ctry = new Set<string>();
  for (const c of clubs) {
    conf.add(c.confederation);
    for (const k of Object.keys(c.byCountry)) ctry.add(k);
  }
  const order = ["UEFA", "CONMEBOL", "CONCACAF", "AFC", "CAF", "OFC"];
  return {
    confederations: [...conf].sort((a, b) => order.indexOf(a) - order.indexOf(b)),
    countries: [...ctry].sort(),
  };
}
