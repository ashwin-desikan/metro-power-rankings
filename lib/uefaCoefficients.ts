import "server-only";
import { readFile } from "fs/promises";
import { join } from "path";

// UEFA country + club coefficients (Bert Kassies "method5"), five-year window.
// scripts/uefa/uefa_coefficients.py recomputes the CURRENT season from Supabase
// (football_fixtures + football_standings, written by the mini's daily
// run-football-standings.sh) and sums it with the four frozen seasons, then
// commits public/data/football/uefa-coefficients.json with [vercel skip].
// This lib reads that committed JSON from GitHub raw at runtime via ISR
// (revalidate 1800) - the same pattern as lib/clubFootballLive.ts and
// lib/euroComps.ts - so the coefficient race refreshes WITHOUT a Vercel build.
// Falls back to the on-disk copy when raw is unavailable (local dev before the
// file is on main, a raw outage, the first deploy after a rebuild). Fail-soft:
// any error returns null/[] and the caller hides the block.
//
// KEEP THE TWO WINDOWS APART, and label them on the hub:
//   * country-coeff-2026-27.json = the frozen ACCESS window (2021/22-2025/26).
//     It decided this season's slots and it never moves, so a build-time read
//     of it is correct.
//   * this file = the LIVE five-year race (2022/23-2026/27), which moves on
//     every European matchday and must never be read at build time.
//
// Server-only (reads the filesystem as its fallback); registered in
// scripts/check-client-imports.mjs.

export type CoefSeasons = Record<string, number | null>;

export type UefaCountryCoef = {
  country: string;
  seasons: CoefSeasons;   // keyed by the season labels in `seasons`
  crank: number;          // five-season sum
  rank: number;
};

export type UefaClubCoef = {
  uefa_name: string;
  cc: string | null;
  name: string;
  metro: string | null;
  country: string | null;
  seasons: CoefSeasons;
  trank: number;          // five-season sum, floored at the country coefficient / 5
  rank: number;
};

export type UefaCoefficients = {
  method: string;
  currentSeason: string;  // "26/27"
  seasons: string[];      // the five season labels, oldest first
  countries: UefaCountryCoef[];
  clubs: UefaClubCoef[];
};

const FILE = "uefa-coefficients.json";
const GH_RAW =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data/football";

async function load(): Promise<UefaCoefficients | null> {
  try {
    const res = await fetch(`${GH_RAW}/${FILE}`, { next: { revalidate: 1800 } });
    if (res.ok) return (await res.json()) as UefaCoefficients;
  } catch {
    /* fall through to disk */
  }
  try {
    const p = join(process.cwd(), "public", "data", "football", FILE);
    return JSON.parse(await readFile(p, "utf-8")) as UefaCoefficients;
  } catch {
    return null;
  }
}

export async function getUefaCoefficients(): Promise<UefaCoefficients | null> {
  return load();
}

export async function getUefaCountryCoefficients(): Promise<UefaCountryCoef[]> {
  return (await load())?.countries ?? [];
}

export async function getUefaClubCoefficients(): Promise<UefaClubCoef[]> {
  return (await load())?.clubs ?? [];
}
