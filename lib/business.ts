import "server-only";
import { readFileSync } from "fs";
import { join } from "path";
import type { Metro } from "./shared";

// Business of the Metros (/business) data layer.
//   public/data/business/business.json - metro/country money tables, race to
//     $5T, weekly movers (arms itself once mktcap_valuations has 2+ snapshots),
//     Fortune Global 500 employers, curated culture owners. Built by
//     scripts/business/build_business_data.py from the mktcap Supabase tables.
//   public/data/business/sp500.json - S&P 500 constituents + selected changes,
//     parsed from Wikipedia and joined to the site universe by
//     scripts/business/build_sp500.py.
// Same read pattern as lib/plSim.ts: GitHub raw via ISR (remote wins on newer
// generated_at) with the build-time file as fallback, so weekly data-only
// commits [vercel skip] appear without a build. Crossover boards are computed
// from metros.json (the workbook ETL) so they always agree with metro pages.

export type BizCompany = {
  rank: number;
  name: string;
  symbol: string;
  cap: number;
  country: string;
  metro: string | null;
  metroSlug: string;
  source: string;
};

export type BizMetro = {
  name: string;
  slug: string;
  country: string;
  region: string;
  cap: number;
  count: number;
  top: { name: string; cap: number }[];
};

export type BizCountry = {
  name: string;
  cap: number;
  count: number;
  top: { name: string; cap: number } | null;
};

export type BizMover = {
  name: string;
  symbol: string;
  metro: string | null;
  cap: number;
  prev: number;
  chg: number;
  pct: number;
};

export type BizMetroMover = {
  metro: string;
  cap: number;
  prev: number;
  chg: number;
  pct: number;
};

export type BizEmployer = {
  name: string;
  employees: number | null;
  revenueUsd: number | null;
  metro: string | null;
  metroSlug: string;
  country: string;
};

export type BizCulture = {
  name: string;
  symbol: string;
  kind: string;
  owns: string;
  screen: boolean;
  sound: boolean;
  cap: number;
  metro: string | null;
  metroSlug: string;
};

export type BusinessFile = {
  meta: {
    as_of: string;
    generated_at: string;
    snapshots: string[];
    companies: number;
    totalCap: number;
    mappedCompanies: number;
    mappedCap: number;
    metros: number;
    countries: number;
    g500Source: string;
  };
  metros: BizMetro[];
  countries: BizCountry[];
  regions: { name: string; cap: number; count: number; metros: number }[];
  topCompanies: BizCompany[];
  race5t: (BizCompany & { pctTo5T: number })[];
  movers: {
    prev_as_of: string;
    as_of: string;
    companies: BizMover[];
    metros: BizMetroMover[];
  } | null;
  employers: BizEmployer[];
  employeesByMetro: { metro: string; slug: string; employees: number; companies: number }[];
  culture: BizCulture[];
};

export type Sp500Constituent = {
  symbol: string;
  name: string;
  sector: string;
  subIndustry: string;
  hq: string;
  hqCity: string;
  hqState: string;
  dateAdded: string;
  founded: string;
  cap: number | null;
  metro: string | null;
  metroSlug: string;
};

export type Sp500Change = {
  date: string;
  addedTicker: string;
  added: string;
  removedTicker: string;
  removed: string;
  reason: string;
};

export type Sp500File = {
  meta: { generated_at: string; source: string; count: number; matched: number };
  constituents: Sp500Constituent[];
  changes: Sp500Change[];
};

const GH_BASE =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data/business";

async function load<T extends { meta: { generated_at: string } }>(
  file: string,
): Promise<T | null> {
  let local: T | null = null;
  try {
    local = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "business", file), "utf-8"),
    ) as T;
  } catch {
    /* no build-time copy */
  }
  try {
    const res = await fetch(`${GH_BASE}/${file}`, { next: { revalidate: 21600 } }); // 6 hours
    if (res.ok) {
      const remote = (await res.json()) as T;
      if (
        remote?.meta?.generated_at &&
        (!local || remote.meta.generated_at >= local.meta.generated_at)
      )
        return remote;
    }
  } catch {
    /* offline: local only */
  }
  return local;
}

export async function getBusiness(): Promise<BusinessFile | null> {
  return load<BusinessFile>("business.json");
}

export async function getSp500(): Promise<Sp500File | null> {
  return load<Sp500File>("sp500.json");
}

// ---------------------------------------------------------------------------
// Crossovers, computed from the metro master (workbook ETL) so the sports rank
// is exactly the flagship Metro Power Rankings position and the market-cap
// figures agree with each metro's own page.

export type CrossoverRow = {
  name: string;
  slug: string;
  country: string;
  sportsRank: number;
  capRank: number | null; // null = no tracked public-company HQ at all
  cap: number;
  majorTeams: number;
};

export type Crossovers = {
  sportsOverBusiness: CrossoverRow[]; // flagship giants without the corporate weight
  businessOverSports: CrossoverRow[]; // corporate giants without the sporting weight
};

export function computeCrossovers(metros: Metro[]): Crossovers {
  const withCap = metros
    .filter((m) => (m.marketCap ?? 0) > 0)
    .sort((a, b) => b.marketCap - a.marketCap);
  const capRank = new Map<string, number>();
  withCap.forEach((m, i) => capRank.set(m.slug, i + 1));

  const row = (m: Metro): CrossoverRow => ({
    name: m.name,
    slug: m.slug,
    country: m.country,
    sportsRank: m.rank,
    capRank: capRank.get(m.slug) ?? null,
    cap: m.marketCap ?? 0,
    majorTeams: m.majorTeams ?? 0,
  });

  // Sporting giants, corporate minnows: strong flagship rank, weak (or no)
  // corporate base. Missing capRank counts as the bottom of the cap table.
  const worstCap = withCap.length + 1;
  const sportsOverBusiness = metros
    .filter((m) => m.rank <= 120)
    .map(row)
    .sort(
      (a, b) =>
        (b.capRank ?? worstCap) - b.sportsRank - ((a.capRank ?? worstCap) - a.sportsRank),
    )
    .slice(0, 12);

  // Corporate giants, sporting minnows: top-100 corporate metros whose
  // flagship rank trails their money rank the most.
  const businessOverSports = withCap
    .filter((m) => (capRank.get(m.slug) ?? worstCap) <= 100)
    .map(row)
    .sort((a, b) => b.sportsRank - (b.capRank ?? 0) - (a.sportsRank - (a.capRank ?? 0)))
    .slice(0, 12);

  return { sportsOverBusiness, businessOverSports };
}

export type StateMoneyRow = {
  state: string;
  slug: string;
  cap: number;
  companies: number;
  metros: number;
  topMetro: { name: string; slug: string; cap: number };
};

// US states by the market cap of their metros' public companies (primary state
// only - multi-state metros like New York count once, toward New York).
export function computeStateBoard(metros: Metro[]): StateMoneyRow[] {
  const states = new Map<string, StateMoneyRow>();
  for (const m of metros) {
    if (m.country !== "United States" || !(m.marketCap > 0) || !m.primaryState) continue;
    const cur = states.get(m.primaryState);
    if (cur) {
      cur.cap += m.marketCap;
      cur.companies += m.companies ?? 0;
      cur.metros += 1;
      if (m.marketCap > cur.topMetro.cap)
        cur.topMetro = { name: m.name, slug: m.slug, cap: m.marketCap };
    } else {
      states.set(m.primaryState, {
        state: m.primaryState,
        slug: m.stateSlug ?? "",
        cap: m.marketCap,
        companies: m.companies ?? 0,
        metros: 1,
        topMetro: { name: m.name, slug: m.slug, cap: m.marketCap },
      });
    }
  }
  return [...states.values()].sort((a, b) => b.cap - a.cap);
}

// ---------------------------------------------------------------------------
// Hub v2 datasets (companies universe, unicorns/private, currencies, markets)

export type CompaniesFile = {
  meta: { as_of: string; generated_at: string; count: number };
  companies: BizCompany[];
};

export type UnicornRow = {
  name: string;
  valuation: number;
  dateJoined: string;
  country: string;
  city: string;
  industry: string;
  investors: string;
  metro: string | null;
  metroSlug: string;
};

export type UnicornsFile = {
  meta: { as_of: string; generated_at: string; unicorns: number; graduated: number; private: number };
  unicorns: UnicornRow[];
  graduated: (UnicornRow & { publicCap: number | null })[];
  private: { name: string; cap: number; country: string; metro: string | null; metroSlug: string }[];
};

export type FxCurrency = {
  code: string;
  name: string;
  perUsd: number;
  usdPer: number;
  countries: { name: string; slug: string }[];
  countryCount: number;
};

export type FxFile = {
  meta: { generated_at: string; as_of: string; base: string; source: string; count: number; api_update_utc: string };
  majors: string[];
  currencies: FxCurrency[];
};

export type MarketIndex = {
  symbol: string;
  name: string;
  country: string;
  metro: string;
  metroSlug: string;
  value: number;
  date: string;
};

export type MarketCommodity = { symbol: string; name: string; unit: string; value: number; date: string };

export type MarketsFile = {
  meta: { generated_at: string; as_of: string; source: string; indices: number; commodities: number; missing: string[] };
  indices: MarketIndex[];
  commodities: MarketCommodity[];
};

export type MarketsHistory = {
  meta: { source: string };
  snapshots: { date: string; values: Record<string, number> }[];
};

export async function getCompanies(): Promise<CompaniesFile | null> {
  return load<CompaniesFile>("companies.json");
}

export async function getUnicorns(): Promise<UnicornsFile | null> {
  return load<UnicornsFile>("unicorns.json");
}

export async function getFx(): Promise<FxFile | null> {
  return load<FxFile>("fx.json");
}

export async function getMarkets(): Promise<MarketsFile | null> {
  return load<MarketsFile>("markets.json");
}

// Local-only (small file, movement only matters once 2+ snapshots exist).
export function getMarketsHistory(): MarketsHistory | null {
  try {
    return JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "business", "markets-history.json"), "utf-8"),
    ) as MarketsHistory;
  } catch {
    return null;
  }
}

// Market cap vs GDP (the Buffett indicator, per country): joins the business
// country rollup to country-indicators gdpUsd via countries.json name->slug.
// Listed-company bias is real (Amsterdam effect: giant companies list where
// they like) - the page says so rather than pretending otherwise.
export type GdpRatioRow = { name: string; slug: string; cap: number; gdpUsd: number; ratio: number };

export function computeGdpBoard(bizCountries: BizCountry[]): GdpRatioRow[] {
  try {
    const dir = join(process.cwd(), "public", "data");
    const countries = JSON.parse(readFileSync(join(dir, "countries.json"), "utf-8")) as {
      name: string;
      slug: string;
    }[];
    const nameToSlug = new Map(countries.map((c) => [c.name.toLowerCase(), c.slug] as const));
    const indicators = (JSON.parse(readFileSync(join(dir, "country-indicators.json"), "utf-8"))
      .countries ?? {}) as Record<string, { indicators?: Record<string, unknown> }>;
    const rows: GdpRatioRow[] = [];
    for (const c of bizCountries) {
      const slug = nameToSlug.get(c.name.toLowerCase());
      if (!slug) continue;
      const raw = indicators[slug]?.indicators?.["gdpUsd"] as { value?: number } | number | undefined;
      const gdp = typeof raw === "number" ? raw : raw?.value;
      if (!gdp || gdp <= 0 || c.cap < 5e10) continue;
      rows.push({ name: c.name, slug, cap: c.cap, gdpUsd: gdp, ratio: c.cap / gdp });
    }
    return rows.sort((a, b) => b.ratio - a.ratio);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Business leaders (CEOs, fund chiefs, central bankers) - Wikidata-resolved by
// scripts/business/build_leaders.py, with a change log like /leaders has.

export type BizLeaderRow = {
  entity: string;
  person: string;
  personQid: string;
  since: string;
  via: string;
  symbol?: string;
  cap?: number;
  metro?: string;
  metroSlug?: string;
  kind?: string;
  country?: string;
  countrySlug?: string;
};

export type BizLeadersFile = {
  meta: { generated_at: string; as_of: string; source: string; total: number; resolved: number };
  ceos: BizLeaderRow[];
  funds: BizLeaderRow[];
  centralBanks: BizLeaderRow[];
};

export type BizLeaderChange = { date: string; group: string; entity: string; from: string; to: string };

export async function getBizLeaders(): Promise<BizLeadersFile | null> {
  return load<BizLeadersFile>("leaders.json");
}

export function getBizLeaderChanges(): BizLeaderChange[] {
  try {
    return (
      JSON.parse(
        readFileSync(join(process.cwd(), "public", "data", "business", "leaders-changes.json"), "utf-8"),
      ) as { changes: BizLeaderChange[] }
    ).changes;
  } catch {
    return [];
  }
}
