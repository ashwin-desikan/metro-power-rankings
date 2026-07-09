// State / province directory and detail-page data layer.
// Source: public/data/states.json (extracted from MetroAreas.xlsx
// "States (ISO 3166-2)" sheet). Server-only — uses fs.readFileSync.
//
// Keying: every state row is identified by (Country, Administrative Division)
// from the workbook. Slugs are kebab-case Administrative Division with a
// country suffix on collisions (e.g. punjab-india / punjab-pakistan). ISO
// 3166-2 is captured when present but is optional metadata; only ~24% of
// the sheet's rows have ISO codes filled in, so we never depend on it.
//
// UK exception: the workbook stores UK subdivisions under the constituent
// country (England, Scotland, Wales, Northern Ireland), never under
// "United Kingdom". /countries/united-kingdom therefore renders no
// state chips, while /countries/england lists Greater London, Greater
// Manchester, Merseyside, etc.

import { readFileSync } from "fs";
import { join } from "path";
import { getAllMetros } from "./data";
import type { Metro } from "./shared";

// ---------- Types ----------

export type State = {
  slug: string;
  name: string;
  // The immediate parent country in the sheet (England / Anguilla / etc.).
  country: string;
  countrySlug: string;
  // Sovereign state, used for cross-country grouping when needed.
  mainCountry: string;
  mainCountrySlug: string;
  type: string;            // Province / State / Territory / Administrative Area / etc.
  iso: string | null;
  pop: number | null;
  capital: string | null;
  continent: string | null;
  subRegion: string | null;
  languageAdmin: string | null;
  languageSecondary: string | null;
  languageDeFacto: string | null;
  languageNational: string | null;
  metroCount: number;
  metroPop: number;
  scoreTotal: number;
  // The full list of metro slugs that touch this state, computed at ETL
  // time by aggregating (Country, State, Metro) edges from Counties +
  // Municipality. A metro that spans 7 English ceremonial counties shows
  // up on all 7 state pages here, even though only its first 3 are stored
  // on the metros.json row.
  metroSlugs?: string[];
};

// ---------- Memoized loaders ----------

let _states: State[] | null = null;
let _bySlug: Map<string, State> | null = null;
let _byCountryName: Map<string, State[]> | null = null;

export function getAllStates(): State[] {
  if (_states) return _states;
  const raw = readFileSync(
    join(process.cwd(), "public", "data", "states.json"),
    "utf-8",
  );
  _states = JSON.parse(raw) as State[];
  return _states;
}

function indices() {
  if (_bySlug && _byCountryName) return { bySlug: _bySlug, byCountryName: _byCountryName };
  const bySlug = new Map<string, State>();
  const byCountryName = new Map<string, State[]>();
  for (const s of getAllStates()) {
    bySlug.set(s.slug, s);
    if (!byCountryName.has(s.country)) byCountryName.set(s.country, []);
    byCountryName.get(s.country)!.push(s);
  }
  _bySlug = bySlug;
  _byCountryName = byCountryName;
  return { bySlug, byCountryName };
}

export function getState(slug: string): State | undefined {
  return indices().bySlug.get(slug);
}

// All states whose immediate parent country (col 4 in the sheet) matches.
// /countries/england returns Greater London / Greater Manchester / etc.;
// /countries/united-kingdom returns nothing because the UK doesn't directly
// own any rows in the States sheet. Sorted highest metro count first.
export function getStatesForCountry(countryName: string): State[] {
  const list = indices().byCountryName.get(countryName) || [];
  return [...list].sort((a, b) => {
    if (b.metroCount !== a.metroCount) return b.metroCount - a.metroCount;
    return a.name.localeCompare(b.name);
  });
}

// Metros assigned to a state via the cross-sheet aggregation in extract.py.
// state.metroSlugs is the authoritative list (built from Counties +
// Municipality edges plus each metro's primary state). Falls back to the
// older 3-slot scan only when metroSlugs is missing — generally only
// happens during local dev runs against pre-aggregator data.
export function getMetrosForState(slug: string): Metro[] {
  const state = getState(slug);
  const all = getAllMetros();
  if (state?.metroSlugs && state.metroSlugs.length > 0) {
    const wanted = new Set(state.metroSlugs);
    return all
      .filter((m) => wanted.has(m.slug))
      .sort((a, b) => a.rank - b.rank);
  }
  // Legacy fallback: scan the 3-slot system + editorial additionalStates.
  // Kept so a stale states.json doesn't blank out every state page during
  // local development.
  return all
    .filter((m) => {
      if (m.stateSlug === slug) return true;
      if (m.state2Slug === slug) return true;
      if (m.state3Slug === slug) return true;
      if (m.additionalStates?.some((a) => a.slug === slug)) return true;
      return false;
    })
    .sort((a, b) => a.rank - b.rank);
}

export function getAllStateSlugs(): string[] {
  return getAllStates().map((s) => s.slug);
}

// All indexable state slugs (~2,187 of the 3,482 rows in the sheet have at
// least one metro). Used by the sitemap, which should list every real page
// regardless of whether it was pre-rendered at build time — see
// getTopStateSlugsForStaticParams for the smaller build-time subset.
export function getStateSlugsWithMetros(): string[] {
  return getAllStates()
    .filter((s) => s.metroCount > 0)
    .map((s) => s.slug);
}

// Slugs that are worth pre-generating at build time: the top 500 states by
// scoreTotal among the ~2,187 that have at least one metro. The rest still
// get a route — see dynamicParams=true on the state page — but render on
// first request rather than during the static-params pass. scoreTotal, not
// metroCount, is the notability signal: many of the most important
// single-metro entries (e.g. Île-de-France/Paris, Beijing, Greater London,
// DC) would be wrongly excluded by a metro-count-only filter despite being
// world-significant, so a metroCount>0-but-low-scoreTotal state (a province
// with one small metro) is what actually gets deferred to on-demand
// rendering here.
const STATE_STATIC_PARAMS_TOP_N = 500;

export function getTopStateSlugsForStaticParams(): string[] {
  return getAllStates()
    .filter((s) => s.metroCount > 0)
    .sort((a, b) => b.scoreTotal - a.scoreTotal)
    .slice(0, STATE_STATIC_PARAMS_TOP_N)
    .map((s) => s.slug);
}

// Look up a state slug by (country, name) with a (subCountry, name)
// fallback for UK constituents. Memoized so the country-page metro
// table can link state2 / state3 names cheaply per row.
let _byCountryNameKey: Map<string, State> | null = null;

function _stateLookupMap(): Map<string, State> {
  if (_byCountryNameKey) return _byCountryNameKey;
  const map = new Map<string, State>();
  for (const s of getAllStates()) {
    map.set(`${s.country}|${s.name}`, s);
  }
  _byCountryNameKey = map;
  return map;
}

export function findStateSlug(
  country: string,
  subCountry: string | undefined | null,
  stateName: string,
): string | undefined {
  if (!stateName) return undefined;
  const map = _stateLookupMap();
  const direct = map.get(`${country}|${stateName}`);
  if (direct) return direct.slug;
  if (subCountry) {
    const fallback = map.get(`${subCountry}|${stateName}`);
    if (fallback) return fallback.slug;
  }
  return undefined;
}
