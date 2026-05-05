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

// Metros assigned to a state via the resolved stateSlug, state2Slug,
// state3Slug, OR any entry in the editorial additionalStates list. So
// London surfaces on /states/greater-london (primary) AND on
// /states/surrey, /states/hertfordshire, /states/berkshire (additional).
// Sorted by global rank.
export function getMetrosForState(slug: string): Metro[] {
  return getAllMetros()
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
