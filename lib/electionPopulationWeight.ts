import "server-only";
import { readFileSync } from "fs";
import { join } from "path";
import type { CensusRow } from "./electionCensus";

// Population-weighted view of the freedom-of-ballot chart.
//
// The contest-counted version answers "what share of the elections we track
// were free", which is a fact about the atlas as much as about the world:
// Denmark and Belgium contribute seventy-odd contests each, China fifteen. The
// weighted version answers the question people think they are reading, "what
// share of the people we cover lived under a free ballot", and it uses the
// population of the decade rather than today's, so the 1930s are weighted by
// the 1930s.
//
// Population series: public/data/country-population.json (Our World in Data,
// CC BY; UN WPP from 1950, Gapminder 1800-1949), already in the repo for the
// country pages.

type PopFile = {
  world: [number, number][];
  countries: Record<string, { series: [number, number][] }>;
};

// Hub code to the population file's country slug. The European Union has no
// single population series and the Vatican is not a polity-wide ballot, so
// neither is weighted; both stay in the contest-counted chart.
export const HUB_COUNTRY_SLUG: Record<string, string> = {
  us: "united-states", uk: "united-kingdom", ca: "canada", mx: "mexico",
  br: "brazil", ar: "argentina", de: "germany", fr: "france", it: "italy",
  es: "spain", pl: "poland", nl: "netherlands", ru: "russia", il: "israel",
  za: "south-africa", ng: "nigeria", tr: "turkey", in: "india", jp: "japan",
  au: "australia", nz: "new-zealand", kr: "south-korea", id: "indonesia",
  tw: "taiwan", cn: "china", ua: "ukraine", iq: "iraq", ps: "palestine",
  sg: "singapore", my: "malaysia", ch: "switzerland", be: "belgium",
  dk: "denmark", gr: "greece", at: "austria", pt: "portugal", ie: "ireland",
  ph: "philippines", eg: "egypt",
};

let _pop: PopFile | null = null;
function popFile(): PopFile {
  return (_pop ??= JSON.parse(
    readFileSync(join(process.cwd(), "public", "data", "country-population.json"), "utf-8"),
  ) as PopFile);
}

/** Population at a year, clamped to the ends of the series. */
function at(series: [number, number][], year: number): number | null {
  if (!series.length) return null;
  if (year <= series[0][0]) return series[0][1];
  if (year >= series[series.length - 1][0]) return series[series.length - 1][1];
  // Series are dense and yearly, so a direct index is right; the scan is the
  // fallback for any sparse country.
  const guess = series[year - series[0][0]];
  if (guess && guess[0] === year) return guess[1];
  let best: number | null = null;
  for (const [y, v] of series) {
    if (y <= year) best = v;
    else break;
  }
  return best;
}

export type WeightedDecade = {
  d: number;
  free: number;      // people, not contests
  partial: number;
  unfree: number;
  covered: number;   // total population of the polities voting that decade
  worldShare: number; // covered as a share of world population, 0-100
  polities: number;
};

/**
 * One row per decade. A polity counts once per decade, at its population in the
 * middle of that decade, under the freedom label of the contests it held. Where
 * a decade mixes labels the LESS free one wins: a country that held one clean
 * election and two rigged ones did not have a free decade.
 */
export function weightedFreedomDecades(
  rows: CensusRow[],
  from = 1850,
  to = 2020,
): WeightedDecade[] {
  const pop = popFile();
  const out: WeightedDecade[] = [];

  for (let d = from; d <= to; d += 10) {
    const mid = d + 5;
    let free = 0, partial = 0, unfree = 0, polities = 0;

    for (const row of rows) {
      const slug = HUB_COUNTRY_SLUG[row.code];
      if (!slug) continue;
      const items = row.items.filter((i) => i.year >= d && i.year < d + 10);
      if (!items.length) continue;
      const series = pop.countries[slug]?.series;
      const people = series ? at(series, mid) : null;
      if (!people) continue;
      polities += 1;
      // Worst label of the decade, so a single rigged contest is not averaged
      // away by two clean ones.
      const worst = items.reduce((a, i) => Math.max(a, i.f), 0);
      if (worst === 0) free += people;
      else if (worst === 1) partial += people;
      else unfree += people;
    }

    const covered = free + partial + unfree;
    if (!covered) continue;
    const world = at(pop.world, mid) ?? 0;
    out.push({
      d, free, partial, unfree, covered, polities,
      worldShare: world ? (100 * covered) / world : 0,
    });
  }
  return out;
}
