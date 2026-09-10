import "server-only";
import { readFileSync } from "fs";
import { join } from "path";
import {
  MONEY_LEAGUE_SLUGS,
  seasonMoneyBoard,
  spanMoneyBoard,
  type ClubMoneyRecord,
  type MoneyBoardRow,
  type MoneyCountryFile,
  type MoneyIndex,
  type MoneyLeagueSlug,
  type MoneySpanRow,
} from "./footballMoneyShape";

// The Money Ledger: transfer fees paid and received per club and season,
// joined to the squad-value series, for the six leagues lib/clubValue.ts
// covers. Built by scripts/football/build_transfer_ledger.py; the pure half
// (types, boards, formatters) lives in lib/footballMoneyShape.ts.
//
// 🔴 SAME IO PATTERN AS lib/clubValue.ts: six payloads plus an index, GitHub
// raw first with the build-time copy as fallback, parsed once per server
// process. Each readFileSync spells every literal directory segment and
// leaves only the leaf dynamic, so the Vercel tracer scopes the route to
// public/data/football/money/* (scripts/DATA-READS-RECIPE.md).
//
// 🔴 A CLUB WITH NO LEDGER RETURNS NULL and the surface renders nothing.
// The great majority of club pages sit outside these six leagues.

export type { ClubMoneyRecord, MoneyBoardRow, MoneyCountryFile, MoneyIndex, MoneySpanRow };

const GH_BASE =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data";

async function load<T>(file: string, readLocal: () => T, ok: (remote: T) => boolean): Promise<T | null> {
  let local: T | null = null;
  try {
    local = readLocal();
  } catch {
    /* no build-time copy */
  }
  if ((process.env.NFL_DATA_LOCAL === "1" || process.env.NODE_ENV === "development") && local != null) {
    return local;
  }
  try {
    const res = await fetch(`${GH_BASE}/${file}`, { next: { revalidate: 86400, tags: ["club-money"] } });
    if (res.ok) {
      const remote = (await res.json()) as T;
      if (ok(remote)) return remote;
    }
  } catch {
    /* offline: local only */
  }
  return local;
}

export async function getMoneyIndex(): Promise<MoneyIndex | null> {
  return load<MoneyIndex>(
    "football/money/index.json",
    () =>
      JSON.parse(
        readFileSync(join(process.cwd(), "public", "data", "football", "money", "index.json"), "utf-8"),
      ),
    (r) => Boolean(r?.countries?.length),
  );
}

async function loadMoneyCountry(slug: MoneyLeagueSlug): Promise<MoneyCountryFile | null> {
  return load<MoneyCountryFile>(
    `football/money/${slug}.json`,
    () =>
      JSON.parse(
        readFileSync(join(process.cwd(), "public", "data", "football", "money", `${slug}.json`), "utf-8"),
      ),
    (r) => Boolean(r?.meta?.country && Array.isArray(r?.clubs)),
  );
}

type MoneyDerived = {
  files: (readonly [MoneyLeagueSlug, MoneyCountryFile])[];
  bySlug: Map<string, { leagueSlug: MoneyLeagueSlug; record: ClubMoneyRecord; meta: MoneyCountryFile["meta"] }>;
};

let _derived: Promise<MoneyDerived | null> | null = null;

async function derive(): Promise<MoneyDerived | null> {
  const loaded = await Promise.all(MONEY_LEAGUE_SLUGS.map((s) => loadMoneyCountry(s).catch(() => null)));
  const files = loaded
    .map((f, i) => [MONEY_LEAGUE_SLUGS[i], f] as const)
    .filter((p): p is readonly [MoneyLeagueSlug, MoneyCountryFile] => p[1] !== null);
  if (!files.length) return null;
  const bySlug: MoneyDerived["bySlug"] = new Map();
  for (const [leagueSlug, f] of files) {
    for (const c of f.clubs) {
      if (!c.slug) continue;
      bySlug.set(c.slug, { leagueSlug, record: c, meta: f.meta });
    }
  }
  return { files, bySlug };
}

async function getDerived(): Promise<MoneyDerived | null> {
  if (!_derived) _derived = derive().catch(() => null);
  return _derived;
}

/** One club's ledger with its country file's meta, or null. */
export async function getClubMoneyBySlug(
  slug: string,
): Promise<{ record: ClubMoneyRecord; meta: MoneyCountryFile["meta"] } | null> {
  if (!slug) return null;
  const d = await getDerived();
  const hit = d?.bySlug.get(slug);
  return hit ? { record: hit.record, meta: hit.meta } : null;
}

/** Every club with a window in `season` ("2024-25"-shaped), across the six leagues. */
export async function getSeasonMoneyBoard(season: string): Promise<MoneyBoardRow[]> {
  if (!/^\d{4}-\d{2}$/.test(season)) return [];
  const d = await getDerived();
  return d ? seasonMoneyBoard(d.files, season) : [];
}

/** The whole span per club, full seasons only. */
export async function getSpanMoneyBoard(): Promise<MoneySpanRow[]> {
  const d = await getDerived();
  return d ? spanMoneyBoard(d.files) : [];
}
