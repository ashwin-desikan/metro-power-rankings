// Country directory and detail-page data layer.
// Source: public/data/countries.json (extracted from MetroAreas.xlsx
// Country Populations sheet). Server-only — uses fs.readFileSync.

import { readFileSync } from "fs";
import { join } from "path";
import { getAllMetros } from "./data";
import type { Metro } from "./shared";

// ---------- Types ----------

export type Country = {
  slug: string;
  name: string;
  parent: string | null;
  parent_slug: string | null;
  continent: string | null;
  altContinent: string | null;
  pop: number | null;
  metroPop: number | null;
  metroPct: number | null;
  areaSqKm: number | null;
  states: number | null;
  counties: number | null;
  municipal: number | null;
  scoreTotal: number | null;
  metroAreas: number | null;
  teams: number | null;
  popRank: number | null;
  scoreRank: number | null;
  capital: string | null;
  biggestMetro: string | null;
  mostImportantMetro: string | null;
  isoCode: string | null;
  source: string | null;
  disputed?: boolean;
};

// World Bank Open Data block, sourced from public/data/country-indicators.json
// (built by scripts/build-country-indicators.py). Additive and namespaced: the
// workbook stays ground truth for pop/area/coords/continent.
export type IndicatorValue = { value: number; year: string };

export type CountryIndicators = {
  iso3: string;
  iso2: string;
  incomeLevel: string | null;
  incomeLevelId: string | null;
  wbCapital: string | null;
  indicators: {
    gdpUsd?: IndicatorValue;
    gdpPerCapitaUsd?: IndicatorValue;
    gdpPerCapitaPpp?: IndicatorValue;
    gniPerCapitaAtlas?: IndicatorValue;
    urbanPopPct?: IndicatorValue;
    popDensity?: IndicatorValue;
    lifeExpectancy?: IndicatorValue;
    giniIndex?: IndicatorValue;
    internetPct?: IndicatorValue;
    inflationPct?: IndicatorValue;
    hdi?: IndicatorValue;
    medianAge?: IndicatorValue;
    popGrowthPct?: IndicatorValue;
    migrantStockPct?: IndicatorValue;
    ruleOfLaw?: IndicatorValue;
  };
};

// ---------- Memoized loaders ----------

let _countries: Country[] | null = null;
let _bySlug: Map<string, Country> | null = null;
let _byName: Map<string, Country> | null = null;

export function getAllCountries(): Country[] {
  if (_countries) return _countries;
  const raw = readFileSync(
    join(process.cwd(), "public", "data", "countries.json"),
    "utf-8",
  );
  _countries = JSON.parse(raw) as Country[];
  return _countries;
}

function indices() {
  if (_bySlug && _byName) return { bySlug: _bySlug, byName: _byName };
  const bySlug = new Map<string, Country>();
  const byName = new Map<string, Country>();
  for (const c of getAllCountries()) {
    bySlug.set(c.slug, c);
    byName.set(c.name, c);
  }
  _bySlug = bySlug;
  _byName = byName;
  return { bySlug, byName };
}

export function getCountry(slug: string): Country | undefined {
  return indices().bySlug.get(slug);
}

export function getCountryByName(name: string): Country | undefined {
  return indices().byName.get(name);
}

// World Bank indicators keyed by country slug. Tolerant of a missing file so
// the build never breaks before build-country-indicators.py has been run;
// returns null for any slug the World Bank does not publish.
let _indicators: Record<string, CountryIndicators> | null = null;
let _indicatorsTried = false;

function loadIndicators(): Record<string, CountryIndicators> {
  if (!_indicatorsTried) {
    _indicatorsTried = true;
    try {
      const raw = readFileSync(
        join(process.cwd(), "public", "data", "country-indicators.json"),
        "utf-8",
      );
      const parsed = JSON.parse(raw) as {
        countries?: Record<string, CountryIndicators>;
      };
      _indicators = parsed.countries ?? {};
    } catch {
      _indicators = {};
    }
  }
  return _indicators ?? {};
}

export function getCountryIndicators(slug: string): CountryIndicators | null {
  return loadIndicators()[slug] ?? null;
}

// Wikidata-sourced infobox facts keyed by country slug (public/data/
// country-facts.json, built by scripts/countryfacts/build-facts.mjs; Supabase
// public.country_facts is the editable system of record). Additive to the
// workbook — never overrides pop/area/continent.
export type CountryFacts = {
  qid: string | null;
  officialLanguages: string[] | null;
  currencyName: string | null;
  currencySymbol: string | null;
  currencyIso: string | null;
  timezones: string[] | null;
  drivingSide: string | null;
  callingCode: string | null;
  tld: string[] | null;
  iso3166: string | null;
  governmentForm: string | null;
  demonym: string | null;
  formationDate: string | null;
  highestPointName: string | null;
  highestPointM: number | null;
  anthem: string | null;
  motto: string | null;
  legislature: string | null;
};

let _facts: Record<string, CountryFacts> | null = null;
let _factsTried = false;

function loadFacts(): Record<string, CountryFacts> {
  if (!_factsTried) {
    _factsTried = true;
    try {
      const raw = readFileSync(
        join(process.cwd(), "public", "data", "country-facts.json"),
        "utf-8",
      );
      const parsed = JSON.parse(raw) as { countries?: Record<string, CountryFacts> };
      _facts = parsed.countries ?? {};
    } catch {
      _facts = {};
    }
  }
  return _facts ?? {};
}

// Fields a dependent territory sensibly inherits from its parent country when
// Wikidata doesn't set them at the territory level (a British Overseas
// Territory uses the pound, drives on the left, etc.).
const INHERITABLE_FACTS: (keyof CountryFacts)[] = [
  "currencyName", "currencySymbol", "currencyIso", "drivingSide", "callingCode", "tld",
];

export function getCountryFacts(slug: string): CountryFacts | null {
  const facts = loadFacts();
  const own = facts[slug];
  if (!own) return null;
  const parentSlug = getCountry(slug)?.parent_slug ?? null;
  const parent = parentSlug ? facts[parentSlug] : null;
  if (!parent) return own;
  const merged: CountryFacts = { ...own };
  for (const k of INHERITABLE_FACTS) {
    const v = merged[k];
    if (v == null || (Array.isArray(v) && v.length === 0)) {
      (merged as Record<string, unknown>)[k] = (parent as Record<string, unknown>)[k];
    }
  }
  return merged;
}

// Per-indicator global ranking. Direction encodes the "rank #1 is notable"
// reading: bigger is rank 1 for magnitude/attainment indicators; smaller is
// rank 1 for Gini (less inequality) and inflation (more price stability), so a
// top-5% gold mark always denotes the favourable end of the scale. Ranks are
// computed only among top-level (sovereign) countries that have the value.
export type IndicatorRank = { rank: number; total: number };

const INDICATOR_RANK_DIR: Record<string, "asc" | "desc"> = {
  gdpUsd: "desc",
  gdpPerCapitaUsd: "desc",
  gdpPerCapitaPpp: "desc",
  gniPerCapitaAtlas: "desc",
  urbanPopPct: "desc",
  popDensity: "desc",
  lifeExpectancy: "desc",
  internetPct: "desc",
  giniIndex: "asc",
  inflationPct: "asc",
  hdi: "desc",
  migrantStockPct: "desc",
  ruleOfLaw: "desc",
};

let _indicatorRanks: Record<string, Map<string, IndicatorRank>> | null = null;

function indicatorRanks(): Record<string, Map<string, IndicatorRank>> {
  if (_indicatorRanks) return _indicatorRanks;
  const all = loadIndicators();
  const topLevel = new Set(getTopLevelCountries().map((c) => c.slug));
  const out: Record<string, Map<string, IndicatorRank>> = {};
  for (const key of Object.keys(INDICATOR_RANK_DIR)) {
    const rows: { slug: string; value: number }[] = [];
    for (const [slug, block] of Object.entries(all)) {
      if (!topLevel.has(slug)) continue;
      const iv = (block.indicators as Record<string, IndicatorValue | undefined>)[
        key
      ];
      if (iv && typeof iv.value === "number") rows.push({ slug, value: iv.value });
    }
    rows.sort((a, b) =>
      INDICATOR_RANK_DIR[key] === "desc" ? b.value - a.value : a.value - b.value,
    );
    const m = new Map<string, IndicatorRank>();
    rows.forEach((row, i) => m.set(row.slug, { rank: i + 1, total: rows.length }));
    out[key] = m;
  }
  _indicatorRanks = out;
  return out;
}

export function getIndicatorRank(slug: string, key: string): IndicatorRank | null {
  const m = indicatorRanks()[key];
  return m ? m.get(slug) ?? null : null;
}

export function isTop5pct(r: IndicatorRank | null): boolean {
  if (!r || r.total === 0) return false;
  return r.rank <= Math.max(1, Math.ceil(r.total * 0.05));
}

// Children of a parent country (constituents, territories, disputed regions).
export function getChildrenOf(parentName: string): Country[] {
  return getAllCountries()
    .filter((c) => c.parent === parentName)
    .sort((a, b) => (b.pop ?? 0) - (a.pop ?? 0));
}

// Top-level countries: no parent (sovereign or recognized standalone).
export function getTopLevelCountries(): Country[] {
  return getAllCountries().filter((c) => !c.parent);
}

// ---------- UK constituent handling ----------

// metros.json tags UK metros with country='United Kingdom' but encodes the
// constituent in subCountry. For /countries/england, /countries/scotland
// etc., we filter UK metros by subCountry.
const UK_CONSTITUENT_BY_SLUG: Record<string, string> = {
  "england": "England",
  "scotland": "Scotland",
  "wales": "Wales",
  "northern-ireland": "Northern Ireland",
};

// ---------- Disputed region handling ----------

// Some disputed regions are tagged via the metro's primaryState field rather
// than as a separate country value. Northern Cyprus is the special case
// where the xlsx encodes the local Turkish district names instead of the
// disputed-region label, so we hardcode the four district names here.
const NORTHERN_CYPRUS_DISTRICTS = new Set([
  "Lefkoşa",
  "Gazimağusa",
  "Girne",
  "Güzelyurt",
]);

function metrosByPrimaryState(stateName: string): Metro[] {
  return getAllMetros().filter((m) => m.primaryState === stateName);
}

// ---------- Metros for a country ----------

// Returns the metros that belong to the given country, applying:
// - UK constituent filter via subCountry
// - Disputed region rules (primaryState match + Northern Cyprus hardcode)
// - Parent-country inclusion for non-internationally-recognized children
//   (Western Sahara metros also appear on Morocco; Northern Cyprus districts
//   also appear on Cyprus; Transnistria/Abkhazia/South Ossetia metros that
//   are tagged country=Moldova/Georgia already appear on those parent pages
//   via the normal country lookup)
export function getMetrosForCountry(slug: string): Metro[] {
  const country = getCountry(slug);
  if (!country) return [];

  // UK constituent: filter UK metros by subCountry
  if (UK_CONSTITUENT_BY_SLUG[slug]) {
    const constituentName = UK_CONSTITUENT_BY_SLUG[slug];
    return getAllMetros()
      .filter((m) => m.country === "United Kingdom" && m.subCountry === constituentName)
      .sort((a, b) => a.rank - b.rank);
  }

  // Northern Cyprus: hardcoded district list, matched via primaryState
  if (slug === "northern-cyprus") {
    return getAllMetros()
      .filter(
        (m) =>
          m.country === "Cyprus" &&
          m.primaryState != null &&
          NORTHERN_CYPRUS_DISTRICTS.has(m.primaryState),
      )
      .sort((a, b) => a.rank - b.rank);
  }

  // Other disputed regions tagged via primaryState (Transnistria, Abkhazia,
  // South Ossetia). These are also pulled into their parent's page below.
  if (country.disputed) {
    const psMatches = metrosByPrimaryState(country.name);
    if (psMatches.length > 0) {
      return psMatches.sort((a, b) => a.rank - b.rank);
    }
    // Fall through to country= match (Western Sahara has country='Western Sahara')
  }

  // Standard: country field exact match
  let metros = getAllMetros().filter((m) => m.country === country.name);

  // For parent countries, include disputed children's metros via their
  // primaryState or country tag. Hong Kong / Macau / Puerto Rico etc. stay
  // independent and are NOT rolled up here (per international-recognition
  // distinction).
  const disputedChildren = getChildrenOf(country.name).filter(
    (c) => c.disputed,
  );
  for (const child of disputedChildren) {
    if (child.slug === "northern-cyprus") {
      // Already in metros list since they have country='Cyprus'
      continue;
    }
    // Add metros tagged country=child.name (e.g. Western Sahara)
    const childCountry = getAllMetros().filter((m) => m.country === child.name);
    metros = metros.concat(childCountry);
    // Add metros tagged primaryState=child.name (e.g. Transnistria)
    const childState = metrosByPrimaryState(child.name);
    for (const m of childState) {
      if (!metros.some((x) => x.slug === m.slug)) metros.push(m);
    }
  }

  return metros.sort((a, b) => a.rank - b.rank);
}

// ---------- Helpers for the directory page ----------

// Continent buckets used by the filter chips (matches metro page conventions).
export const COUNTRY_CONTINENTS = [
  "All",
  "Europe",
  "North America",
  "Asia",
  "South America",
  "Africa",
  "Oceania",
] as const;

// Slug list for static generation.
export function getAllCountrySlugs(): string[] {
  return getAllCountries().map((c) => c.slug);
}

// Lightweight rank lookup used by the directory.
export function metroCountForCountry(slug: string): number {
  return getMetrosForCountry(slug).length;
}
