// Types and pure helpers for the population-to-2100 read model
// (public/data/countries/pop2100/, built by
// scripts/countries/build_population_2100.py from UN WPP 2024). No fs here:
// client components import this file; lib/population2100.ts does the reading.

/** [year, median, lo80, hi80, lo95, hi95], persons. */
export type ProjRow = [number, number, number, number, number, number];

export type PopFacts = {
  peak: { year: number; value: number; past: boolean };
  base: { year: number; value: number | null };
  y2050: { med: number; lo80: number | null; hi80: number | null; lo95: number | null; hi95: number | null };
  y2100: { med: number; lo80: number | null; hi80: number | null; lo95: number | null; hi95: number | null };
  multiple2100: number | null;
  declineFrom: number | null;
  naturalDeclineFrom: number | null;
};

export type Pop2100 = {
  slug: string;
  iso3: string;
  name: string;
  un_name: string;
  revision: string;
  last_estimate: number;
  end: number;
  source_credit: string;
  /** [year, persons], 1950 to the last estimate. */
  estimates: [number, number][];
  projection: ProjRow[];
  scenarios: Partial<Record<"high" | "low" | "zero_migration" | "constant_fertility", [number, number][]>>;
  drivers: Partial<Record<"births" | "deaths" | "netmig" | "tfr" | "lex" | "cbr" | "cdr" | "median_age", [number, number][]>>;
  facts: PopFacts;
};

export type Pop2100IndexRow = { slug: string; iso3: string; name: string } & PopFacts;

export type Pop2100Index = {
  _meta: { asOf: string; revision: string; last_estimate: number; end: number; base_year: number; source_credit: string; generated_at: string };
  countries: Pop2100IndexRow[];
  unmatched: { iso3: string; name: string }[];
};

export function fmtPop(n: number | null | undefined): string {
  if (n == null) return "";
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}bn`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e8 ? 0 : 1)}m`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
  return String(Math.round(n));
}

/** Signed, for net migration: "+1.2m", "-340k". */
export function fmtSigned(n: number | null | undefined): string {
  if (n == null) return "";
  return `${n > 0 ? "+" : n < 0 ? "-" : ""}${fmtPop(Math.abs(n))}`;
}
