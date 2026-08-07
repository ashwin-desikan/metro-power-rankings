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
  getIndicatorsMeta,
  isTop5pct,
  type CountryIndicators,
} from "@/lib/countries";
import { getStatesForCountry } from "@/lib/states";
import CountryMap from "./CountryMap";
import Collapsible from "./Collapsible";
import CountryFactsSection from "./CountryFactsSection";
import NationalTeamsSection, { countryHasNationalTeams } from "./NationalTeamsSection";
import LeagueHubsSection from "./LeagueHubsSection";
import CountryNav, { type CountryNavItem } from "./CountryNav";
import MetrosExplorer from "./MetrosExplorer";
import SubdivisionsExplorer from "./SubdivisionsExplorer";
import { withIcon } from "./sectionIcons";
import MobileCollapse from "./MobileCollapse";
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

// Countries with an election-history hub get a card linking to it (and the US
// and UK also link their political-leadership pages).
const ELECTION_CARD: Record<string, { href: string; head: string; sub: string }> = {
  "united-states": { href: "/elections/us", head: "Every presidential election since 1788 →", sub: "Sixty contests: electoral college, state results, turnout, Congress and the midterm penalty." },
  "united-kingdom": { href: "/elections/uk", head: "Every general election since 1802 →", sub: "Fifty-eight contests: seats, swings, turnout, referendums and the devolved map." },
  canada: { href: "/elections/ca", head: "Every federal election since 1867 →", sub: "Forty-five contests: seats, swings, turnout, minority parliaments and the 1993 collapse." },
  australia: { href: "/elections/au", head: "Every federal election since 1901 →", sub: "Forty-eight contests: preferential voting, compulsory turnout, the Dismissal and the 2025 landslide." },
  germany: { href: "/elections/de", head: "Every federal election since 1848 →", sub: "Fifty national votes across Empire, Weimar and two republics, with the unfree years labelled." },
  france: { href: "/elections/fr", head: "Elections since the Revolution →", sub: "Legislative contests back to 1791 and every Fifth Republic presidential runoff in one hub." },
  india: { href: "/elections/in", head: "Every general election since 1920 →", sub: "The world's largest democratic exercise, from the Raj-era assemblies to 970 million voters." },
  japan: { href: "/elections/jp", head: "Every general election since 1890 →", sub: "Asia's first parliament, the 1955 system and the LDP's seven decades of dominance." },
  brazil: { href: "/elections/br", head: "Elections since the first Republic →", sub: "Presidential contests from 1891 and the parliamentary record, through the 2022 runoff." },
  mexico: { href: "/elections/mx", head: "Presidential elections since 1853 →", sub: "From the Porfiriato and one-party rule to real contests and the first woman president." },
  "south-africa": { href: "/elections/za", head: "Every general election since 1910 →", sub: "The whites-only parliaments stated plainly, and the democratic era from 1994 to 2024." },
  italy: { href: "/elections/it", head: "Every general election since 1861 →", sub: "From the Liberal monarchy through the First Republic's decades to the Second Republic." },
  israel: { href: "/elections/il", head: "Every election since the Yishuv →", sub: "From the pre-state assemblies to the Knesset's deadlock cycle; next contest due in 2026." },
  "south-korea": { href: "/elections/kr", head: "Presidential and Assembly elections since 1948 →", sub: "The authoritarian rituals labelled as such, and the two-camp democracy since 1987." },
  indonesia: { href: "/elections/id", head: "Elections since the Volksraad →", sub: "The 1955 experiment, the New Order's managed votes, and the world's largest election day." },
  spain: { href: "/elections/es", head: "Every general election since 1867 →", sub: "The turno pacífico stated plainly, the Second Republic, and the democratic era since 1977." },
  poland: { href: "/elections/pl", head: "Elections since the royal free elections →", sub: "Elected kings from 1573, the communist rituals labelled, and the Third Republic's duels." },
  netherlands: { href: "/elections/nl", head: "Every general election since 1886 →", sub: "The Pacification of 1917, the pillarised decades, and the world's purest proportional system." },
  "new-zealand": { href: "/elections/nz", head: "Every general election since 1853 →", sub: "The world's first vote with women's suffrage, the first Labour government, and the MMP era." },
  argentina: { href: "/elections/ar", head: "Presidential elections since 1826 →", sub: "The oligarchic republic, the Sáenz Peña revolution, Perón, and unbroken democracy since 1983." },
  taiwan: { href: "/elections/tw", head: "Presidential elections since 1911 →", sub: "The ROC's whole lineage, with the National Assembly rituals labelled and democracy since 1996." },
  nigeria: { href: "/elections/ng", head: "Elections since Africa's first, in 1923 →", sub: "June 12 and the rigged contests labelled plainly, and the Fourth Republic's unbroken run." },
  turkey: { href: "/elections/tr", head: "Elections since the Republic →", sub: "The single-party era labelled, the 1950 breakthrough, the coups — and the tilted contests of today." },
  russia: { href: "/elections/ru", head: "Russian & Soviet votes, recorded honestly →", sub: "Single-list rituals, the free 1990s window, and the managed elections that closed it." },
  china: { href: "/elections/cn", head: "The national congresses since 1949 →", sub: "China holds no competitive elections; this records the NPC's party-managed selection instead." },
  ukraine: { href: "/elections/ua", head: "Every election since independence →", sub: "Seven presidential races and eight Rada contests — all real, three incumbents defeated — suspended under martial law." },
  iraq: { href: "/elections/iq", head: "Elections since the monarchy →", sub: "The palace-managed chambers, Saddam's rituals stated plainly, and seven competitive elections since 2005." },
  palestine: { href: "/elections/ps", head: "The elections of 1996–2006 →", sub: "The Authority's founding votes, the free 2006 election that froze everything — and the vote scheduled for 2026." },
  "vatican-city": { href: "/elections/va", head: "Papal conclaves since 1061 →", sub: "The oldest electoral system on earth: 964 years of conclaves and papal elections, through Leo XIV in 2025." },
  singapore: { href: "/elections/sg", head: "Every general election since 1948 →", sub: "The PAP's seventeen consecutive victories, cleanly counted and structurally tilted, each labelled honestly." },
  malaysia: { href: "/elections/my", head: "Every general election since 1955 →", sub: "The BN supermajority decades on a tilted map, and the two-coalition era that made power change hands." },
  switzerland: { href: "/elections/ch", head: "Every federal election since 1848 →", sub: "The Radical republic, the PR revolution, the magic formula — and the SVP era that broke it." },
  belgium: { href: "/elections/be", head: "Every election since 1831 →", sub: "From the censitaire kingdom and plural voting to the linguistic fracture and the 541-day formation." },
  denmark: { href: "/elections/dk", head: "Every election since 1849 →", sub: "The constitutional struggle, Stauning's Denmark, the 1973 earthquake and bloc politics to March 2026." },
};

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
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${c.name} | ${SITE_NAME}`, description: desc, url, type: "website" },
    twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${c.name} | ${SITE_NAME}`, description: desc },
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

function StatCard({ label, value, sub, rank, gold, percentile }: { label: string; value: string; sub?: string; rank?: string; gold?: boolean; percentile?: number | null }) {
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
      {/* Percentile bar: turns "#9 / 194" into something readable at a glance.
          Derived from the rank we already have (getIndicatorRank returns
          {rank,total}), so no new data. Rank 1 fills the bar; last place leaves
          it nearly empty. Rendered only where a rank exists - medianAge and
          popGrowthPct have no entry in INDICATOR_RANK_DIR, so they show no bar
          rather than a misleading one. Purely decorative, hence aria-hidden;
          the rank text above is the accessible value. */}
      {percentile != null ? (
        <div className="mt-2 h-1 w-full rounded-full overflow-hidden" style={{ backgroundColor: "var(--border)" }} aria-hidden>
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.max(2, Math.round(percentile * 100))}%`,
              backgroundColor: gold ? "#f59e0b" : "var(--accent)",
              opacity: gold ? 1 : 0.55,
            }}
          />
        </div>
      ) : null}
      {sub ? <div className="text-xs text-[var(--text-muted)] mt-1">{sub}</div> : null}
    </div>
  );
}

// `src` is the ORIGINATING body, not the aggregator. Every card previously read
// "World Bank · {year}", including HDI, median age and rule of law, which are
// UNDP, UN WPP and V-Dem republished by Our World in Data. These are CC BY
// series, so crediting the wrong body is a licence issue, not a nitpick.
const ECON_INDICATORS: { key: keyof CountryIndicators["indicators"]; label: string; src: string; fmt: (n: number) => string }[] = [
  { key: "hdi", label: "Human Dev. Index", src: "UNDP", fmt: (n) => n.toFixed(3) },
  { key: "gdpUsd", label: "GDP", src: "World Bank", fmt: (n) => fmtUsdLarge(n) },
  { key: "gdpPerCapitaUsd", label: "GDP per capita", src: "World Bank", fmt: (n) => fmtUsd(n) },
  { key: "gdpPerCapitaPpp", label: "GDP/capita (PPP)", src: "World Bank", fmt: (n) => fmtUsd(n) },
  { key: "gniPerCapitaAtlas", label: "GNI/capita (Atlas)", src: "World Bank", fmt: (n) => fmtUsd(n) },
  { key: "lifeExpectancy", label: "Life expectancy", src: "World Bank", fmt: (n) => `${n.toFixed(1)} yrs` },
  { key: "medianAge", label: "Median age", src: "UN WPP", fmt: (n) => `${n.toFixed(1)} yrs` },
  { key: "urbanPopPct", label: "Urban population", src: "World Bank", fmt: (n) => `${n.toFixed(0)}%` },
  { key: "popGrowthPct", label: "Pop. growth", src: "World Bank", fmt: (n) => `${n.toFixed(1)}%` },
  { key: "popDensity", label: "Pop. density", src: "World Bank", fmt: (n) => `${n.toFixed(0)}/km²` },
  { key: "migrantStockPct", label: "Foreign-born", src: "World Bank", fmt: (n) => `${n.toFixed(1)}%` },
  { key: "ruleOfLaw", label: "Rule of law", src: "V-Dem", fmt: (n) => n.toFixed(2) },
  { key: "giniIndex", label: "Gini index", src: "World Bank", fmt: (n) => n.toFixed(1) },
  { key: "internetPct", label: "Internet users", src: "World Bank", fmt: (n) => `${n.toFixed(0)}%` },
  { key: "inflationPct", label: "Inflation", src: "World Bank", fmt: (n) => `${n.toFixed(1)}%` },
  // "Renewable electricity", NOT "renewable energy" — the series is renewables'
  // share of electricity generation. The primary-energy equivalent covers only
  // 91 countries against this one's 226, so it was rejected.
  { key: "co2PerCapita", label: "CO₂ per capita", src: "Global Carbon Budget", fmt: (n) => `${n.toFixed(1)} t` },
  { key: "renewableElecPct", label: "Renewable electricity", src: "Ember", fmt: (n) => `${n.toFixed(0)}%` },
  { key: "energyPerCapita", label: "Energy per capita", src: "Energy Institute", fmt: (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)} MWh` : `${n.toFixed(0)} kWh`) },
];

// CapitalBadge / LargestBadge moved into MetrosExplorer.tsx with the metros
// list; they had no other caller on this page.

export default async function CountryDetailPage({ params }: Props) {
  const { slug } = await params;
  const conflictWars = conflictsForCountry(await getConflicts(), slug);
  const billionaires = billionairesForCountry(await getBillionaires(), slug);
  const country = getCountry(slug);
  if (!country) notFound();

  const metros = getMetrosForCountry(slug);
  // Hoisted: the nav needs to know whether a Power section will render, and
  // PowerSection needs the series itself. Called once either way.
  const powerSeries = getCountryPowerSeries(slug);
  const indicators = getCountryIndicators(slug);
  const indicatorsMeta = getIndicatorsMeta();
  const facts = getCountryFacts(slug);
  const metroSlugByName = new Map(metros.map((m) => [m.name, m.slug] as const));
  const children = getChildrenOf(country.name);
  // Championship history for this country: club / domestic titles join by the
  // country's metros; national-team titles attribute by nation name, rolling up
  // constituents (UK -> England/Scotland/Wales/Northern Ireland + Great Britain).
  const champNations = [country.name, ...children.map((c) => c.name), ...(country.name === "United Kingdom" ? ["Great Britain"] : [])];
  const champTitles = getCountryTitles([], champNations); // national-team titles only
  // Hoisted: countryHasNationalTeams became async when the rugby, cricket and
  // basketball libs moved to runtime reads, and the section-nav chip list below
  // is built inside a synchronous IIFE that cannot await.
  const hasNationalTeams = await countryHasNationalTeams(country.name);
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

  // Capital / Largest matching now lives in MetrosExplorer, which receives
  // country.capital and country.biggestMetro as plain strings.

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(collectionLd) }} />
      <main className="min-h-screen pt-8 pb-16 px-4 sm:px-6 lg:px-8">
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

            {/* Provenance stamp, per the TabHeader idiom in app/business/ui.tsx
                and the DESIGN-STANDARDS rule that every data page states its
                source and as-of date. Country pages are built at build time, so
                without this a reader cannot tell how old the numbers are. */}
            {(() => {
              const bits = [
                country.source ? `population: ${country.source}` : null,
                indicatorsMeta?.fetchedAt
                  ? `indicators as of ${indicatorsMeta.fetchedAt.slice(0, 10)}`
                  : null,
                metros.length > 0 ? `${metros.length.toLocaleString()} metros tracked` : null,
              ].filter(Boolean);
              return bits.length > 0 ? (
                <p
                  className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mt-4"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {bits.join(" · ")}
                </p>
              ) : null;
            })()}
          </header>

          {(() => {
            // Order below MATCHES DOM ORDER. It previously did not - National
            // Teams sat 3rd in the nav but 11th on the page - which made the
            // chips useless as a map of the page. #power also rendered with an
            // id but had no chip at all, so the section was unreachable from
            // here. Both fixed 2026-08-04.
            const navItems: CountryNavItem[] = [
              // REGIONS FIRST, matching DOM order exactly. Keep these two lists
              // in step: the chips are a map of the page, and they stopped
              // being one the last time they drifted.
              ...(metros.length > 0 ? [{ label: "Geography", href: "#geography", group: "Regions" }, { label: "Metros", href: "#metros", group: "Regions" }] : []),
              ...(stateGroups.length > 0 ? [{ label: "Subdivisions", href: "#subdivisions", group: "Regions" }] : []),
              ...(children.length > 0 ? [{ label: "Constituents", href: "#constituents", group: "Regions" }] : []),
              ...(facts ? [{ label: "At a glance", href: "#at-a-glance", group: "Overview" }] : []),
              ...(indicators ? [{ label: "Economy", href: "#economy", group: "Overview" }] : []),
              ...(countryHasOrgs(slug) ? [{ label: "Alliances & Orgs", href: "#orgs", group: "Governance" }] : []),
              ...(countryHasLeaders(slug) ? [{ label: "Leadership", href: "#leaders", group: "Governance" }] : []),
              ...(powerSeries.length > 0 ? [{ label: "Power", href: "#power", group: "Governance" }] : []),
              ...(conflictWars.length ? [{ label: "Conflicts", href: "#conflicts", group: "Governance" }] : []),
              ...(billionaires.length ? [{ label: "Billionaires", href: "#billionaires", group: "Society" }] : []),
              ...(hasNationalTeams ? [{ label: "National Teams", href: "#national-teams", group: "Society" }] : []),
              ...(getLeagueHubsForCountry(slug).length > 0 ? [{ label: "League Hubs", href: "#league-hubs", group: "Society" }] : []),
            ];
            return navItems.length > 1 ? <CountryNav items={navItems} /> : null;
          })()}

          {/* Renders nothing; closes the collapseOnMobile sections on phones. */}
          <MobileCollapse />

          {/* ================= REGIONS ==================================
              Deliberately first (2026-08-04). This is what the site is
              uniquely about, and it was previously LAST - metros rendered
              13th of 13 on a site called Global Metro Power Rankings.
              It only became affordable to lead with once the metros card
              list was height-capped: before that, Regions-first meant 68
              screens of cards before a mobile reader reached anything else.
              Contained, the whole cluster is about 3 screens.
              Map first because it is a one-screen visual that answers "what
              does this country look like" faster than any table; metros next
              as the payoff; the drier administrative lists at the back.
              Order here MUST match the nav order in CountryNav/navItems. */}
          {metros.length > 0 ? (
            <CountryMap slug={country.slug} countryName={country.name} />
          ) : null}

          <Collapsible
            id="metros"
            collapseOnMobile
            title={withIcon("metros", metros.length > 0 ? `${metros.length} tracked ${metros.length === 1 ? "metro" : "metros"}` : "No metros tracked yet")}
          >
            {metros.length > 0 ? (
              <MetrosExplorer
                metros={metros.map((m) => ({
                  slug: m.slug,
                  name: m.name,
                  rank: m.rank,
                  pop: m.pop,
                  score: m.score,
                  primaryState: m.primaryState ?? null,
                  stateSlug: m.stateSlug ?? null,
                  state2: m.state2 ?? null,
                  state2Slug: m.state2Slug ?? null,
                  state3: m.state3 ?? null,
                  state3Slug: m.state3Slug ?? null,
                  additionalStates: m.additionalStates ?? null,
                }))}
                capital={country.capital ?? null}
                biggestMetro={country.biggestMetro ?? null}
              />
            ) : (
              <div className="border rounded-lg p-8 text-center" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
                <p className="text-[var(--text-muted)] mb-2">No metros are currently tracked for {country.name} in the dataset.</p>
                <p className="text-xs text-[var(--text-dim)]">This page will populate automatically when metros are added.</p>
              </div>
            )}
          </Collapsible>

          {stateGroups.length > 0 ? (
            <Collapsible id="subdivisions" collapseOnMobile title={withIcon("subdivisions", stateSectionTitle)}>
              <SubdivisionsExplorer
                intro={`${states.length} ${states.length === 1 ? "entry" : "entries"} listed under ${country.name}${
                  stateGroups.length > 1 ? ` across ${stateGroups.length} types` : ""
                }. Click any to see its metros and footprint.`}
                groups={stateGroups.map((g) => ({
                  type: g.type,
                  label: g.label,
                  rows: g.rows.map((s) => ({
                    slug: s.slug,
                    name: s.name,
                    iso: s.iso ?? null,
                    type: s.type,
                    metroCount: s.metroCount,
                  })),
                }))}
              />
            </Collapsible>
          ) : null}

          {children.length > 0 ? (
            <Collapsible id="constituents" title={withIcon("constituents", "Constituents and territories")}>
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

          {/* ================= OVERVIEW ================================= */}
          <CountryFactsSection facts={facts} />

          {indicators ? (
            <Collapsible
              id="economy"
              title={withIcon("economy", "Economy and development")}
              right={indicators.incomeLevel ? <IncomeBadge level={indicators.incomeLevel} /> : null}
            >
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {ECON_INDICATORS.map(({ key, label, src, fmt }) => {
                  const iv = indicators.indicators[key];
                  if (!iv) return null;
                  const r = getIndicatorRank(country.slug, key);
                  const gold = isTop5pct(r);
                  // Percentile: 1 = best. Derived from the rank we already
                  // have, so no new data and no new pass over the indicators.
                  const percentile = r && r.total > 1 ? (r.total - r.rank) / (r.total - 1) : null;
                  return (
                    <StatCard
                      key={key}
                      label={label}
                      value={fmt(iv.value)}
                      sub={`${src} · ${iv.year}`}
                      rank={r ? `#${r.rank} / ${r.total}` : undefined}
                      gold={gold}
                      percentile={percentile}
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
                (UNDP, UN WPP, V-Dem, Global Carbon Budget, Ember, Energy Institute; CC BY 4.0). Each card
                credits its originating body. Renewable share is of electricity generation, not of primary
                energy. Each figure is the most recent year available.
              </p>
            </Collapsible>
          ) : null}

          <OrgsSection countrySlug={slug} />

          {/* The Political leadership / Elections cards are passed INTO the
              Leadership section rather than rendered as a sibling here, so they
              live inside <section id="leaders"> and cannot be stranded by a
              future reorder. They sit outside the <details>, so they stay
              visible even though Leadership History starts collapsed. */}
          <LeadersSection
            countrySlug={slug}
            aside={
              ELECTION_CARD[slug] ? (
                <div className="grid gap-3 sm:grid-cols-2 mt-4">
                  {slug === "united-states" || slug === "united-kingdom" ? (
                    <Link
                      href={slug === "united-states" ? "/us-political-leadership" : "/uk-political-leadership"}
                      className="block rounded-xl border p-4 transition-colors hover:border-[var(--accent)] min-w-0"
                      style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
                    >
                      <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">Political leadership</p>
                      <p className="font-bold text-[var(--text)]">
                        {slug === "united-states"
                          ? "President, Supreme Court, Cabinet, governors & Congress →"
                          : "The Crown, Prime Minister, Cabinet & Parliament →"}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        Who holds power today, with a time machine back through history.
                      </p>
                    </Link>
                  ) : null}
                  <Link
                    href={ELECTION_CARD[slug].href}
                    className="block rounded-xl border p-4 transition-colors hover:border-[var(--accent)] min-w-0"
                    style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
                  >
                    <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">Elections</p>
                    <p className="font-bold text-[var(--text)]">{ELECTION_CARD[slug].head}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">{ELECTION_CARD[slug].sub}</p>
                  </Link>
                </div>
              ) : null
            }
          />

          <PowerSection series={powerSeries} name={country.name} />
          <ConflictsSection wars={conflictWars} />
          <BillionairesSection list={billionaires} />

          {(hasNationalTeams || champTitles.length > 0) ? (
            <Collapsible id="national-teams" collapseOnMobile title={withIcon("national-teams", "National Teams")}>
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

          <footer className="mt-12 pt-8 border-t border-[var(--border)] text-sm text-[var(--text-muted)]">
            <p>
              Browse <Link href="/countries" className="text-[var(--accent)] hover:underline">all countries</Link>,
              read the <Link href="/methodology" className="text-[var(--accent)] hover:underline">composite methodology</Link>,
              or jump back to the <Link href="/" className="text-[var(--accent)] hover:underline">global rankings</Link>.
            </p>
            {/* Population source moved into the header provenance stamp so the
                page states its as-of date up front rather than 800 lines down. */}
          </footer>
        </div>
      </main>
    </>
  );
}
