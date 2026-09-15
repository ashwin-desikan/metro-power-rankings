import "server-only";

// Tennis & golf majors data layer (/teams/golf and /teams/tennis).
// Source: scripts/build-majors-data.py reads Supabase (golf_majors, tennis_majors,
// golf_ryder_cup, tennis_davis_cup, the source of record) and emits
// public/data/majors/{golf,tennis}.json. Server-only.
// Listed in scripts/check-client-imports.mjs SERVER_ONLY_MODULES.

// STATIC IMPORTS, not readFileSync. These three are small, fixed and known at
// build time, so they compile into the server bundle and there is nothing for
// the Vercel file tracer to get wrong. That matters more here than it used to:
// these pages now carry a 1h ISR window, so their fallback path runs on a real
// Vercel re-render rather than only during `next build`. Measured on the build
// of 2026-09-15, the .nft.json for /teams/golf and /teams/tennis traced 111
// files and NONE of the majors JSON, the identical silent miss
// scripts/DATA-READS-RECIPE.md records for lib/international.ts. A readFileSync
// fallback here would have been dead code that returned null, and the page
// renders nothing when data is null.
import bundledGolf from "@/public/data/majors/golf.json";
import bundledTennis from "@/public/data/majors/tennis.json";
import golfMonthsData from "@/public/data/majors/golf-months.json";

export type Champion = {
  year: number;
  tournament: string;
  gender?: "M" | "W";
  champion: string;
  nation: string | null;
  careerNo: number | null;
  careerTotal: number | null;
  note: string;
  metroSlug?: string;
  metroName?: string;
  venue?: string;
};

export type Leader = { player: string; nation: string | null; total: number; byTour: Record<string, number> };
export type NationTally = { nation: string; titles: number };
export type HostMetro = { metroSlug: string; metroName: string; count: number };

export type RyderEdition = {
  edition: number; year: number; winner: string; score: string;
  host: string; venue: string; usCaptain: string; homeCaptain: string;
  metroSlug?: string; metroName?: string;
};

export type DavisNation = {
  country: string; titles: number; titleYears: string | null;
  runnerUp: number; runnerUpYears: string | null;
};

export type GolfData = {
  sport: string; tournaments: string[]; champions: Champion[];
  leaders: Leader[]; byNation: NationTally[]; hostMetros: HostMetro[];
  ryder: RyderEdition[]; ryderTally: Record<string, number>;
};

export type TennisData = {
  sport: string; tournaments: string[]; champions: Champion[];
  leadersMen: Leader[]; leadersWomen: Leader[];
  byNationMen: NationTally[]; byNationWomen: NationTally[];
  hostMetros: HostMetro[]; davis: DavisNation[];
};

// The bundled copies, used when the runtime fetch below cannot be served.
const BUNDLED = {
  "golf.json": bundledGolf as unknown as GolfData,
  "tennis.json": bundledTennis as unknown as TennisData,
} as const;

// Read at RUNTIME from GitHub raw, not baked in at build time (2026-09-15),
// following lib/teamOwners.ts. .github/workflows/majors-ingest.yml detects a
// finished major every morning, writes the champion to Supabase, re-emits
// these two files and commits them with [vercel skip], then pings
// /api/revalidate?tag=majors. A new US Open or Open Championship champion
// therefore reaches /teams/tennis and /teams/golf minutes after the push
// without spending a paid production build.
//
// It used to be a build-time readFileSync, and majors-ingest.yml deliberately
// omitted [vercel skip] for exactly that reason, which is what made a
// three-line data commit cost a full production build (6871c2a9d, 14 Sep 2026,
// the US Open champions; seven such builds in the prior 180 days).
//
// The hourly revalidate is the backstop if the ping fails; the bundled copy is
// the fallback if the fetch does. In development the local working copy leads,
// matching lib/liveData.ts and lib/teamOwners.ts.
const GH_RAW = {
  "golf.json": "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data/majors/golf.json",
  "tennis.json": "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data/majors/tennis.json",
} as const;
type LiveFileName = keyof typeof GH_RAW;

// Memo key. These two files carry no `generated` stamp and deliberately are not
// given one: build-majors-data.py runs daily and the workflow commits only when
// the content actually differs, so a timestamp would turn every quiet day into
// a commit that is pure noise. The response's byte length is the key instead.
// It moves whenever a champion is added and never otherwise, and the only cost
// of the theoretical collision (a replacement of exactly equal length) is one
// re-parse skipped inside a single hourly window.
const _memo = new Map<LiveFileName, { key: string; data: unknown }>();

async function loadLive<T extends { champions?: unknown[] }>(
  rel: LiveFileName,
): Promise<T | null> {
  if (process.env.NODE_ENV === "production") {
    try {
      const res = await fetch(GH_RAW[rel], { next: { revalidate: 3600, tags: ["majors"] } });
      if (res.ok) {
        const text = await res.text();
        const key = `${text.length}`;
        const hit = _memo.get(rel);
        if (hit && hit.key === key) return hit.data as T;
        const parsed = JSON.parse(text) as T;
        // A truncated or error response must not replace a good bundled file.
        if (parsed?.champions?.length) {
          _memo.set(rel, { key, data: parsed });
          return parsed;
        }
      }
    } catch {
      /* fall through to the bundled copy */
    }
  }
  return BUNDLED[rel] as unknown as T;
}

export async function getGolfMajors(): Promise<GolfData | null> {
  return loadLive<GolfData>("golf.json");
}
export async function getTennisMajors(): Promise<TennisData | null> {
  return loadLive<TennisData>("tennis.json");
}

// Real month each golf major was played, keyed `${year}|${golf.json tournament}`,
// so /teams/golf orders each season by the actual calendar (the PGA closed the
// year through 2018, then moved to May) rather than by name. Majors.xlsx has no
// dates; the champions ledger does.
//
// This used to read all 2.6 MB of champions-history.json and do the join here,
// for 478 integers. scripts/champions/build_champions.py now emits the join as
// public/data/majors/golf-months.json (12 KB) and this is a static import of it,
// which also takes /teams/golf off a build-time file read the Vercel tracer was
// not tracing for that route. A month the ledger does not carry is simply absent
// and the caller falls back, exactly as before.
const GOLF_MONTHS: Record<string, number> = golfMonthsData as Record<string, number>;
export function golfMajorMonths(): Record<string, number> {
  return GOLF_MONTHS;
}

// Group a flat champions list by tournament, each sorted most-recent first.
export function byTournament(champs: Champion[], gender?: "M" | "W"): Map<string, Champion[]> {
  const m = new Map<string, Champion[]>();
  for (const c of champs) {
    if (gender && c.gender !== gender) continue;
    if (!m.has(c.tournament)) m.set(c.tournament, []);
    m.get(c.tournament)!.push(c);
  }
  for (const arr of m.values()) arr.sort((a, b) => b.year - a.year);
  return m;
}

// Most-recent champion per tournament (for the hero cards).
export function latestByTournament(champs: Champion[], gender?: "M" | "W"): Map<string, Champion> {
  const grouped = byTournament(champs, gender);
  const out = new Map<string, Champion>();
  for (const [t, arr] of grouped) if (arr.length) out.set(t, arr[0]);
  return out;
}

// Nation display name -> country-page slug, for flags and /countries links.
const NATION_SLUG_OVERRIDE: Record<string, string> = {
  // "United Kingdom" players (Murray, Perry, Wade, Raducanu) need the
  // "great-britain" key, which flagCdnUrl maps to the gb flag; "united-kingdom"
  // has no flag entry. Home nations (England/Scotland/Wales/Northern Ireland)
  // resolve on their own.
  "United Kingdom": "great-britain",
  "United Kingdom of Great Britain and Ireland": "great-britain",
  "West Germany": "germany",
  "Weimar Republic": "germany",
  "Soviet Union": "russia",
  "Czechoslovakia": "czech-republic",
  "Republic of Ireland": "ireland",
  "Socialist Federal Republic of Yugoslavia": "serbia",
  "Federal Republic of Yugoslavia": "serbia",
};

export function nationSlug(name: string | null): string | null {
  if (!name) return null;
  if (NATION_SLUG_OVERRIDE[name]) return NATION_SLUG_OVERRIDE[name];
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
