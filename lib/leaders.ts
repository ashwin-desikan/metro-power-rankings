// lib/leaders.ts
// Server-side loader for world-leaders data (data/leaders/<slug>.json).
// Safe to import only from server components / generateStaticParams.

import fs from "fs";
import path from "path";

export type LeaderMetro = {
  name: string;  // display name, e.g. "Chicago"
  slug: string;  // metro slug for /metros/[slug]
};

export type Leader = {
  name: string;
  role: string;
  start: string | null;
  end: string | null;
  current: boolean;
  tenure: string | null;
  party: string | null;
  era: string | null;
  metros?: LeaderMetro[];  // home metro(s) — US presidents
};

const DATA_DIR = path.join(process.cwd(), "public", "data", "leaders");

let _cache: Record<string, Leader[]> = {};

export function getLeaders(slug: string): Leader[] {
  if (_cache[slug] !== undefined) return _cache[slug];
  const file = path.join(DATA_DIR, `${slug}.json`);
  if (!fs.existsSync(file)) {
    _cache[slug] = [];
    return [];
  }
  try {
    _cache[slug] = JSON.parse(fs.readFileSync(file, "utf-8")) as Leader[];
  } catch {
    _cache[slug] = [];
  }
  return _cache[slug];
}

export function countryHasLeaders(slug: string): boolean {
  return fs.existsSync(path.join(DATA_DIR, `${slug}.json`));
}

/** Return year from an ISO date string, or null. */
export function leaderYear(d: string | null): number | null {
  if (!d) return null;
  const y = parseInt(d.slice(0, 4), 10);
  return isNaN(y) ? null : y;
}
