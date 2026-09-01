import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// The constitutions layer: every country's current constitution, how often it
// has been amended, and the full record of constitutional systems since 1789.
//
// Built by scripts/civic/build_constitutions.py from the Comparative
// Constitutions Project releases, which ship roughly once a year and are
// hand-downloaded (no egress to their host from any of our runners). Read at
// build time, like the election data: a refresh only matters when CCP publishes,
// which needs a deploy anyway.
//
// TWO THINGS THIS LAYER DELIBERATELY DOES NOT CARRY.
//   1. No rigidity score. One was built and failed its hand-check: it ranked
//      Uganda the most rigid constitution in the world and Germany near the
//      bottom, because formal procedure is not difficulty and because the
//      weights were ours. The measure on the page is amendment events per
//      decade, which is observed rather than constructed.
//   2. No claim that anything is in force "today". The source is a complete
//      country-year panel to 2019 and records events only from 2020, so a
//      country silent since 2019 has had no constitutional event, which is not
//      the same as being confirmed in force this morning.

export type ConstitutionChars = {
  year: number;
  words: number | null;
  documents: number | null;
  /** CCP records no amendment procedure: an uncodified constitution. */
  uncodified: boolean;
  entrenchedClauses: boolean;
  /** Bodies that must approve an amendment, in CCP's coding. */
  approvers: string[] | null;
  /** Legislative threshold, where approval runs through a chamber at all. */
  threshold: string | null;
  /** Whether the text carries an EXPLICIT independence declaration. Not a
   *  judgement about the judiciary: the United States codes false here. */
  judicialIndependenceClause: boolean;
};

export type ConstitutionCountry = {
  slug: string;
  name: string;
  cow: string;
  ccpName: string;
  /** Year the current constitution was adopted. */
  adopted: number | null;
  /** The last year the source covers at all. The chronology is a complete
   *  country-year panel to 2019 and records events only from 2020, so silence
   *  after 2019 means no constitutional event, not missing data. */
  asOf: number;
  /** Year of this country's most recent recorded constitutional event. */
  lastEvent: number;
  ageYears: number | null;
  /** CCP counts amendment EVENTS, not amended articles. The US Bill of Rights
   *  is one event covering ten amendments. */
  amendEvents: number;
  amendPerDecade: number | null;
  systemsSince1789: number;
  suspensions: number;
  reinstatements: number;
  interims: number;
  note: string | null;
  chars: ConstitutionChars | null;
};

export type ConstitutionSystem = {
  cow: string;
  slug: string;
  status: "live" | "defunct" | "lineage";
  /** The state's name at the time, resolved from leaders/_names.json. */
  nameAtTime: string;
  start: number;
  end: number | null;
  /** replaced = a later constitution took over. interrupted = the covered run
   *  ended, usually because the state did (Poland 1795, Haiti 1915). Only
   *  "replaced" is a completed lifespan. */
  outcome: "replaced" | "interrupted" | "in force at last coverage";
  ended: boolean;
  years: number;
};

/** Hand-curated timelines for countries whose constitution is not a document.
 *  The comparative dataset records no amendment procedure for these, which would
 *  leave them off every board; this is the series that puts them back on. */
export type ConstitutionalInstrument = {
  year: number;
  name: string;
  what: string;
  /** Year it was repealed, where it has been. */
  repealed?: number;
};
export type UncodifiedCountry = {
  form: "uncodified";
  summary: string;
  instruments: ConstitutionalInstrument[];
};
/** A country's founding documents, where the founding is more than one text.
 *  The United States prints four of them at the head of its Code. */
export type FoundingSet = {
  label: string;
  summary: string;
  context: string;
  documents: { year: number; name: string; what: string; status: string }[];
};
export type ConstitutionDocuments = {
  built: string;
  inclusionRule: string;
  review: string;
  uncodified: Record<string, UncodifiedCountry>;
  founding: Record<string, FoundingSet>;
};

/** Survival findings. WP4 ruled the per-country FORECAST does not ship: it
 *  failed its walk-forward backtest at the most recent cut. These descriptive
 *  figures are what passed, and they are computed at build time so the page
 *  never states a statistic it did not derive. */
export type Endurance = {
  medianYears: number | null;
  survival: Record<string, number>;
  another20GivenAge: Record<string, number>;
  eras: { label: string; n: number; median: number | null; p20: number }[];
  flexibility: Record<"amendedEarly" | "notAmendedEarly",
                     { n: number; medianFurther: number | null; p25: number }>;
  forecast: string;
};

export type ConstitutionsData = {
  built: string;
  citation: { chronology: string; characteristics: string; url: string };
  coverage: {
    chronologyFrom: number;
    chronologyTo: number;
    liveCountries: number;
    /** Last year of the complete country-year panel. After this the source
     *  records constitutional events only. */
    panelEnd: number;
    countriesWithAnEventSince2020: number;
    note: string;
  };
  endurance: Endurance;
  countries: ConstitutionCountry[];
  systems: ConstitutionSystem[];
};

let cache: ConstitutionsData | null = null;
let docsCache: ConstitutionDocuments | null = null;

/** Hand-curated document sets: the uncodified timelines and the founding sets.
 *  Everything else on the hub is derived from the comparative dataset; this is
 *  the one file written by hand, so it carries its own review note. */
export function getConstitutionDocuments(): ConstitutionDocuments {
  if (!docsCache) {
    docsCache = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "constitutions-documents.json"), "utf-8"),
    ) as ConstitutionDocuments;
  }
  return docsCache;
}

/** One country's row from the comparative dataset, for pages outside the hub. */
export function getCountryConstitution(slug: string): ConstitutionCountry | null {
  return getConstitutions().countries.find((c) => c.slug === slug) ?? null;
}

/** Constitutional instruments per decade, the uncodified analogue of an
 *  amendment rate. Deliberately NOT presented as the same measure: any statute
 *  can be constitutional here, so the two counts answer different questions. */
export function instrumentsPerDecade(c: UncodifiedCountry, since = 1900): number | null {
  const inWindow = c.instruments.filter((i) => i.year >= since);
  if (!inWindow.length) return null;
  const span = new Date().getFullYear() - since;
  return Math.round((inWindow.length / span) * 10 * 100) / 100;
}

export function getConstitutions(): ConstitutionsData {
  if (!cache) {
    cache = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "constitutions.json"), "utf-8"),
    ) as ConstitutionsData;
  }
  return cache;
}

/** Countries with a dated current constitution, oldest first. */
export function oldestInForce(d: ConstitutionsData): ConstitutionCountry[] {
  return d.countries
    .filter((c) => c.adopted != null && !c.chars?.uncodified)
    .sort((a, b) => (a.adopted as number) - (b.adopted as number));
}

/** Countries with an amendment rate we are willing to publish. */
export function byAmendmentRate(d: ConstitutionsData): ConstitutionCountry[] {
  return d.countries
    .filter((c) => c.amendPerDecade != null)
    .sort((a, b) => (a.amendPerDecade as number) - (b.amendPerDecade as number));
}

/** Completed lifespans only. Interrupted systems are not deaths by replacement,
 *  and systems still standing are censored, so neither belongs in the average. */
export function completedLifespans(d: ConstitutionsData): number[] {
  return d.systems.filter((s) => s.outcome === "replaced").map((s) => s.years);
}

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
