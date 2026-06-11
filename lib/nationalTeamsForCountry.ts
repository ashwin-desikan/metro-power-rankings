import "server-only";

// Country hub → national teams join (men's football + women's football).
//
// No new ETL: joins lib/international (men, 235 teams) and lib/wnational
// (Women's World Cup nations, 44) against a country display name by
// diacritic-insensitive name match. Verified 2026-06-11: 230/235 men's teams
// resolve to a country page; the 5 misses are defunct states (East Germany,
// South Vietnam, South Yemen, Tibet, Zanzibar), intentionally omitted in v1.
// All 44 WWC nations resolve. UK constituents resolve to their own pages.
//
// Server-only. Listed in scripts/check-client-imports.mjs SERVER_ONLY_MODULES.

import { getAllNationalTeams, type NationalTeam } from "@/lib/international";
import { getWWCNations, type WWCNation } from "@/lib/wnational";

export type CountryNationalTeams = {
  men: NationalTeam | null;
  women: WWCNation | null;
};

function norm(s: string): string {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

// Editorial aliases for when a workbook country name and a team name differ.
// Key: normalized country name → normalized team name to look up instead.
const COUNTRY_TEAM_ALIASES: Record<string, string> = {};

let _men: Map<string, NationalTeam> | null = null;
let _women: Map<string, WWCNation> | null = null;

function menByName(): Map<string, NationalTeam> {
  if (_men) return _men;
  _men = new Map();
  for (const t of getAllNationalTeams()) {
    // cur_name is display-canonical; index legacy name too without clobbering.
    for (const key of [norm(t.cur_name || t.name), norm(t.name)]) {
      if (key && !_men.has(key)) _men.set(key, t);
    }
  }
  return _men;
}

function womenByName(): Map<string, WWCNation> {
  if (_women) return _women;
  _women = new Map();
  for (const n of getWWCNations()) {
    const key = norm(n.name);
    if (key && !_women.has(key)) _women.set(key, n);
  }
  return _women;
}

export function getNationalTeamsForCountry(countryName: string): CountryNationalTeams {
  const key = COUNTRY_TEAM_ALIASES[norm(countryName)] ?? norm(countryName);
  return {
    men: menByName().get(key) ?? null,
    women: womenByName().get(key) ?? null,
  };
}
