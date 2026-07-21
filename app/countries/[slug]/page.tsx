import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAllCountrySlugs,
  getChildrenOf,
  getCountry,
  getCountryIndicators,
  getCountryFacts,
  getIndicatorRank,
  getMetrosForCountry,
  isTop5pct,
  type CountryIndicators,
} from "@/lib/countries";
import { getStatesForCountry } from "@/lib/states";
import CountryMap from "./CountryMap";
import Collapsible from "./Collapsible";
import CountryFactsSection from "./CountryFactsSection";
import NationalTeamsSection, { countryHasNationalTeams } from "./NationalTeamsSection";
import LeagueHubsSection from "./LeagueHubsSection";
import HubNav from "@/app/teams/HubNav";
import { getCountryTitles } from "@/lib/championsHistory";
import { competitionHref } from "@/lib/competitionLinks";
import { sportIcon } from "@/lib/sportLabels";
import ChampionLogo from "@/app/teams/_shared/ChampionLogo";
import { getLeagueHubsForCountry } from "@/lib/leagueHubs";
import LeadersSection from "./LeadersSection";
import PowerSection from "./PowerSection";
import { getCountryPowerSeries } from "@/lib/powerHistory";
import { countryHasLeaders, getLeaders } from "@/lib/leaders";
import OrgsSection from "./OrgsSection";
import ConflictsSection from "./ConflictsSection";
import { getConflicts, conflictsForCountry } from "@/lib/conflicts";
import BillionairesSection from "./BillionairesSection";
import { getBillionaires, billionairesForCountry } from "@/lib/billionaires";
import { countryHasOrgs } from "@/lib/orgs";
import { computeTier, tierAnchor } from "@/lib/tiers";
import { formatPop, regionColors, fmtArea } from "@/lib/shared";
import { flagUrl, flagSrcSet } from "@/lib/flags";
import {
  AUTHOR,
  BASE_URL,
  PUBLISHER,
  SITE_NAME,
  serializeJsonLd,
} from "@/lib/seo";

export const dynamicParams = false;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return getAllCountrySlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const c = getCountry(slug);
  if (!c) return { title: "Country not found" };
  const url = `${BASE_URL}/countries/${c.slug}`;
  const desc = `${c.name}: population, area, capital, and a ranked list of every metro tracked${c.parent ? ` (a constituent of ${c.parent})` : ""}.`;
  return {
    title: c.name,
    description: desc,
    alternates: { canonical: `/countries/${c.slug}` },
    openGraph: { title: `${c.name} | ${SITE_NAME}`, description: desc, url, type: "website" },
    twitter: { card: "summary_large_image", title: `${c.name} | ${SITE_NAME}`, description: desc },
  };
}

// Pluralize a single Type label in a way that reads naturally. Falls
// back to a trailing "s" for any type not in the editorial map.
const TYPE_PLURALS: Record<string, string> = {
  State: "States",
  Province: "Provinces",
  Territory: "Territories",
  Region: "Regions",
  Department: "Departments",
  County: "Counties",
  Country: "Countries",
  District: "Districts",
  Prefecture: "Prefectures",
  Borough: "Boroughs",
  "Federal District": "Federal Districts",
  "Federal City": "Federal Cities",
  "Autonomous Region": "Autonomous Regions",
  "Autonomous Republic": "Autonomous Republics",
  "Autonomous Oblast": "Autonomous Oblasts",
  "Autonomous Okrug": "Autonomous Okrugs",
  "Autonomous Community": "Autonomous Communities",
  "Administrative Area": "Administrative Areas",
  "Special Administrative Region": "Special Administrative Regions",
  "Unitary Authority": "Unitary Authorities",
  "Metropolitan Borough": "Metropolitan Boroughs",
  "London Borough": "London Boroughs",
  Krai: "Krais",
  Oblast: "Oblasts",
  Republic: "Republics",
};

function pluralizeType(type: string): string {
  if (!type) return "Subdivisions";
  if (TYPE_PLURALS[type]) return TYPE_PLURALS[type];
  // Heuristic fallbacks: handle "y" → "ies", anything ending in s/x/z stays as-is.
  if (/[sxz]$/i.test(type)) return type;
  if (/[bcdfghjklmnpqrstvwxz]y$/i.test(type)) return type.slice(0, -1) + "ies";
  return `${type}s`;
}

// Group states by Type, sort each group by metroCount desc then name, and
// return the groups themselves sorted by group-size desc. So a country with
// 32 Counties + 28 Unitary Authorities + 1 Administrative Area renders the
// Counties group first.
function groupStatesByType<S extends { type: string; metroCount: number; name: string }>(
  states: readonly S[]
): { type: string; label: string; rows: S[] }[] {
  const buckets = new Map<string, S[]>();
  for (const s of states) {
    const t = s.type || "Subdivision";
    if (!buckets.has(t)) buckets.set(t, []);
    buckets.get(t)!.push(s);
  }
  const groups: { type: string; label: string; rows: S[] }[] = [];
  for (const [t, list] of buckets.entries()) {
    list.sort((a, b) => {
      if (b.metroCount !== a.metroCount) return b.metroCount - a.metroCount;
      return a.name.localeCompare(b.name);
    });
    groups.push({ type: t, label: pluralizeType(t), rows: list });
  }
  groups.sort((a, b) => b.rows.length - a.rows.length || a.label.localeCompare(b.label));
  return groups;
}

function fmtPercent(n: number | null): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(0)}%`;
}

function fmtUsd(n: number): string {
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

function StatCard({ label, value, sub, rank, gold }: { label: string; value: string; sub?: string; rank?: string; gold?: boolean }) {
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
  { key: "hdi", label: "Human Dev. Index", fmt: (n) => n.toFixed(3) },
  { key: "gdpUsd", label: "GDP", fmt: (n) => fmtUsdLarge(n) },
  { key: "gdpPerCapitaUsd", label: "GDP per capita", fmt: (n) => fmtUsd(n) },
  { key: "gdpPerCapitaPpp", label: "GDP/capita (PPP)", fmt: (n) => fmtUsd(n) },
  { key: "gniPerCapitaAtlas", label: "GNI/capita (Atlas)", fmt: (n) => fmtUsd(n) },
  { key: "lifeExpectancy", label: "Life expectancy", fmt: (n) => `${n.toFixed(1)} yrs` },
  { key: "medianAge", label: "Median age", fmt: (n) => `${n.toFixed(1)} yrs` },
  { key: "urbanPopPct", label: "Urban population", fmt: (n) => `${n.toFixed(0)}%` },
  { key: "popGrowthPct", label: "Pop. growth", fmt: (n) => `${n.toFixed(1)}%` },
  { key: "popDensity", label: "Pop. density", fmt: (n) => `${n.toFixed(0)}/km²` },
  { key: "migrantStockPct", label: "Foreign-born", fmt: (n) => `${n.toFixed(1)}%` },
  { key: "ruleOfLaw", label: "Rule of law", fmt: (n) => n.toFixed(2) },
  { key: "giniIndex", label: "Gini index", fmt: (n) => n.toFixed(1) },
  { key: "internetPct", label: "Internet users", fmt: (n) => `${n.toFixed(0)}%` },
  { key: "inflationPct", label: "Inflation", fmt: (n) => `${n.toFixed(1)}%` },
];

function CapitalBadge() {
  return (
    <span className="ml-2 inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{ backgroundColor: "rgba(245, 158, 11, 0.18)", color: "#f59e0b", fontFamily: "'JetBrains Mono', monospace" }}
          title="National capital">★ Capital</span>
  );
}

function LargestBadge() {
  return (
    <span className="ml-2 inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{ backgroundColor: "rgba(96, 165, 250, 0.18)", color: "#60a5fa", fontFamily: "'JetBrains Mono', monospace" }}
          title="Largest metro by population">▲ Largest</span>
  );
}

export default async function CountryDetailPage({ params }: Props) {
  const { slug } = await params;
  const conflictWars = conflictsForCountry(await getConflicts(), slug);
  const billionaires = billionairesForCountry(await getBillionaires(), slug);
  const country = getCountry(slug);
  if (!country) notFound();

  const metros = getMetrosForCountry(slug);
  const indicators = getCountryIndicators(slug);
  const facts = getCountryFacts(slug);
  const metroSlugByName = new Map(metros.map((m) => [m.name, m.slug] as const));
  const children = getChildrenOf(country.name);
  // Championship history for this country: club / domestic titles join by the
  // country's metros; national-team titles attribute by nation name, rolling up
  // constituents (UK -> England/Scotland/Wales/Northern Ireland + Great Britain).
  const champNations = [country.name, ...children.map((c) => c.name), ...(country.name === "United Kingdom" ? ["Great Britain"] : [])];
  const champTitles = getCountryTitles([], champNations); // national-team titles only
  // States listed under this country in the States sheet (col 4 = Country
  // exact match). UK gets zero hits because UK subdivisions live under
  // England / Scotland / Wales / Northern Ireland; those constituent
  // pages render their own state chips.
  const states = getStatesForCountry(country.name);
  // Group by Type so countries with mixed subdivision schemes (England:
  // Counties + Unitary Authorities + Metropolitan Boroughs + Administrative
  // Areas; Russia: Republics + Krais + Oblasts + ...) show every type with
  // its own count rather than collapsing to whichever is dominant.
  const stateGroups = groupStatesByType(states);
  const stateSectionTitle =
    stateGroups.length === 0
      ? "States and provinces"
      : stateGroups.length === 1
        ? stateGroups[0].label
        : "Administrative subdivisions";

  // Roll disputed-territory population, metro pop, area, and score into the
  // parent's hero stats. Morocco gains Western Sahara, Cyprus gains
  // Northern Cyprus, Moldova gains Transnistria, Georgia gains Abkhazia +
  // South Ossetia. Hong Kong / Macau / Puerto Rico etc. are NOT rolled up
  // (per international-recognition distinction — they stay independent).
  const disputedChildren = children.filter((c) => c.disputed);
  const aggPop = (country.pop ?? 0) + disputedChildren.reduce((s, c) => s + (c.pop ?? 0), 0);
  const aggMetroPop = (country.metroPop ?? 0) + disputedChildren.reduce((s, c) => s + (c.metroPop ?? 0), 0);
  const aggArea = (country.areaSqKm ?? 0) + disputedChildren.reduce((s, c) => s + (c.areaSqKm ?? 0), 0);
  const aggScore = (country.scoreTotal ?? 0) + disputedChildren.reduce((s, c) => s + (c.scoreTotal ?? 0), 0);
  const hasDisputedRollup = disputedChildren.length > 0;
  const displayPop = hasDisputedRollup ? aggPop : country.pop;
  const displayArea = hasDisputedRollup ? aggArea : country.areaSqKm;
  const displayScore = hasDisputedRollup ? aggScore : country.scoreTotal;
  const displayMetroPct = hasDisputedRollup && aggPop > 0 ? aggMetroPop / aggPop : country.metroPct;

  const collectionLd = {
    "@context": "https://schema.org",
    "@type": "Place",
    name: country.name,
    description: `${country.name}: tracked metropolitan areas, population, and composite score.`,
    url: `${BASE_URL}/countries/${country.slug}`,
    ...(facts?.qid ? { sameAs: [`https://www.wikidata.org/entity/${facts.qid}`] } : {}),
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: BASE_URL, publisher: PUBLISHER },
    author: AUTHOR,
  };

  // Capital / Largest match — checked against multiple shapes since the
  // xlsx capital/biggestMetro fields contain metro-level names.
  function isCapital(metroName: string): boolean {
    if (!country) return false;
    return country.capital != null && metroName === country.capital;
  }
  function isLargest(metroName: string): boolean {
    if (!country) return false;
    return country.biggestMetro != null && metroName === country.biggestMetro;
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(collectionLd) }} />
      <main className="min-h-screen pt-24 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <nav className="mb-6 flex items-center gap-3 text-xs text-[var(--text-muted)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            <Link href="/" className="hover:text-[var(--accent)]">Rankings</Link>
            <span>/</span>
            <Link href="/countries" className="hover:text-[var(--accent)]">Countries</Link>
            <span>/</span>
            <span className="text-[var(--text)]">{country.name}</span>
          </nav>

          <header className="mb-10 border-b border-[var(--border)] pb-8">
            <div className="flex items-baseline gap-3 mb-3">
              <h1 className="text-4xl sm:text-5xl font-bold tracking-tight flex items-center gap-3">
                {(() => {
                  const fu = flagUrl(country.slug);
                  return fu ? (
                    <img
                      src={fu}
                      srcSet={flagSrcSet(country.slug) ?? undefined}
                      alt=""
                      aria-hidden
                      className="h-[0.85em] w-auto rounded-sm ring-1 ring-white/10 shrink-0"
                    />
                  ) : null;
                })()}
                <span>{country.name}</span>
              </h1>
              {country.disputed ? (
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded italic"
                      style={{ color: "var(--text-dim)", border: "1px solid var(--border)", fontFamily: "'JetBrains Mono', monospace" }}
                      title="Internationally disputed">disputed</span>
              ) : null}
            </div>
            {country.parent ? (
              <p className="text-sm text-[var(--text-muted)] mb-4">
                {country.disputed ? `Internationally disputed; claimed by ${country.parent}.` : "Constituent / territory of "}
                {!country.disputed ? (
                  <Link href={`/countries/${country.parent_slug}`} className="text-[var(--accent)] hover:underline">{country.parent}</Link>
                ) : null}
                {country.disputed ? " " : "."}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3 mb-6 text-sm text-[var(--text-muted)]">
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
              {getLeaders(slug).filter((l) => l.current).map((l) => (
                <span key={`${l.name}-${l.role}`}>
                  <span className="text-[var(--text-dim)]">{l.role}:</span>{" "}
                  {l.name}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard
                label="2026 population"
                value={displayPop != null ? formatPop(displayPop) : "—"}
                sub={hasDisputedRollup
                  ? `Includes ${disputedChildren.map((c) => c.name).join(" + ")}`
                  : country.popRank != null ? `Rank #${country.popRank} globally` : undefined}
              />
              <StatCard label="Area" value={fmtArea(displayArea)} />
              <StatCard
                label="Metros tracked"
                value={metros.length.toString()}
                sub={displayMetroPct != null ? `${fmtPercent(displayMetroPct)} of population in metros` : undefined}
              />
              <StatCard
                label="Composite score"
                value={displayScore != null ? displayScore.toFixed(1) : "—"}
                sub={country.scoreRank != null ? `Rank #${country.scoreRank} globally` : undefined}
              />
            </div>
          </header>

          {(() => {
            const navItems = [
              ...(facts ? [{ label: "At a glance", href: "#at-a-glance" }] : []),
              ...(indicators ? [{ label: "Economy", href: "#economy" }] : []),
              ...(countryHasNationalTeams(country.name) ? [{ label: "National Teams", href: "#national-teams" }] : []),
              ...(countryHasOrgs(slug) ? [{ label: "Alliances & Orgs", href: "#orgs" }] : []),
              ...(countryHasLeaders(slug) ? [{ label: "Leadership", href: "#leaders" }] : []),
              ...(conflictWars.length ? [{ label: "Conflicts", href: "#conflicts" }] : []),
              ...(billionaires.length ? [{ label: "Billionaires", href: "#billionaires" }] : []),
              ...(getLeagueHubsForCountry(slug).length > 0 ? [{ label: "League Hubs", href: "#league-hubs" }] : []),
              ...(children.length > 0 ? [{ label: "Constituents", href: "#constituents" }] : []),
              ...(stateGroups.length > 0 ? [{ label: "Subdivisions", href: "#subdivisions" }] : []),
              ...(metros.length > 0 ? [{ label: "Geography", href: "#geography" }, { label: "Metros", href: "#metros" }] : []),
            ];
            return navItems.length > 1 ? <HubNav items={navItems} /> : null;
          })()}

          <CountryFactsSection facts={facts} />

          {indicators ? (
            <Collapsible
              id="economy"
              title="Economy and development"
              right={indicators.incomeLevel ? <IncomeBadge level={indicators.incomeLevel} /> : null}
            >
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
              </div>
              <p className="text-xs text-[var(--text-dim)] mt-3">
                Ranks are among sovereign countries with data; ★ marks a top-5% finish. Sources:{" "}
                <a href="https://data.worldbank.org" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--accent)]">
                  World Bank Open Data
                </a>{" "}
                and{" "}
                <a href="https://ourworldindata.org" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--accent)]">
                  Our World in Data
                </a>{" "}
                (UNDP, UN, V-Dem; CC BY 4.0). Each figure is the most recent year available.
              </p>
            </Collapsible>
          ) : null}

          <OrgsSection countrySlug={slug} />

          <LeadersSection countrySlug={slug} />

          <PowerSection series={getCountryPowerSeries(slug)} name={country.name} />
          <ConflictsSection wars={conflictWars} />
          <BillionairesSection list={billionaires} />

          {(countryHasNationalTeams(country.name) || champTitles.length > 0) ? (
            <Collapsible id="national-teams" title="National Teams">
              <NationalTeamsSection countryName={country.name} bare />
              {champTitles.length > 0 ? (
                <div className="mt-8">
                  <h3 className="text-lg font-bold mb-2">National Teams Champions</h3>
                  <p className="text-sm text-[var(--text-muted)] mb-4">
                    Every major championship won by {country.name}&apos;s national teams, newest first. {champTitles.length} in total.
                  </p>
              <div className="border rounded-lg overflow-hidden" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
                {/* Mobile: one card per title, same data as the desktop table */}
                <div className="sm:hidden divide-y divide-[var(--border)] max-h-[32rem] overflow-y-auto">
                  {champTitles.map((t, i) => (
                    <div key={`${t.compSlug}-${t.year}-${t.champion}-${i}-card`} className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <ChampionLogo name={t.champion} canonical={t.canonical} size={t.tier != null && t.tier <= 2 ? 22 : 16} />
                        {t.teamHref ? (
                          <Link href={t.teamHref} className={`hover:text-[var(--accent)] hover:underline text-[var(--text)] ${t.tier != null && t.tier <= 2 ? "font-bold text-base" : "font-medium text-sm"}`}>{t.champion}</Link>
                        ) : (
                          <span className={`text-[var(--text)] ${t.tier != null && t.tier <= 2 ? "font-bold text-base" : "font-medium text-sm"}`}>{t.champion}</span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs tabular-nums text-[var(--text-muted)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        <span>{t.year ?? "\u2014"}</span>
                        {t.date ? <span>{"\u00b7"} {t.date}</span> : null}
                      </div>
                      <div className="mt-1 text-xs">
                        {sportIcon(t.sport) ? <span aria-hidden className="mr-1">{sportIcon(t.sport)}</span> : null}
                        <Link href={competitionHref(t.compSlug)} className="text-[var(--text-muted)] hover:text-[var(--accent)] hover:underline">{t.eraName || t.competition}</Link>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Desktop: full table */}
                <div className="hidden sm:block max-h-[32rem] overflow-y-auto overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 border-b" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
                      <tr className="text-left text-[10px] uppercase tracking-widest text-[var(--text-dim)]">
                        <th className="px-4 py-2 font-semibold">Year</th>
                        <th className="px-4 py-2 font-semibold">Date</th>
                        <th className="px-4 py-2 font-semibold">Champion</th>
                        <th className="px-4 py-2 font-semibold">Competition</th>
                      </tr>
                    </thead>
                    <tbody>
                      {champTitles.map((t, i) => (
                        <tr key={`${t.compSlug}-${t.year}-${t.champion}-${i}`} className="border-b last:border-0 hover:bg-[var(--bg-card-hover)] transition" style={{ borderColor: "var(--border)" }}>
                          <td className="px-4 py-2 tabular-nums whitespace-nowrap" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{t.year ?? "\u2014"}</td>
                          <td className="px-4 py-2 tabular-nums whitespace-nowrap text-[var(--text-muted)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{t.date || "\u2014"}</td>
                          <td className="px-4 py-2">
                            <ChampionLogo name={t.champion} canonical={t.canonical} size={t.tier != null && t.tier <= 2 ? 22 : 16} />
                            {t.teamHref ? (
                              <Link href={t.teamHref} className={`hover:text-[var(--accent)] hover:underline text-[var(--text)] ${t.tier != null && t.tier <= 2 ? "font-bold text-base" : ""}`}>{t.champion}</Link>
                            ) : (
                              <span className={`text-[var(--text)] ${t.tier != null && t.tier <= 2 ? "font-bold text-base" : ""}`}>{t.champion}</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-xs">
                            {sportIcon(t.sport) ? <span aria-hidden className="mr-1">{sportIcon(t.sport)}</span> : null}
                            <Link href={competitionHref(t.compSlug)} className="text-[var(--text-muted)] hover:text-[var(--accent)] hover:underline">{t.eraName || t.competition}</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
                </div>
              ) : null}
            </Collapsible>
          ) : null}

          <LeagueHubsSection countrySlug={slug} countryName={country.name} />

          {children.length > 0 ? (
            <Collapsible id="constituents" title="Constituents and territories">
              <p className="text-sm text-[var(--text-muted)] mb-4">{children.length} entries listed under {country.name}. Click any to see its own metros.</p>
              <div className="flex flex-wrap gap-2">
                {children.map((c) => (
                  <Link key={c.slug} href={`/countries/${c.slug}`}
                        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)", fontFamily: "'JetBrains Mono', monospace" }}>
                    {c.name}
                    {c.disputed ? <span className="text-[10px] italic text-[var(--text-dim)]" title="Disputed">disputed</span> : null}
                  </Link>
                ))}
              </div>
            </Collapsible>
          ) : null}

          {stateGroups.length > 0 ? (
            <Collapsible id="subdivisions" title={stateSectionTitle}>
              {slug === "united-states" ? (
                <Link href="/us-political-leadership" className="inline-block mb-3 text-sm font-medium text-[var(--accent)] hover:underline">
                  United States political leadership: president, cabinet, governors &amp; Congress →
                </Link>
              ) : null}
              {slug === "united-kingdom" ? (
                <Link href="/uk-political-leadership" className="inline-block mb-3 text-sm font-medium text-[var(--accent)] hover:underline">
                  United Kingdom political leadership: the Sovereign, Prime Minister, cabinet &amp; Parliament →
                </Link>
              ) : null}
              <p className="text-sm text-[var(--text-muted)] mb-4">
                {states.length} {states.length === 1 ? "entry" : "entries"} listed under {country.name}
                {stateGroups.length > 1 ? ` across ${stateGroups.length} types` : ""}
                . Click any to see its metros and footprint.
              </p>
              {stateGroups.map((group) => (
                <div key={group.type} className="mb-5 last:mb-0">
                  {stateGroups.length > 1 ? (
                    <h3
                      className="text-[11px] uppercase tracking-wider font-semibold mb-2"
                      style={{
                        color: "var(--text-muted)",
                        fontFamily: "'JetBrains Mono', monospace",
                      }}
                    >
                      {group.label}{" "}
                      <span style={{ color: "var(--text-dim)" }}>
                        ({group.rows.length})
                      </span>
                    </h3>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {group.rows.map((s) => (
                      <Link
                        key={s.slug}
                        href={`/states/${s.slug}`}
                        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                        style={{
                          backgroundColor: "var(--bg-card)",
                          borderColor: "var(--border)",
                          color: "var(--text)",
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                        title={s.iso ? `${s.type} · ${s.iso}` : s.type}
                      >
                        {s.name}
                        {s.metroCount > 0 ? (
                          <span
                            className="text-[10px]"
                            style={{ color: "var(--text-dim)" }}
                          >
                            {s.metroCount}
                          </span>
                        ) : null}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </Collapsible>
          ) : null}

          {metros.length > 0 ? (
            <div id="geography" className="scroll-mt-20">
              <CountryMap slug={country.slug} countryName={country.name} />
            </div>
          ) : null}

          <Collapsible
            id="metros"
            title={metros.length > 0 ? `${metros.length} tracked ${metros.length === 1 ? "metro" : "metros"}` : "No metros tracked yet"}
          >
            {metros.length > 0 ? (
              <div className="border rounded-lg overflow-hidden" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
                {/* Mobile: stacked cards */}
                <div className="sm:hidden divide-y divide-[var(--border)]">
                  {metros.map((m) => {
                    const tier = computeTier(m.score);
                    const state2Slug = m.state2Slug;
                    const state3Slug = m.state3Slug;
                    const extraStates = [
                      m.state2 ? { name: m.state2, slug: state2Slug } : null,
                      m.state3 ? { name: m.state3, slug: state3Slug } : null,
                      ...(m.additionalStates ?? []),
                    ].filter((s): s is { name: string; slug?: string } => s !== null);
                    return (
                      <div key={`${m.slug}-card`} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-xs text-[var(--text-dim)] tabular-nums mr-1.5" style={{ fontFamily: "'JetBrains Mono', monospace" }}>#{m.rank}</span>
                            <Link href={`/rankings/${m.slug}`} className="font-semibold hover:text-[var(--accent)]">{m.name}</Link>
                            {isCapital(m.name) ? <CapitalBadge /> : null}
                            {isLargest(m.name) ? <LargestBadge /> : null}
                          </div>
                          <span className="flex-shrink-0 font-bold tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)" }}>{m.score.toFixed(1)}</span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                          <span className="tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatPop(m.pop)}</span>
                          <Link href={`/methodology${tierAnchor(m.score)}`} className="hover:text-[var(--accent)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{tier.name}</Link>
                        </div>
                        {(m.primaryState || extraStates.length > 0) ? (
                          <div className="mt-1 text-xs text-[var(--text-dim)]">
                            {m.primaryState ? (
                              m.stateSlug ? (
                                <Link href={`/states/${m.stateSlug}`} className="text-[var(--text-muted)] hover:text-[var(--accent)]">{m.primaryState}</Link>
                              ) : (
                                <span className="text-[var(--text-muted)]">{m.primaryState}</span>
                              )
                            ) : null}
                            {extraStates.map((s, idx) => (
                              <span key={`${s.name}-${idx}`}>
                                {(m.primaryState || idx > 0) ? " · " : ""}
                                {s.slug ? (
                                  <Link href={`/states/${s.slug}`} className="hover:text-[var(--accent)]">{s.name}</Link>
                                ) : (
                                  <span>{s.name}</span>
                                )}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                {/* Desktop: table */}
                <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[var(--text-dim)] uppercase tracking-wider"
                        style={{ borderBottom: "1px solid var(--border)", fontFamily: "'JetBrains Mono', monospace" }}>
                      <th className="py-2 pl-4 pr-4">Rank</th>
                      <th className="py-2 pr-4">Metro</th>
                      <th className="hidden md:table-cell py-2 pr-4">State</th>
                      <th className="hidden sm:table-cell py-2 pr-4 text-right">Population</th>
                      <th className="py-2 pr-4 text-right">Score</th>
                      <th className="py-2 pr-4 text-right">Tier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metros.map((m) => {
                      const tier = computeTier(m.score);
                      // State column reads ETL-resolved stateSlug, state2Slug,
                      // state3Slug directly off metros.json. Multi-state metros
                      // (NYC, Washington-Baltimore, Cincinnati) can link to all
                      // three constituent states.
                      const state2Slug = m.state2Slug;
                      const state3Slug = m.state3Slug;
                      return (
                        <tr key={m.slug} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td className="py-3 pl-4 pr-4 text-xs text-[var(--text-dim)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>#{m.rank}</td>
                          <td className="py-3 pr-4">
                            <Link href={`/rankings/${m.slug}`} className="font-semibold hover:text-[var(--accent)]">{m.name}</Link>
                            {isCapital(m.name) ? <CapitalBadge /> : null}
                            {isLargest(m.name) && !isCapital(m.name) ? <LargestBadge /> : null}
                            {isLargest(m.name) && isCapital(m.name) ? <LargestBadge /> : null}
                          </td>
                          <td className="hidden md:table-cell py-3 pr-4 text-xs">
                            {m.primaryState ? (
                              m.stateSlug ? (
                                <Link href={`/states/${m.stateSlug}`} className="text-[var(--text)] hover:text-[var(--accent)]">
                                  {m.primaryState}
                                </Link>
                              ) : (
                                <span className="text-[var(--text)]">{m.primaryState}</span>
                              )
                            ) : (
                              <span className="text-[var(--text-dim)]">—</span>
                            )}
                            {(m.state2 || m.state3 || (m.additionalStates && m.additionalStates.length > 0)) ? (
                              <div className="text-[10px] text-[var(--text-dim)] mt-0.5">
                                {[
                                  m.state2 ? { name: m.state2, slug: state2Slug } : null,
                                  m.state3 ? { name: m.state3, slug: state3Slug } : null,
                                  ...(m.additionalStates ?? []),
                                ]
                                  .filter((s): s is { name: string; slug?: string } => s !== null)
                                  .map((s, idx, arr) => (
                                    <span key={`${s.name}-${idx}`}>
                                      {s.slug ? (
                                        <Link href={`/states/${s.slug}`} className="hover:text-[var(--accent)]">{s.name}</Link>
                                      ) : (
                                        <span>{s.name}</span>
                                      )}
                                      {idx < arr.length - 1 ? <span> · </span> : null}
                                    </span>
                                  ))}
                              </div>
                            ) : null}
                          </td>
                          <td className="hidden sm:table-cell py-3 pr-4 text-right text-[var(--text-muted)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatPop(m.pop)}</td>
                          <td className="py-3 pr-4 text-right font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)" }}>{m.score.toFixed(1)}</td>
                          <td className="py-3 pr-4 text-right text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-muted)" }}>
                            <Link href={`/methodology${tierAnchor(m.score)}`} className="hover:text-[var(--accent)]">{tier.name}</Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            ) : (
              <div className="border rounded-lg p-8 text-center" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
                <p className="text-[var(--text-muted)] mb-2">No metros are currently tracked for {country.name} in the dataset.</p>
                <p className="text-xs text-[var(--text-dim)]">This page will populate automatically when metros are added.</p>
              </div>
            )}
          </Collapsible>


          <footer className="mt-12 pt-8 border-t border-[var(--border)] text-sm text-[var(--text-muted)]">
            <p>
              Browse <Link href="/countries" className="text-[var(--accent)] hover:underline">all countries</Link>,
              read the <Link href="/methodology" className="text-[var(--accent)] hover:underline">composite methodology</Link>,
              or jump back to the <Link href="/" className="text-[var(--accent)] hover:underline">global rankings</Link>.
            </p>
            {country.source ? (<p className="text-xs text-[var(--text-dim)] mt-2">Population source: {country.source}</p>) : null}
          </footer>
        </div>
      </main>
    </>
  );
}
