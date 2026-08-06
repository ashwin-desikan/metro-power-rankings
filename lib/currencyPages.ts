// Which currencies have an individual history page at /business/currencies/[code].
//
// Single source of truth for the twenty majors. The card grid on
// /business/currencies is driven by fx.majors in the data file, the static
// params for the detail route are driven by this list, and country pages use
// currencyHref() to decide whether a country's currency deep-links to its own
// chart or falls back to the currencies index.
//
// Adding a major means three things in step: MAJORS in
// scripts/business/build_fx.py, a seeded series file in
// public/data/business/fx-series/{code}.json, and this list. USD is
// deliberately absent - it is the base of every quote, so it has no page.

export const CURRENCY_PAGE_CODES = [
  "eur", "gbp", "jpy", "cny", "inr", "chf", "cad", "aud", "krw", "brl",
  "mxn", "sgd", "hkd", "sek", "nok", "zar", "try", "pln", "aed", "sar",
] as const;

export type CurrencyPageCode = (typeof CURRENCY_PAGE_CODES)[number];

const PAGED = new Set<string>(CURRENCY_PAGE_CODES);

export const CURRENCIES_INDEX = "/business/currencies";

/** True when `iso` (any case, may be null) has its own currency page. */
export function hasCurrencyPage(iso: string | null | undefined): boolean {
  return PAGED.has((iso ?? "").trim().toLowerCase());
}

/**
 * Destination for a currency ISO code. The detail page when one exists,
 * otherwise the currencies index - which is also where USD, the unpaged
 * base currency, and the handful of Wikidata rows carrying a numeric code
 * instead of an alphabetic one end up.
 */
export function currencyHref(iso: string | null | undefined): string {
  const code = (iso ?? "").trim().toLowerCase();
  return PAGED.has(code) ? `${CURRENCIES_INDEX}/${code}` : CURRENCIES_INDEX;
}
