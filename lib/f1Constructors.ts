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

export type F1Constructor = {
  slug: string;
  name: string;
  /** Era names in order, e.g. Tyrrell -> BAR -> Honda -> Brawn -> Mercedes. */
  chain: string[];
  contested: boolean;
  first: number;
  last: number;
  seasons: number;
  races: number;
  entries: number;
  wins: number;
  podiums: number;
  poles: number;
  points: number;
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
    source: string;
  };
  lineages: F1Constructor[];
};

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
