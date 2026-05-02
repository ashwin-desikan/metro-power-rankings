import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAllBadges,
  getBadge,
  getLiveBadgeSlugs,
  getQualifyingMetros,
  type QualifyingMetro,
} from "@/lib/badges";
import { computeTier, tierAnchor } from "@/lib/tiers";
import { formatPop } from "@/lib/shared";
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
    openGraph: {
      title: `${badge.name} | ${SITE_NAME}`,
      description: badge.shortDesc,
      url,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${badge.name} | ${SITE_NAME}`,
      description: badge.shortDesc,
    },
  };
}

function formatContextValue(badgeSlug: string, value: number): string {
  if (badgeSlug === "university-town") return `${value.toFixed(0)}%`;
  if (badgeSlug === "skyline-city") return `${value.toFixed(0)}%`;
  if (badgeSlug === "megacity") return formatPop(value);
  if (badgeSlug === "finance-capital") {
    if (value >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
    return `$${value.toFixed(0)}`;
  }
  if (badgeSlug === "culture-capital" || badgeSlug === "sports-mecca") {
    return value.toFixed(0);
  }
  if (badgeSlug === "rail-hub" || badgeSlug === "global-gateway") {
    return value % 1 === 0 ? value.toFixed(0) : value.toFixed(1);
  }
  return value.toFixed(1);
}

function MetroRow({
  metro,
  badgeSlug,
  showTier = false,
}: {
  metro: QualifyingMetro;
  badgeSlug: string;
  showTier?: boolean;
}) {
  const tier = computeTier(metro.score);
  return (
    <tr style={{ borderBottom: "1px solid var(--border)" }}>
      <td
        className="py-3 pr-4 text-xs text-[var(--text-dim)]"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        #{metro.rank}
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

export default async function BadgeDetailPage({ params }: Props) {
  const { slug } = await params;
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
      <main className="min-h-screen pt-24 pb-16 px-4 sm:px-6 lg:px-8">
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
                {metros.length} qualifying metros
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

          {/* Tier breakdown (when applicable) */}
          {badge.tiers ? (
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
          {badge.tiers ? (
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
                  <div
                    className="border rounded-lg overflow-x-auto"
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
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })
          ) : (
            <section className="mb-12">
              <div
                className="border rounded-lg overflow-x-auto"
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
                    {metros.map((m) => (
                      <MetroRow
                        key={m.slug}
                        metro={m}
                        badgeSlug={badge.slug}
                        showTier={showTierColumn}
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
