import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAllCountrySlugs,
  getChildrenOf,
  getCountry,
  getMetrosForCountry,
} from "@/lib/countries";
import { getStatesForCountry } from "@/lib/states";
import CountryMap from "./CountryMap";
import { computeTier, tierAnchor } from "@/lib/tiers";
import { formatPop, regionColors } from "@/lib/shared";
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

// Heading for the states/provinces chip section. We pick by dominant Type
// from the rows themselves so federations read as "States", others as
// "Provinces", "Regions", etc. Keeps the chrome accurate per country.
function pickStateHeading(states: { type: string }[]): string {
  if (states.length === 0) return "States and provinces";
  const counts = new Map<string, number>();
  for (const s of states) counts.set(s.type, (counts.get(s.type) || 0) + 1);
  const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  // Pluralize in a way that reads naturally.
  const pluralized: Record<string, string> = {
    State: "States",
    Province: "Provinces",
    Territory: "Territories",
    Region: "Regions",
    Department: "Departments",
    County: "Counties",
    District: "Districts",
    Prefecture: "Prefectures",
    "Federal District": "Federal Districts",
    "Autonomous Region": "Autonomous Regions",
    "Autonomous Republic": "Autonomous Republics",
    "Administrative Area": "Administrative Areas",
  };
  return pluralized[dominant] || `${dominant}s`;
}

function fmtArea(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M km²`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k km²`;
  return `${n} km²`;
}

function fmtPercent(n: number | null): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(0)}%`;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border rounded-lg p-4" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="text-xs uppercase tracking-wider text-[var(--text-dim)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{label}</div>
      <div className="text-2xl font-bold mt-1 text-[var(--text)]">{value}</div>
      {sub ? <div className="text-xs text-[var(--text-muted)] mt-1">{sub}</div> : null}
    </div>
  );
}

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
  const country = getCountry(slug);
  if (!country) notFound();

  const metros = getMetrosForCountry(slug);
  const children = getChildrenOf(country.name);
  // States listed under this country in the States sheet (col 4 = Country
  // exact match). UK gets zero hits because UK subdivisions live under
  // England / Scotland / Wales / Northern Ireland; those constituent
  // pages render their own state chips.
  const states = getStatesForCountry(country.name);
  // Pick a section heading appropriate to the dominant subdivision type.
  // Most countries list "States" or "Provinces"; some are mixed.
  const stateLabel = pickStateHeading(states);

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
              <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">{country.name}</h1>
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
              {country.capital ? (<span><span className="text-[var(--text-dim)]">Capital:</span> {country.capital}</span>) : null}
              {country.mostImportantMetro && country.mostImportantMetro !== country.capital ? (
                <span><span className="text-[var(--text-dim)]">Most important metro:</span> {country.mostImportantMetro}</span>
              ) : null}
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

          {children.length > 0 ? (
            <section className="mb-12">
              <h2 className="text-xl font-bold mb-3">Constituents and territories</h2>
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
            </section>
          ) : null}

          {states.length > 0 ? (
            <section className="mb-12">
              <h2 className="text-xl font-bold mb-3">{stateLabel}</h2>
              <p className="text-sm text-[var(--text-muted)] mb-4">
                {states.length} {stateLabel.toLowerCase()} listed under {country.name}. Click any to see its metros and footprint.
              </p>
              <div className="flex flex-wrap gap-2">
                {states.map((s) => (
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
            </section>
          ) : null}

          {metros.length > 0 ? (
            <CountryMap slug={country.slug} countryName={country.name} />
          ) : null}

          <section className="mb-12">
            <h2 className="text-xl font-bold mb-3">
              {metros.length > 0 ? `${metros.length} tracked ${metros.length === 1 ? "metro" : "metros"}` : "No metros tracked yet"}
            </h2>
            {metros.length > 0 ? (
              <div className="border rounded-lg overflow-x-auto" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
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
            ) : (
              <div className="border rounded-lg p-8 text-center" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
                <p className="text-[var(--text-muted)] mb-2">No metros are currently tracked for {country.name} in the dataset.</p>
                <p className="text-xs text-[var(--text-dim)]">This page will populate automatically when metros are added.</p>
              </div>
            )}
          </section>

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
