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

export type Pop2100IndexRow = {
  slug: string;
  iso3: string;
  name: string;
  /** One integer per year from `_meta.path_start` to `_meta.end`: UN estimates to `_meta.last_estimate`, the median after. */
  path: number[];
} & PopFacts;

/** The value on a row's path at `year`, or null outside it; `pathStart` is `_meta.path_start`. */
export function pathAt(row: { path: number[] }, pathStart: number, year: number): number | null {
  const i = year - pathStart;
  return i >= 0 && i < row.path.length ? row.path[i] : null;
}

/**
 * A bloc on the 2100 board: a membership summed year by year on the median.
 *
 * 🔴 MEDIANS ADD, BANDS DO NOT. The sum of member medians is a fair reading
 * of the bloc's median path; the prediction intervals are per-country and
 * correlated in ways the UN does not publish, so a bloc has no band and the
 * cell says so rather than adding widths. Peak is read off the summed path
 * from `pathStart`; "past" means the peak year is within the estimates.
 */
export type Pop2100Bloc = {
  key: string;
  name: string;
  /** "org" for a tracked organisation's current members; "proposed" for a hypothetical. */
  kind: "org" | "proposed";
  /** One line on where the membership comes from or what the proposal is. */
  note: string;
  href: string | null;
  members: string[];
  /** Members with no UN row (territories the UN folds into a parent). */
  missing: string[];
  path: number[];
  base: number;
  y2050: number;
  y2100: number;
  multiple2100: number | null;
  peak: { year: number; value: number; past: boolean };
  declineFrom: number | null;
};

export function aggregateBloc(
  rows: Pop2100IndexRow[],
  meta: { pathStart: number; baseYear: number; lastEstimate: number; nowPop?: Record<string, number> },
  def: { key: string; name: string; kind: "org" | "proposed"; note: string; href: string | null; members: string[] },
): Pop2100Bloc | null {
  const { pathStart, baseYear, lastEstimate, nowPop } = meta;
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const present = def.members.filter((m) => bySlug.has(m));
  const missing = def.members.filter((m) => !bySlug.has(m));
  if (!present.length) return null;
  const n = bySlug.get(present[0])!.path.length;
  const path = Array.from({ length: n }, (_, k) => present.reduce((a, m) => a + (bySlug.get(m)!.path[k] ?? 0), 0));
  let pk = 0;
  for (let k = 1; k < n; k++) if (path[k] > path[pk]) pk = k;
  const at = (year: number) => path[Math.min(Math.max(year - pathStart, 0), n - 1)];
  // "Today" is the population this site tracks for each member (countries.json,
  // official estimates), summed, with the UN path standing in for a member it
  // lacks; the multiple is 2100 over that.
  const yb = Math.min(Math.max(baseYear - pathStart, 0), n - 1);
  const base = nowPop
    ? present.reduce((a, m) => a + (nowPop[m] ?? bySlug.get(m)!.path[yb] ?? 0), 0)
    : at(baseYear);
  // The first projected year from which the sum never rises again.
  let decline: number | null = null;
  for (let k = lastEstimate + 1 - pathStart; k < n; k++) {
    if (k > 0 && path[k] <= path[k - 1] && path.slice(k).every((v, i, a) => i === 0 || v <= a[i - 1])) { decline = pathStart + k; break; }
  }
  return {
    key: def.key, name: def.name, kind: def.kind, note: def.note, href: def.href,
    members: present, missing, path,
    base, y2050: at(2050), y2100: at(2100),
    multiple2100: base ? +(at(2100) / base).toFixed(3) : null,
    peak: { year: pathStart + pk, value: path[pk], past: pathStart + pk <= lastEstimate },
    declineFrom: decline,
  };
}

/**
 * Hypothetical aggregations: a proposed state or union that does not exist
 * yet, summed from its would-be members. The precedent row (Ashwin,
 * 2026-09-10) is the East African Federation; add others here with the
 * membership the proposal actually names, never a guess. Splits (a Catalonia
 * out of Spain, a Scotland out of the UK) are not modelled: the UN publishes
 * no sub-national projections and a share of a national path is not one.
 */
export const PROPOSED_BLOCS: { key: string; name: string; note: string; href: string | null; members: string[] }[] = [
  {
    key: "east-african-federation",
    name: "East African Federation",
    note: "Proposed political federation of the East African Community's eight partner states (Burundi, DR Congo, Kenya, Rwanda, Somalia, South Sudan, Tanzania, Uganda); a draft constitution has been in preparation since 2018.",
    href: "https://en.wikipedia.org/wiki/East_African_Federation",
    members: ["burundi", "congo-dr", "kenya", "rwanda", "somalia", "south-sudan", "tanzania", "uganda"],
  },
  {
    key: "union-state",
    name: "Union State of Russia and Belarus",
    note: "A supranational union under the 1999 treaty, with integration programmes renewed in 2021 and 2024; the two states summed as the treaty envisages.",
    href: "https://en.wikipedia.org/wiki/Union_State",
    members: ["russia", "belarus"],
  },
  {
    key: "korea-unified",
    name: "Korea, unified",
    note: "Reunification is the declared long-term policy of the Republic of Korea, which keeps a Ministry of Unification for it; the North withdrew its own unification aim in 2024. Both states summed.",
    href: "https://en.wikipedia.org/wiki/Korean_reunification",
    members: ["south-korea", "north-korea"],
  },
  {
    key: "romania-moldova",
    name: "Romania and Moldova, united",
    note: "A unionist movement with parties on both sides of the Prut and a recurring share of Moldovan opinion behind it; not the policy of either government. Both states summed.",
    href: "https://en.wikipedia.org/wiki/Unification_of_Romania_and_Moldova",
    members: ["romania", "moldova"],
  },
];

export type Pop2100Index = {
  _meta: { asOf: string; revision: string; last_estimate: number; end: number; base_year: number; path_start: number; source_credit: string; generated_at: string };
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
