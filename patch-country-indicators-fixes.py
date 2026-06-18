#!/usr/bin/env python3
"""
patch-country-indicators-fixes.py

Applies three fixes on top of the already-wired country pages
(run AFTER patch-country-indicators-wiring.py):

  1. Link the capital metro and most-important metro in the hero to /rankings/<slug>.
  2. Add an unlinked "Capital city" line in the hero (from World Bank wbCapital).
  3. Add global ranks (#rank / total) to every Economy card, with a gold star when
     the country lands in the top 5% (favourable end) of that indicator.

Idempotent and anchor-asserted. Run from the repo root:
    python3 patch-country-indicators-fixes.py
"""
import sys, os

COUNTRIES_TS = os.path.join("lib", "countries.ts")
PAGE_TSX = os.path.join("app", "countries", "[slug]", "page.tsx")


def apply_one(content, anchor, replacement, where):
    n = content.count(anchor)
    if n != 1:
        sys.exit(f"ABORT [{where}]: anchor found {n} times (expected 1). No files changed.")
    return content.replace(anchor, replacement, 1)


# ============================================================ lib/countries.ts
TS_LOADER_ANCHOR = '''export function getCountryIndicators(slug: string): CountryIndicators | null {
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
}'''

TS_LOADER_NEW = '''function loadIndicators(): Record<string, CountryIndicators> {
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
  return _indicators ?? {};
}

export function getCountryIndicators(slug: string): CountryIndicators | null {
  return loadIndicators()[slug] ?? null;
}

// Per-indicator global ranking. Direction encodes the "rank #1 is notable"
// reading: bigger is rank 1 for magnitude/attainment indicators; smaller is
// rank 1 for Gini (less inequality) and inflation (more price stability), so a
// top-5% gold mark always denotes the favourable end of the scale. Ranks are
// computed only among top-level (sovereign) countries that have the value.
export type IndicatorRank = { rank: number; total: number };

const INDICATOR_RANK_DIR: Record<string, "asc" | "desc"> = {
  gdpUsd: "desc",
  gdpPerCapitaUsd: "desc",
  gdpPerCapitaPpp: "desc",
  gniPerCapitaAtlas: "desc",
  urbanPopPct: "desc",
  popDensity: "desc",
  lifeExpectancy: "desc",
  internetPct: "desc",
  giniIndex: "asc",
  inflationPct: "asc",
};

let _indicatorRanks: Record<string, Map<string, IndicatorRank>> | null = null;

function indicatorRanks(): Record<string, Map<string, IndicatorRank>> {
  if (_indicatorRanks) return _indicatorRanks;
  const all = loadIndicators();
  const topLevel = new Set(getTopLevelCountries().map((c) => c.slug));
  const out: Record<string, Map<string, IndicatorRank>> = {};
  for (const key of Object.keys(INDICATOR_RANK_DIR)) {
    const rows: { slug: string; value: number }[] = [];
    for (const [slug, block] of Object.entries(all)) {
      if (!topLevel.has(slug)) continue;
      const iv = (block.indicators as Record<string, IndicatorValue | undefined>)[
        key
      ];
      if (iv && typeof iv.value === "number") rows.push({ slug, value: iv.value });
    }
    rows.sort((a, b) =>
      INDICATOR_RANK_DIR[key] === "desc" ? b.value - a.value : a.value - b.value,
    );
    const m = new Map<string, IndicatorRank>();
    rows.forEach((row, i) => m.set(row.slug, { rank: i + 1, total: rows.length }));
    out[key] = m;
  }
  _indicatorRanks = out;
  return out;
}

export function getIndicatorRank(slug: string, key: string): IndicatorRank | null {
  const m = indicatorRanks()[key];
  return m ? m.get(slug) ?? null : null;
}

export function isTop5pct(r: IndicatorRank | null): boolean {
  if (!r || r.total === 0) return false;
  return r.rank <= Math.max(1, Math.ceil(r.total * 0.05));
}'''


# ==================================================================== page.tsx
PAGE_IMPORT_ANCHOR = '''import {
  getAllCountrySlugs,
  getChildrenOf,
  getCountry,
  getCountryIndicators,
  getMetrosForCountry,
} from "@/lib/countries";'''

PAGE_IMPORT_NEW = '''import {
  getAllCountrySlugs,
  getChildrenOf,
  getCountry,
  getCountryIndicators,
  getIndicatorRank,
  getMetrosForCountry,
  isTop5pct,
  type CountryIndicators,
} from "@/lib/countries";'''

PAGE_STATCARD_ANCHOR = '''function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border rounded-lg p-4" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="text-xs uppercase tracking-wider text-[var(--text-dim)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{label}</div>
      <div className="text-2xl font-bold mt-1 text-[var(--text)]">{value}</div>
      {sub ? <div className="text-xs text-[var(--text-muted)] mt-1">{sub}</div> : null}
    </div>
  );
}'''

PAGE_STATCARD_NEW = '''function StatCard({ label, value, sub, rank, gold }: { label: string; value: string; sub?: string; rank?: string; gold?: boolean }) {
  return (
    <div className="border rounded-lg p-4" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs uppercase tracking-wider text-[var(--text-dim)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{label}</div>
        {rank ? (
          <span className="text-[10px] whitespace-nowrap" style={{ color: gold ? "#f59e0b" : "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace" }} title={gold ? "Top 5% globally in this category" : "Global rank in this category"}>
            {gold ? "★ " : ""}{rank}
          </span>
        ) : null}
      </div>
      <div className="text-2xl font-bold mt-1 text-[var(--text)]">{value}</div>
      {sub ? <div className="text-xs text-[var(--text-muted)] mt-1">{sub}</div> : null}
    </div>
  );
}

const ECON_INDICATORS: { key: keyof CountryIndicators["indicators"]; label: string; fmt: (n: number) => string }[] = [
  { key: "gdpUsd", label: "GDP", fmt: (n) => fmtUsdLarge(n) },
  { key: "gdpPerCapitaUsd", label: "GDP per capita", fmt: (n) => fmtUsd(n) },
  { key: "gdpPerCapitaPpp", label: "GDP/capita (PPP)", fmt: (n) => fmtUsd(n) },
  { key: "gniPerCapitaAtlas", label: "GNI/capita (Atlas)", fmt: (n) => fmtUsd(n) },
  { key: "urbanPopPct", label: "Urban population", fmt: (n) => `${n.toFixed(0)}%` },
  { key: "lifeExpectancy", label: "Life expectancy", fmt: (n) => `${n.toFixed(1)} yrs` },
  { key: "popDensity", label: "Pop. density", fmt: (n) => `${n.toFixed(0)}/km²` },
  { key: "giniIndex", label: "Gini index", fmt: (n) => n.toFixed(1) },
  { key: "internetPct", label: "Internet users", fmt: (n) => `${n.toFixed(0)}%` },
  { key: "inflationPct", label: "Inflation", fmt: (n) => `${n.toFixed(1)}%` },
];'''

PAGE_COMPUTE_ANCHOR = '''  const indicators = getCountryIndicators(slug);'''

PAGE_COMPUTE_NEW = '''  const indicators = getCountryIndicators(slug);
  const metroSlugByName = new Map(metros.map((m) => [m.name, m.slug] as const));'''


PAGE_META_ANCHOR = '''            <div className="flex flex-wrap items-center gap-3 mb-6 text-sm text-[var(--text-muted)]">
              {country.continent ? (
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: regionColors[country.continent] || "var(--text-dim)" }} />
                  {country.continent}
                </span>
              ) : null}
              {country.capital ? (<span><span className="text-[var(--text-dim)]">Capital:</span> {country.capital}</span>) : null}
              {country.mostImportantMetro && country.mostImportantMetro !== country.capital ? (
                <span><span className="text-[var(--text-dim)]">Most important metro:</span> {country.mostImportantMetro}</span>
              ) : null}
            </div>'''

PAGE_META_NEW = '''            <div className="flex flex-wrap items-center gap-3 mb-6 text-sm text-[var(--text-muted)]">
              {country.continent ? (
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: regionColors[country.continent] || "var(--text-dim)" }} />
                  {country.continent}
                </span>
              ) : null}
              {indicators?.wbCapital ? (
                <span><span className="text-[var(--text-dim)]">Capital city:</span> {indicators.wbCapital}</span>
              ) : null}
              {country.capital ? (
                <span>
                  <span className="text-[var(--text-dim)]">Capital metro:</span>{" "}
                  {metroSlugByName.has(country.capital) ? (
                    <Link href={`/rankings/${metroSlugByName.get(country.capital)}`} className="text-[var(--accent)] hover:underline">{country.capital}</Link>
                  ) : (
                    country.capital
                  )}
                </span>
              ) : null}
              {country.mostImportantMetro && country.mostImportantMetro !== country.capital ? (
                <span>
                  <span className="text-[var(--text-dim)]">Most important metro:</span>{" "}
                  {metroSlugByName.has(country.mostImportantMetro) ? (
                    <Link href={`/rankings/${metroSlugByName.get(country.mostImportantMetro)}`} className="text-[var(--accent)] hover:underline">{country.mostImportantMetro}</Link>
                  ) : (
                    country.mostImportantMetro
                  )}
                </span>
              ) : null}
            </div>'''


PAGE_CARDS_ANCHOR = '''              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
              </div>'''

PAGE_CARDS_NEW = '''              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {ECON_INDICATORS.map(({ key, label, fmt }) => {
                  const iv = indicators.indicators[key];
                  if (!iv) return null;
                  const r = getIndicatorRank(country.slug, key);
                  const gold = isTop5pct(r);
                  return (
                    <StatCard
                      key={key}
                      label={label}
                      value={fmt(iv.value)}
                      sub={`World Bank · ${iv.year}`}
                      rank={r ? `#${r.rank} / ${r.total}` : undefined}
                      gold={gold}
                    />
                  );
                })}
              </div>'''

PAGE_SOURCE_ANCHOR = '''              <p className="text-xs text-[var(--text-dim)] mt-3">
                Source:{" "}'''

PAGE_SOURCE_NEW = '''              <p className="text-xs text-[var(--text-dim)] mt-3">
                Ranks are among sovereign countries with World Bank data; ★ marks a top-5% finish. Source:{" "}'''


def patch_countries_ts():
    if not os.path.exists(COUNTRIES_TS):
        sys.exit(f"ABORT: {COUNTRIES_TS} not found. Run from the repo root.")
    c = open(COUNTRIES_TS, encoding="utf-8").read()
    if "getIndicatorRank" in c:
        print(f"SKIP {COUNTRIES_TS}: fixes already applied.")
        return
    if "getCountryIndicators" not in c:
        sys.exit(f"ABORT: {COUNTRIES_TS} missing base wiring. Run patch-country-indicators-wiring.py first.")
    c = apply_one(c, TS_LOADER_ANCHOR, TS_LOADER_NEW, "countries.ts loader+ranks")
    open(COUNTRIES_TS, "w", encoding="utf-8").write(c)
    print(f"PATCHED {COUNTRIES_TS}")


def patch_page_tsx():
    if not os.path.exists(PAGE_TSX):
        sys.exit(f"ABORT: {PAGE_TSX} not found. Run from the repo root.")
    p = open(PAGE_TSX, encoding="utf-8").read()
    if "ECON_INDICATORS" in p:
        print(f"SKIP {PAGE_TSX}: fixes already applied.")
        return
    if "getCountryIndicators" not in p:
        sys.exit(f"ABORT: {PAGE_TSX} missing base wiring. Run patch-country-indicators-wiring.py first.")
    p = apply_one(p, PAGE_IMPORT_ANCHOR, PAGE_IMPORT_NEW, "page import")
    p = apply_one(p, PAGE_STATCARD_ANCHOR, PAGE_STATCARD_NEW, "page StatCard + ECON_INDICATORS")
    p = apply_one(p, PAGE_COMPUTE_ANCHOR, PAGE_COMPUTE_NEW, "page metroSlugByName")
    p = apply_one(p, PAGE_META_ANCHOR, PAGE_META_NEW, "page hero meta row")
    p = apply_one(p, PAGE_CARDS_ANCHOR, PAGE_CARDS_NEW, "page economy cards")
    p = apply_one(p, PAGE_SOURCE_ANCHOR, PAGE_SOURCE_NEW, "page source note")
    open(PAGE_TSX, "w", encoding="utf-8").write(p)
    print(f"PATCHED {PAGE_TSX}")


if __name__ == "__main__":
    patch_countries_ts()
    patch_page_tsx()
    print("Done. Now run: npx tsc --noEmit")
