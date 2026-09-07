import "server-only";
import { getIntlExpectation } from "./intlExpectation";
import { getPlExpectationClubs, getPlExpectation } from "./plExpectation";
import {
  getClubValueIndex,
  getClubValueBySlug,
  joinValueAndSurplus,
  seasonValue,
} from "./clubValue";

// The per-SEASON view of the six against-expectation ledgers, for the 67 year
// hubs (app/teams/football/SeasonHub.tsx). lib/intlExpectation and
// lib/plExpectation are organised by CLUB; a year hub needs the opposite cut,
// so this is the transpose plus the squad-value join for the seasons that
// have one.
//
// 🔴 SURPLUS IS COMPARABLE WITHIN A LEAGUE AND ONLY LOOSELY ACROSS LEAGUES.
// Anything here that puts two leagues on one board carries CROSS_LEAGUE_NOTE
// beside it. Same rule as lib/intlExpectation.ts.
//
// 🔴 SQUAD VALUE IS 2012-07 TO 2026-06 ONLY, so the value column exists for
// seasons 2012-13 through 2025-26 and for NO OTHER SEASON. `hasValue` is
// decided per SEASON, never per row: an older hub renders no value column at
// all rather than a column of blanks. See lib/clubValue.ts.
//
// 🔴 `n` RIDES WITH EVERY VALUE. A club-month is null below 15 valued players,
// so a thin squad reads as a cheap one unless the count is beside it.
//
// 🔴 ATTRIBUTION RIDES WITH THE DATA. `sourceCredit` (engsoccerdata) must
// render wherever these surpluses do; `valueCredit` (Transfermarkt via
// dcaribou/transfermarkt-datasets) wherever the values do.

/** The first season a squad value exists for, per lib/clubValue's 2012-07 floor. */
export const VALUE_FIRST_SEASON = "2012-13";
/** The last season whose June reading is inside the 2026-06 ceiling. */
export const VALUE_LAST_SEASON = "2025-26";

export const CROSS_LEAGUE_NOTE =
  "Surplus is comparable within a league and only loosely across leagues, because league size and era differ.";

/** True when the squad-value series covers the whole of `season`. */
export function seasonHasValue(season: string): boolean {
  return season >= VALUE_FIRST_SEASON && season <= VALUE_LAST_SEASON;
}

export type SeasonLedgerLeague = {
  country: string;
  competition: string;
  /** Club slug -> match points earned minus expected, that season. */
  surplus: Map<string, number>;
  /** Club slug -> squad value at the season's June reading, with its `n`. */
  value: Map<string, { eur_m: number; n: number }>;
  /**
   * One line to print under this league's table when the season's table is
   * not final (partial or grouped), or null when it is.
   */
  note: string | null;
};

export type SeasonLedgerTop = {
  club: string;
  slug: string;
  country: string;
  competition: string;
  surplus: number;
};

export type SeasonLedger = {
  season: string;
  /** Keyed by the hub's own country name, which is what League.country carries. */
  leagues: Map<string, SeasonLedgerLeague>;
  /** Biggest surplus that season across whichever leagues are present. */
  best: SeasonLedgerTop | null;
  /** Biggest shortfall that season across the same leagues. */
  worst: SeasonLedgerTop | null;
  /** True when the value series covers this season at all. */
  hasValue: boolean;
  sourceCredit: string;
  valueCredit: string;
};

const EMPTY: SeasonLedger = {
  season: "",
  leagues: new Map(),
  best: null,
  worst: null,
  hasValue: false,
  sourceCredit: "",
  valueCredit: "",
};

/** The partial/grouped label for one league-season, or null when final. */
function noteFor(
  season: string,
  partial: { season: string; reason: string; played?: number; expected?: number }[] | undefined,
  grouped: { season: string; reason: string }[] | undefined,
): string | null {
  const p = (partial ?? []).find((x) => x.season === season);
  if (p) return `${season} is a partial season: ${p.reason}. Its surplus covers only the matches that were played.`;
  const g = (grouped ?? []).find((x) => x.season === season);
  if (g) return `${season} was not a single round-robin: ${g.reason}. Its surplus is grouped across those stages.`;
  return null;
}

/**
 * Every ledger row for one season, cut by league and keyed by club slug, plus
 * the squad-value join where the season has one.
 *
 * Cheap after the first call on a server process: both ledgers and the value
 * payloads are already parsed once and shared (lib/intlExpectation,
 * lib/plExpectation, lib/clubValue).
 */
export async function getSeasonLedger(season: string): Promise<SeasonLedger> {
  if (!/^\d{4}-\d{2}$/.test(season)) return { ...EMPTY, season };

  const [intl, plClubs, plIndex, valueIndex] = await Promise.all([
    getIntlExpectation().catch(() => null),
    getPlExpectationClubs().catch(() => null),
    getPlExpectation().catch(() => null),
    getClubValueIndex().catch(() => null),
  ]);

  const hasValue = seasonHasValue(season);
  const leagues = new Map<string, SeasonLedgerLeague>();
  const tops: SeasonLedgerTop[] = [];

  const noteByCountry = new Map<string, string | null>();
  for (const m of intl?.metas ?? []) {
    noteByCountry.set(m.country, noteFor(season, m.partial_seasons, m.grouped_seasons));
  }

  const put = (
    country: string,
    competition: string,
    slug: string,
    club: string,
    surplus: number,
  ) => {
    let lg = leagues.get(country);
    if (!lg) {
      lg = {
        country,
        competition,
        surplus: new Map(),
        value: new Map(),
        note: noteByCountry.get(country) ?? null,
      };
      leagues.set(country, lg);
    }
    lg.surplus.set(slug, surplus);
    tops.push({ club, slug, country, competition, surplus });
  };

  if (intl) {
    for (const entry of intl.clubs.values()) {
      const row = entry.seasons.find((s) => s.season === season);
      if (!row) continue;
      // The ERA name is what the club was called that season, which is what
      // the hub's own table prints beside it.
      put(entry.country, entry.competition, entry.slug, row.club, row.surplus);
    }
  }
  if (plClubs) {
    for (const [slug, entry] of Object.entries(plClubs.clubs)) {
      const row = entry.seasons.find((s) => s.season === season);
      if (!row) continue;
      put("England", "English top flight", slug, row.club, row.surplus);
    }
  }

  if (hasValue) {
    for (const lg of leagues.values()) {
      for (const slug of lg.surplus.keys()) {
        const record = await getClubValueBySlug(slug);
        if (!record) continue;
        const v = seasonValue(record, season);
        // `end` is the June reading; n_min is the thinnest valued squad the
        // season saw, and is what keeps a small squad from reading as cheap.
        if (v?.end == null || v.n_min == null) continue;
        lg.value.set(slug, { eur_m: v.end, n: v.n_min });
      }
    }
  }

  const sorted = [...tops].sort((a, b) => b.surplus - a.surplus);
  return {
    season,
    leagues,
    best: sorted[0] ?? null,
    worst: sorted.length > 1 ? sorted[sorted.length - 1] : null,
    hasValue: hasValue && [...leagues.values()].some((l) => l.value.size > 0),
    sourceCredit: intl?.totals.source_credit ?? plIndex?.meta.source ?? "",
    valueCredit: valueIndex?._meta.source_credit ?? "",
  };
}

export type LeagueSkillRow = {
  /** The league hub slug this row belongs to, e.g. "eredivisie". */
  hubSlug: string;
  country: string;
  competition: string;
  /** Log-loss improvement over that league's own era baseline. */
  skill: number;
  seasons: [string, string];
  matches: number;
};

/** League hub slug -> the country its ledger is filed under. */
export const LEAGUE_HUB_COUNTRY: Record<string, string> = {
  "premier-league": "England",
  "la-liga": "Spain",
  "serie-a": "Italy",
  bundesliga: "Germany",
  "ligue-1": "France",
  eredivisie: "Netherlands",
};

const COUNTRY_HUB_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(LEAGUE_HUB_COUNTRY).map(([k, v]) => [v, k]),
);

/**
 * The six leagues' skill against their own era baselines, read from the
 * payloads (intl index.json plus the English ledger's meta) and never
 * hardcoded, sorted most predictable first.
 */
export async function getLeagueSkillTable(): Promise<{
  rows: LeagueSkillRow[];
  sourceCredit: string;
}> {
  const [intl, pl] = await Promise.all([
    getIntlExpectation().catch(() => null),
    getPlExpectation().catch(() => null),
  ]);
  const rows: LeagueSkillRow[] = [];
  for (const m of intl?.metas ?? []) {
    const hubSlug = COUNTRY_HUB_SLUG[m.country];
    if (!hubSlug) continue;
    rows.push({
      hubSlug,
      country: m.country,
      competition: m.competition,
      skill: m.skill_vs_era_baseline,
      seasons: m.seasons,
      matches: m.matches,
    });
  }
  if (pl?.meta) {
    rows.push({
      hubSlug: "premier-league",
      country: "England",
      competition: "English top flight",
      skill: pl.meta.skill_vs_era_baseline,
      seasons: pl.meta.seasons,
      matches: pl.meta.matches,
    });
  }
  rows.sort((a, b) => b.skill - a.skill);
  return {
    rows,
    sourceCredit: intl?.totals.source_credit ?? "",
  };
}

export type ConcentrationPoint = {
  season: string;
  topClub: string;
  topSlug: string;
  /** The top club's squad value at the season's June reading, EUR millions. */
  topValue: number;
  /** Valued squad size behind that figure. */
  topN: number;
  /** Every valued club in the league that season, summed. */
  total: number;
  /** topValue / total, 0..1. */
  share: number;
  clubs: number;
};

/** Every season from 2012-13 to 2025-26, oldest first. */
function valueSeasons(): string[] {
  const out: string[] = [];
  for (let y = Number(VALUE_FIRST_SEASON.slice(0, 4)); y <= Number(VALUE_LAST_SEASON.slice(0, 4)); y++) {
    out.push(`${y}-${String((y + 1) % 100).padStart(2, "0")}`);
  }
  return out;
}

/**
 * One league's squad-value concentration, season by season: the most valuable
 * club's share of every valued club in that league that June.
 *
 * The club set is the league's own against-expectation ledger for that season
 * joined to the value series, which for a top flight is the season's field.
 * A season where fewer than four clubs price is dropped rather than reported
 * as a concentrated one.
 */
export async function getLeagueValueConcentration(
  country: string,
): Promise<{ points: ConcentrationPoint[]; valueCredit: string }> {
  const valueIndex = await getClubValueIndex().catch(() => null);
  const seasons = valueSeasons();
  const joined = await Promise.all(
    seasons.map((s) => joinValueAndSurplus(s, { includeEngland: true }).catch(() => [])),
  );
  const points: ConcentrationPoint[] = [];
  for (let i = 0; i < seasons.length; i++) {
    const rows = joined[i].filter((r) => r.country === country);
    if (rows.length < 4) continue;
    const total = rows.reduce((a, r) => a + r.value_eur_m, 0);
    if (!(total > 0)) continue;
    const top = rows.reduce((a, r) => (r.value_eur_m > a.value_eur_m ? r : a));
    points.push({
      season: seasons[i],
      topClub: top.club,
      topSlug: top.slug,
      topValue: top.value_eur_m,
      topN: top.n,
      total,
      share: top.value_eur_m / total,
      clubs: rows.length,
    });
  }
  return { points, valueCredit: valueIndex?._meta.source_credit ?? "" };
}
