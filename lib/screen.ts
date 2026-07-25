import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// The Screen of the Metros — metros (and countries) ranked by the film industry's
// output, box office as the base pillar (era-normalized, director-weighted credit
// split) with Academy Award prestige + cinematic-consensus significance layered on
// top. People, metro and country profiles all read the committed screen.json built
// by the external pipeline (_screen_of_metros_pipeline). Top 2,000 people exported;
// metro profiles link out to the country and peer metros.

export type ScreenTopPerson = { name: string; combined: number };
export type ScreenMetro = {
  slug: string;
  name: string;
  country: string;
  score: number;
  people: number;
  top: ScreenTopPerson[];
};
export type ScreenCountry = {
  slug: string;
  name: string;
  score: number;
  people: number;
  metros: number;
  top: ScreenTopPerson[];
};
export type ScreenPerson = {
  name: string;
  metro: string | null;
  metroName: string | null;
  country?: string | null;
  countrySlug?: string | null;
  film: number;
  prestige: number;
  audience: number;
  combined: number;
  wins: number;
  noms: number;
  directed: number;
  castIn: number;
};
export type ScreenFilm = {
  title: string;
  year: number;
  points: number;
  score: number;
  canonRank: number | null;
  gross: number | null;
  directors: string[];
  basis: string;
  honours: string[];
  genre?: string;
  rating?: number | null;
  votes?: number | null;
};
export type GenreDecades = {
  genres: string[];
  rows: ({ decade: number } & Record<string, number>)[];
};
export type ScreenAcademy = {
  decades: { decade: number; pctTop10: number; n: number }[];
  winners: { year: number; title: string; rank: number | null }[];
};
export type ScreenDecade = { decade: number; us: number; ukie: number; europe: number; world: number; n: number };
export type ScreenFile = {
  built: string;
  totals: {
    films: number;
    years: number;
    nominations: number;
    ceremonies: number;
    people: number;
    mappedPeople: number;
    metros: number;
  };
  metros: ScreenMetro[];
  people: ScreenPerson[];
  directors: ScreenPerson[];
  countries?: ScreenCountry[];
  metroCountry?: Record<string, string>;
  films: ScreenFilm[];
  decades: ScreenDecade[];
  genreDecades?: GenreDecades;
  academy: ScreenAcademy | null;
};

export type ScreenYearAward = { name: string; film: string };
export type ScreenYear = {
  year: number;
  basis: string;
  films: { title: string; gross: number; directors: string[]; genre?: string; tmdb?: boolean; rating?: number }[];
  awards: { picture?: ScreenYearAward; director?: ScreenYearAward; actor?: ScreenYearAward; actress?: ScreenYearAward } | null;
};
export type ScreenYearsFile = { years: ScreenYear[] };

export type ScreenOscarNominee = { film: string; names: string[]; winner: boolean };
export type ScreenOscarCategory = { label: string; nominees: ScreenOscarNominee[] };
export type ScreenOscarOther = { category: string; film: string; names: string[] };
export type ScreenCeremony = {
  ceremony: number;
  yearLabel: string;
  filmYear: number | null;
  big6: ScreenOscarCategory[];
  others: ScreenOscarOther[];
};
export type ScreenOscarsFile = { ceremonies: ScreenCeremony[] };

export type CanonDirector = { name: string; metro: string | null; metroName: string | null };
export type CanonSetting = { metro: string; metroName: string; via: "set" | "filmed" };
export type CanonFilm = {
  rank: number;
  title: string;
  year: number;
  directors: CanonDirector[];
  topGrosser: boolean;
  rating?: number | null;
  setting?: CanonSetting | null;
};
export type ScreenCanonFile = {
  source: string;
  sourceUrl: string;
  films: CanonFilm[];
  metroCounts: { slug: string; name: string; films: number }[];
};

export type N1Film = {
  title: string;
  tt: string | null;
  canonRank: number | null;
  topGrosser: boolean;
  bestPicture: boolean;
};
export type N1Week = { date: string; target: string; gross: number | null };
export type N1Year = { year: number; weeks: N1Week[] };
export type ScreenNumberOnesFile = {
  source: string;
  films: Record<string, N1Film>;
  years: N1Year[];
  mostWeeks: { target: string; weeks: number }[];
  longestReigns: { target: string; weeks: number; start: string }[];
  totals: { weeks: number; films: number; withTt: number; years: number };
};

let cache: ScreenFile | null | undefined;
let yearsCache: ScreenYearsFile | null | undefined;
let canonCache: ScreenCanonFile | null | undefined;
let oscarsCache: ScreenOscarsFile | null | undefined;
let n1Cache: ScreenNumberOnesFile | null | undefined;

export function getScreenNumberOnes(): ScreenNumberOnesFile | null {
  if (n1Cache !== undefined) return n1Cache;
  try {
    n1Cache = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "screen", "screen_number_ones.json"), "utf-8"),
    ) as ScreenNumberOnesFile;
  } catch {
    n1Cache = null;
  }
  return n1Cache;
}

export function getScreenOscars(): ScreenOscarsFile | null {
  if (oscarsCache !== undefined) return oscarsCache;
  try {
    oscarsCache = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "screen", "screen_oscars.json"), "utf-8"),
    ) as ScreenOscarsFile;
  } catch {
    oscarsCache = null;
  }
  return oscarsCache;
}

export function getScreenCanon(): ScreenCanonFile | null {
  if (canonCache !== undefined) return canonCache;
  try {
    canonCache = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "screen", "screen_canon.json"), "utf-8"),
    ) as ScreenCanonFile;
  } catch {
    canonCache = null;
  }
  return canonCache;
}

export function getScreenYears(): ScreenYearsFile | null {
  if (yearsCache !== undefined) return yearsCache;
  try {
    yearsCache = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "screen", "screen_years.json"), "utf-8"),
    ) as ScreenYearsFile;
  } catch {
    yearsCache = null;
  }
  return yearsCache;
}

export function getScreen(): ScreenFile | null {
  if (cache !== undefined) return cache;
  try {
    cache = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "screen", "screen.json"), "utf-8"),
    ) as ScreenFile;
  } catch {
    cache = null;
  }
  return cache;
}

export type MetroScreen = ScreenMetro & { rank: number };

export function getScreenForMetro(slug: string): MetroScreen | null {
  const f = getScreen();
  if (!f) return null;
  const i = f.metros.findIndex((m) => m.slug === slug);
  if (i < 0) return null;
  return { rank: i + 1, ...f.metros[i] };
}

export type CanonFilmLocal = { film: CanonFilm; directors: string[] };
export type ScreenMetroProfile = {
  metro: MetroScreen;
  people: ScreenPerson[]; // notable people (top-500) attributed to this metro, by score
  filmsSet: CanonFilm[]; // canon films set or filmed in this metro
  filmsByLocals: CanonFilmLocal[]; // canon films with a director from this metro
};

// Assemble everything the "Screen of {metro}" profile needs from the shipped
// JSON: the metro's rank/score, the notable people it raised, the canon films
// set or filmed there, and the canon films its native directors made.
export function getScreenMetroProfile(slug: string): ScreenMetroProfile | null {
  const metro = getScreenForMetro(slug);
  if (!metro) return null;
  const f = getScreen();
  const people = (f?.people ?? [])
    .filter((p) => p.metro === slug)
    .sort((a, b) => b.combined - a.combined);
  const canon = getScreenCanon();
  const filmsSet = (canon?.films ?? [])
    .filter((c) => c.setting?.metro === slug)
    .sort((a, b) => a.rank - b.rank);
  const filmsByLocals = (canon?.films ?? [])
    .map((c) => ({ film: c, directors: c.directors.filter((d) => d.metro === slug).map((d) => d.name) }))
    .filter((x) => x.directors.length > 0)
    .sort((a, b) => a.film.rank - b.film.rank);
  return { metro, people, filmsSet, filmsByLocals };
}

export type CountryScreen = ScreenCountry & { rank: number };
export type ScreenCountryProfile = {
  country: CountryScreen;
  people: ScreenPerson[]; // notable people (top-500) from this country, by score
  filmsSet: CanonFilm[]; // canon films set or filmed in this country
  metros: ScreenMetro[]; // scored metros within this country, by score
};

export function getScreenCountry(slug: string): CountryScreen | null {
  const f = getScreen();
  const cs = f?.countries ?? [];
  const i = cs.findIndex((c) => c.slug === slug);
  if (i < 0) return null;
  return { rank: i + 1, ...cs[i] };
}

// Every person's country is inferred from their metro; a country profile then
// gathers the people it raised, the canon films set within its metros, and its
// own scored metros.
export function getScreenCountryProfile(slug: string): ScreenCountryProfile | null {
  const country = getScreenCountry(slug);
  if (!country) return null;
  const f = getScreen();
  const people = (f?.people ?? [])
    .filter((p) => p.countrySlug === slug)
    .sort((a, b) => b.combined - a.combined);
  const metros = (f?.metros ?? [])
    .filter((m) => m.country === country.name)
    .sort((a, b) => b.score - a.score);
  const mc = f?.metroCountry ?? {};
  const canon = getScreenCanon();
  const filmsSet = (canon?.films ?? [])
    .filter((c) => c.setting && mc[c.setting.metro] === country.name)
    .sort((a, b) => a.rank - b.rank);
  return { country, people, filmsSet, metros };
}
