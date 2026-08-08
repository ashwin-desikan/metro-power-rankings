import "server-only";

// Generic winners-only "honour roll" data layer for domestic competitions that
// we track as champions lists only (no team pages, no metro spine), mirroring
// Domestic Rugby / Domestic T20. One JSON per portal under public/data/honours/
// built by scripts/intl_sport (handball/volleyball/basketball/hockey domestic,
// cricket county, British rugby league).
//
// Server-only. Listed in scripts/check-client-imports.mjs.

import { existsSync, readFileSync } from "fs";
import { join } from "path";

// `era` names the competition a season belongs to, for rolls that span more
// than one (Spain's Liga Española before the Liga ACB, the Yugoslav First
// League before the ABA). HonourRolls draws a labelled rule wherever it
// changes. Optional: rolls covering a single competition omit it entirely.
export type HonourRollRow = {
  season: string;
  winner: string;
  ru: string | null;
  era?: string | null;
};

export type HonourPortal = {
  labels: Record<string, string>;
  rolls: Record<string, HonourRollRow[]>;
  most_titled: Record<string, { winner: string; titles: number }[]>;
};

const DIR = join(process.cwd(), "public", "data", "honours");
const cache = new Map<string, HonourPortal | null>();

export function getHonourPortal(key: string): HonourPortal | null {
  if (cache.has(key)) return cache.get(key) ?? null;
  const p = join(DIR, `${key}.json`);
  const v = existsSync(p) ? (JSON.parse(readFileSync(p, "utf-8")) as HonourPortal) : null;
  cache.set(key, v);
  return v;
}
