// The Money Ledger's pure half: types for scripts/football/build_transfer_ledger.py's
// payloads, the formatters every surface shares, and the two board cuts
// (one season across the six leagues; the whole span per club). No fs, no
// fetch, so Vitest can load it; lib/footballMoney.ts is the IO wrapper.
//
// 🔴 FEES ONLY, EUR MILLIONS. Wages are estimates nobody licenses. A move
// with no fee on record is COUNTED (nofee_in / nofee_out) and never priced,
// so every total renders its no-fee count beside it or a quiet window looks
// like a frugal one.
//
// 🔴 APPRECIATION IS THE ARGUMENT. (v_end - v_start) - (spent - received):
// the change in squad value once the trading is netted out. Buy 100m and end
// 100m higher is zero; end 120m higher and the club made 20m of players
// better (or the market repriced them). Null when either end of the season
// has no priced squad (the 15-player floor, or a season outside 2012-07 to
// 2026-06), never zero.
//
// 🔴 THE LAST SEASON IN THE FILE IS A STUB. The upstream paused on
// 2026-07-06, so "2026-27" holds six days of a window; `isStubSeason` is
// how a surface knows to label it and never rank on it.

export const MONEY_LEAGUE_SLUGS = ["england", "france", "germany", "holland", "italy", "spain"] as const;
export type MoneyLeagueSlug = (typeof MONEY_LEAGUE_SLUGS)[number];

export type MoneyMove = { fee: number; player: string; club: string };

export type MoneySeason = {
  season: string;
  y: number;
  spent: number;
  received: number;
  net: number;
  n_in: number;
  n_out: number;
  nofee_in: number;
  nofee_out: number;
  v_start: number | null;
  n_start: number | null;
  v_end: number | null;
  n_end: number | null;
  appreciation: number | null;
  biggest_in: MoneyMove | null;
  biggest_out: MoneyMove | null;
};

export type ClubMoneyRecord = {
  club: string;
  slug: string | null;
  /** The site's own name for the club (crest lookups key on it); null when unresolved. */
  site_name: string | null;
  metro: string | null;
  metro_slug: string | null;
  first: string;
  last: string;
  spent: number;
  received: number;
  net: number;
  appreciation: number | null;
  seasons_valued: number;
  seasons: MoneySeason[];
};

export type MoneyCountryMeta = {
  country: string;
  first_season: string;
  last_season: string;
  data_end: string;
  source_credit: string;
  generated_at: string;
};

export type MoneyCountryFile = { meta: MoneyCountryMeta; clubs: ClubMoneyRecord[] };

export type MoneyIndex = {
  _meta: { asOf: string; source_credit: string };
  first_season: string;
  last_season: string;
  countries: { slug: string; country: string; clubs: number; unmapped: number }[];
};

/** The last season a full July-to-June window exists for. */
export const MONEY_LAST_FULL_SEASON = "2025-26";
export const MONEY_FIRST_SEASON = "2012-13";

/** "2026-27" in a file whose data ends 2026-07-06 is six days of a window. */
export function isStubSeason(season: string, dataEnd: string): boolean {
  const y = Number(season.slice(0, 4));
  return dataEnd < `${y + 1}-06-30`;
}

/** €1.23b / €412m / €0m; magnitude only. */
export function fmtEurM(v: number): string {
  const a = Math.abs(v);
  return a >= 1000 ? `€${(a / 1000).toFixed(2)}b` : `€${a.toFixed(0)}m`;
}

/** +€412m / −€1.55b; a real minus sign, never a hyphen. */
export function fmtEurSigned(v: number): string {
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmtEurM(v)}`;
}

export type MoneyBoardRow = {
  club: string;
  slug: string;
  site_name: string | null;
  country: string;
  leagueSlug: MoneyLeagueSlug;
  spent: number;
  received: number;
  net: number;
  nofee: number;
  v_start: number | null;
  v_end: number | null;
  n_end: number | null;
  appreciation: number | null;
  /** 1 = most spent, WITHIN this row's league only. */
  spend_rank: number;
  /** 1 = biggest appreciation, WITHIN this row's league, among clubs with one. */
  appreciation_rank: number | null;
  /** The season's biggest arrival by fee, if any fee was paid. */
  biggest_in: MoneyMove | null;
};

/**
 * One season across whichever of the six leagues are present, one row per
 * club with a window that season, ranked within its league on spend and on
 * appreciation, and sorted on appreciation (nulls last, then by spend).
 */
export function seasonMoneyBoard(
  files: readonly (readonly [MoneyLeagueSlug, MoneyCountryFile])[],
  season: string,
): MoneyBoardRow[] {
  const out: MoneyBoardRow[] = [];
  for (const [leagueSlug, f] of files) {
    const rows: MoneyBoardRow[] = [];
    for (const c of f.clubs) {
      if (!c.slug) continue;
      const s = c.seasons.find((x) => x.season === season);
      if (!s) continue;
      rows.push({
        club: c.club,
        slug: c.slug,
        site_name: c.site_name ?? null,
        country: f.meta.country,
        leagueSlug,
        spent: s.spent,
        received: s.received,
        net: s.net,
        nofee: s.nofee_in + s.nofee_out,
        v_start: s.v_start,
        v_end: s.v_end,
        n_end: s.n_end,
        appreciation: s.appreciation,
        spend_rank: 0,
        appreciation_rank: null,
        biggest_in: s.biggest_in,
      });
    }
    const bySpend = [...rows].sort((a, b) => b.spent - a.spent);
    bySpend.forEach((r, i) => (r.spend_rank = i + 1));
    const byAppr = rows
      .filter((r) => r.appreciation != null)
      .sort((a, b) => (b.appreciation as number) - (a.appreciation as number));
    byAppr.forEach((r, i) => (r.appreciation_rank = i + 1));
    out.push(...rows);
  }
  return out.sort(
    (a, b) =>
      (b.appreciation ?? -Infinity) - (a.appreciation ?? -Infinity) || b.spent - a.spent,
  );
}

export type MoneySpanRow = {
  club: string;
  slug: string;
  site_name: string | null;
  country: string;
  leagueSlug: MoneyLeagueSlug;
  first: string;
  last: string;
  spent: number;
  received: number;
  net: number;
  appreciation: number | null;
  seasons_valued: number;
  /** Appreciation per euro spent, as a percentage; null below a 50m spend floor. */
  return_pct: number | null;
};

/** The whole span per club, full seasons only, for the league board. */
export function spanMoneyBoard(
  files: readonly (readonly [MoneyLeagueSlug, MoneyCountryFile])[],
  lastFullSeason: string = MONEY_LAST_FULL_SEASON,
): MoneySpanRow[] {
  const out: MoneySpanRow[] = [];
  for (const [leagueSlug, f] of files) {
    for (const c of f.clubs) {
      if (!c.slug) continue;
      const full = c.seasons.filter((s) => s.season <= lastFullSeason);
      if (!full.length) continue;
      const spent = full.reduce((a, s) => a + s.spent, 0);
      const received = full.reduce((a, s) => a + s.received, 0);
      const valued = full.filter((s) => s.appreciation != null);
      const appreciation = valued.length
        ? valued.reduce((a, s) => a + (s.appreciation as number), 0)
        : null;
      out.push({
        club: c.club,
        slug: c.slug,
        site_name: c.site_name ?? null,
        country: f.meta.country,
        leagueSlug,
        first: full[0].season,
        last: full[full.length - 1].season,
        spent,
        received,
        net: received - spent,
        appreciation,
        seasons_valued: valued.length,
        // 🔴 A 50m FLOOR. A club that spent 8m and gained 40m of value is a
        // 500% return that says nothing about its trading; the ratio is only
        // a comparison once the denominator is a real programme of spending.
        return_pct: appreciation != null && spent >= 50 ? (appreciation / spent) * 100 : null,
      });
    }
  }
  return out.sort(
    (a, b) =>
      (b.appreciation ?? -Infinity) - (a.appreciation ?? -Infinity) || b.spent - a.spent,
  );
}
