import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getMetrosForState,
  getState,
  getTopStateSlugsForStaticParams,
} from "@/lib/states";
import { getCountry, getCountryByName } from "@/lib/countries";
import StateMap from "./StateMap";
import { getStateGovernor } from "@/lib/governors";
import { getStateFacts, getInCountryRank, getAreaRank } from "@/lib/stateFacts";
import StateFactsSection from "./StateFactsSection";
import { computeTier, tierAnchor } from "@/lib/tiers";
import { formatPop, regionColors } from "@/lib/shared";
import {
  AUTHOR,
  BASE_URL,
  PUBLISHER,
  SITE_NAME,
  serializeJsonLd,
} from "@/lib/seo";

// Pre-generate only the top 500 states by score (see
// getTopStateSlugsForStaticParams). Every other state - including the
// ~1,650 with zero metros and the ~1,687 lower-scoring states that do have
// one - is still reachable: dynamicParams=true lets Next.js render it on
// first request, and the long revalidate caches the result so the second
// request is fast.
export const dynamicParams = true;
export const revalidate = 31536000; // 1 year — effectively static

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return getTopStateSlugsForStaticParams().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const s = getState(slug);
  if (!s) return { title: "State not found" };
  const url = `${BASE_URL}/states/${s.slug}`;
  const desc = `${s.name}, ${s.country}: population, capital, and a ranked list of every metro tracked.`;
  return {
    title: `${s.name} (${s.country})`,
    description: desc,
    alternates: { canonical: `/states/${s.slug}` },
    openGraph: {
      title: `${s.name}, ${s.country} | ${SITE_NAME}`,
      description: desc,
      url,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${s.name}, ${s.country} | ${SITE_NAME}`,
      description: desc,
    },
  };
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      className="border rounded-lg p-4"
      style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <div
        className="text-xs uppercase tracking-wider text-[var(--text-dim)]"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {label}
      </div>
      <div className="text-2xl font-bold mt-1 text-[var(--text)]">{value}</div>
      {sub ? <div className="text-xs text-[var(--text-muted)] mt-1">{sub}</div> : null}
    </div>
  );
}

function CapitalBadge() {
  return (
    <span
      className="ml-2 inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
      style={{
        backgroundColor: "rgba(245, 158, 11, 0.18)",
        color: "#f59e0b",
        fontFamily: "'JetBrains Mono', monospace",
      }}
      title={`Capital of the state/province`}
    >
      ★ Capital
    </span>
  );
}

export default async function StateDetailPage({ params }: Props) {
  const { slug } = await params;
  const state = getState(slug);
  const governor = await getStateGovernor(slug);
  if (!state) notFound();

  const metros = getMetrosForState(slug);

  const facts = getStateFacts(slug);
  const inCountryRank = getInCountryRank(slug);
  const areaRank = getAreaRank(slug);
  const flagshipMetro =
    metros.length > 0 ? { name: metros[0].name, slug: metros[0].slug } : null;

  // Resolve the country page link. The state's `country` field is the
  // immediate parent in the sheet (England / Anguilla / etc.), and its
  // `mainCountry` is the sovereign state. Prefer the immediate parent
  // since /countries/england, /countries/anguilla etc. exist as their
  // own pages and feel more accurate as the breadcrumb anchor.
  const parentCountry =
    getCountryByName(state.country) || getCountryByName(state.mainCountry);

  // Top-level breadcrumb: always link to /countries/{mainCountry-slug} so
  // readers can step out one level even if the immediate parent (e.g.
  // England) is itself a constituent of a larger sovereign.
  const sovereign =
    parentCountry?.parent != null
      ? getCountry(parentCountry.parent_slug || "")
      : parentCountry;

  const collectionLd = {
    "@context": "https://schema.org",
    "@type": "Place",
    name: state.name,
    description: `${state.name}, ${state.country}: tracked metropolitan areas, population, and composite score.`,
    url: `${BASE_URL}/states/${state.slug}`,
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: BASE_URL, publisher: PUBLISHER },
    author: AUTHOR,
  };

  const totalMetroPop = metros.reduce((s, m) => s + (m.pop || 0), 0);
  const totalScore = metros.reduce((s, m) => s + (m.score || 0), 0);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(collectionLd) }}
      />
      <main className="min-h-screen pt-24 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <nav
            className="mb-6 flex items-center gap-3 text-xs text-[var(--text-muted)] flex-wrap"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            <Link href="/" className="hover:text-[var(--accent)]">
              Rankings
            </Link>
            <span>/</span>
            <Link href="/countries" className="hover:text-[var(--accent)]">
              Countries
            </Link>
            {sovereign ? (
              <>
                <span>/</span>
                <Link
                  href={`/countries/${sovereign.slug}`}
                  className="hover:text-[var(--accent)]"
                >
                  {sovereign.name}
                </Link>
              </>
            ) : null}
            {parentCountry && parentCountry !== sovereign ? (
              <>
                <span>/</span>
                <Link
                  href={`/countries/${parentCountry.slug}`}
                  className="hover:text-[var(--accent)]"
                >
                  {parentCountry.name}
                </Link>
              </>
            ) : null}
            <span>/</span>
            <span className="text-[var(--text)]">{state.name}</span>
          </nav>

          <header className="mb-10 border-b border-[var(--border)] pb-8">
            {facts?.flag ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={facts.flag}
                alt={`Flag of ${state.name}`}
                className="h-8 mb-3 rounded-sm border border-[var(--border)]"
                loading="lazy"
              />
            ) : null}
            <div className="flex items-baseline gap-3 mb-3 flex-wrap">
              <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
                {state.name}
              </h1>
              <span
                className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded italic"
                style={{
                  color: "var(--text-dim)",
                  border: "1px solid var(--border)",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {state.type}
              </span>
              {state.iso ? (
                <span
                  className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={{
                    color: "var(--text-muted)",
                    backgroundColor: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                  title="ISO 3166-2 code"
                >
                  {state.iso}
                </span>
              ) : null}
            </div>
            <p className="text-sm text-[var(--text-muted)] mb-4">
              {state.type} of{" "}
              {parentCountry ? (
                <Link
                  href={`/countries/${parentCountry.slug}`}
                  className="text-[var(--accent)] hover:underline"
                >
                  {state.country}
                </Link>
              ) : (
                state.country
              )}
              {state.mainCountry && state.mainCountry !== state.country ? (
                <>
                  {" "}
                  ({state.mainCountry})
                </>
              ) : null}
              .
            </p>

            <div className="flex flex-wrap items-center gap-3 mb-6 text-sm text-[var(--text-muted)]">
              {state.continent ? (
                <span className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor:
                        regionColors[state.continent] || "var(--text-dim)",
                    }}
                  />
                  {state.continent}
                </span>
              ) : null}
              {state.capital ? (
                <span>
                  <span className="text-[var(--text-dim)]">Capital:</span> {state.capital}
                </span>
              ) : null}
              {governor ? (
                <span>
                  <span className="text-[var(--text-dim)]">Governor:</span> {governor.name}
                  <span className="text-[var(--text-dim)]"> ({governor.party})</span>
                </span>
              ) : null}
              {state.subRegion ? (
                <span>
                  <span className="text-[var(--text-dim)]">Sub-region:</span>{" "}
                  {state.subRegion}
                </span>
              ) : null}
              {state.languageAdmin ? (
                <span>
                  <span className="text-[var(--text-dim)]">Language:</span>{" "}
                  {state.languageAdmin}
                  {state.languageSecondary ? `, ${state.languageSecondary}` : ""}
                </span>
              ) : null}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard
                label="Population"
                value={state.pop != null ? formatPop(state.pop) : "—"}
              />
              <StatCard
                label="Metros tracked"
                value={metros.length.toString()}
                sub={
                  metros.length > 0 && state.pop
                    ? `${formatPop(totalMetroPop)} in metros (${(
                        (totalMetroPop / state.pop) *
                        100
                      ).toFixed(0)}%)`
                    : undefined
                }
              />
              <StatCard
                label="Composite score"
                value={totalScore > 0 ? totalScore.toFixed(1) : "—"}
                sub={metros.length > 0 ? "Sum across tracked metros" : undefined}
              />
              <StatCard
                label="Type"
                value={state.type}
                sub={state.iso ? `ISO 3166-2: ${state.iso}` : undefined}
              />
            </div>
          </header>

          <StateFactsSection
            facts={facts}
            pop={state.pop}
            rank={inCountryRank}
            areaRank={areaRank}
            flagship={flagshipMetro}
            countryName={state.mainCountry}
          />

          {metros.length > 0 ? (
            <StateMap slug={state.slug} stateName={state.name} />
          ) : null}

          <section className="mb-12">
            <h2 className="text-xl font-bold mb-3">
              {metros.length > 0
                ? `${metros.length} tracked ${metros.length === 1 ? "metro" : "metros"}`
                : "No metros tracked yet"}
            </h2>
            {metros.length > 0 ? (
              <div
                className="border rounded-lg overflow-hidden"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border)",
                }}
              >
                {/* Mobile: stacked cards */}
                <div className="sm:hidden divide-y divide-[var(--border)]">
                  {metros.map((m) => {
                    const tier = computeTier(m.score);
                    const isCapital =
                      state.capital != null && m.name === state.capital;
                    return (
                      <div key={`${m.slug}-card`} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-xs text-[var(--text-dim)] tabular-nums mr-1.5" style={{ fontFamily: "'JetBrains Mono', monospace" }}>#{m.rank}</span>
                            <Link
                              href={`/rankings/${m.slug}`}
                              className="font-semibold hover:text-[var(--accent)]"
                            >
                              {m.name}
                            </Link>
                            {isCapital ? <CapitalBadge /> : null}
                          </div>
                          <span className="flex-shrink-0 font-bold tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)" }}>
                            {m.score.toFixed(1)}
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                          <span className="tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatPop(m.pop)}</span>
                          <Link
                            href={`/methodology${tierAnchor(m.score)}`}
                            className="hover:text-[var(--accent)]"
                            style={{ fontFamily: "'JetBrains Mono', monospace" }}
                          >
                            {tier.name}
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Desktop: table */}
                <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr
                      className="text-left text-xs text-[var(--text-dim)] uppercase tracking-wider"
                      style={{
                        borderBottom: "1px solid var(--border)",
                        fontFamily: "'JetBrains Mono', monospace",
                      }}
                    >
                      <th className="py-2 pl-4 pr-4">Rank</th>
                      <th className="py-2 pr-4">Metro</th>
                      <th className="hidden sm:table-cell py-2 pr-4 text-right">
                        Population
                      </th>
                      <th className="py-2 pr-4 text-right">Score</th>
                      <th className="py-2 pr-4 text-right">Tier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metros.map((m) => {
                      const tier = computeTier(m.score);
                      const isCapital =
                        state.capital != null && m.name === state.capital;
                      return (
                        <tr key={m.slug} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td
                            className="py-3 pl-4 pr-4 text-xs text-[var(--text-dim)]"
                            style={{ fontFamily: "'JetBrains Mono', monospace" }}
                          >
                            #{m.rank}
                          </td>
                          <td className="py-3 pr-4">
                            <Link
                              href={`/rankings/${m.slug}`}
                              className="font-semibold hover:text-[var(--accent)]"
                            >
                              {m.name}
                            </Link>
                            {isCapital ? <CapitalBadge /> : null}
                          </td>
                          <td
                            className="hidden sm:table-cell py-3 pr-4 text-right text-[var(--text-muted)]"
                            style={{ fontFamily: "'JetBrains Mono', monospace" }}
                          >
                            {formatPop(m.pop)}
                          </td>
                          <td
                            className="py-3 pr-4 text-right font-bold"
                            style={{
                              fontFamily: "'JetBrains Mono', monospace",
                              color: "var(--accent)",
                            }}
                          >
                            {m.score.toFixed(1)}
                          </td>
                          <td
                            className="py-3 pr-4 text-right text-xs"
                            style={{
                              fontFamily: "'JetBrains Mono', monospace",
                              color: "var(--text-muted)",
                            }}
                          >
                            <Link
                              href={`/methodology${tierAnchor(m.score)}`}
                              className="hover:text-[var(--accent)]"
                            >
                              {tier.name}
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            ) : (
              <div
                className="border rounded-lg p-8 text-center"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border)",
                }}
              >
                <p className="text-[var(--text-muted)] mb-2">
                  No metros are currently tracked for {state.name} in the dataset.
                </p>
                <p className="text-xs text-[var(--text-dim)]">
                  This page will populate automatically when metros are added.
                </p>
              </div>
            )}
          </section>

          <footer className="mt-12 pt-8 border-t border-[var(--border)] text-sm text-[var(--text-muted)]">
            <p>
              {parentCountry ? (
                <>
                  Browse all states of{" "}
                  <Link
                    href={`/countries/${parentCountry.slug}`}
                    className="text-[var(--accent)] hover:underline"
                  >
                    {state.country}
                  </Link>
                  ,{" "}
                </>
              ) : null}
              read the{" "}
              <Link
                href="/methodology"
                className="text-[var(--accent)] hover:underline"
              >
                composite methodology
              </Link>
              , or jump back to the{" "}
              <Link href="/" className="text-[var(--accent)] hover:underline">
                global rankings
              </Link>
              .
            </p>
          </footer>
        </div>
      </main>
    </>
  );
}
