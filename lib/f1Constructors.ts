import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// F1 teams, as CONTINUOUS ORGANISATIONS rather than as Ergast constructor
// records. Built by scripts/f1/build_constructors.py from the Jolpica mirror
// plus the curation in scripts/f1/lineages.py, which is where the reasoning
// lives: Ergast's model is chassis-plus-engine, so it splits Team Lotus across
// four records (45 + 22 + 11 + 1 wins) and welds three unrelated Alfa Romeos
// into one. Everything here is post-curation.
//
// Server-only: reads from disk at module load, same as lib/f1.ts.

export type F1Era = {
  name: string;
  from: number;
  to: number;
  races: number;
  wins: number;
  podiums: number;
  poles: number;
  points: number;
  titles: number;
  /** 1 when the link into this era is a judgement someone could reasonably
      dispute. The page SHOWS this rather than hiding the call. */
  contested: number;
  note: string;
  drivers: number;
};

/** [season, championship position or null, points, wins] */
export type F1FormPoint = [number, number | null, number, number];
/** [season, races, wins, podiums, poles, points, champPos, meanGrid, meanFinish, drivers] */
export type F1SeasonRow = [
  number, number, number, number, number, number,
  number | null, number | null, number | null, string[],
];
/** [driver, races, wins, podiums, points, firstSeason, lastSeason] */
export type F1TeamDriver = [string, number, number, number, number, number, number];
/** [decade, entries, percent classified as finished] */
export type F1Reliability = [number, number, number];
/** [circuitId, circuitName, metro, metroSlug, races, wins] */
export type F1TeamCircuit = [string, string | null, string | null, string | null, number, number];
/** [season, round, raceName, driver, metro, metroSlug, circuitId] */
export type F1Victory = [number, number, string | null, string, string | null, string | null, string];

/**
 * Teammate against teammate.
 * [driverA, driverB, racesTogether, firstSeason, lastSeason,
 *  qualWinsA, qualWinsB, raceWinsA, raceWinsB]
 *
 * The two denominators differ on purpose. Qualifying counts only races where
 * BOTH cars set a grid position; the race counts only races where BOTH were
 * classified. Scoring a retirement as a defeat would say a car that broke on
 * lap two lost to somebody, and it did not.
 */
export type F1Teammates = [string, string, number, number, number, number, number, number, number];

/** [season, pointsDelta, why] — a stewards' adjustment, not a scoring error. */
export type F1PointsNote = [number, number, string];

/**
 * One factory, workshop or engine plant, for one span of years.
 *
 * `metro` is null when MetroAreas.xlsx cannot rule on the town, which is not
 * an edge case: Brackley and Silverstone, the homes of Mercedes and Aston
 * Martin, both sit in the workbook with a blank Metro Area. The page shows the
 * town unlinked in that case rather than promoting it to a neighbouring metro.
 */
export type F1Base = {
  town: string;
  region: string;
  country: string;
  from: number;
  /** 9999 means "still there". */
  to: number;
  role: "main" | "engine" | "design" | "hq";
  source: string;
  contested: number;
  note: string;
  metro: string | null;
  metroSlug: string | null;
  /** How the workbook resolved it: exact, word, metro-name and so on. */
  how: string | null;
};

export type F1Constructor = {
  slug: string;
  name: string;
  /** Every curated site, main sites first and then in date order. */
  bases: F1Base[];
  /** The current main site, or the last one. Null when none is sourced. */
  base: {
    town: string;
    region: string;
    country: string;
    metro: string | null;
    metroSlug: string | null;
    since: number;
    until: number | null;
  } | null;
  /** Era names in order, e.g. Tyrrell -> BAR -> Honda -> Brawn -> Mercedes. */
  chain: string[];
  /** Every name the archive itself uses for the records this lineage claims,
      including the chassis-engine ones like "Lotus-Climax". Used to resolve a
      name written elsewhere on the site back to a team page. */
  aliases: string[];
  contested: boolean;
  first: number;
  last: number;
  seasons: number;
  races: number;
  entries: number;
  wins: number;
  podiums: number;
  poles: number;
  /** Points SCORED, race plus sprint. Not always the championship total: many
      seasons before 1994 counted only a driver's best N results. */
  points: number;
  /** Of which, from sprint races. 2021 onward only. */
  sprintPoints: number;
  /** Sprint wins are counted here and deliberately NOT in `wins`, because a
      Saturday result is not a Grand Prix victory. */
  sprintWins: number;
  teammates: F1Teammates[];
  pointsNotes: F1PointsNote[];
  titles: number;
  bestChamp: number | null;
  current: boolean;
  nationality: string | null;
  wikipedia: string | null;
  eras: F1Era[];
  form: F1FormPoint[];
  seasonRows: F1SeasonRow[];
  drivers: F1TeamDriver[];
  reliability: F1Reliability[];
  statuses: Array<[string, number]>;
  circuits: F1TeamCircuit[];
  victories: F1Victory[];
  note: string;
  /** True when no curation touched this record: it is its own team by default. */
  default: boolean;
  hasPage: boolean;
};

export type F1ConstructorsDoc = {
  meta: {
    generated_at: string;
    first_season: number;
    last_season: number;
    lineages: number;
    with_pages: number;
    constructor_records: number;
    curated_lineages: number;
    with_base: number;
    with_base_metro: number;
    base_rows: number;
    source: string;
  };
  lineages: F1Constructor[];
};

/** A metro with the teams that build, or built, cars in it. */
export type F1MetroCluster = {
  metro: string;
  metroSlug: string | null;
  country: string;
  teams: Array<{ slug: string; name: string; town: string; current: boolean }>;
  current: number;
};

/**
 * Teams grouped by the metro of their MAIN site, for the "where Formula 1 is
 * built" board. Engine plants and design offices are excluded on purpose: a
 * team belongs to the place its car is designed and made.
 *
 * Towns the workbook cannot place are grouped under a null metro and reported,
 * because pretending Brackley is nowhere would understate England badly.
 */
export function getF1MetroClusters(): {
  clusters: F1MetroCluster[];
  unplaced: Array<{ town: string; country: string; teams: string[] }>;
} {
  const byMetro = new Map<string, F1MetroCluster>();
  const unplaced = new Map<string, { town: string; country: string; teams: string[] }>();
  for (const c of getPagedF1Constructors()) {
    const home = c.base;
    if (!home) continue;
    if (!home.metro) {
      const k = `${home.country}|${home.town}`;
      if (!unplaced.has(k)) unplaced.set(k, { town: home.town, country: home.country, teams: [] });
      unplaced.get(k)!.teams.push(c.name);
      continue;
    }
    const k = `${home.country}|${home.metro}`;
    if (!byMetro.has(k)) {
      byMetro.set(k, {
        metro: home.metro, metroSlug: home.metroSlug, country: home.country,
        teams: [], current: 0,
      });
    }
    const cl = byMetro.get(k)!;
    cl.teams.push({ slug: c.slug, name: c.name, town: home.town, current: c.current });
    if (c.current) cl.current += 1;
  }
  const clusters = [...byMetro.values()].sort(
    (a, b) => b.current - a.current || b.teams.length - a.teams.length ||
      a.metro.localeCompare(b.metro),
  );
  for (const cl of clusters) {
    cl.teams.sort((a, b) => Number(b.current) - Number(a.current) || a.name.localeCompare(b.name));
  }
  return {
    clusters,
    unplaced: [...unplaced.values()].sort((a, b) => b.teams.length - a.teams.length),
  };
}

let _doc: F1ConstructorsDoc | null = null;
function load(): F1ConstructorsDoc {
  if (_doc === null) {
    _doc = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "f1", "constructors.json"), "utf-8"),
    ) as F1ConstructorsDoc;
  }
  return _doc;
}

export function getF1ConstructorsMeta() {
  return load().meta;
}

/** Every lineage, most wins first. Includes the ones without their own page. */
export function getAllF1Constructors(): F1Constructor[] {
  return load().lineages;
}

/** Only the lineages that earn a page: ten or more races, or at least one win. */
export function getPagedF1Constructors(): F1Constructor[] {
  return load().lineages.filter((c) => c.hasPage);
}

export function getF1ConstructorBySlug(slug: string): F1Constructor | null {
  return load().lineages.find((c) => c.slug === slug) ?? null;
}

export function getAllF1ConstructorSlugs(): string[] {
  return getPagedF1Constructors().map((c) => c.slug);
}

/**
 * Resolve a name as it appears elsewhere on the site (a valuations row, a
 * standings table) to a lineage. Matches the CURRENT name first, then any era
 * name, so "AlphaTauri" and "Toro Rosso" both reach Racing Bulls.
 */
export function getF1ConstructorByName(name: string): F1Constructor | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  const all = load().lineages;
  const exact = all.find((c) => c.name.toLowerCase() === n && c.hasPage);
  if (exact) return exact;
  const byEra = all.find((c) => c.hasPage && c.chain.some((e) => e.toLowerCase() === n));
  if (byEra) return byEra;
  // The archive's own labels for every record a lineage claims. The rest of the
  // site still writes them: the F1 hub wrote "Lotus-Climax", "Lotus-Ford",
  // "Cooper-Climax" and "RB F1 Team", none of which is a display name or an era
  // name, so none of them linked to anything until 2026-08-18.
  const byAlias = all.find((c) => c.hasPage && c.aliases.some((a) => a.toLowerCase() === n));
  if (byAlias) return byAlias;
  // Era names are the sponsor-laden legal ones ("Stake F1 Team Kick Sauber")
  // while the rest of the site writes the short form ("Kick Sauber"), so match
  // on containment too. Longest era first, or "Sauber" would swallow it.
  const eraHits = all
    .filter((c) => c.hasPage)
    .flatMap((c) => c.chain.map((e) => ({ c, e: e.toLowerCase() })))
    .filter(({ e }) => e.includes(n) || n.includes(e))
    .sort((a, b) => b.e.length - a.e.length);
  if (eraHits.length) return eraHits[0].c;
  // Last resort: the site writes "Haas F1 Team", "Red Bull Racing" and
  // "Racing Bulls" in several forms, so allow a containment match, longest
  // name first so "Red Bull Racing" cannot be captured by a shorter entry.
  const sorted = [...all].filter((c) => c.hasPage).sort((a, b) => b.name.length - a.name.length);
  return sorted.find((c) => n.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(n)) ?? null;
}
