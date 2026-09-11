import "server-only";
import { readFileSync } from "fs";
import { join } from "path";
import { getIntlExpectation } from "./intlExpectation";
import { getPlExpectationClubs } from "./plExpectation";
import {
  directorClubBoard,
  growthBoard,
  MONEY_LEAGUE_SLUGS,
  moneyFrontierPoints,
  seasonMoneyBoard,
  spanMoneyBoard,
  type ClubMoneyRecord,
  type DirectorClubRow,
  type DirectorIndex,
  type FrontierPoint,
  type GrowthRow,
  type MoneyBoardRow,
  type MoneyCountryFile,
  type MoneyIndex,
  type MoneyLeagueSlug,
  type MoneySpanRow,
} from "./footballMoneyShape";

// The Money Ledger: transfer fees paid and received per club and season,
// joined to the squad-value series, for the six leagues lib/clubValue.ts
// covers. Built by scripts/football/build_transfer_ledger.py; the pure half
// (types, boards, formatters) lives in lib/footballMoneyShape.ts.
//
// 🔴 SAME IO PATTERN AS lib/clubValue.ts: six payloads plus an index, GitHub
// raw first with the build-time copy as fallback, parsed once per server
// process. Each readFileSync spells every literal directory segment and
// leaves only the leaf dynamic, so the Vercel tracer scopes the route to
// public/data/football/money/* (scripts/DATA-READS-RECIPE.md).
//
// 🔴 A CLUB WITH NO LEDGER RETURNS NULL and the surface renders nothing.
// The great majority of club pages sit outside these six leagues.

export type { ClubMoneyRecord, DirectorClubRow, DirectorIndex, FrontierPoint, GrowthRow, MoneyBoardRow, MoneyCountryFile, MoneyIndex, MoneySpanRow };

const GH_BASE =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data";

async function load<T>(file: string, readLocal: () => T, ok: (remote: T) => boolean): Promise<T | null> {
  let local: T | null = null;
  try {
    local = readLocal();
  } catch {
    /* no build-time copy */
  }
  if ((process.env.NFL_DATA_LOCAL === "1" || process.env.NODE_ENV === "development") && local != null) {
    return local;
  }
  try {
    const res = await fetch(`${GH_BASE}/${file}`, { next: { revalidate: 86400, tags: ["club-money"] } });
    if (res.ok) {
      const remote = (await res.json()) as T;
      if (ok(remote)) return remote;
    }
  } catch {
    /* offline: local only */
  }
  return local;
}

export async function getMoneyIndex(): Promise<MoneyIndex | null> {
  return load<MoneyIndex>(
    "football/money/index.json",
    () =>
      JSON.parse(
        readFileSync(join(process.cwd(), "public", "data", "football", "money", "index.json"), "utf-8"),
      ),
    (r) => Boolean(r?.countries?.length),
  );
}

/** The director's ledger's top-20-each-way and per-league coverage; each
 * club's own summary rides on its ClubMoneyRecord ("director" field). */
export async function getDirectorIndex(): Promise<DirectorIndex | null> {
  return load<DirectorIndex>(
    "football/money/director.json",
    () =>
      JSON.parse(
        readFileSync(join(process.cwd(), "public", "data", "football", "money", "director.json"), "utf-8"),
      ),
    (r) => Boolean(r?.leagues?.length),
  );
}

async function loadMoneyCountry(slug: MoneyLeagueSlug): Promise<MoneyCountryFile | null> {
  return load<MoneyCountryFile>(
    `football/money/${slug}.json`,
    () =>
      JSON.parse(
        readFileSync(join(process.cwd(), "public", "data", "football", "money", `${slug}.json`), "utf-8"),
      ),
    (r) => Boolean(r?.meta?.country && Array.isArray(r?.clubs)),
  );
}

type MoneyDerived = {
  files: (readonly [MoneyLeagueSlug, MoneyCountryFile])[];
  bySlug: Map<string, { leagueSlug: MoneyLeagueSlug; record: ClubMoneyRecord; meta: MoneyCountryFile["meta"] }>;
};

// (module-scope cache; a dev-server edit here forces a reload of any stale
// public/data snapshot picked up before a --write rebuild)
let _derived: Promise<MoneyDerived | null> | null = null;

async function derive(): Promise<MoneyDerived | null> {
  const loaded = await Promise.all(MONEY_LEAGUE_SLUGS.map((s) => loadMoneyCountry(s).catch(() => null)));
  const files = loaded
    .map((f, i) => [MONEY_LEAGUE_SLUGS[i], f] as const)
    .filter((p): p is readonly [MoneyLeagueSlug, MoneyCountryFile] => p[1] !== null);
  if (!files.length) return null;
  const bySlug: MoneyDerived["bySlug"] = new Map();
  for (const [leagueSlug, f] of files) {
    for (const c of f.clubs) {
      if (!c.slug) continue;
      bySlug.set(c.slug, { leagueSlug, record: c, meta: f.meta });
    }
  }
  return { files, bySlug };
}

async function getDerived(): Promise<MoneyDerived | null> {
  if (!_derived) _derived = derive().catch(() => null);
  return _derived;
}

/** One club's ledger with its country file's meta, or null. */
export async function getClubMoneyBySlug(
  slug: string,
): Promise<{ record: ClubMoneyRecord; meta: MoneyCountryFile["meta"] } | null> {
  if (!slug) return null;
  const d = await getDerived();
  const hit = d?.bySlug.get(slug);
  return hit ? { record: hit.record, meta: hit.meta } : null;
}

/** Every club with a window in `season` ("2024-25"-shaped), across the six leagues. */
export async function getSeasonMoneyBoard(season: string): Promise<MoneyBoardRow[]> {
  if (!/^\d{4}-\d{2}$/.test(season)) return [];
  const d = await getDerived();
  return d ? seasonMoneyBoard(d.files, season) : [];
}

/** The whole span per club, full seasons only. */
export async function getSpanMoneyBoard(): Promise<MoneySpanRow[]> {
  const d = await getDerived();
  return d ? spanMoneyBoard(d.files) : [];
}

/** Trading (=net) split from appreciation, summed over [sinceSeason, throughSeason]. */
export async function getGrowthBoard(sinceSeason: string, throughSeason?: string): Promise<GrowthRow[]> {
  const d = await getDerived();
  return d ? growthBoard(d.files, sinceSeason, throughSeason) : [];
}

/** Every club the builder graded in the director's ledger, sorted on the multiplier. */
export async function getDirectorBoard(): Promise<DirectorClubRow[]> {
  const d = await getDerived();
  return d ? directorClubBoard(d.files) : [];
}

/**
 * Money against football: every priced club-season joined to its surplus
 * from the Against Expectation ledgers (five leagues from lib/intlExpectation,
 * England from lib/plExpectation, both slug-keyed), Pareto set marked. Same
 * once-per-process cache as the boards.
 */
let _frontier: Promise<FrontierPoint[]> | null = null;

async function deriveFrontier(): Promise<FrontierPoint[]> {
  const [d, intl, pl] = await Promise.all([
    getDerived(),
    getIntlExpectation().catch(() => null),
    getPlExpectationClubs().catch(() => null),
  ]);
  if (!d) return [];
  const surplus = new Map<string, Map<string, number>>();
  if (intl) {
    for (const entry of intl.clubs.values()) {
      surplus.set(entry.slug, new Map(entry.seasons.map((r) => [r.season, r.surplus])));
    }
  }
  if (pl) {
    for (const [slug, entry] of Object.entries(pl.clubs)) {
      if (!surplus.has(slug)) surplus.set(slug, new Map(entry.seasons.map((r) => [r.season, r.surplus])));
    }
  }
  return moneyFrontierPoints(d.files, surplus);
}

export async function getMoneyFrontier(): Promise<FrontierPoint[]> {
  if (!_frontier) _frontier = deriveFrontier().catch(() => []);
  return _frontier;
}
