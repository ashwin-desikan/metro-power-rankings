import "server-only";
import { readFileSync } from "fs";
import { join } from "path";

// The continental top-flight expectation ledgers: Spain, Italy, Germany,
// France and the Netherlands, built by scripts/football/build_expectation_intl.py.
//
// 🔴 ONE MODEL, NOT SIX. build_expectation_intl.py IMPORTS run, davidson and
// trailing_params from build_expectation and its self-test asserts `run is
// be.run`, so these are the English ledger's numbers applied to another
// league. If either side ever grows its own run() the two drift in public.
//
// 🔴 SURPLUS IS COMPARABLE WITHIN A LEAGUE AND ONLY LOOSELY ACROSS LEAGUES,
// because league size and era differ. Every cross-league table on the site
// carries a sentence saying so. Do not rank Feyenoord 1973-74 against
// Leverkusen 2023-24 without it.
//
// 🔴 THERE IS NO MARKET LAYER HERE. `meta.market` is null in all five
// payloads and no continental price exists anywhere in the tree. Nothing may
// imply one.
//
// 🔴 ISR READ, NOT A MODULE-LOAD readFileSync OF EVERYTHING. Same rule as
// lib/plExpectation.ts: five payloads of roughly 200 KB each, fetched and
// parsed once per server process, kept off the build graph.
//
// 🔴 ATTRIBUTION RIDES WITH THE DATA. meta.source_credit names James Curley
// (github.com/jalapic/engsoccerdata) and must render wherever these numbers do.

export type IntlSeasonRow = {
  season: string;
  /** The ERA name: what the club was called that season. */
  club: string;
  /** 2 or 3, per that league's own switch. */
  win_pts: number;
  gp: number;
  w: number;
  d: number;
  l: number;
  pts: number;
  xpts: number;
  diff: number;
  /** Era-neutral: match points (win 1, draw 0.5) earned minus expected. */
  surplus: number;
};

export type IntlSeasonNote = { season: string; reason: string };
export type IntlPartialSeason = IntlSeasonNote & {
  played: number;
  expected: number;
  fraction: number;
};
export type IntlGroupedSeason = IntlSeasonNote & { clubs: number; played: number };
export type IntlSupplementedSeason = { season: string; source: string; matches: number };

export type IntlMeta = {
  country: string;
  competition: string;
  generated_at: string;
  model: string;
  model_source: string;
  source: string;
  source_credit: string;
  /** ["1928-29", "2024-25"] */
  seasons: [string, string];
  season_count: number;
  matches: number;
  clubs: number;
  /** The season three points for a win arrived, per league. Never assume England's. */
  win_pts_three_from: string | null;
  log_loss: number;
  brier: number;
  baseline_log_loss: number;
  skill_vs_era_baseline: number;
  /** null in every continental payload, and that is the point. */
  market: null;
  metros_resolved: boolean;
  metros_missing: number;
  missing_seasons: IntlSeasonNote[];
  partial_seasons: IntlPartialSeason[];
  grouped_seasons: IntlGroupedSeason[];
  supplemented_seasons: IntlSupplementedSeason[];
  dropped_rows: { date: string; home: string; away: string; reason: string }[];
};

export type IntlClub = {
  club: string;
  /** null when the club earned a metro but not a club page. Check THIS, never metro. */
  slug: string | null;
  metro: string | null;
  metro_slug: string | null;
  metro_method: string;
  total_surplus: number;
  club_matches: number;
  seasons: IntlSeasonRow[];
};

export type IntlCountryFile = {
  meta: IntlMeta;
  best: IntlSeasonRow[];
  worst: IntlSeasonRow[];
  clubs: IntlClub[];
};

export type IntlCountrySummary = {
  slug: string;
  country: string;
  competition: string;
  seasons: [string, string];
  season_count: number;
  matches: number;
  clubs: number;
  log_loss: number;
  baseline_log_loss: number;
  skill_vs_era_baseline: number;
  missing_seasons: number;
  partial_seasons: number;
};

export type IntlIndex = {
  generated_at: string;
  source_credit: string;
  countries: IntlCountrySummary[];
};

/** The payload slugs, which are file names and not country slugs: "holland"
 *  is the Netherlands. Country display names come from meta.country. */
export const INTL_LEAGUE_SLUGS = ["spain", "italy", "germany", "france", "holland"] as const;
export type IntlLeagueSlug = (typeof INTL_LEAGUE_SLUGS)[number];

/** Used only for prose ("the Spanish and Italian top flights"). A country
 *  absent from this map falls back to its own name, never to a guess. */
const DEMONYM: Record<string, string> = {
  Spain: "Spanish",
  Italy: "Italian",
  Germany: "German",
  France: "French",
  Netherlands: "Dutch",
  England: "English",
};

export function leagueAdjective(country: string): string {
  return DEMONYM[country] ?? country;
}

/** "Spanish, Italian and Dutch", an Oxford-comma-free list for running prose. */
export function joinCountries(countries: string[]): string {
  const a = countries.map(leagueAdjective);
  if (a.length <= 1) return a[0] ?? "";
  return `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`;
}

export type IntlMetroRow = {
  metro: string;
  metro_slug: string;
  /** Match points earned minus expected, summed over every club-season here. */
  surplus: number;
  club_matches: number;
  clubs: number;
  /** Country display names, in league order. */
  countries: string[];
  /** The earliest season any club here played, across those leagues. */
  first_season: string;
};

export type IntlClubCaveat = {
  season: string;
  kind: "partial" | "grouped" | "supplemented";
  reason: string;
};

export type IntlClubEntry = {
  /** The club's LATEST era name, which is what the club page calls it. */
  club: string;
  /** Every name it has played under in this league, oldest first. */
  names: string[];
  slug: string;
  metro: string | null;
  metro_slug: string | null;
  country: string;
  competition: string;
  total_surplus: number;
  club_matches: number;
  seasons: IntlSeasonRow[];
  best: IntlSeasonRow;
  worst: IntlSeasonRow;
  win_pts_three_from: string | null;
  /** Only the seasons THIS club played whose table is not final. */
  caveats: IntlClubCaveat[];
};

export type IntlLeagueBoard = {
  slug: IntlLeagueSlug;
  country: string;
  competition: string;
  best: IntlSeasonRow[];
  worst: IntlSeasonRow[];
};

/** A best/worst row carrying the league it came from, and the club page it
 *  belongs to when the era name resolves to exactly one club in that league. */
export type IntlBoardRow = IntlSeasonRow & {
  country: string;
  competition: string;
  /** null when the era name is ambiguous or the club has no page. Never guessed. */
  slug: string | null;
};

export type IntlDerived = {
  metas: IntlMeta[];
  boards: IntlLeagueBoard[];
  /** The five leagues' best seasons merged and ranked by MATCH points, the
   *  only unit comparable across leagues that switched to three points for a
   *  win in three different seasons. */
  best_seasons: IntlBoardRow[];
  worst_seasons: IntlBoardRow[];
  metros: IntlMetroRow[];
  clubs: Map<string, IntlClubEntry>;
  totals: {
    leagues: number;
    matches: number;
    seasons: number;
    clubs: number;
    metros: number;
    /** The earliest season in any of the five. */
    first_season: string;
    last_season: string;
    /** The newest build stamp across the five payloads. */
    generated_at: string;
    source_credit: string;
  };
};

const GH_BASE =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data";

async function load<T>(file: string, ok: (remote: T) => boolean): Promise<T | null> {
  let local: T | null = null;
  try {
    local = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", file), "utf-8"),
    ) as T;
  } catch {
    /* no build-time copy */
  }
  try {
    const res = await fetch(`${GH_BASE}/${file}`, {
      next: { revalidate: 86400, tags: ["intl-expectation"] },
    });
    if (res.ok) {
      const remote = (await res.json()) as T;
      if (ok(remote)) return remote;
    }
  } catch {
    /* offline: local only */
  }
  return local;
}

export async function getIntlExpectationIndex(): Promise<IntlIndex | null> {
  return load<IntlIndex>("football/expectation/intl/index.json", (r) =>
    Boolean(r?.countries?.length),
  );
}

async function loadCountry(slug: IntlLeagueSlug): Promise<IntlCountryFile | null> {
  return load<IntlCountryFile>(`football/expectation/intl/${slug}.json`, (r) =>
    Boolean(r?.meta?.country && Array.isArray(r?.clubs) && r.clubs.length > 0),
  );
}

// One derivation per server process, held as the in-flight promise so 4,314
// metro pages and 1,460 club pages share a single parse of the five payloads.
// Lazy, so it never enters the build graph.
let _derived: Promise<IntlDerived | null> | null = null;

function pickCaveats(meta: IntlMeta, seasons: IntlSeasonRow[]): IntlClubCaveat[] {
  const played = new Set(seasons.map((s) => s.season));
  const out: IntlClubCaveat[] = [];
  for (const p of meta.partial_seasons ?? [])
    if (played.has(p.season)) out.push({ season: p.season, kind: "partial", reason: p.reason });
  for (const g of meta.grouped_seasons ?? [])
    if (played.has(g.season)) out.push({ season: g.season, kind: "grouped", reason: g.reason });
  for (const s of meta.supplemented_seasons ?? [])
    if (played.has(s.season))
      out.push({ season: s.season, kind: "supplemented", reason: `results supplied from ${s.source}` });
  return out.sort((a, b) => a.season.localeCompare(b.season));
}

async function derive(): Promise<IntlDerived | null> {
  const files = (
    await Promise.all(INTL_LEAGUE_SLUGS.map((s) => loadCountry(s).catch(() => null)))
  ).map((f, i) => [INTL_LEAGUE_SLUGS[i], f] as const);

  const present = files.filter((p): p is readonly [IntlLeagueSlug, IntlCountryFile] => p[1] !== null);
  if (!present.length) return null;

  const metas = present.map(([, f]) => f.meta);
  const boards: IntlLeagueBoard[] = present.map(([slug, f]) => ({
    slug,
    country: f.meta.country,
    competition: f.meta.competition,
    best: f.best ?? [],
    worst: f.worst ?? [],
  }));

  const byMetro = new Map<string, IntlMetroRow>();
  const clubs = new Map<string, IntlClubEntry>();
  // Keyed by `${league}|${slug}`, because a slug is only unique inside a league.
  const pending = new Map<string, { slug: string; meta: IntlMeta; rows: IntlClub[] }>();
  // The best/worst boards carry the ERA name and no slug. Resolving one means
  // matching that name inside the same league's own club list, which is the
  // same source rather than a guess. A name claimed by two clubs resolves to
  // NOTHING: an ambiguous link is worse than an unlinked name.
  const eraSlug = new Map<string, string | null>();

  for (const [lslug, f] of present) {
    for (const c of f.clubs) {
      if (c.slug) {
        for (const nm of new Set([c.club, ...c.seasons.map((s2) => s2.club)])) {
          const k = `${lslug}|${nm}`;
          eraSlug.set(k, eraSlug.has(k) && eraSlug.get(k) !== c.slug ? null : c.slug);
        }
      }
      if (c.metro_slug && c.metro) {
        const row =
          byMetro.get(c.metro_slug) ??
          {
            metro: c.metro,
            metro_slug: c.metro_slug,
            surplus: 0,
            club_matches: 0,
            clubs: 0,
            countries: [],
            first_season: c.seasons[0]?.season ?? "",
          };
        row.surplus += c.total_surplus;
        row.club_matches += c.club_matches;
        row.clubs += 1;
        if (!row.countries.includes(f.meta.country)) row.countries.push(f.meta.country);
        const first = c.seasons[0]?.season ?? "";
        if (first && (!row.first_season || first < row.first_season)) row.first_season = first;
        byMetro.set(c.metro_slug, row);
      }

      // 🔴 A club with no slug has a metro and NO club page. It contributes to
      // the metro rollup and must never be linked or stubbed.
      if (!c.slug || !c.seasons.length) continue;
      // 🔴 MERGE, NEVER FIRST-WINS. 21 slugs are claimed by two or more ledger
      // rows, every one of them the same club under an earlier name inside the
      // same league (Feijenoord then Feyenoord, four spellings of Red Star).
      // Keeping only the first silently drops 17 Feyenoord seasons. Measured
      // 2026-09-06: no two rows sharing a slug claim the same season, and none
      // disagrees about the metro, so concatenating is safe and summing is right.
      const k = `${lslug}|${c.slug}`;
      const p = pending.get(k) ?? { slug: c.slug, meta: f.meta, rows: [] };
      p.rows.push(c);
      pending.set(k, p);
    }
  }

  for (const p of pending.values()) {
    const rows = [...p.rows].sort((a, b) =>
      (a.seasons[0]?.season ?? "").localeCompare(b.seasons[0]?.season ?? ""),
    );
    const seasons = rows
      .flatMap((r) => r.seasons)
      .sort((a, b) => a.season.localeCompare(b.season));
    if (!seasons.length) continue;
    const latest = rows[rows.length - 1];
    clubs.set(p.slug, {
      club: latest.club,
      names: rows.map((r) => r.club),
      slug: p.slug,
      metro: latest.metro,
      metro_slug: latest.metro_slug,
      country: p.meta.country,
      competition: p.meta.competition,
      total_surplus: rows.reduce((a, r) => a + r.total_surplus, 0),
      club_matches: rows.reduce((a, r) => a + r.club_matches, 0),
      seasons,
      best: seasons.reduce((a, b) => (b.diff > a.diff ? b : a)),
      worst: seasons.reduce((a, b) => (b.diff < a.diff ? b : a)),
      win_pts_three_from: p.meta.win_pts_three_from ?? null,
      caveats: pickCaveats(p.meta, seasons),
    });
  }

  const flat = (pick: (b: IntlLeagueBoard) => IntlSeasonRow[]): IntlBoardRow[] =>
    boards.flatMap((b) =>
      pick(b).map((r) => ({
        ...r,
        country: b.country,
        competition: b.competition,
        slug: eraSlug.get(`${b.slug}|${r.club}`) ?? null,
      })),
    );
  const best_seasons = flat((b) => b.best).sort((a, b) => b.surplus - a.surplus);
  const worst_seasons = flat((b) => b.worst).sort((a, b) => a.surplus - b.surplus);

  const metros = [...byMetro.values()].sort((a, b) => b.surplus - a.surplus);
  const firsts = metas.map((m) => m.seasons[0]).filter(Boolean).sort();
  const lasts = metas.map((m) => m.seasons[1]).filter(Boolean).sort();

  return {
    metas,
    boards,
    best_seasons,
    worst_seasons,
    metros,
    clubs,
    totals: {
      leagues: metas.length,
      matches: metas.reduce((a, m) => a + m.matches, 0),
      seasons: metas.reduce((a, m) => a + m.season_count, 0),
      clubs: metas.reduce((a, m) => a + m.clubs, 0),
      metros: metros.length,
      first_season: firsts[0] ?? "",
      last_season: lasts[lasts.length - 1] ?? "",
      generated_at: metas.map((m) => m.generated_at).sort().slice(-1)[0] ?? "",
      source_credit: metas[0]?.source_credit ?? "",
    },
  };
}

export async function getIntlExpectation(): Promise<IntlDerived | null> {
  if (!_derived) _derived = derive().catch(() => null);
  return _derived;
}

/** One metro's continental surplus, or null when no club of these five
 *  leagues has ever been based there. */
export async function getIntlExpectationMetro(metroSlug: string): Promise<IntlMetroRow | null> {
  if (!metroSlug) return null;
  const d = await getIntlExpectation();
  return d?.metros.find((m) => m.metro_slug === metroSlug) ?? null;
}

/** One club's continental series, or null for the great majority of club
 *  pages, which have never played in one of these five top flights. */
export async function getIntlExpectationClub(slug: string): Promise<IntlClubEntry | null> {
  if (!slug) return null;
  const d = await getIntlExpectation();
  return d?.clubs.get(slug) ?? null;
}
