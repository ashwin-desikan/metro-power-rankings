import "server-only";

// Generic national-team data layer for two-tier sports (Olympics = ultimate
// trophy + a World Championship), shared by handball and volleyball. Each sport
// calls makeWorldsPortal("<sport>") to get its own cached accessors over
// public/data/<sport>/{nations,hub,team-detail}. Mirrors lib/hockey.ts.
//
// Server-only. The thin per-sport wrappers (lib/handball.ts, lib/volleyball.ts)
// and this file are all listed in scripts/check-client-imports.mjs.

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { getAllCountries } from "@/lib/countries";

export type WorldsNation = {
  slug: string; name: string; country_slug: string | null;
  oly_gold: number; oly_silver: number; oly_bronze: number; oly_medals: number;
  oly_gold_years: number[]; oly_alltime_rank: number | null;
  worlds_gold: number; worlds_silver: number; worlds_bronze: number;
  worlds_medals: number; worlds_gold_years: number[];
  lineage: string[] | null;
};

export type WorldsDetail = {
  slug: string; name: string; country_slug: string | null;
  oly: { year: number; medal: string }[];
  worlds: { year: number; medal: string }[];
};

export type WorldsHub = {
  olympic_podiums: { year: number; gold: string; silver: string; bronze: string }[];
  worlds: { year: number; gold: string; silver: string; bronze: string }[];
  totals: { nations: number; oly_editions: number; worlds_editions: number };
};

const COUNTRY_ALIASES: Record<string, string> = {
  "united kingdom": "great britain",
  england: "great britain",
  scotland: "great britain",
  wales: "great britain",
};

function norm(s: string): string {
  let out = "";
  for (const ch of s.normalize("NFKD")) {
    const cp = ch.codePointAt(0);
    if (cp === undefined || cp < 0x0300 || cp > 0x036f) out += ch;
  }
  return out.replace(/&/g, " and ").replace(/\./g, " ").replace(/\s+/g, " ").toLowerCase().trim();
}

export type WorldsPortal = {
  getAllTeams: () => WorldsNation[];
  getHub: () => WorldsHub | null;
  getTeamBySlug: (slug: string) => WorldsNation | null;
  getAllSlugs: () => string[];
  getTeamDetail: (slug: string) => WorldsDetail | null;
  getTeamForCountry: (countryName: string) => WorldsNation | null;
  getCountrySlugForTeam: (team: WorldsNation) => string | null;
};

export function makeWorldsPortal(sportDir: string): WorldsPortal {
  const DATA_DIR = join(process.cwd(), "public", "data", sportDir);
  function loadJson<T>(rel: string): T | null {
    const p = join(DATA_DIR, rel);
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, "utf-8")) as T;
  }

  let _nations: WorldsNation[] | null = null;
  let _hub: WorldsHub | null = null;
  let _bySlug: Map<string, WorldsNation> | null = null;
  let _byName: Map<string, WorldsNation> | null = null;
  let _countryByNorm: Map<string, string> | null = null;

  const getAllTeams = () => (_nations ??= loadJson<WorldsNation[]>("nations.json") ?? []);
  const getHub = () => (_hub ??= loadJson<WorldsHub>("hub.json"));
  const getTeamBySlug = (slug: string) => {
    if (!_bySlug) _bySlug = new Map(getAllTeams().map((t) => [t.slug, t]));
    return _bySlug.get(slug) ?? null;
  };
  const getAllSlugs = () => getAllTeams().map((t) => t.slug);
  const getTeamDetail = (slug: string) => loadJson<WorldsDetail>(join("team-detail", `${slug}.json`));

  function nationsByName(): Map<string, WorldsNation> {
    if (_byName) return _byName;
    _byName = new Map();
    for (const t of getAllTeams()) _byName.set(norm(t.name), t);
    return _byName;
  }
  const getTeamForCountry = (countryName: string) => {
    const key = COUNTRY_ALIASES[norm(countryName)] ?? norm(countryName);
    return nationsByName().get(key) ?? null;
  };

  function countryByNorm(): Map<string, string> {
    if (_countryByNorm) return _countryByNorm;
    _countryByNorm = new Map();
    for (const c of getAllCountries()) {
      const key = norm(c.name);
      if (key && !_countryByNorm.has(key)) _countryByNorm.set(key, c.slug);
    }
    return _countryByNorm;
  }
  const getCountrySlugForTeam = (team: WorldsNation) => {
    const direct = countryByNorm().get(norm(team.name));
    if (direct) return direct;
    for (const [countryName, teamName] of Object.entries(COUNTRY_ALIASES)) {
      if (teamName === norm(team.name)) {
        const s = countryByNorm().get(norm(countryName));
        if (s) return s;
      }
    }
    return null;
  };

  return {
    getAllTeams, getHub, getTeamBySlug, getAllSlugs, getTeamDetail,
    getTeamForCountry, getCountrySlugForTeam,
  };
}
