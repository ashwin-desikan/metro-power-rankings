import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAllMetros,
  getMetroDetail,
  type MetroDetail,
} from "@/lib/data";
import { BASE_URL } from "@/lib/seo";
import { computeTier } from "@/lib/tiers";
import MetroMap from "@/app/MetroMap";
import ShareRow from "@/app/_shared/ShareRow";

// Matchup pages: canonical head-to-head URLs for any two metros.
// URL pattern: /matchups/{a-slug}-vs-{b-slug}
// Canonical form sorts the two slugs alphabetically so each pair has one URL.
//
// Pre-rendered for the top 25 metros × top 25 (300 unique pairs) at build
// time. Other pairs return 404; expand the static set later by widening
// generateStaticParams. The /compare utility remains the universal pick-any-two
// surface; /matchups is the canonical, indexable, shareable surface for pairs
// that matter editorially.

export const dynamicParams = false;

const PAIR_SEPARATOR = "-vs-";
const TOP_N_FOR_STATIC_PARAMS = 25;

function parsePairSlug(slug: string): [string, string] | null {
  const idx = slug.indexOf(PAIR_SEPARATOR);
  if (idx <= 0) return null;
  const a = slug.slice(0, idx);
  const b = slug.slice(idx + PAIR_SEPARATOR.length);
  if (!a || !b || a === b) return null;
  return [a, b];
}

function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function pairSlug(a: string, b: string): string {
  const [x, y] = canonicalPair(a, b);
  return `${x}${PAIR_SEPARATOR}${y}`;
}

export async function generateStaticParams() {
  const metros = getAllMetros()
    .filter((m) => m.rank > 0 && m.rank <= TOP_N_FOR_STATIC_PARAMS)
    .map((m) => m.slug);
  const params: Array<{ slug: string }> = [];
  for (let i = 0; i < metros.length; i++) {
    for (let j = i + 1; j < metros.length; j++) {
      params.push({ slug: pairSlug(metros[i], metros[j]) });
    }
  }
  return params;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const parsed = parsePairSlug(slug);
  if (!parsed) {
    return { title: "Matchup Not Found" };
  }
  const [a, b] = parsed;
  const detailA = getMetroDetail(a);
  const detailB = getMetroDetail(b);
  if (!detailA || !detailB) {
    return { title: "Matchup Not Found" };
  }
  const title = `${detailA.metro.name} vs ${detailB.metro.name}: head-to-head metro power ranking`;
  const description = `${detailA.metro.name} (#${detailA.metro.rank}, score ${detailA.metro.score.toFixed(1)}) vs ${detailB.metro.name} (#${detailB.metro.rank}, score ${detailB.metro.score.toFixed(1)}). Tier match, dimension-by-dimension verdict, and the case for each.`;
  const ogImageUrl = `${BASE_URL}/api/og/compare?m=${a},${b}`;
  return {
    title,
    description,
    alternates: { canonical: `/matchups/${slug}` },
    openGraph: {
      title: `${detailA.metro.name} vs ${detailB.metro.name}`,
      description,
      url: `${BASE_URL}/matchups/${slug}`,
      type: "article",
      images: [{ url: ogImageUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${detailA.metro.name} vs ${detailB.metro.name}`,
      description,
      images: [ogImageUrl],
    },
  };
}

// Dimensions surfaced on the matchup page. Same set the comparison OG card
// uses, plus a few more for the full table because the page has the room.
const MATCHUP_DIMENSIONS: Array<{ key: string; label: string; group: string }> = [
  { key: "marketCap", label: "Market cap", group: "Economy" },
  { key: "companies", label: "Major companies", group: "Economy" },
  { key: "majorLeagueTeams", label: "Major league teams", group: "Sports" },
  { key: "majorSportingEvents", label: "Major sporting events", group: "Sports" },
  { key: "topUniHospResearch", label: "Universities / hospitals / research", group: "Education" },
  { key: "culturalEvents", label: "Cultural events", group: "Culture" },
  { key: "museumsLandmarks", label: "Museums and landmarks", group: "Culture" },
  { key: "luxuryStars", label: "Luxury hospitality", group: "Culture" },
  { key: "airportScore", label: "Airport score", group: "Infrastructure" },
  { key: "portsExchangesInfra", label: "Ports, exchanges, infra", group: "Infrastructure" },
  { key: "metroStations", label: "Metro stations", group: "Infrastructure" },
  { key: "suburbStations", label: "Commuter rail", group: "Infrastructure" },
  { key: "trainHubs", label: "Intercity train hubs", group: "Infrastructure" },
  { key: "skyscrapers", label: "Skyscrapers (150m+)", group: "Infrastructure" },
];

function parseRank(rankStr: string | null | undefined): number {
  if (!rankStr) return Infinity;
  const clean = String(rankStr).replace(/^T-/, "");
  const n = parseInt(clean, 10);
  return Number.isFinite(n) ? n : Infinity;
}

type DimensionVerdict = {
  key: string;
  label: string;
  group: string;
  rankA: number;
  rankB: number;
  rankADisplay: string;
  rankBDisplay: string;
  winner: "a" | "b" | "tie" | "neither";
};

function buildVerdicts(
  detailA: MetroDetail,
  detailB: MetroDetail,
): DimensionVerdict[] {
  return MATCHUP_DIMENSIONS.map(({ key, label, group }) => {
    const rawA = detailA.dimRanks?.[key];
    const rawB = detailB.dimRanks?.[key];
    const rankA = parseRank(rawA);
    const rankB = parseRank(rawB);
    let winner: DimensionVerdict["winner"] = "neither";
    if (Number.isFinite(rankA) || Number.isFinite(rankB)) {
      if (rankA === rankB) winner = "tie";
      else if (rankA < rankB) winner = "a";
      else winner = "b";
    }
    return {
      key,
      label,
      group,
      rankA,
      rankB,
      rankADisplay: rawA ?? "—",
      rankBDisplay: rawB ?? "—",
      winner,
    };
  });
}

// Template-driven editorial paragraph. Hand-written copy for the top
// matchups can override this later by exporting a per-pair record from a
// matchups/copy.ts module; for v1 every pair gets the deterministic
// version. The template is structured so it never sounds robotic: it
// names the tier match, identifies the dominant metro, surfaces the
// largest competitive gap, and signs off with a question.
function buildEditorialParagraph(
  detailA: MetroDetail,
  detailB: MetroDetail,
  verdicts: DimensionVerdict[],
): string {
  const tierA = computeTier(detailA.metro.score);
  const tierB = computeTier(detailB.metro.score);
  const sameTier = tierA.slug === tierB.slug;
  const aWins = verdicts.filter((v) => v.winner === "a").length;
  const bWins = verdicts.filter((v) => v.winner === "b").length;
  const ties = verdicts.filter((v) => v.winner === "tie").length;

  const scoreDiff = Math.abs(detailA.metro.score - detailB.metro.score);
  const higher =
    detailA.metro.score >= detailB.metro.score ? detailA : detailB;
  const lower = higher.metro.slug === detailA.metro.slug ? detailB : detailA;

  // Find the most decisive dimension gap (largest |rankA - rankB|).
  let biggestGap: DimensionVerdict | null = null;
  let biggestGapSize = 0;
  for (const v of verdicts) {
    if (!Number.isFinite(v.rankA) || !Number.isFinite(v.rankB)) continue;
    const gap = Math.abs(v.rankA - v.rankB);
    if (gap > biggestGapSize) {
      biggestGap = v;
      biggestGapSize = gap;
    }
  }

  const tierLine = sameTier
    ? `Both ${detailA.metro.name} and ${detailB.metro.name} sit in the ${tierA.name} tier.`
    : `${detailA.metro.name} sits in the ${tierA.name} tier; ${detailB.metro.name} is a ${tierB.name}.`;

  const compositeLine = `On the composite, ${higher.metro.name} edges out ${lower.metro.name} by ${scoreDiff.toFixed(1)} points (${higher.metro.score.toFixed(1)} to ${lower.metro.score.toFixed(1)}).`;

  const dimsLine = `Across the fourteen dimensions tracked here, ${detailA.metro.name} leads on ${aWins}, ${detailB.metro.name} leads on ${bWins}${ties > 0 ? `, and ${ties} are tied` : ""}.`;

  const gapLine = biggestGap
    ? `The widest gap is on ${biggestGap.label.toLowerCase()}: ${
        biggestGap.winner === "a"
          ? `${detailA.metro.name} ranks #${biggestGap.rankADisplay} globally while ${detailB.metro.name} sits at #${biggestGap.rankBDisplay}`
          : `${detailB.metro.name} ranks #${biggestGap.rankBDisplay} globally while ${detailA.metro.name} sits at #${biggestGap.rankADisplay}`
      }.`
    : "";

  return [tierLine, compositeLine, dimsLine, gapLine].filter(Boolean).join(" ");
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function MatchupPage({ params }: PageProps) {
  const { slug } = await params;
  const parsed = parsePairSlug(slug);
  if (!parsed) notFound();
  const [a, b] = parsed;

  // Enforce canonical (alphabetical) form. If the URL is in the other order,
  // rendering the same content would create duplicate-canonical issues for
  // SEO. The metadata canonical above always points to canonical form;
  // additionally, generateStaticParams only produces canonical slugs, so
  // non-canonical URLs are not built and naturally 404 with dynamicParams = false.
  const canonical = pairSlug(a, b);
  if (canonical !== slug) notFound();

  const detailA = getMetroDetail(a);
  const detailB = getMetroDetail(b);
  if (!detailA || !detailB) notFound();

  const tierA = computeTier(detailA.metro.score);
  const tierB = computeTier(detailB.metro.score);
  const sameTier = tierA.slug === tierB.slug;
  const verdicts = buildVerdicts(detailA, detailB);
  const editorial = buildEditorialParagraph(detailA, detailB, verdicts);
  const aWins = verdicts.filter((v) => v.winner === "a").length;
  const bWins = verdicts.filter((v) => v.winner === "b").length;

  // Group verdicts by dimension group for the rendered table.
  const groupOrder: string[] = [];
  const grouped: Record<string, DimensionVerdict[]> = {};
  for (const v of verdicts) {
    if (!grouped[v.group]) {
      grouped[v.group] = [];
      groupOrder.push(v.group);
    }
    grouped[v.group].push(v);
  }

  const shareUrl = `${BASE_URL}/matchups/${slug}`;
  const shareTitle = `${detailA.metro.name} vs ${detailB.metro.name} - Global Metro Power Rankings`;

  return (
    <main className="min-h-screen pt-24 pb-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <nav className="text-xs mb-8" aria-label="Breadcrumb">
          <Link
            href="/"
            className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            &larr; Back to rankings
          </Link>
        </nav>

        <header className="mb-10 border-b border-[var(--border)] pb-8">
          <p
            className="text-xs tracking-widest text-[var(--text-muted)] mb-3"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            HEAD TO HEAD
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            {detailA.metro.name} vs {detailB.metro.name}
          </h1>
          <p className="text-lg text-[var(--text-muted)] leading-relaxed">
            {sameTier ? "Tier match: " : "Cross-tier: "}
            <span style={{ color: tierA.accentHex, fontWeight: 600 }}>
              {tierA.name}
            </span>
            {" vs "}
            <span style={{ color: tierB.accentHex, fontWeight: 600 }}>
              {tierB.name}
            </span>
            {". "}
            <span style={{ color: tierA.accentHex, fontWeight: 600 }}>
              {detailA.metro.name} {aWins}
            </span>
            {" · "}
            <span style={{ color: tierB.accentHex, fontWeight: 600 }}>
              {bWins} {detailB.metro.name}
            </span>
            {" on dimension wins."}
          </p>
        </header>

        {/* Two-metro hero cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
          {[detailA, detailB].map((d) => {
            const tier = computeTier(d.metro.score);
            return (
              <div
                key={d.metro.slug}
                className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-6"
                style={{ borderLeft: `4px solid ${tier.accentHex}` }}
              >
                <Link
                  href={`/rankings/${d.metro.slug}`}
                  className="block hover:underline"
                >
                  <h2 className="text-2xl font-bold">{d.metro.name}</h2>
                </Link>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  {(d.metro.sovereignSlug ?? d.metro.countrySlug) ? (
                    <Link
                      href={`/countries/${d.metro.sovereignSlug ?? d.metro.countrySlug}`}
                      className="hover:text-[var(--accent)]"
                    >
                      {d.metro.country}
                    </Link>
                  ) : (
                    d.metro.country
                  )}
                </p>
                <div className="flex items-center gap-3 mt-4">
                  <span
                    className="inline-block text-xs font-semibold rounded-full px-3 py-1 border"
                    style={{
                      color: tier.accentHex,
                      borderColor: tier.accentHex,
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    {tier.name}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">
                    Rank #{d.metro.rank}
                  </span>
                </div>
                <div className="flex items-baseline gap-3 mt-6">
                  <span className="text-5xl font-bold text-[var(--text)]">
                    {d.metro.score.toFixed(1)}
                  </span>
                  <span className="text-sm text-[var(--text-muted)]">
                    Power Score
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Map: derby-style geographic context — two markers, dashed line, distance implied */}
        <section className="mb-10">
          <MetroMap
            points={[
              { slug: detailA.metro.slug, name: detailA.metro.name, lat: detailA.metro.lat, lon: detailA.metro.lon },
              { slug: detailB.metro.slug, name: detailB.metro.name, lat: detailB.metro.lat, lon: detailB.metro.lon },
            ]}
            height={360}
          />
        </section>

        {/* Editorial paragraph */}
        <section className="mb-10">
          <p className="text-base leading-relaxed text-[var(--text)]">
            {editorial}
          </p>
        </section>

        {/* Dimension-by-dimension verdict grid */}
        <section className="mb-10">
          <h3 className="text-2xl font-bold mb-4">Dimension verdicts</h3>
          <div className="space-y-6">
            {groupOrder.map((group) => (
              <div key={group}>
                <h4
                  className="text-xs tracking-widest text-[var(--text-muted)] mb-3"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {group.toUpperCase()}
                </h4>
                <div className="space-y-1">
                  {grouped[group].map((v) => {
                    const winnerColor =
                      v.winner === "a"
                        ? tierA.accentHex
                        : v.winner === "b"
                        ? tierB.accentHex
                        : "var(--text-muted)";
                    return (
                      <div
                        key={v.key}
                        className="flex flex-col gap-1 py-2 border-b border-[var(--border)] sm:grid sm:grid-cols-12 sm:items-center sm:gap-0"
                      >
                        <span className="text-sm sm:col-span-5">{v.label}</span>
                        <div className="flex items-center sm:contents">
                          <span
                            className="flex-1 text-sm text-right sm:col-span-3"
                            style={{
                              color:
                                v.winner === "a" ? tierA.accentHex : "var(--text)",
                              fontWeight: v.winner === "a" ? 600 : 400,
                              fontFamily: "'JetBrains Mono', monospace",
                            }}
                          >
                            #{v.rankADisplay}
                          </span>
                          <span
                            className="w-6 text-center text-xs sm:w-auto sm:col-span-1"
                            style={{ color: winnerColor }}
                            aria-hidden="true"
                          >
                            {v.winner === "a"
                              ? "◀"
                              : v.winner === "b"
                              ? "▶"
                              : "·"}
                          </span>
                          <span
                            className="flex-1 text-sm text-left sm:col-span-3"
                            style={{
                              color:
                                v.winner === "b" ? tierB.accentHex : "var(--text)",
                              fontWeight: v.winner === "b" ? 600 : 400,
                              fontFamily: "'JetBrains Mono', monospace",
                            }}
                          >
                            #{v.rankBDisplay}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Share row */}
        <section className="mb-10 pt-6 border-t border-[var(--border)]">
          <h3 className="text-sm font-semibold mb-3 text-[var(--text-muted)]">
            Share this matchup
          </h3>
          <ShareRow url={shareUrl} title={shareTitle} />
        </section>

        {/* Cross-links */}
        <footer className="text-sm text-[var(--text-muted)] pt-6 border-t border-[var(--border)]">
          <p>
            Read the full profile for{" "}
            <Link
              href={`/rankings/${detailA.metro.slug}`}
              className="text-[var(--accent)] hover:underline"
            >
              {detailA.metro.name}
            </Link>{" "}
            or{" "}
            <Link
              href={`/rankings/${detailB.metro.slug}`}
              className="text-[var(--accent)] hover:underline"
            >
              {detailB.metro.name}
            </Link>
            . The composite score formula and all sixteen dimensions are
            documented on the{" "}
            <Link
              href="/methodology"
              className="text-[var(--accent)] hover:underline"
            >
              methodology page
            </Link>
            .
          </p>
        </footer>
      </div>
    </main>
  );
}
