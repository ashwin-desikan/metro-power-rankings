import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// The Screen of the Metros — metros ranked by the film industry's output,
// box office as the base pillar (era-normalized, director-weighted credit
// split) with Academy Award prestige layered on top. Dataset is built by the
// external pipeline (_screen_of_metros_pipeline) and refreshed annually
// after each Oscar ceremony; the page reads the committed JSON at build time.

export type ScreenTopPerson = { name: string; combined: number };
export type ScreenMetro = {
  slug: string;
  name: string;
  country: string;
  score: number;
  people: number;
  top: ScreenTopPerson[];
};
export type ScreenPerson = {
  name: string;
  metro: string | null;
  metroName: string | null;
  film: number;
  prestige: number;
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
