#!/usr/bin/env python3
"""
patch-country-indicators-wiring.py

Wires public/data/country-indicators.json (produced by build-country-indicators.py)
into lib/countries.ts and app/countries/[slug]/page.tsx.

Idempotent and anchor-asserted: every insertion checks that its anchor appears
exactly once before editing, and the whole script is a no-op if already applied.
Run from the repo root:  python3 patch-country-indicators-wiring.py
"""
import sys, os

COUNTRIES_TS = os.path.join("lib", "countries.ts")
PAGE_TSX = os.path.join("app", "countries", "[slug]", "page.tsx")


def apply_one(content, anchor, replacement, where):
    n = content.count(anchor)
    if n != 1:
        sys.exit(f"ABORT [{where}]: anchor found {n} times (expected 1). No files changed.")
    return content.replace(anchor, replacement, 1)


# ---------------------------------------------------------------- lib/countries.ts
TS_TYPE_ANCHOR = """  isoCode: string | null;
  source: string | null;
  disputed?: boolean;
};

// ---------- Memoized loaders ----------"""

TS_TYPE_NEW = """  isoCode: string | null;
  source: string | null;
  disputed?: boolean;
};

// World Bank Open Data block, sourced from public/data/country-indicators.json
// (built by scripts/build-country-indicators.py). Additive and namespaced: the
// workbook stays ground truth for pop/area/coords/continent.
export type IndicatorValue = { value: number; year: string };

export type CountryIndicators = {
  iso3: string;
  iso2: string;
  incomeLevel: string | null;
  incomeLevelId: string | null;
  wbCapital: string | null;
  indicators: {
    gdpUsd?: IndicatorValue;
    gdpPerCapitaUsd?: IndicatorValue;
    gdpPerCapitaPpp?: IndicatorValue;
    gniPerCapitaAtlas?: IndicatorValue;
    urbanPopPct?: IndicatorValue;
    popDensity?: IndicatorValue;
    lifeExpectancy?: IndicatorValue;
    giniIndex?: IndicatorValue;
    internetPct?: IndicatorValue;
    inflationPct?: IndicatorValue;
  };
};

// ---------- Memoized loaders ----------"""

TS_LOADER_ANCHOR = """export function getCountryByName(name: string): Country | undefined {
  return indices().byName.get(name);
}"""

TS_LOADER_NEW = """export function getCountryByName(name: string): Country | undefined {
  return indices().byName.get(name);
}

// World Bank indicators keyed by country slug. Tolerant of a missing file so
// the build never breaks before build-country-indicators.py has been run;
// returns null for any slug the World Bank does not publish.
let _indicators: Record<string, CountryIndicators> | null = null;
let _indicatorsTried = false;

export function getCountryIndicators(slug: string): CountryIndicators | null {
  if (!_indicatorsTried) {
    _indicatorsTried = true;
    try {
      const raw = readFileSync(
        join(process.cwd(), "public", "data", "country-indicators.json"),
        "utf-8",
      );
      const parsed = JSON.parse(raw) as {
        countries?: Record<string, CountryIndicators>;
      };
      _indicators = parsed.countries ?? {};
    } catch {
      _indicators = {};
    }
  }
  return _indicators?.[slug] ?? null;
}"""


# ---------------------------------------------------------------- page.tsx
PAGE_IMPORT_ANCHOR = """import {
  getAllCountrySlugs,
  getChildrenOf,
  getCountry,
  getMetrosForCountry,
} from "@/lib/countries";"""

PAGE_IMPORT_NEW = """import {
  getAllCountrySlugs,
  getChildrenOf,
  getCountry,
  getCountryIndicators,
  getMetrosForCountry,
} from "@/lib/countries";"""

PAGE_HELPERS_ANCHOR = """function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {"""

PAGE_HELPERS_NEW = """function fmtUsd(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function fmtUsdLarge(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toFixed(0)}`;
}

function IncomeBadge({ level }: { level: string }) {
  return (
    <span
      className="inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
      style={{ backgroundColor: "rgba(52, 211, 153, 0.16)", color: "#34d399", fontFamily: "'JetBrains Mono', monospace" }}
      title="World Bank income classification"
    >
      {level}
    </span>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {"""

PAGE_COMPUTE_ANCHOR = """  const metros = getMetrosForCountry(slug);"""

PAGE_COMPUTE_NEW = """  const metros = getMetrosForCountry(slug);
  const indicators = getCountryIndicators(slug);"""

PAGE_NAV_ANCHOR = """            const navItems = [
              ...(countryHasNationalTeams(country.name) ? [{ label: "National Teams", href: "#national-teams" }] : []),"""

PAGE_NAV_NEW = """            const navItems = [
              ...(indicators ? [{ label: "Economy", href: "#economy" }] : []),
              ...(countryHasNationalTeams(country.name) ? [{ label: "National Teams", href: "#national-teams" }] : []),"""

PAGE_SECTION_ANCHOR = """          })()}

          <NationalTeamsSection countryName={country.name} />"""

PAGE_SECTION_NEW = """          })()}

          {indicators ? (
            <section className="mb-12" id="economy">
              <div className="flex items-baseline gap-3 mb-3">
                <h2 className="text-xl font-bold">Economy and development</h2>
                {indicators.incomeLevel ? <IncomeBadge level={indicators.incomeLevel} /> : null}
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {indicators.indicators.gdpUsd ? (
                  <StatCard label="GDP" value={fmtUsdLarge(indicators.indicators.gdpUsd.value)} sub={`World Bank · ${indicators.indicators.gdpUsd.year}`} />
                ) : null}
                {indicators.indicators.gdpPerCapitaUsd ? (
                  <StatCard label="GDP per capita" value={fmtUsd(indicators.indicators.gdpPerCapitaUsd.value)} sub={`World Bank · ${indicators.indicators.gdpPerCapitaUsd.year}`} />
                ) : null}
                {indicators.indicators.gdpPerCapitaPpp ? (
                  <StatCard label="GDP/capita (PPP)" value={fmtUsd(indicators.indicators.gdpPerCapitaPpp.value)} sub={`World Bank · ${indicators.indicators.gdpPerCapitaPpp.year}`} />
                ) : null}
                {indicators.indicators.urbanPopPct ? (
                  <StatCard label="Urban population" value={`${indicators.indicators.urbanPopPct.value.toFixed(0)}%`} sub={`World Bank · ${indicators.indicators.urbanPopPct.year}`} />
                ) : null}
                {indicators.indicators.lifeExpectancy ? (
                  <StatCard label="Life expectancy" value={`${indicators.indicators.lifeExpectancy.value.toFixed(1)} yrs`} sub={`World Bank · ${indicators.indicators.lifeExpectancy.year}`} />
                ) : null}
                {indicators.indicators.popDensity ? (
                  <StatCard label="Pop. density" value={`${indicators.indicators.popDensity.value.toFixed(0)}/km²`} sub={`World Bank · ${indicators.indicators.popDensity.year}`} />
                ) : null}
                {indicators.indicators.giniIndex ? (
                  <StatCard label="Gini index" value={indicators.indicators.giniIndex.value.toFixed(1)} sub={`World Bank · ${indicators.indicators.giniIndex.year}`} />
                ) : null}
                {indicators.indicators.internetPct ? (
                  <StatCard label="Internet users" value={`${indicators.indicators.internetPct.value.toFixed(0)}%`} sub={`World Bank · ${indicators.indicators.internetPct.year}`} />
                ) : null}
                {indicators.indicators.inflationPct ? (
                  <StatCard label="Inflation" value={`${indicators.indicators.inflationPct.value.toFixed(1)}%`} sub={`World Bank · ${indicators.indicators.inflationPct.year}`} />
                ) : null}
              </div>
              <p className="text-xs text-[var(--text-dim)] mt-3">
                Source:{" "}
                <a href="https://data.worldbank.org" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--accent)]">
                  World Bank Open Data
                </a>{" "}
                (CC BY 4.0). Each figure is the most recent year the World Bank publishes for this country.
              </p>
            </section>
          ) : null}

          <NationalTeamsSection countryName={country.name} />"""


def patch_countries_ts():
    if not os.path.exists(COUNTRIES_TS):
        sys.exit(f"ABORT: {COUNTRIES_TS} not found. Run from the repo root.")
    c = open(COUNTRIES_TS, encoding="utf-8").read()
    if "getCountryIndicators" in c:
        print(f"SKIP {COUNTRIES_TS}: already wired.")
        return
    c = apply_one(c, TS_TYPE_ANCHOR, TS_TYPE_NEW, "countries.ts type")
    c = apply_one(c, TS_LOADER_ANCHOR, TS_LOADER_NEW, "countries.ts loader")
    open(COUNTRIES_TS, "w", encoding="utf-8").write(c)
    print(f"PATCHED {COUNTRIES_TS}")


def patch_page_tsx():
    if not os.path.exists(PAGE_TSX):
        sys.exit(f"ABORT: {PAGE_TSX} not found. Run from the repo root.")
    p = open(PAGE_TSX, encoding="utf-8").read()
    if "getCountryIndicators" in p:
        print(f"SKIP {PAGE_TSX}: already wired.")
        return
    p = apply_one(p, PAGE_IMPORT_ANCHOR, PAGE_IMPORT_NEW, "page import")
    p = apply_one(p, PAGE_HELPERS_ANCHOR, PAGE_HELPERS_NEW, "page helpers")
    p = apply_one(p, PAGE_COMPUTE_ANCHOR, PAGE_COMPUTE_NEW, "page compute")
    p = apply_one(p, PAGE_NAV_ANCHOR, PAGE_NAV_NEW, "page nav item")
    p = apply_one(p, PAGE_SECTION_ANCHOR, PAGE_SECTION_NEW, "page section")
    open(PAGE_TSX, "w", encoding="utf-8").write(p)
    print(f"PATCHED {PAGE_TSX}")


if __name__ == "__main__":
    patch_countries_ts()
    patch_page_tsx()
    print("Done. Now run: npx tsc --noEmit")
