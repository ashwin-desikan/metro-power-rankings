// Pure squad-value logic: no "server-only", no fs, no fetch. Split out of
// lib/clubValue.ts so this can be unit tested directly (a "server-only"
// import throws for real once the real npm package is resolved outside a
// bundler's react-server condition, which is exactly what plain Node/Vitest
// does — the same reason lib/standingsShape.ts exists next to lib/standings.ts).
// lib/clubValue.ts re-exports everything here plus the IO wrappers.

export type ValueMonth = { m: string; v: number | null; n: number };

export type ClubValueRecord = {
  club: string;
  slug: string;
  metro: string | null;
  metro_slug: string | null;
  metro_method?: string;
  /** First month with a valued squad, "YYYY-MM". */
  first: string;
  last: string;
  /** Count of months in `series`, not necessarily all valued (v can be null). */
  months: number;
  /** All-time peak value, EUR millions, across the whole series. */
  peak: number;
  series: ValueMonth[];
};

export type ValueCountryMeta = {
  country: string;
  start: string;
  end: string;
  min_squad: number;
  stale_months: number;
  source_credit: string;
  generated_at: string;
};

export type ValueCountryFile = { meta: ValueCountryMeta; clubs: ClubValueRecord[] };

export type ValueIndexCountry = { slug: string; country: string; clubs: number; unmapped: number };
export type ValueIndex = {
  _meta: { asOf: string; source_credit: string };
  start: string;
  end: string;
  countries: ValueIndexCountry[];
};

/** File-name slugs (not always the site's own country slug: "holland" is
 *  the Netherlands, matching lib/intlExpectation.ts's INTL_LEAGUE_SLUGS). */
export const VALUE_LEAGUE_SLUGS = ["england", "france", "germany", "holland", "italy", "spain"] as const;
export type ValueLeagueSlug = (typeof VALUE_LEAGUE_SLUGS)[number];

/** "2024-25" -> ["2024-07", "2024-08", ..., "2025-06"], oldest first.
 *  Malformed input returns []. */
export function seasonToMonths(season: string): string[] {
  const m = /^(\d{4})-\d{2}$/.exec(season);
  if (!m) return [];
  const y = Number(m[1]);
  const out: string[] = [];
  for (let mo = 7; mo <= 12; mo++) out.push(`${y}-${String(mo).padStart(2, "0")}`);
  for (let mo = 1; mo <= 6; mo++) out.push(`${y + 1}-${String(mo).padStart(2, "0")}`);
  return out;
}

export type SeasonValueSummary = {
  /** Value at the season's first month (July), or null if unpriced/out of range. */
  start: number | null;
  /** Value at the season's last month (June), or null if unpriced/out of range. */
  end: number | null;
  /** The season's own peak across whichever months carry a value. */
  peak: number | null;
  /** The thinnest valued squad size seen during the season. */
  n_min: number | null;
};

/** One club's value inside one football season, or null when the season's
 *  window carries no series row at all (entirely outside 2012-07..2026-06,
 *  or a malformed season label). */
export function seasonValue(club: ClubValueRecord, season: string): SeasonValueSummary | null {
  const months = seasonToMonths(season);
  if (!months.length) return null;
  const byMonth = new Map(club.series.map((r) => [r.m, r]));
  const rows = months.map((m) => byMonth.get(m)).filter((r): r is ValueMonth => r != null);
  if (!rows.length) return null;
  const valued = rows.filter((r) => r.v != null) as (ValueMonth & { v: number })[];
  if (!valued.length) return { start: null, end: null, peak: null, n_min: null };
  return {
    start: byMonth.get(months[0])?.v ?? null,
    end: byMonth.get(months[months.length - 1])?.v ?? null,
    peak: Math.max(...valued.map((r) => r.v)),
    n_min: Math.min(...valued.map((r) => r.n)),
  };
}

export type ValueSurplusCandidate = {
  slug: string;
  club: string;
  country: string;
  league: string;
  /** Match points earned minus expected, that season (lib/intlExpectation's unit). */
  surplus: number;
};

export type JoinedValueSurplusRow = {
  slug: string;
  club: string;
  country: string;
  /** Competition display name: "Primera División", "Serie A", ..., or
   *  "Premier League" for England. */
  league: string;
  /** 1 = most valuable squad, WITHIN this row's league only. */
  value_rank: number;
  /** Squad value at the end of the season (June), EUR millions. */
  value_eur_m: number;
  /** Valued squad size at that same June reading. */
  n: number;
  surplus: number;
  /** 1 = biggest surplus, WITHIN this row's league only. */
  surplus_rank_in_league: number;
};

/**
 * The pure half of the join: given every candidate club-season (from
 * whichever against-expectation ledgers the caller loaded) and a slug ->
 * value-record lookup, match on slug, read the value at `endMonth`, and
 * rank WITHIN each league (never across leagues — surplus is only loosely
 * comparable across them, and mixing currencies of skill would compound
 * that).
 */
export function computeValueSurplusJoin(
  candidates: ValueSurplusCandidate[],
  valueBySlug: Map<string, ClubValueRecord>,
  endMonth: string,
): JoinedValueSurplusRow[] {
  const joined: (Omit<JoinedValueSurplusRow, "value_rank" | "surplus_rank_in_league">)[] = [];
  for (const c of candidates) {
    const record = valueBySlug.get(c.slug);
    if (!record) continue; // no priced squad for this club at all
    const monthRow = record.series.find((r) => r.m === endMonth);
    if (!monthRow || monthRow.v == null) continue; // unpriced (or below the 15-player floor) that June
    joined.push({
      slug: c.slug,
      club: c.club,
      country: c.country,
      league: c.league,
      value_eur_m: monthRow.v,
      n: monthRow.n,
      surplus: c.surplus,
    });
  }

  const byLeague = new Map<string, typeof joined>();
  for (const row of joined) {
    const arr = byLeague.get(row.league) ?? [];
    arr.push(row);
    byLeague.set(row.league, arr);
  }
  const out: JoinedValueSurplusRow[] = [];
  for (const rows of byLeague.values()) {
    const byValue = [...rows].sort((a, b) => b.value_eur_m - a.value_eur_m);
    const bySurplus = [...rows].sort((a, b) => b.surplus - a.surplus);
    const valueRank = new Map(byValue.map((r, i) => [r.slug, i + 1]));
    const surplusRank = new Map(bySurplus.map((r, i) => [r.slug, i + 1]));
    for (const r of rows) {
      out.push({
        ...r,
        value_rank: valueRank.get(r.slug)!,
        surplus_rank_in_league: surplusRank.get(r.slug)!,
      });
    }
  }
  out.sort((a, b) => b.value_eur_m - a.value_eur_m);
  return out;
}
