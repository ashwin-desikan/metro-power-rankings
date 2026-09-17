import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// The sole bridge between public/data/nba/elo/** and the NBA season pages.
// Mirrors lib/nflElo.ts deliberately: same shard layout, same load strategy,
// same types modulo the sport. scripts/build-nba-elo.py writes these files.
//
// 🔴 WHERE THE NBA DIFFERS FROM THE NFL, AND IT MATTERS FOR ANY LIVE WORK.
// The NFL carries its live season forward in Python from the week-0 seed and
// the game log. The NBA CANNOT: its Elo is an external series pasted into the
// workbook, not something a formula regenerates. Measured 2026-09-17 over
// 30,958 rated team-games, the workbook's own shift formula reproduces the
// real column to only 3.26 Elo on average, and the real column is zero-sum in
// just 63.26% of game pairs, which a self-consistent pairwise Elo is by
// construction. So there is no live chain to build here, and a 2026-27 season
// updates when the workbook does. Full detail in scripts/build-nba-elo.py.

/** One team-week. `e` is the rating, `r` its rank inside that week's pool. */
export type NbaEloWeek = {
  w: number;
  e: number;
  /** Rank within the season's whole pool that week, 1 = highest rated. */
  r?: number;
  /** Week-ending date, ISO. */
  d?: string;
  /** [wins, losses] through that week. */
  rec?: [number, number];
  /** Elo change against the same team's previous week. */
  chg?: number;
  /** Present only on week 0, the preseason seed. */
  seed?: true;
};

/** Season-end honours, VLOOKUP'd from NBA.xlsx Year by Year and identical on
 *  every week row of a team-season: what the season turned out to be. */
export type NbaEloFlags = {
  play_app?: boolean;
  div_title?: boolean;
  best_conf?: boolean;
  best_rec?: boolean;
  cf_app?: boolean;
  champ_app?: boolean;
  champ?: boolean;
};

/** One playoff series, folded from the workbook's two rows (one per side). */
export type NbaEloSeries = {
  /** Counts BACKWARDS from the Finals: 1 is the Finals, 4 the first round,
   *  4.5 and 5 the play-in. Sort descending to walk the postseason in order. */
  round: number | null;
  round_label: string;
  /** Null on the Finals, which are inter-conference by definition. */
  conf: string | null;
  league: string | null;
  /** 🔴 CANONICAL, i.e. a JOIN KEY, not a label. Link on these; do not print
   *  them. A 1978 series between "Thunder" and someone is wrong on its face. */
  winner: string;
  loser: string;
  /** The name each club actually carried THAT SEASON. This is what a reader
   *  sees: "Seattle SuperSonics", not "Thunder". */
  winner_city: string | null;
  winner_team: string | null;
  loser_city: string | null;
  loser_team: string | null;
  /** Series score from the winner's side. */
  w: number | null;
  l: number | null;
  winner_seed: number | null;
  loser_seed: number | null;
};

/** One game from the season's top-20 board.
 *
 *  Field names match public/data/nba/top-games-all-time.json so a reader
 *  moving between a season page and the all-time board meets one vocabulary.
 *  `game_score` is the workbook's own frozen metric, read and never
 *  recomputed here. */
export type NbaTopGame = {
  year: number;
  date: string | null;
  round: string | null;
  round_num: number | null;
  game_num: number | null;
  phase: string | null;
  winner_canonical: string;
  loser_canonical: string;
  winner_city: string | null;
  winner_team: string | null;
  loser_city: string | null;
  loser_team: string | null;
  winner_pts: number;
  loser_pts: number;
  ot: boolean;
  /** "OT", "2OT" and so on, when the workbook says which. */
  ot_label: string | null;
  game_score: number;
};

export type NbaAward = {
  player: string;
  /** The workbook's own label: "Most Valuable Player", "1st Team All NBA". */
  award: string;
  /** The winner's franchise, joinable to a team. */
  canonical: string | null;
  city: string | null;
  team: string | null;
  pos: string | null;
  /** True for an All-NBA team selection rather than a single-winner award. */
  all_nba: boolean;
};

export type NbaAllStarPlayer = {
  player: string;
  canonical: string | null;
  city: string | null;
  team: string | null;
  conf: string | null;
  /** Which appearance this was for the player, e.g. a 7th selection. */
  appearance: number | null;
  mvp: boolean;
  hof: boolean;
};

export type NbaAllStar = {
  host_arena: string | null;
  host_city: string | null;
  host_state: string | null;
  players: NbaAllStarPlayer[];
};

export type NbaEloTeam = {
  name: string;
  city: string | null;
  team: string | null;
  league: string | null;
  conf: string | null;
  div: string | null;
  /** 🔴 REGULAR SEASON ONLY, from NBA.xlsx Year by Year. The weekly `rec`
   *  inside `weeks` keeps counting through the playoffs, so for the 2026 Spurs
   *  it ends 75-31 while `reg` is 62-20 and `post` is 13-10. Showing one
   *  without saying which it is invites the reader to take it for the other. */
  reg: [number, number] | null;
  /** Null when the team did not reach the postseason. Distinct from [0, 0],
   *  which would say they played and lost everything. */
  post: [number, number] | null;
  seed: number | null;
  /** Where this team finished the PREVIOUS season, so a season table can show
   *  a year-over-year movement. Null for a first season or an expansion club,
   *  which is a real distinction and not a zero. */
  prev_end: number | null;
  flags: NbaEloFlags;
  /** Null on an "upcoming" shell, which carries no ratings at all. Narrow with
   *  isRated() before handing a team to anything that plots it. */
  start: number | null;
  end: number | null;
  peak: { w: number; e: number } | null;
  trough: { w: number; e: number } | null;
  weeks: NbaEloWeek[];
};

/** A team with ratings, i.e. not from an "upcoming" shell. */
export type NbaRatedTeam = NbaEloTeam & {
  start: number;
  end: number;
  peak: { w: number; e: number };
  trough: { w: number; e: number };
};

export function isRated(t: NbaEloTeam): t is NbaRatedTeam {
  return t.end != null && t.start != null && t.weeks.length > 0;
}

/** final:    every week carries a plausible, varying Elo.
 *  seeded:   week 0 is sound and later weeks are not, i.e. not yet played.
 *  upcoming: not even a week 0. A shell carrying the FIELD only, so the hub
 *            can point at the season about to start instead of the one that
 *            just finished. Distinct from "seeded" on purpose: a seeded
 *            season has ratings to chart and this one has none, and a page
 *            that conflates them renders an empty chart.
 *  broken:   week 0 is unusable too. */
export type NbaEloStatus = "final" | "live" | "seeded" | "upcoming" | "broken";

export type NbaEloMeta = {
  generated_at: string;
  source: string;
  source_credit: string;
  k_base: number;
  hfa_elo: number;
  team_weeks: number;
  seasons: [number, number];
};

export type NbaEloSeason = {
  meta: NbaEloMeta;
  season: number;
  status: NbaEloStatus;
  leagues: string[];
  /** True only when someone is flagged champion. The gate for anything that
   *  summarises a whole season: a half-played season must not get a board. */
  complete: boolean;
  teams: NbaEloTeam[];
  /** Every playoff series that season, this league only. Empty before the
   *  postseason and for seasons the workbook has no bracket for. */
  bracket: NbaEloSeries[];
  /** The season's best games by the workbook's frozen Game Score, best first. */
  top_games: NbaTopGame[];
  /** Individual honours first, then the All-NBA teams. */
  awards: NbaAward[];
  /** The All-Star game: where it was, who was picked, who won it. Null for a
   *  season with no game (the workbook has none before 1951, and 1999). */
  all_star: NbaAllStar | null;
  dropped_weeks: number[];
};

export type NbaEloIndexRow = {
  season: number;
  status: NbaEloStatus;
  leagues: string[];
  complete: boolean;
  champion: { name: string; city: string | null; team: string | null } | null;
  teams: number;
  weeks: number;
  dropped_weeks: number[];
  top: { name: string; city: string | null; team: string | null; elo: number } | null;
};

export type NbaEloIndex = { meta: NbaEloMeta; seasons: NbaEloIndexRow[] };

export type NbaFranchiseSeason = {
  season: number;
  elo_start: number;
  elo_end: number;
  peak: number;
  rank_end: number | null;
  weeks: number;
  status: NbaEloStatus;
};

export type NbaFranchisesFile = {
  meta: NbaEloMeta;
  franchises: Record<string, NbaFranchiseSeason[]>;
};

const GH_BASE =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data";

// readLocal does the actual literal readFileSync per file (never a helper
// taking a dynamic filename) so the Vercel file tracer scopes each route to
// just the file(s) it reads. See scripts/DATA-READS-RECIPE.md: a shared const
// naming public/data bundles all 265 MB of it into every route that reads one
// file, which is what put 304 routes at 220 MB.
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
  // Dev, or a local `next start` with NBA_DATA_LOCAL=1, reads the checkout so
  // a rebuild shows on the page BEFORE it is pushed. Production stays
  // GitHub-raw-first, which is what makes a data refresh free of a build.
  // Never set NBA_DATA_LOCAL in Vercel's environment.
  if (
    (process.env.NBA_DATA_LOCAL === "1" || process.env.NODE_ENV === "development") &&
    local != null
  ) {
    return local;
  }
  try {
    const res = await fetch(`${GH_BASE}/${file}`, {
      next: { revalidate: 86400, tags: ["nba-elo"] },
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

export async function getNbaEloIndex(): Promise<NbaEloIndex | null> {
  return load<NbaEloIndex>(
    "nba/elo/index.json",
    () =>
      JSON.parse(
        readFileSync(
          join(process.cwd(), "public", "data", "nba", "elo", "index.json"),
          "utf-8",
        ),
      ),
    (r) => Boolean(r?.seasons?.length),
  );
}

/** One season. 80 of these exist; a page fetches exactly the one it renders. */
export async function getNbaEloSeason(season: number): Promise<NbaEloSeason | null> {
  if (!Number.isInteger(season)) return null;
  return load<NbaEloSeason>(
    `nba/elo/seasons/${season}.json`,
    () =>
      JSON.parse(
        readFileSync(
          join(process.cwd(), "public", "data", "nba", "elo", "seasons", `${season}.json`),
          "utf-8",
        ),
      ),
    (r) => Boolean(r?.season === season && r?.teams?.length),
  );
}

export async function getNbaEloFranchises(): Promise<NbaFranchisesFile | null> {
  return load<NbaFranchisesFile>(
    "nba/elo/franchises.json",
    () =>
      JSON.parse(
        readFileSync(
          join(process.cwd(), "public", "data", "nba", "elo", "franchises.json"),
          "utf-8",
        ),
      ),
    (r) => Boolean(r?.franchises && Object.keys(r.franchises).length),
  );
}

// NOTE: the "2025-26" label a reader expects for season 2026 already exists as
// seasonLabel() in lib/nba.ts. Import it from there rather than adding a
// second one here; a duplicated formatter that drifts is how two pages end up
// disagreeing about what season they are showing.
