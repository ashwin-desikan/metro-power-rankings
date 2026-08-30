import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  getAllBadges,
  getBadge,
  getLiveBadgeSlugs,
  getQualifyingMetros,
  formatContextValue,
  type QualifyingMetro,
} from "@/lib/badges";
import { computeTier, tierAnchor } from "@/lib/tiers";
import { formatPop } from "@/lib/shared";
import { getAllMetros } from "@/lib/data";
import ConurbationsTable, {
  type EnrichedConurbationRow,
} from "./ConurbationsTable";
import BadgeMap from "./BadgeMap";
import { CappedList } from "@/app/_shared/Disclosure";
import {
  AUTHOR,
  BASE_URL,
  PUBLISHER,
  SITE_NAME,
  serializeJsonLd,
} from "@/lib/seo";

export const dynamicParams = false;

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return getLiveBadgeSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const badge = getBadge(slug);
  if (!badge || badge.status !== "live") {
    return { title: "Badge not found" };
  }
  const url = `${BASE_URL}/badges/${badge.slug}`;
  const title = `${badge.emoji} ${badge.name}`;
  return {
    title,
    description: badge.shortDesc,
    alternates: { canonical: `/badges/${badge.slug}` },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }],
      title: `${badge.name} | ${SITE_NAME}`,
      description: badge.shortDesc,
      url,
      type: "website",
    },
    twitter: { images: ["/og-default.png"],
      card: "summary_large_image",
      title: `${badge.name} | ${SITE_NAME}`,
      description: badge.shortDesc,
    },
  };
}


function MetroRow({
  metro,
  badgeSlug,
  showTier = false,
  position,
}: {
  metro: QualifyingMetro;
  badgeSlug: string;
  showTier?: boolean;
  position?: number;
}) {
  const tier = computeTier(metro.score);
  // Conurbations: ranks A/B/C by descending list position; D uses the lead
  // metro's own rank, prefixed "M" so the reader knows it's a metro rank
  // rather than a conurbation rank.
  const rankLabel =
    badgeSlug === "conurbations"
      ? metro.tier === "D"
        ? `M#${metro.rank}`
        : `#${position ?? metro.rank}`
      : `#${metro.rank}`;
  return (
    <tr style={{ borderBottom: "1px solid var(--border)" }}>
      <td
        className="py-3 pr-4 text-xs text-[var(--text-dim)]"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {rankLabel}
      </td>
      <td className="py-3 pr-4">
        <Link
          href={`/rankings/${metro.slug}`}
          className="font-semibold hover:text-[var(--accent)]"
        >
          {metro.name}
        </Link>
        <span className="text-sm text-[var(--text-muted)] ml-2">
          {metro.country}
        </span>
        {metro.cluster?.componentMetro ? (
          <div className="text-xs text-[var(--text-dim)] mt-0.5">
            <span>anchor: </span>
            <Link
              href={`/rankings/${metro.cluster.componentMetro.slug}`}
              className="hover:text-[var(--accent)] underline-offset-2"
            >
              {metro.cluster.componentMetro.name}
            </Link>
            <span> (#{metro.cluster.componentMetro.rank})</span>
          </div>
        ) : null}
        {metro.cluster && metro.cluster.otherSlugs.length > 0 ? (
          <div className="text-xs text-[var(--text-muted)] mt-0.5">
            <span aria-hidden="true">↔ </span>
            {metro.cluster.otherSlugs.map((s, i) => (
              <span key={s}>
                <Link href={`/rankings/${s}`} className="hover:text-[var(--accent)]">
                  {metro.cluster!.otherNames[i] ?? s}
                </Link>
                {i < metro.cluster!.otherSlugs.length - 1 ? <span>, </span> : null}
              </span>
            ))}
            <span className="text-[var(--text-dim)]"> ({metro.cluster.size} metros, {metro.cluster.diameterKm.toFixed(0)} km, {formatPop(metro.cluster.populationSum)} pop)</span>
          </div>
        ) : metro.cluster && metro.cluster.otherNames.length > 0 ? (
          <div className="text-xs text-[var(--text-muted)] mt-0.5">
            <span aria-hidden="true">↔ </span>
            <span>{metro.cluster.otherNames.join(", ")}</span>
            <span className="text-[var(--text-dim)]"> ({metro.cluster.size} areas, {formatPop(metro.cluster.populationSum)} pop)</span>
          </div>
        ) : metro.peerName && metro.peerSlug ? (
          <div className="text-xs text-[var(--text-muted)] mt-0.5">
            <span aria-hidden="true">nearest peer: </span>
            <Link
              href={`/rankings/${metro.peerSlug}`}
              className="hover:text-[var(--accent)]"
            >
              {metro.peerName}
            </Link>
            {metro.peerRank ? <span className="text-[var(--text-dim)]"> (#{metro.peerRank})</span> : null}
            {metro.peerCountry && metro.peerCountry !== metro.country ? (
              <span className="text-[var(--text-dim)]"> ({metro.peerCountry})</span>
            ) : null}
          </div>
        ) : null}
      </td>
      {showTier && metro.tier ? (
        <td
          className="py-3 pr-4 text-xs"
          style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-muted)" }}
        >
          Tier {metro.tier}
        </td>
      ) : null}
      <td
        className="py-3 pr-4 text-right font-bold"
        style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)" }}
      >
        {formatContextValue(badgeSlug, metro.contextValue)}
      </td>
      <td
        className="py-3 text-right text-sm"
        style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-muted)" }}
      >
        <Link
          href={`/methodology${tierAnchor(metro.score)}`}
          className="hover:text-[var(--accent)]"
        >
          {tier.name}
        </Link>
      </td>
    </tr>
  );
}

// Mobile card equivalent of MetroRow — same fields, stacked layout so no
// column has to be hidden or scrolled to at 375px.
function MetroCard({
  metro,
  badgeSlug,
  showTier = false,
  position,
}: {
  metro: QualifyingMetro;
  badgeSlug: string;
  showTier?: boolean;
  position?: number;
}) {
  const tier = computeTier(metro.score);
  const rankLabel =
    badgeSlug === "conurbations"
      ? metro.tier === "D"
        ? `M#${metro.rank}`
        : `#${position ?? metro.rank}`
      : `#${metro.rank}`;
  return (
    <div
      className="p-3"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span
            className="text-[10px] text-[var(--text-dim)] mr-1.5"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {rankLabel}
          </span>
          <Link
            href={`/rankings/${metro.slug}`}
            className="font-semibold hover:text-[var(--accent)]"
          >
            {metro.name}
          </Link>
          <span className="text-xs text-[var(--text-muted)] ml-1.5">
            {metro.country}
          </span>
        </div>
        <div className="text-right flex-shrink-0">
          <div
            className="font-bold"
            style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)" }}
          >
            {formatContextValue(badgeSlug, metro.contextValue)}
          </div>
          {showTier && metro.tier ? (
            <div className="text-[10px] text-[var(--text-muted)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              Tier {metro.tier}
            </div>
          ) : null}
        </div>
      </div>
      {metro.cluster?.componentMetro ? (
        <div className="text-xs text-[var(--text-dim)] mt-0.5">
          <span>anchor: </span>
          <Link
            href={`/rankings/${metro.cluster.componentMetro.slug}`}
            className="hover:text-[var(--accent)] underline-offset-2"
          >
            {metro.cluster.componentMetro.name}
          </Link>
          <span> (#{metro.cluster.componentMetro.rank})</span>
        </div>
      ) : null}
      {metro.cluster && metro.cluster.otherSlugs.length > 0 ? (
        <div className="text-xs text-[var(--text-muted)] mt-0.5">
          <span aria-hidden="true">↔ </span>
          {metro.cluster.otherSlugs.map((s, i) => (
            <span key={s}>
              <Link href={`/rankings/${s}`} className="hover:text-[var(--accent)]">
                {metro.cluster!.otherNames[i] ?? s}
              </Link>
              {i < metro.cluster!.otherSlugs.length - 1 ? <span>, </span> : null}
            </span>
          ))}
          <span className="text-[var(--text-dim)]"> ({metro.cluster.size} metros, {metro.cluster.diameterKm.toFixed(0)} km, {formatPop(metro.cluster.populationSum)} pop)</span>
        </div>
      ) : metro.cluster && metro.cluster.otherNames.length > 0 ? (
        <div className="text-xs text-[var(--text-muted)] mt-0.5">
          <span aria-hidden="true">↔ </span>
          <span>{metro.cluster.otherNames.join(", ")}</span>
          <span className="text-[var(--text-dim)]"> ({metro.cluster.size} areas, {formatPop(metro.cluster.populationSum)} pop)</span>
        </div>
      ) : metro.peerName && metro.peerSlug ? (
        <div className="text-xs text-[var(--text-muted)] mt-0.5">
          <span aria-hidden="true">nearest peer: </span>
          <Link
            href={`/rankings/${metro.peerSlug}`}
            className="hover:text-[var(--accent)]"
          >
            {metro.peerName}
          </Link>
          {metro.peerRank ? <span className="text-[var(--text-dim)]"> (#{metro.peerRank})</span> : null}
          {metro.peerCountry && metro.peerCountry !== metro.country ? (
            <span className="text-[var(--text-dim)]"> ({metro.peerCountry})</span>
          ) : null}
        </div>
      ) : null}
      <div className="mt-1.5 text-xs">
        <Link
          href={`/methodology${tierAnchor(metro.score)}`}
          className="hover:text-[var(--accent)] text-[var(--text-muted)]"
        >
          {tier.name}
        </Link>
      </div>
    </div>
  );
}

export default async function BadgeDetailPage({ params }: Props) {
  const { slug } = await params;
  if (slug === "velvet-rock-capital") redirect("/sound/velvet-rock");
  const badge = getBadge(slug);
  if (!badge || badge.status !== "live") notFound();

  const metros = getQualifyingMetros(badge);
  const showTierColumn = badge.tiers !== undefined && metros.some((m) => m.tier);

  // If tiers are defined, group by tier slug
  const tieredGroups: Map<string, QualifyingMetro[]> = new Map();
  if (badge.tiers) {
    for (const t of badge.tiers) tieredGroups.set(t.slug, []);
    for (const m of metros) {
      const k = m.tier ?? "_other";
      const arr = tieredGroups.get(k);
      if (arr) arr.push(m);
    }
  }
  // Positional rank in the sorted list (1-based).
  const positionBySlug = new Map<string, number>();
  metros.forEach((m, i) => positionBySlug.set(m.slug, i + 1));

  const collectionLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: badge.name,
    description: badge.longDesc,
    url: `${BASE_URL}/badges/${badge.slug}`,
    isPartOf: {
      "@type": "WebSite",
      name: SITE_NAME,
      url: BASE_URL,
      publisher: PUBLISHER,
    },
    author: AUTHOR,
    numberOfItems: metros.length,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(collectionLd) }}
      />
      <main className="min-h-screen pt-8 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <nav className="mb-6 flex items-center gap-3 text-xs text-[var(--text-muted)]"
               style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            <Link href="/" className="hover:text-[var(--accent)]">Rankings</Link>
            <span>/</span>
            <Link href="/badges" className="hover:text-[var(--accent)]">Badges</Link>
            <span>/</span>
            <span className="text-[var(--text)]">{badge.name}</span>
          </nav>

          <header className="mb-10 border-b border-[var(--border)] pb-10">
            <div className="flex items-baseline gap-4 mb-4">
              <span className="text-5xl" aria-hidden="true">
                {badge.emoji}
              </span>
              <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
                {badge.name}
              </h1>
            </div>
            <p className="text-lg text-[var(--text-muted)] leading-relaxed max-w-3xl">
              {badge.longDesc}
            </p>
            <div className="flex flex-wrap gap-3 mt-6 text-xs"
                 style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              <span
                className="px-2.5 py-1 rounded"
                style={{
                  backgroundColor: "rgba(78, 205, 196, 0.16)",
                  color: "var(--accent)",
                }}
              >
                {metros.length} {badge.slug === "conurbations" ? "qualifying clusters" : "qualifying metros"}
              </span>
              {badge.methodologyAnchor ? (
                <Link
                  href={`/methodology${badge.methodologyAnchor}`}
                  className="px-2.5 py-1 rounded border hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  style={{
                    borderColor: "var(--border)",
                    color: "var(--text-muted)",
                  }}
                >
                  Methodology &rarr;
                </Link>
              ) : null}
            </div>
          </header>

          {/* Map of qualifying metros. Markers colored by badge tier (when
              defined), filtered by continent and tier, click-to-navigate.
              Rendered once per badge via the shared BadgeMap helper so any
              new badge added to lib/badges.ts BADGES picks it up here. */}
          <BadgeMap badge={badge} qualifying={metros} />

          {/* Conurbations: client-side search + filter, mirrors
              the homepage RankingsTable scope-dropdown pattern. */}
          {badge.slug === "conurbations" && badge.tiers ? (() => {
            const all = getAllMetros();
            const bySlug = new Map(all.map((m) => [m.slug, m]));
            const enriched: EnrichedConurbationRow[] = metros.map((m) => {
              const slugs = m.cluster?.memberSlugs ?? [m.slug];
              const members = slugs
                .map((s) => bySlug.get(s))
                .filter((mm): mm is NonNullable<typeof mm> => mm !== undefined)
                .map((mm) => ({
                  slug: mm.slug,
                  name: mm.name,
                  country: mm.country,
                  subCountry: mm.subCountry,
                  primaryState: mm.primaryState,
                  state2: mm.state2,
                  state3: mm.state3,
                  primaryCity: mm.primaryCity,
                  lat: mm.lat,
                  lon: mm.lon,
                }));
              return { ...m, members };
            });
            return (
              <ConurbationsTable rows={enriched} tiers={badge.tiers!} />
            );
          })() : null}

          {/* Tier breakdown (when applicable) */}
          {badge.slug !== "conurbations" && badge.tiers ? (
            <section className="mb-12">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {badge.tiers.map((t) => {
                  const count = tieredGroups.get(t.slug)?.length ?? 0;
                  return (
                    <div
                      key={t.slug}
                      className="border rounded-lg p-4"
                      style={{
                        backgroundColor: "var(--bg-card)",
                        borderColor: "var(--border)",
                      }}
                    >
                      <div className="text-xs uppercase tracking-wider"
                           style={{ color: t.accentHex, fontFamily: "'JetBrains Mono', monospace" }}>
                        Tier {t.slug}
                      </div>
                      <div className="text-2xl font-bold mt-1">{count}</div>
                      <div className="text-xs text-[var(--text-muted)] mt-1">
                        {t.name.replace(/^Tier \w+ — /, "")}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* List */}
          {badge.slug !== "conurbations" && badge.tiers ? (
            badge.tiers.map((t) => {
              const group = tieredGroups.get(t.slug) ?? [];
              if (group.length === 0) return null;
              return (
                <section key={t.slug} className="mb-12" id={`tier-${t.slug.toLowerCase()}`}>
                  <header className="mb-4">
                    <h2 className="text-2xl font-bold" style={{ color: t.accentHex }}>
                      {t.name}
                    </h2>
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                      {t.description}
                    </p>
                  </header>
                  {/* Mobile: stacked cards instead of a 4-column table */}
                  <div
                    className="border rounded-lg overflow-hidden sm:hidden"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border)",
                    }}
                  >
                    <CappedList
                      initial={12}
                      noun="groups"
                      items={group.map((m) => (
                      <MetroCard
                        key={`${m.slug}-card`}
                        metro={m}
                        badgeSlug={badge.slug}
                        showTier={false}
                        position={positionBySlug.get(m.slug)}
                      />
                    ))}
                    />
                  </div>

                  <div
                    className="border rounded-lg overflow-x-auto hidden sm:block"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border)",
                    }}
                  >
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
                          <th className="py-2 pr-4 text-right">
                            {group[0]?.contextLabel ?? "Value"}
                          </th>
                          <th className="py-2 pr-4 text-right">Tier</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.map((m) => (
                          <MetroRow
                            key={m.slug}
                            metro={m}
                            badgeSlug={badge.slug}
                            showTier={false}
                            position={positionBySlug.get(m.slug)}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })
          ) : badge.slug === "conurbations" ? null : (
            <section className="mb-12">
              {/* Mobile: stacked cards instead of a 4-column table */}
              <div
                className="border rounded-lg overflow-hidden sm:hidden"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border)",
                }}
              >
                <CappedList
                  initial={12}
                  noun="metros"
                  items={metros.map((m, i) => (
                  <MetroCard
                    key={`${m.slug}-card`}
                    metro={m}
                    badgeSlug={badge.slug}
                    showTier={showTierColumn}
                    position={i + 1}
                  />
                ))}
                />
              </div>

              <div
                className="border rounded-lg overflow-x-auto hidden sm:block"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border)",
                }}
              >
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
                      <th className="py-2 pr-4 text-right">
                        {metros[0]?.contextLabel ?? "Value"}
                      </th>
                      <th className="py-2 pr-4 text-right">Tier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metros.map((m, i) => (
                      <MetroRow
                        key={m.slug}
                        metro={m}
                        badgeSlug={badge.slug}
                        showTier={showTierColumn}
                        position={i + 1}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <footer className="mt-12 pt-8 border-t border-[var(--border)] text-sm text-[var(--text-muted)]">
            <p>
              Browse <Link href="/badges" className="text-[var(--accent)] hover:underline">all badges</Link>{" "}
              or read the <Link href="/methodology" className="text-[var(--accent)] hover:underline">composite methodology</Link>.
              For the underlying data structure, see the badge definition in{" "}
              <code className="text-[var(--text)]">lib/badges.ts</code>.
            </p>
          </footer>
        </div>
      </main>
    </>
  );
}
