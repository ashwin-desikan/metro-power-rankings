import "server-only";

import { readFileSync } from "fs";
import { join } from "path";

import { getAllCountries, getPopulationFile } from "./countries";

/**
 * Data layer for the /countries Time Machine.
 *
 * WHAT THE VIEW ANSWERS. Not "what was this country called in 1975" but "who
 * held this territory, and how many people lived in it". Every row is the same
 * atom - a modern territory in a given year, carrying one population - and the
 * two views differ only in how those atoms are grouped. The country view shows
 * them individually; the polity view sums them into whichever state governed
 * them that year. Two groupings of one set of numbers cannot contradict each
 * other, which is the whole reason it is built this way: a reader who expands
 * the USSR in 1985 sees fifteen rows that add up to the total above them,
 * exactly, because the total was computed from those fifteen rows.
 *
 * WHY THE PAYLOAD IS SHAPED LIKE THIS. Values are a dense array indexed from
 * `from`, not [year, value] pairs. 220 entities x 226 years is a lot of
 * repeated year integers, and the pairs form roughly doubles the document for
 * no information. Nulls are real: they mean the source has no value for that
 * entity that year, and the client must render them as absent rather than zero.
 *
 * SPARSE SERIES ARE NOT INTERPOLATED. East and West Germany have three data
 * points between them across 1949-1990, so most Cold War years are null. The
 * client shows the nearest PRECEDING value labelled with the year it came from
 * (Ashwin's ruling, 2026-08-14, same convention as a leadership gap). Filling
 * those years in here would invent East German population figures, and an
 * invented number that looks like a measurement is worse than a stated gap.
 */

export type TimelineEntity = {
  /** Slug for a country, OWID code for a polity. Unique across both. */
  key: string;
  name: string;
  continent: string | null;
  /** Values indexed from `meta.from`. null = the source has no value. */
  v: (number | null)[];
};

export type TimelinePolity = TimelineEntity & {
  from: number;
  to: number;
  /** Modern slugs this polity covered; empty for a partition. */
  replaces: string[];
  /**
   * [slug, from, to] per member. A land empire acquired its territory over a
   * century, so membership is not simply the empire's own lifespan: Merv fell
   * in 1885, not 1800, and a board that shows Turkmenistan as Russian in 1800
   * is inventing history in the same confident voice it uses for the rest.
   */
  memberWindows?: [string, number, number][];
  /** Years the state did not exist: Czechoslovakia 1939-1945. */
  gaps?: [number, number][];
  /** "sum" of its parts, or the source's own "source" series. */
  basis: "sum" | "source";
  /** Set when the polity was a slice of ONE modern country. */
  partitionOf?: string;
  /** Percent by which the summed value differs from the source's own series. */
  sourceDivergence: number | null;
};

/**
 * A colonial empire, as a GROUPING rather than a source. Nobody publishes "the
 * British Empire" as a population series, so it is the metropole plus whatever
 * COLDAT says it held that year, summed from the same atoms as everything
 * else. That is why it can never disagree with the territory view.
 *
 * The honest limit, which the page states: these are MODERN territories
 * carrying that year's people. British India in 1940 is India plus Pakistan
 * plus Bangladesh plus Myanmar as four rows, not one Raj census.
 */
export type TimelineEmpire = {
  key: string;
  name: string;
  coloniser: string;
  metropole: string;
  from: number;
  to: number;
  territories: number;
  /** [from, to, name] periodised labels, resolved against the viewed year. */
  eraNames: [number, number, string][];
};

/** slug -> the sovereign state it is a dependency of TODAY. */
export type Dependencies = Record<string, string>;

/**
 * A holding COLDAT cannot know: it codes eight European powers, so the
 * American Philippines, the whole Japanese empire and every wartime occupation
 * are absent from it.
 *
 * `kind` decides aggregation. A `colony` rolls up. `occupied` and `annexed`
 * roll up only when the reader asks, because occupation is not possession.
 * `partial` never rolls up at all - Japan held Manchuria and much of eastern
 * China but never the whole country, and there is no modern slug for the part
 * it held.
 */
export type ExtraHolding = {
  slug: string;
  from: number;
  to: number;
  holder: string;
  kind: "colony" | "occupied" | "annexed" | "partial" | "client";
  note?: string;
  /**
   * True when the entry was DERIVED rather than curated: the gap between two
   * of the source's own colonial runs, which is a handover it does not record
   * and never a restoration of independence. Kept on the record so a reader
   * can tell a hand-checked date from an inferred one.
   */
  derived?: boolean;
};

/**
 * A territory that was not yet ONE COUNTRY. Nigeria in 1818 was the Sokoto
 * Caliphate and the Yoruba states; Germany was the Confederation. Ranking them
 * beside France says they were countries, and they were not.
 */
export type Fragmented = { slug: string; from: number; to: number; note: string };

/** A dependency whose holder changed: wins over the current parent. */
export type DependencyOverride = { slug: string; from: number; to: number; holder: string };

/** A self-governing dominion: out of its empire's total from `from`. */
export type Dominion = { slug: string; from: number; of: string };

/** slug -> inclusive [from, to, coloniser] runs. */
export type ColoniserRuns = Record<string, [number, number, string][]>;

/**
 * A modern territory that was SPLIT between powers, never summed into any of
 * them. Poland in 1914 was Russian, German and Austrian at once; assigning it
 * whole to one would double-count, and calling it independent is simply false.
 * It renders as its own row saying what actually held it.
 */
export type Partitioned = {
  slug: string;
  from: number;
  to: number;
  between: string[];
};

export type CountryTimeline = {
  meta: {
    from: number;
    to: number;
    /** Last year that is estimated rather than projected. */
    estimateThrough: number;
    source: string;
    note: string;
  };
  countries: TimelineEntity[];
  polities: TimelinePolity[];
  empires: TimelineEmpire[];
  colonisers: ColoniserRuns;
  colonySource: string;
  partitioned: Partitioned[];
  dominions: Dominion[];
  dependencies: Dependencies;
  dependencyOverrides: DependencyOverride[];
  /** slug -> the year its CURRENT holder acquired it. */
  dependencySince: Record<string, number>;
  /**
   * slug -> [from, to, name] era labels, taken from the LEADERS layer's own
   * `era` field so this board and the World Leaders time machine cannot drift:
   * 1940 reads "Nazi Germany" on both because both read the same file.
   */
  countryEras: Record<string, [number, number, string][]>;
  extraHoldings: ExtraHolding[];
  extraEraNames: Record<string, [number, number, string][]>;
  fragmented: Fragmented[];
};

let _cache: CountryTimeline | null = null;

export function getCountryTimeline(): CountryTimeline {
  if (_cache) return _cache;

  const file = getPopulationFile();
  const meta = file?._meta;
  const from = meta?.first ?? 1800;
  const to = meta?.projectedTo ?? meta?.last ?? 2025;
  const span = to - from + 1;

  const names = new Map(getAllCountries().map((c) => [c.slug, c]));

  const dense = (series: [number, number][]): (number | null)[] => {
    const v: (number | null)[] = new Array(span).fill(null);
    for (const [y, n] of series) {
      const i = y - from;
      if (i >= 0 && i < span) v[i] = n;
    }
    return v;
  };

  const countries: TimelineEntity[] = Object.entries(file?.countries ?? {})
    .map(([slug, p]) => ({
      key: slug,
      name: names.get(slug)?.name ?? slug,
      continent: names.get(slug)?.continent ?? null,
      v: dense(p.series),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const polities: TimelinePolity[] = (file?.polities ?? [])
    .map((p) => {
      // The divergence this design deliberately overrides. Reported at the last
      // year both constructions cover, so it can be shown rather than buried.
      const sum = new Map(p.series);
      const src = new Map(p.sourceSeries);
      const common = [...sum.keys()].filter((y) => src.has(y)).sort((a, b) => a - b);
      const last = common[common.length - 1];
      const divergence =
        last != null && src.get(last)
          ? ((sum.get(last)! - src.get(last)!) / src.get(last)!) * 100
          : null;

      // A polity has no continent of its own, so it borrows its first
      // successor's. Without this the Continent filter would silently drop
      // every historical state the moment a reader narrowed to Europe, which
      // is the one view where they most want to see them.
      const anchor = p.replaces[0] ?? p.partitionOf;
      return {
        key: p.code,
        name: p.name,
        continent: (anchor && names.get(anchor)?.continent) ?? null,
        v: dense(p.series),
        from: p.from,
        to: p.to,
        replaces: p.replaces,
        ...(p.memberWindows ? { memberWindows: p.memberWindows } : {}),
        ...(p.gaps ? { gaps: p.gaps } : {}),
        basis: p.basis,
        ...(p.partitionOf ? { partitionOf: p.partitionOf } : {}),
        sourceDivergence: divergence == null ? null : Math.round(divergence * 100) / 100,
      };
    })
    .sort((a, b) => a.from - b.from || a.name.localeCompare(b.name));

  // COLDAT, built by scripts/build-colonisers.py. Absent is survivable: the
  // board simply offers no empire grouping rather than failing to render.
  let empires: TimelineEmpire[] = [];
  let colonisers: ColoniserRuns = {};
  let colonySource = "";
  let dominions: Dominion[] = [];
  let dependencies: Dependencies = {};
  let dependencyOverrides: DependencyOverride[] = [];
  let dependencySince: Record<string, number> = {};
  let countryEras: Record<string, [number, number, string][]> = {};
  let extraHoldings: ExtraHolding[] = [];
  let extraEraNames: Record<string, [number, number, string][]> = {};
  let fragmentedWindows: Fragmented[] = [];
  try {
    const raw = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "country-colonisers.json"), "utf-8"),
    ) as {
      _meta?: { source?: string };
      empires?: Omit<TimelineEmpire, "key">[];
      colonisers?: ColoniserRuns;
      dominions?: Dominion[];
      dependencies?: Dependencies;
      dependencyOverrides?: DependencyOverride[];
      dependencySince?: Record<string, number>;
      countryEras?: Record<string, [number, number, string][]>;
      extraHoldings?: ExtraHolding[];
      extraEraNames?: Record<string, [number, number, string][]>;
      fragmented?: Fragmented[];
    };
    empires = (raw.empires ?? []).map((e) => ({
      ...e,
      eraNames: e.eraNames ?? [],
      key: `empire:${e.coloniser}`,
    }));
    colonisers = raw.colonisers ?? {};
    dominions = raw.dominions ?? [];
    dependencies = raw.dependencies ?? {};
    dependencyOverrides = raw.dependencyOverrides ?? [];
    dependencySince = raw.dependencySince ?? {};
    countryEras = raw.countryEras ?? {};
    extraHoldings = raw.extraHoldings ?? [];
    extraEraNames = raw.extraEraNames ?? {};
    fragmentedWindows = raw.fragmented ?? [];
    colonySource = raw._meta?.source ?? "";
  } catch {
    empires = [];
    colonisers = {};
  }

  _cache = {
    meta: {
      from,
      to,
      estimateThrough: meta?.last ?? to,
      source: meta?.source ?? "Our World in Data",
      note: meta?.note ?? "",
    },
    countries,
    polities,
    empires,
    colonisers,
    colonySource,
    partitioned: (file as unknown as { partitioned?: Partitioned[] })?.partitioned ?? [],
    dominions,
    dependencies,
    dependencyOverrides,
    dependencySince,
    countryEras,
    extraHoldings,
    extraEraNames,
    fragmented: fragmentedWindows,
  };
  return _cache;
}

/**
 * Which modern slugs are absorbed by a live polity in a given year. The polity
 * view hides these at the top level and offers them underneath, which is the
 * expandable breakdown this feature was asked for.
 *
 * Exported and pure so it can be tested without a build, and so the client can
 * reuse the same rule rather than reimplementing it slightly differently.
 */
export function absorbedIn(polities: TimelinePolity[], year: number): Set<string> {
  const out = new Set<string>();
  for (const p of polities) {
    if (year < p.from || year > p.to) continue;
    if (p.memberWindows) {
      for (const [slug, a, b] of p.memberWindows) {
        if (year >= a && year <= b) out.add(slug);
      }
    } else {
      for (const slug of p.replaces) out.add(slug);
    }
    // A partition replaces its modern parent for as long as it existed: there
    // was no "Germany" row between 1949 and 1990, there were two.
    if (p.partitionOf) out.add(p.partitionOf);
  }
  return out;
}

/**
 * Which slugs a given coloniser held in `year`. Pure and exported so the board
 * and any test agree on the rule rather than each implementing it slightly
 * differently.
 */
export function coloniesOf(
  colonisers: ColoniserRuns,
  coloniser: string,
  year: number,
): string[] {
  const out: string[] = [];
  for (const [slug, runs] of Object.entries(colonisers)) {
    for (const [a, b, name] of runs) {
      if (name === coloniser && year >= a && year <= b) {
        out.push(slug);
        break;
      }
    }
  }
  return out;
}
