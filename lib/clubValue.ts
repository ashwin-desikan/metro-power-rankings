import "server-only";
import { readFileSync } from "fs";
import { join } from "path";
import { getIntlExpectation } from "./intlExpectation";
import { getPlExpectationClubs } from "./plExpectation";
import {
  computeValueSurplusJoin,
  seasonToMonths,
  seasonValue,
  VALUE_LEAGUE_SLUGS,
  type ClubValueRecord,
  type JoinedValueSurplusRow,
  type SeasonValueSummary,
  type ValueCountryFile,
  type ValueCountryMeta,
  type ValueIndex,
  type ValueLeagueSlug,
  type ValueMonth,
  type ValueSurplusCandidate,
} from "./clubValueShape";

// Squad market value, built from Transfermarkt via
// dcaribou/transfermarkt-datasets, for the six leagues that already carry an
// Against Expectation ledger (England plus the five continental top flights).
//
// 🔴 2012-07 TO 2026-06 ONLY. History gets the ledger, the last fourteen
// years get the money. Every payload's own `meta.start`/`meta.end` already
// enforces this at the source; nothing here widens it. A season whose window
// falls (even partly) outside that range yields fewer than 12 valued months,
// which is why `seasonValue` returns null fields for the months it cannot
// see rather than guessing a lower one from an adjacent month.
//
// 🔴 `n` IS NOT DECORATION. A club-month is null below 15 valued players
// (`meta.min_squad`), and every caller that renders a value renders the `n`
// beside it, or a thin squad reads as a cheap one.
//
// 🔴 STEP, NEVER SMOOTHED. Transfermarkt reprices globally each December and
// June and revalues continuously between, so the source line is already a
// step function. ValueStepChart draws it as one; nothing here interpolates.
//
// 🔴 THE SERIES DOES NOT START WHERE THE DATA DOES. Totals before 2012-07
// are a survivorship artefact of which players Transfermarkt had priced at
// the time, which is why the 2012-07 floor exists upstream and why nothing
// here reads a build-time copy older than that floor.
//
// 🔴 UPSTREAM HAS BEEN PAUSED SINCE JULY 2026. The series ends where it
// ends; do not synthesise a month past `meta.end`.
//
// 🔴 ISR READ, NOT A MODULE-LOAD readFileSync OF EVERYTHING. Same pattern as
// lib/intlExpectation.ts: six payloads, fetched and parsed once per server
// process, kept off the build graph.
//
// 🔴 SURPLUS IS COMPARABLE WITHIN A LEAGUE AND ONLY LOOSELY ACROSS LEAGUES.
// `joinValueAndSurplus` computes `value_rank` and `surplus_rank_in_league`
// WITHIN one league's joined clubs (see clubValueShape's computeValueSurplusJoin);
// never rank across leagues without saying so, same rule as lib/intlExpectation.ts.
//
// 🔴 THE PURE HALF LIVES IN lib/clubValueShape.ts. `import "server-only"`
// throws for real once resolved outside a bundler's react-server condition,
// which is exactly what plain Node/Vitest does, so the season-to-month
// mapping and the join's ranking logic are pure functions there with no fs
// or fetch, and this file is the thin IO wrapper around them. Test that file.

export type {
  ClubValueRecord,
  JoinedValueSurplusRow,
  SeasonValueSummary,
  ValueCountryFile,
  ValueCountryMeta,
  ValueIndex,
  ValueLeagueSlug,
  ValueMonth,
};
export { seasonToMonths, seasonValue, VALUE_LEAGUE_SLUGS };

const GH_BASE =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data";

// readLocal does the actual literal readFileSync per file (never a helper
// taking a dynamic filename) so the Vercel file tracer scopes each route to
// just the file(s) it reads. See scripts/DATA-READS-RECIPE.md.
async function load<T>(
  file: string,
  readLocal: () => T,
  ok: (remote: T) => boolean,
): Promise<T | null> {
  let local: T | null = null;
  try {
    local = readLocal();
  } catch {
    /* no build-time copy */
  }
  try {
    const res = await fetch(`${GH_BASE}/${file}`, {
      next: { revalidate: 86400, tags: ["club-value"] },
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

export async function getClubValueIndex(): Promise<ValueIndex | null> {
  return load<ValueIndex>(
    "football/value/index.json",
    () =>
      JSON.parse(
        readFileSync(join(process.cwd(), "public", "data", "football", "value", "index.json"), "utf-8"),
      ),
    (r) => Boolean(r?.countries?.length),
  );
}

async function loadValueCountry(slug: ValueLeagueSlug): Promise<ValueCountryFile | null> {
  return load<ValueCountryFile>(
    `football/value/${slug}.json`,
    () =>
      JSON.parse(
        readFileSync(
          join(process.cwd(), "public", "data", "football", "value", `${slug}.json`),
          "utf-8",
        ),
      ),
    (r) => Boolean(r?.meta?.country && Array.isArray(r?.clubs)),
  );
}

type ValueDerived = {
  /** slug -> { leagueSlug, country, record }. A slug is globally unique
   *  across these six files in practice (site club slugs), unlike the
   *  per-league era names in lib/intlExpectation.ts, so one flat map is safe. */
  bySlug: Map<string, { leagueSlug: ValueLeagueSlug; country: string; record: ClubValueRecord }>;
  metas: ValueCountryMeta[];
};

// One derivation per server process, shared the same way
// lib/intlExpectation.ts shares its five-payload parse.
let _derived: Promise<ValueDerived | null> | null = null;

async function deriveValue(): Promise<ValueDerived | null> {
  const files = (
    await Promise.all(VALUE_LEAGUE_SLUGS.map((s) => loadValueCountry(s).catch(() => null)))
  ).map((f, i) => [VALUE_LEAGUE_SLUGS[i], f] as const);
  const present = files.filter((p): p is readonly [ValueLeagueSlug, ValueCountryFile] => p[1] !== null);
  if (!present.length) return null;

  const bySlug: ValueDerived["bySlug"] = new Map();
  for (const [leagueSlug, f] of present) {
    for (const c of f.clubs) {
      if (!c.slug) continue; // unresolved upstream slug; never guessed
      bySlug.set(c.slug, { leagueSlug, country: f.meta.country, record: c });
    }
  }
  return { bySlug, metas: present.map(([, f]) => f.meta) };
}

async function getValueDerived(): Promise<ValueDerived | null> {
  if (!_derived) _derived = deriveValue().catch(() => null);
  return _derived;
}

/** One club's value series, or null when the club has no priced squad in
 *  any of these six leagues (the great majority of club pages). */
export async function getClubValueBySlug(slug: string): Promise<ClubValueRecord | null> {
  if (!slug) return null;
  const d = await getValueDerived();
  return d?.bySlug.get(slug)?.record ?? null;
}

/**
 * Every club with BOTH a value series and an against-expectation season row
 * for `season` ("2024-25"-shaped), joined on slug.
 *
 * 🔴 CONTINENTAL BY DEFAULT. The scoping note's own worked count (79 clubs
 * for 2024-25) is the five continental leagues only; passing
 * `includeEngland: true` adds the Premier League via lib/plExpectation
 * (cheap: both its clubs file and the value file are already slug-keyed,
 * no extra parse pass), but changes the joined total, so the WP4 board on
 * /sports/expectation deliberately leaves it at the default to match the
 * note's own count.
 */
export async function joinValueAndSurplus(
  season: string,
  opts?: { includeEngland?: boolean },
): Promise<JoinedValueSurplusRow[]> {
  const months = seasonToMonths(season);
  if (!months.length) return [];
  const endMonth = months[months.length - 1];

  const [valueDerived, intl, plClubs] = await Promise.all([
    getValueDerived(),
    getIntlExpectation(),
    opts?.includeEngland ? getPlExpectationClubs() : Promise.resolve(null),
  ]);
  if (!valueDerived) return [];

  const candidates: ValueSurplusCandidate[] = [];
  if (intl) {
    for (const entry of intl.clubs.values()) {
      const row = entry.seasons.find((s) => s.season === season);
      if (!row) continue;
      candidates.push({
        slug: entry.slug,
        club: entry.club,
        country: entry.country,
        league: entry.competition,
        surplus: row.surplus,
      });
    }
  }
  if (plClubs) {
    for (const [slug, entry] of Object.entries(plClubs.clubs)) {
      const row = entry.seasons.find((s) => s.season === season);
      if (!row) continue;
      candidates.push({
        slug,
        club: entry.names[entry.names.length - 1],
        country: "England",
        league: "Premier League",
        surplus: row.surplus,
      });
    }
  }

  const valueBySlug = new Map(
    [...valueDerived.bySlug.entries()].map(([slug, v]) => [slug, v.record]),
  );
  return computeValueSurplusJoin(candidates, valueBySlug, endMonth);
}
