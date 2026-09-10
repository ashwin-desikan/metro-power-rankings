import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// The NFL weekly-Elo spine, built by scripts/build-nfl-elo.py from
// NFL_all.xlsx sheet "NFL Standings": 48,636 team-weeks, 1920-2026, every one
// carrying a rating and a league rank.
//
// 🔴 ONE ELO POOL PER SEASON, STANDINGS SPLIT BY LEAGUE. 1946-49 rates the NFL
// and the AAFC against each other; 1960-69 the NFL and the AFL. Ashwin's
// ruling, and it matches the workbook. So `rank` is league-agnostic and a hub
// that shows standings must split on `league` WITHOUT splitting the ratings.
//
// 🔴 STATUS IS NOT DECORATION. A season is `final`, `seeded` (week 0 is sound
// and nothing after it is) or `broken`. 2026 is `seeded` today because the
// workbook's shift formula returns 6.9283225680685128 for every team when
// there is no result to consume. Render a seeded season as a preseason board,
// never as a flat line.
//
// 🔴 A CARRIED WEEK IS NOT A MEASURED WEEK. Byes and post-elimination weeks
// inherit the previous rating and carry `carried: true`. Draw them as held.
//
// 🔴 ISR READ, NOT A MODULE-LOAD readFileSync. Same rule as plExpectation and
// intlExpectation: 107 shards of ~36 KB, one fetched per season page.

export type NflEloWeek = {
  /** 0 is the preseason seed. Filter on THIS, never on a phase label: the
   *  workbook calls week 0 "Preseason" in 2024 and "Reg. Season" from 2025. */
  w: number;
  /** Elo after that week, one decimal. */
  e: number;
  /** Rank in the season's whole pool, across every league that ran in it. */
  r: number | null;
  /** [W, L, T] to date. */
  rec?: [number, number, number];
  /** [points for, points against] to date. */
  pts?: [number, number];
  /** Division position that week. */
  dv?: string;
  /** Week-ending date, ISO. */
  d?: string;
  /** The workbook's phase label for that week: "Preseason", "Reg. Season",
   *  "Playoff", "Champ". Never filter weeks on this - week 0 is labelled
   *  "Reg. Season" from 2025 on. It is for annotation only. */
  ph?: string;
  carried?: true;
  seed?: true;
};

/** The year-end honours the workbook records, in the order they escalate. */
export const NFL_HONOURS = [
  "play_app", "div_title", "best_conf", "best_rec", "cf_app", "champ_app", "champ",
] as const;
export type NflHonour = (typeof NFL_HONOURS)[number];

export type NflEloTeam = {
  /** Canonical franchise name, the workbook's join key. */
  name: string;
  city: string | null;
  team: string | null;
  league: string | null;
  conf: string | null;
  div: string | null;
  /** Year-end honours, straight from the workbook's AR-AX columns. A key is
   *  present ONLY when the team earned it, so every key is `true`.
   *
   *  🔴 THE WORKBOOK'S VOCABULARY IS "Y" OR "0", NOT "Y" OR BLANK. The build
   *  script tests `== "Y"` explicitly; storing the raw cell made every team a
   *  1966 champion, because "0" is a non-empty string. */
  flags?: Partial<Record<NflHonour, true>>;
  /** Final regular-season record, [W, L, T].
   *
   *  🔴 THE LAST WEEK THAT HAS ONE, NOT THE LAST WEEK. The workbook stops
   *  writing W/L/T once a team's regular season ends, so reading the final week
   *  gave every team that reached January a blank record. */
  rec?: [number, number, number];
  /** Points [for, against] at the same week as `rec`. */
  pts?: [number, number];
  /** Playoff seed, from the game log rather than the standings sheet: NFL
   *  Standings' "Play Pos." column is empty in every season. Absent for a team
   *  that did not reach the playoffs, and for the eras that had none. */
  seed?: number;
  start: number;
  end: number;
  peak: { w: number; e: number };
  trough: { w: number; e: number };
  weeks: NflEloWeek[];
};

export type NflEloMeta = {
  generated_at: string;
  source: string;
  source_credit: string;
  hfa_elo: number;
  team_weeks: number;
  seasons: [number, number];
  notes: string;
};

/**
 * `final`  every week carries a plausible, varying rating from the workbook
 * `live`   the season is under way and the chain is carried in Python from the
 *          week-0 seed and the game log, because the workbook's weekly rating
 *          is a formula and a formula is stale until Excel opens the file
 * `seeded` week 0 is sound and nothing after it is: a season not yet played
 * `broken` week 0 is unusable too
 */
export type NflEloSeasonStatus = "final" | "live" | "seeded" | "broken";

export type NflEloSeason = {
  meta: NflEloMeta;
  season: number;
  status: NflEloSeasonStatus;
  leagues: string[];
  /** League to the last week labelled regular season, week 0 excluded. Two
   *  entries in the years two leagues ran and did not finish together. */
  reg_end_week: Record<string, number>;
  /** 🔴 THE GATE FOR ANYTHING THAT SUMMARISES A WHOLE SEASON. True only once
   *  a champion is flagged, so 2026 gets no greatest-games board in November. */
  complete: boolean;
  teams: NflEloTeam[];
  dropped_weeks: number[];
};

export type NflEloIndexRow = {
  season: number;
  status: NflEloSeasonStatus;
  leagues: string[];
  teams: number;
  weeks: number;
  dropped_weeks: number[];
  complete: boolean;
  champion: { name: string; city: string | null; team: string | null } | null;
  top: { name: string; city: string | null; team: string | null; elo: number } | null;
};

export type NflEloIndex = { meta: NflEloMeta; seasons: NflEloIndexRow[] };

export type NflFranchiseSeason = {
  season: number;
  start: number;
  end: number;
  peak: number;
  peak_w: number;
  trough: number;
  trough_w: number;
  rank_end: number | null;
  weeks: number;
  status: NflEloSeasonStatus;
};

export type NflFranchise = {
  name: string;
  first_season: number;
  last_season: number;
  seasons: NflFranchiseSeason[];
  peak: { season: number; week: number; elo: number } | null;
  trough: { season: number; week: number; elo: number } | null;
};

export type NflFranchisesFile = { meta: NflEloMeta; franchises: NflFranchise[] };

export type NflScheduledGame = {
  week: number;
  date: string | null;
  home: string;
  away: string;
  home_city: string | null;
  away_city: string | null;
  neutral: boolean;
  phase: string | null;
  home_pts: number | null;
  away_pts: number | null;
  home_elo: number | null;
  away_elo: number | null;
  /** Pre-game probability for the HOME side. Null where a rating is not yet a
   *  fact: week 2 depends on week 1's results, so it is never guessed. */
  p_home: number | null;
  basis: "seed" | "week" | "pending";
};

export type NflUpcoming = {
  meta: NflEloMeta;
  season: number;
  last_rated_week: number | null;
  games: number;
  priced: number;
  schedule: NflScheduledGame[];
};

const GH_BASE =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data";

// readLocal does the actual literal readFileSync per file (never a helper
// taking a dynamic filename) so the Vercel file tracer scopes each route to
// just the file(s) it reads. See scripts/DATA-READS-RECIPE.md.
async function load<T>(
  file: string,
  readLocal: () => T,
  ok: (remote: T) => boolean,
): Promise<T | null> {
  let local: T | null = null;
  try {
    local = readLocal();
  } catch {
    /* no build-time copy */
  }
  // A development server, or a local `next start` with NFL_DATA_LOCAL=1,
  // reads the checkout's files instead of origin's, so a data change shows
  // on the page BEFORE it is pushed (Ashwin, 2026-09-10: rebuilt seeds files
  // invisible on `next dev` because the page fetched origin's copy first).
  // Production keeps GitHub-raw-first, which is what makes a data refresh
  // free of a build. Never set NFL_DATA_LOCAL in Vercel's environment.
  if ((process.env.NFL_DATA_LOCAL === "1" || process.env.NODE_ENV === "development") && local != null) return local;
  try {
    const res = await fetch(`${GH_BASE}/${file}`, {
      next: { revalidate: 86400, tags: ["nfl-elo"] },
    });
    if (res.ok) {
      const remote = (await res.json()) as T;
      if (ok(remote)) return remote;
    }
  } catch {
    /* offline: local only */
  }
  return local;
}

export async function getNflEloIndex(): Promise<NflEloIndex | null> {
  return load<NflEloIndex>(
    "nfl/elo/index.json",
    () => JSON.parse(readFileSync(join(process.cwd(), "public", "data", "nfl", "elo", "index.json"), "utf-8")),
    (r) => Boolean(r?.seasons?.length),
  );
}

/** One season. 107 of these exist; a page fetches exactly the one it renders. */
export async function getNflEloSeason(season: number): Promise<NflEloSeason | null> {
  if (!Number.isInteger(season)) return null;
  return load<NflEloSeason>(
    `nfl/elo/seasons/${season}.json`,
    () =>
      JSON.parse(
        readFileSync(
          join(process.cwd(), "public", "data", "nfl", "elo", "seasons", `${season}.json`),
          "utf-8",
        ),
      ),
    (r) => Boolean(r?.season === season && r?.teams?.length),
  );
}

// Week-by-week playoff seeding for one season, 1920 on, from
// scripts/nfl/playoff_seeds.py: for every regular-season week, each team's
// division rank, rank in the pool it qualifies from (the conference from
// 1970, the league before) and its seed or place if the season had ended
// then, by the tiebreaking procedure of that era. Arrays are week 1 first.
export type NflSeedsTeam = {
  /** The pool the team qualifies from: conference from 1970, league before. */
  conf: string;
  div: string;
  seed: (number | null)[];
  dr: number[];
  cr: number[];
  /** Before 1970 only: level for a division title that would be played off. */
  tie?: boolean[];
};

/** A played-off division title (ten of them, 1941 to 1968). */
export type NflTiebreak = { home: string; away: string; score: string; date: string | null; winner: string; div: string | null };

export type NflSeedsFile = {
  tiebreaks?: NflTiebreak[];
  season: number;
  /** The largest pool's seed count; `pools` has each pool's own. */
  seeds_per_conf: number;
  pools: Record<string, { seeds: number; per_division: number; divisions: number }>;
  /** "seed" from 1970, "place" (a division winner's playoff place) 1933-69, "leader" before 1933 */
  label: "seed" | "place" | "leader";
  reg_end_week: number;
  through_week: number;
  complete: boolean;
  note: string;
  teams: Record<string, NflSeedsTeam>;
  /** week -> the name-order stand-ins for a coin toss that week, if any */
  notes: Record<string, string[]>;
};

/** One season's seeding file; null before 1920 or before the file is built. */
export async function getNflSeeds(season: number): Promise<NflSeedsFile | null> {
  if (!Number.isInteger(season) || season < 1920) return null;
  return load<NflSeedsFile>(
    `nfl/seeds/${season}.json`,
    () =>
      JSON.parse(
        readFileSync(join(process.cwd(), "public", "data", "nfl", "seeds", `${season}.json`), "utf-8"),
      ),
    (r) => Boolean(r?.season === season && r?.teams),
  );
}

// 78 franchise pages want one entry out of the same 349 KB file. Hold the
// in-flight promise so it is parsed once per server process. Lazy, so it stays
// off the build graph.
let _franchises: Promise<NflFranchisesFile | null> | null = null;

export async function getNflFranchiseElos(): Promise<NflFranchisesFile | null> {
  if (!_franchises) {
    _franchises = load<NflFranchisesFile>(
      "nfl/elo/franchises.json",
      () =>
        JSON.parse(
          readFileSync(join(process.cwd(), "public", "data", "nfl", "elo", "franchises.json"), "utf-8"),
        ),
      (r) => Boolean(r?.franchises?.length),
    ).catch(() => null);
  }
  return _franchises;
}

/** One franchise's whole Elo life, or null for a name with no rated season. */
export async function getNflFranchiseElo(name: string): Promise<NflFranchise | null> {
  if (!name) return null;
  const f = await getNflFranchiseElos();
  return f?.franchises.find((x) => x.name === name) ?? null;
}

/** The live season's schedule, priced where both ratings are facts. */
export async function getNflUpcoming(): Promise<NflUpcoming | null> {
  return load<NflUpcoming>(
    "nfl/elo/upcoming.json",
    () =>
      JSON.parse(
        readFileSync(join(process.cwd(), "public", "data", "nfl", "elo", "upcoming.json"), "utf-8"),
      ),
    (r) => Boolean(r?.schedule?.length),
  );
}

/** Standings split by league, ratings left pooled. The order a hub renders. */
export function byLeague(teams: NflEloTeam[]): { league: string; teams: NflEloTeam[] }[] {
  const m = new Map<string, NflEloTeam[]>();
  for (const t of teams) {
    const k = t.league || "NFL";
    (m.get(k) ?? m.set(k, []).get(k)!).push(t);
  }
  return [...m.entries()]
    .map(([league, ts]) => ({ league, teams: [...ts].sort((a, b) => b.end - a.end) }))
    // NFL first when it ran alongside another league, then alphabetical.
    .sort((a, b) => (a.league === "NFL" ? -1 : b.league === "NFL" ? 1 : a.league.localeCompare(b.league)));
}
