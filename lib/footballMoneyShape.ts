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

// ---------------------------------------------------------------- the frontier
//
// Money against football, one dot per club and season. x is the season's
// surplus from the Against Expectation ledger (match points earned minus
// expected, a win counting one, a draw a half: era-neutral and the same unit
// on every club page). y is the season's appreciation: squad value gained
// beyond the net spend. A club above and to the right of another did both
// things better that season. The Pareto set is every club-season no other
// one beats on BOTH axes; that is the frontier, and it is drawn, never
// fitted, because a fitted curve claims a relationship the data does not
// have to carry.
//
// 🔴 SURPLUS IS COMPARABLE WITHIN A LEAGUE AND ONLY LOOSELY ACROSS LEAGUES
// (lib/clubValue.ts, same rule). The chart puts all six on one plane because
// the argument is money against football, not league against league; the
// readout always names the league, and nothing here ranks across leagues.

export type FrontierPoint = {
  slug: string;
  club: string;
  country: string;
  leagueSlug: MoneyLeagueSlug;
  season: string;
  /** Match points above expectation that season (win 1, draw 0.5). */
  surplus: number;
  /** Squad value gained beyond the net spend, EUR millions. */
  appreciation: number;
  spent: number;
  net: number;
  /** True when no other point beats this one on both axes. */
  frontier: boolean;
};

/** slug -> season -> surplus, from whichever expectation ledgers are loaded. */
export type SurplusLookup = ReadonlyMap<string, ReadonlyMap<string, number>>;

/**
 * Every priced club-season that also has a ledger row, full seasons only.
 * `frontier` is set on the Pareto set (maximise both axes). Sorted by season
 * then club so the client component's order is stable.
 */
export function moneyFrontierPoints(
  files: readonly (readonly [MoneyLeagueSlug, MoneyCountryFile])[],
  surplus: SurplusLookup,
  lastFullSeason: string = MONEY_LAST_FULL_SEASON,
): FrontierPoint[] {
  const out: FrontierPoint[] = [];
  for (const [leagueSlug, f] of files) {
    for (const c of f.clubs) {
      if (!c.slug) continue;
      const bySeason = surplus.get(c.slug);
      if (!bySeason) continue;
      for (const s of c.seasons) {
        if (s.season > lastFullSeason || s.appreciation == null) continue;
        const x = bySeason.get(s.season);
        if (x == null || !Number.isFinite(x)) continue;
        out.push({
          slug: c.slug,
          club: c.club,
          country: f.meta.country,
          leagueSlug,
          season: s.season,
          surplus: x,
          appreciation: s.appreciation,
          spent: s.spent,
          net: s.net,
          frontier: false,
        });
      }
    }
  }
  for (const i of paretoFrontier(out)) out[i].frontier = true;
  return out.sort((a, b) => a.season.localeCompare(b.season) || a.club.localeCompare(b.club));
}

/**
 * Indices of the Pareto set for "more surplus AND more appreciation": walk the
 * points from the highest surplus down and keep each one whose appreciation
 * beats every point already kept. Ties on surplus keep the higher
 * appreciation only. Returned in descending-surplus order, so joining them
 * in sequence draws the frontier from right to left.
 */
export function paretoFrontier(points: readonly { surplus: number; appreciation: number }[]): number[] {
  const order = points
    .map((p, i) => i)
    .sort((a, b) => points[b].surplus - points[a].surplus || points[b].appreciation - points[a].appreciation);
  const kept: number[] = [];
  let best = -Infinity;
  for (const i of order) {
    if (points[i].appreciation > best) {
      kept.push(i);
      best = points[i].appreciation;
    }
  }
  return kept;
}

/**
 * The frontier packed for the client: club identity once, season strings
 * once, then one short tuple per point, so 2,000 dots travel as ~50 KB of
 * RSC payload rather than 250 KB of repeated strings.
 * Tuple: [clubIndex, seasonIndex, surplus, appreciation, spent, net, frontier 0/1].
 */
export type PackedFrontier = {
  clubs: { slug: string; club: string; country: string; leagueSlug: MoneyLeagueSlug }[];
  seasons: string[];
  pts: [number, number, number, number, number, number, 0 | 1][];
};

export function packFrontier(points: readonly FrontierPoint[]): PackedFrontier {
  const clubs: PackedFrontier["clubs"] = [];
  const clubIdx = new Map<string, number>();
  const seasons: string[] = [];
  const seasonIdx = new Map<string, number>();
  const pts: PackedFrontier["pts"] = [];
  for (const p of points) {
    let ci = clubIdx.get(p.slug);
    if (ci == null) {
      ci = clubs.length;
      clubIdx.set(p.slug, ci);
      clubs.push({ slug: p.slug, club: p.club, country: p.country, leagueSlug: p.leagueSlug });
    }
    let si = seasonIdx.get(p.season);
    if (si == null) {
      si = seasons.length;
      seasonIdx.set(p.season, si);
      seasons.push(p.season);
    }
    pts.push([ci, si, round1(p.surplus), round1(p.appreciation), round1(p.spent), round1(p.net), p.frontier ? 1 : 0]);
  }
  return { clubs, seasons, pts };
}

export function unpackFrontier(packed: PackedFrontier): FrontierPoint[] {
  return packed.pts.map(([ci, si, surplus, appreciation, spent, net, f]) => ({
    ...packed.clubs[ci],
    season: packed.seasons[si],
    surplus,
    appreciation,
    spent,
    net,
    frontier: f === 1,
  }));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
