import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// Formula 1 title odds, built by scripts/f1/build_title_odds.py after each
// race (the mini's run-f1-weekly.sh and the f1-refresh workflow both write
// public/data/f1/title-odds.json with [vercel skip]). Same ISR read as
// lib/seasonSim.ts: GitHub raw first so a refresh lands without a build, the
// build-time copy as the fallback.

export type F1DriverOdds = {
  driverId: string;
  driver: string;
  constructor: string | null;
  points: number;
  wins: number;
  points_per_race: number;
  dnf_rate: number;
  exp_points: number;
  /** Percent, 0 to 100. */
  p_title: number;
  clinched: boolean;
  eliminated: boolean;
};

export type F1ConstructorOdds = {
  constructorId: string;
  constructor: string;
  points: number;
  wins: number;
  drivers: string[];
  exp_points: number;
  p_title: number;
  clinched: boolean;
  eliminated: boolean;
};

export type F1TitleOdds = {
  meta: {
    league: string;
    season: number;
    through_round: number;
    rounds_total: number;
    races_remaining: number;
    sprints_remaining: number;
    max_points_remaining_driver: number;
    max_points_remaining_constructor: number;
    next_race: { round: number; name: string; date: string | null; sprint: boolean } | null;
    sims: number;
    noise_scale: number;
    generated_at: string;
    source: string;
    method: string;
  };
  drivers: F1DriverOdds[];
  constructors: F1ConstructorOdds[];
  /** Every round with its sessions' instants and the winners so far; absent in files built before 2026-09-11. */
  calendar?: F1CalendarRound[];
};

export type F1CalendarRound = {
  round: number;
  name: string;
  date: string | null;
  sprint: boolean;
  circuit: string | null;
  locality: string | null;
  country: string | null;
  /** In weekend order: practice, sprint qualifying, sprint, qualifying, race. */
  sessions: { label: string; when: string }[];
  winner: { driver: string; constructor: string } | null;
  sprint_winner: { driver: string; constructor: string } | null;
};

const GH_BASE =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data";

export async function getF1TitleOdds(): Promise<F1TitleOdds | null> {
  let local: F1TitleOdds | null = null;
  try {
    local = JSON.parse(readFileSync(join(process.cwd(), "public", "data", "f1", "title-odds.json"), "utf-8"));
  } catch {
    /* no build-time copy yet */
  }
  try {
    const res = await fetch(`${GH_BASE}/f1/title-odds.json`, { next: { revalidate: 21600, tags: ["predictions-daily"] } });
    if (res.ok) {
      const remote = (await res.json()) as F1TitleOdds;
      if (remote?.meta?.generated_at && (!local || remote.meta.generated_at >= local.meta.generated_at)) return remote;
    }
  } catch {
    /* offline: local only */
  }
  return local;
}

/**
 * Worth showing only while the season is under way and the file is fresh:
 * races still to run and generated within the last 21 days (F1 has three-week
 * gaps; a dead job must still fade out rather than pin stale odds).
 */
export function f1OddsAreCurrent(o: F1TitleOdds | null, season?: number): o is F1TitleOdds {
  if (!o || o.drivers.length === 0) return false;
  if (season != null && o.meta.season !== season) return false;
  if (o.meta.races_remaining <= 0) return false;
  const age = Date.now() - new Date(`${o.meta.generated_at}T00:00:00Z`).getTime();
  return Number.isFinite(age) && age < 21 * 24 * 3600 * 1000;
}

/** Driver display name -> row; constructor name -> row. The live tables carry the same names. */
export function f1OddsByName(o: F1TitleOdds | null): { drivers: Map<string, F1DriverOdds>; constructors: Map<string, F1ConstructorOdds> } {
  const drivers = new Map<string, F1DriverOdds>();
  const constructors = new Map<string, F1ConstructorOdds>();
  for (const d of o?.drivers ?? []) drivers.set(normDriver(d.driver), d);
  for (const c of o?.constructors ?? []) constructors.set(normConstructor(c.constructor), c);
  return { drivers, constructors };
}

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").trim();

/** "Andrea Kimi Antonelli" and "Kimi Antonelli" meet on the last two tokens. */
export function normDriver(s: string): string {
  return fold(s).split(/\s+/).slice(-2).join(" ");
}

/** "Haas F1 Team", "RB F1 Team", "Alpine F1 Team" keep only the name that identifies them. */
export function normConstructor(s: string): string {
  return fold(s).split(/\s+/).filter((t) => !["f1", "team", "racing", "formula", "one"].includes(t)).join(" ");
}
