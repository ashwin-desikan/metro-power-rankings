// Which series have an individual history page at /business/markets/[symbol].
//
// Single source of truth for the twenty indices, commodities and crypto. The static
// params for the detail route are driven by this list, and the Markets board
// uses marketHref() to decide whether a row deep-links to its own chart.
//
// Adding a series means FOUR things in step, and they are easy to get wrong:
//   1. INDICES / COMMODITIES / CRYPTO in scripts/business/build_markets.py (slug first)
//   2. a row in Supabase's market_series_meta (slug is the primary key)
//   3. a backfill: python scripts/business/load_market_series.py --only <slug>
//   4. this list
// build_markets.py's --self-test asserts its own slugs are unique and
// URL-safe; MARKET_PAGE_SLUGS below is asserted against the emitted read-model
// files by check:public-data, so a slug added here without data fails the gate
// rather than shipping a 404.
//
// FX is deliberately absent: currencies have their own board and their own
// route at /business/currencies/[code].

export const MARKET_INDEX_SLUGS = [
  "sp-500",
  "dow-jones",
  "nasdaq-composite",
  "ftse-100",
  "dax",
  "cac-40",
  "nikkei-225",
  "hang-seng",
  "sensex",
  "shanghai-composite",
  "kospi",
  "sp-tsx-composite",
  "bovespa",
] as const;

export const MARKET_COMMODITY_SLUGS = [
  "gold",
  "silver",
  "crude-oil-wti",
  "brent-crude",
  "copper",
  "natural-gas",
] as const;

// Its own list rather than an entry in COMMODITIES. Bitcoin has no country, no
// exchange and no home metro, so filing it under raw materials would put it
// beneath a heading that contradicts what this site is about. See the `crypto`
// kind in lib/business.ts.
export const MARKET_CRYPTO_SLUGS = [
  "bitcoin",
] as const;

export const MARKET_PAGE_SLUGS = [
  ...MARKET_INDEX_SLUGS,
  ...MARKET_COMMODITY_SLUGS,
  ...MARKET_CRYPTO_SLUGS,
] as const;

export type MarketPageSlug = (typeof MARKET_PAGE_SLUGS)[number];

const PAGED = new Set<string>(MARKET_PAGE_SLUGS);

export const MARKETS_INDEX = "/business/markets";
export const MARKETS_COMPARE = "/business/markets/compare";

/** True when `slug` has its own history page. */
export function hasMarketPage(slug: string | null | undefined): boolean {
  return PAGED.has((slug ?? "").trim().toLowerCase());
}

/**
 * Destination for a series slug: its own page when one exists, otherwise the
 * Markets board. `compare` is reserved for the overlay route and can never be
 * a series slug, which the assertion below enforces at import time rather than
 * leaving a silent route collision to be discovered in production.
 */
export function marketHref(slug: string | null | undefined): string {
  const s = (slug ?? "").trim().toLowerCase();
  return PAGED.has(s) ? `${MARKETS_INDEX}/${s}` : MARKETS_INDEX;
}

if (PAGED.has("compare")) {
  throw new Error("`compare` is the overlay route and cannot be a series slug");
}
