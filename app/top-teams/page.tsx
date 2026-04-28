import type { Metadata } from "next";
import Link from "next/link";
import { getAllMetros } from "@/lib/data";
import {
  AUTHOR,
  BASE_URL,
  PUBLISHER,
  SITE_NAME,
  serializeJsonLd,
} from "@/lib/seo";
import { TOP_TEAMS, topTeamAnchorId } from "@/lib/topTeams";

export const dynamicParams = false;

const PAGE_PATH = "/top-teams";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "The Team That Wins the City";
const PAGE_DESCRIPTION =
  "One crest per city. Across 237 metros, the team that wins the civic identity contest is rarely the one with the most trophies. It is the one whose disappearance would change what the city is.";
const PAGE_PUBLISHED = "2026-04-28";
const METRO_UNIVERSE_LABEL = "4,200+";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: {
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    type: "article",
    publishedTime: PAGE_PUBLISHED,
    authors: [AUTHOR.name],
  },
  twitter: {
    card: "summary_large_image",
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
  },
  keywords: [
    "top sports teams",
    "civic identity",
    "metro sports",
    "global sports rankings",
    "city sports culture",
    "football clubs",
    "sports geography",
  ],
};

/**
 * Aggressive slug normalization so essay-style metro names match dataset
 * slugs. Mirrors the function used in /neighborhoods.
 */
function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.'’]/g, "")
    .replace(/[\s_/]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildSlugIndex(): Map<string, string> {
  const metros = getAllMetros();
  const byNorm = new Map<string, string>();
  for (const m of metros) {
    byNorm.set(normalize(m.name), m.slug);
    byNorm.set(normalize(m.slug), m.slug);
  }
  return byNorm;
}

// Manual overrides for the rare cases where the essay/sheet name does not
// normalize to a dataset slug. Most metros resolve via normalize() alone.
const SLUG_ALIASES: Record<string, string> = {
  "mexico-cdmx": "mexico-city",
  "rhine-ruhr-cologneduesseldorf": "rhine-ruhr",
  "rhine-ruhr": "rhine-ruhr",
  "rhine-neckar": "rhine-neckar",
  "guangzhou-pearl-river-delta": "guangzhou",
  "birmingham-al": "birmingham-al",
  "birmingham-uk": "birmingham-uk",
  "san-francisco-san-jose": "san-francisco-san-jose",
  "washington-baltimore": "washington-baltimore",
  "osaka-kyoto-kobe": "osaka-kyoto-kobe",
  "rotterdam-the-hague": "rotterdam-the-hague",
  "padua-venice": "padua-venice",
  "dubai-sharjah": "dubai-sharjah",
  "busan-ulsan": "busan-ulsan",
  "raleigh-durham": "raleigh-durham",
  "quebec-city": "quebec-city",
  "new-haven": "new-haven",
  "new-orleans": "new-orleans",
  "tel-aviv": "tel-aviv",
  "st-louis": "st-louis",
  "st-petersburg": "st-petersburg",
  "san-sebastian": "san-sebastian",
  "abu-dhabi": "abu-dhabi",
  "omaha-lincoln": "omaha-lincoln",
  "greenville-spartanburg": "greenville-spartanburg",
  "south-bend": "south-bend",
  "state-college": "state-college",
  "baton-rouge": "baton-rouge",
  "kansas-city": "kansas-city",
  "las-vegas": "las-vegas",
  "san-diego": "san-diego",
  "sao-paulo": "sao-paulo",
  "rio-de-janeiro": "rio-de-janeiro",
  "buenos-aires": "buenos-aires",
  "cape-town": "cape-town",
  "hong-kong": "hong-kong",
  "new-york": "new-york",
  "clermont-ferrand": "clermont-ferrand",
  "minho-braga": "minho",
};

function resolveSlug(metro: string, index: Map<string, string>): string | null {
  const n = normalize(metro);
  const direct = index.get(n);
  if (direct) return direct;
  const aliasTarget = SLUG_ALIASES[n];
  if (aliasTarget && index.get(aliasTarget)) return index.get(aliasTarget)!;
  return null;
}

// Sport label normalization for display: keep dataset labels but soften the
// (NCAA) suffix into a parenthetical that reads better in card chrome.
function sportLabel(sport: string): string {
  if (sport === "American Football (NCAA)") return "College Football";
  if (sport === "Basketball (NCAA)") return "College Basketball";
  return sport;
}

// Aggregate counts for the summary chips at the top of the page. Computed at
// build time from the dataset so they stay accurate as rows are added.
function buildSummary() {
  const total = TOP_TEAMS.length;
  const sportCounts = new Map<string, number>();
  for (const t of TOP_TEAMS) {
    const k = sportLabel(t.sport) || "Unspecified";
    sportCounts.set(k, (sportCounts.get(k) ?? 0) + 1);
  }
  const dominantSport = [...sportCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const contestedCount = TOP_TEAMS.filter((t) => t.team.includes("/")).length;
  return { total, sportCounts, dominantSport, contestedCount };
}

export default function TopTeamsPage() {
  const slugIndex = buildSlugIndex();
  const summary = buildSummary();

  // Breadcrumb JSON-LD
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: SITE_NAME,
        item: `${BASE_URL}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Top Sports Teams",
        item: PAGE_URL,
      },
    ],
  };

  // Article JSON-LD for the essay-derived reference page
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    mainEntityOfPage: PAGE_URL,
    headline: PAGE_TITLE,
    alternativeHeadline:
      "One crest per city: the top sporting franchise that defines each of 237 global metros",
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    datePublished: PAGE_PUBLISHED,
    dateModified: PAGE_PUBLISHED,
    inLanguage: "en",
    author: {
      "@type": "Person",
      name: AUTHOR.name,
      url: AUTHOR.url,
    },
    publisher: {
      "@type": "Organization",
      name: PUBLISHER.name,
      url: PUBLISHER.url,
    },
    isPartOf: {
      "@type": "Dataset",
      name: SITE_NAME,
      url: BASE_URL,
    },
    keywords: [
      "top sports teams",
      "civic identity",
      "metro sports",
      "global sports rankings",
      "city sports culture",
      "football clubs",
      "sports geography",
    ],
  };

  // ItemList JSON-LD for the 236 ranked picks
  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Top Sports Teams by Metro",
    description:
      "The single sporting franchise that defines each metro's civic identity, ordered by the metro's rank in the Global Metro Power Rankings.",
    numberOfItems: TOP_TEAMS.length,
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    itemListElement: TOP_TEAMS.map((t, i) => {
      const slug = resolveSlug(t.metro, slugIndex);
      return {
        "@type": "ListItem",
        position: i + 1,
        name: `${t.metro}: ${t.team}`,
        url: slug ? `${BASE_URL}/rankings/${slug}` : PAGE_URL,
      };
    }),
  };

  return (
    <main className="pt-24 pb-24 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: "var(--bg)" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(articleLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(itemListLd) }}
      />

      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <header className="mb-16">
          <div
            className="text-xs uppercase tracking-widest mb-4"
            style={{ color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}
          >
            Top Sports Teams · Reference
          </div>
          <h1
            className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight mb-6"
            style={{ color: "var(--text)" }}
          >
            {PAGE_TITLE}
          </h1>
          <p
            className="text-lg sm:text-xl leading-relaxed mb-8 max-w-3xl"
            style={{ color: "var(--text-muted)" }}
          >
            One crest per city. Out of {METRO_UNIVERSE_LABEL} metros in the Global Metro Power
            Rankings dataset, {summary.total} have a top-team call serious enough to land. Every
            row links back to the metro&rsquo;s ranking page.
          </p>

          {/* Summary chips */}
          <div
            className="flex flex-wrap gap-3 text-xs"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            <span
              className="inline-block border rounded px-3 py-1.5"
              style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
            >
              {summary.total} metros
            </span>
            {summary.dominantSport && (
              <span
                className="inline-block border rounded px-3 py-1.5"
                style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
              >
                {summary.dominantSport[1]} {summary.dominantSport[0].toLowerCase()} picks
              </span>
            )}
            <span
              className="inline-block border rounded px-3 py-1.5"
              style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
            >
              {summary.contestedCount} contested rows
            </span>
            <span
              className="inline-block border rounded px-3 py-1.5"
              style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
            >
              {METRO_UNIVERSE_LABEL} metros in corpus
            </span>
          </div>

          <div className="mt-8 text-sm" style={{ color: "var(--text-muted)" }}>
            Based on the Substack essay{" "}
            <a
              href="https://citizenofnowhere.substack.com/p/the-team-that-wins-the-city"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:opacity-80 transition"
              style={{ color: "var(--accent)" }}
            >
              The Team That Wins the City
            </a>
            . Metros are ordered by their rank in the{" "}
            <Link
              href="/"
              className="underline hover:opacity-80 transition"
              style={{ color: "var(--accent)" }}
            >
              Global Metro Power Rankings
            </Link>
            .
          </div>
        </header>

        {/* Framework recap */}
        <section
          className="mb-16 p-6 sm:p-8 rounded-lg border"
          style={{
            borderColor: "var(--border)",
            backgroundColor: "var(--bg-card)",
          }}
        >
          <h2
            className="text-xl font-bold mb-5 tracking-tight"
            style={{ color: "var(--text)" }}
          >
            The Standard
          </h2>
          <p className="mb-5 text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
            &ldquo;Top team&rdquo; is not the team with the most trophies right now. It is not the
            team that won most recently. It is the team that, if it disappeared, would change the
            city&rsquo;s idea of itself.
          </p>
          <ul
            className="space-y-3 text-sm leading-relaxed mb-6 ml-6 list-disc"
            style={{ color: "var(--text)" }}
          >
            <li>
              <strong>Civic footprint over silverware.</strong> Trophies count. Continuity,
              cultural reach, and the team&rsquo;s grip on the city&rsquo;s self-image count more.
            </li>
            <li>
              <strong>Inheritance over insurgency.</strong> A modern oligarch project does not
              automatically displace the club the city has worn for a hundred years. Sometimes it
              earns co-equal status (London, Milan). Rarely, it wins outright (PSG).
            </li>
            <li>
              <strong>One pick per metro, but the slash exists.</strong> Where two clubs are
              genuinely co-equal, the row reads &ldquo;X / Y.&rdquo; The slash is rare and earned.
            </li>
            <li>
              <strong>Cultural reach over residence.</strong> Wisconsin&rsquo;s top team plays in a
              town smaller than a New York neighborhood. Reach decides the row, not zip codes.
            </li>
          </ul>
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Runners-up appear in the rationale where they have a serious case. The most contested
            picks (London, Milan, Istanbul, Glasgow, Raleigh-Durham) carry the longest rationales
            in the dataset.
          </p>
        </section>

        {/* Top team picks */}
        <section id="picks" className="mb-20">
          <div className="flex items-baseline justify-between mb-8 flex-wrap gap-3">
            <h2
              className="text-2xl sm:text-3xl font-bold tracking-tight"
              style={{ color: "var(--text)" }}
            >
              Top Team by Metro
            </h2>
            <span
              className="text-xs uppercase tracking-widest"
              style={{
                color: "var(--text-muted)",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {summary.total} metros · ordered by rank
            </span>
          </div>

          <div className="grid gap-5">
            {TOP_TEAMS.map((t) => {
              const slug = resolveSlug(t.metro, slugIndex);
              const isContested = t.team.includes("/");
              return (
                <article
                  key={`${t.rank}-${t.metro}`}
                  id={topTeamAnchorId(t.metro)}
                  className="rounded-lg border p-5 sm:p-6 transition hover:border-[var(--accent)] scroll-mt-24"
                  style={{
                    borderColor: "var(--border)",
                    backgroundColor: "var(--bg-card)",
                  }}
                >
                  <header className="flex items-start gap-4 mb-3 flex-wrap">
                    <div
                      className="text-xs font-semibold px-2.5 py-1 rounded border whitespace-nowrap"
                      style={{
                        color: "var(--accent)",
                        borderColor: "var(--border)",
                        fontFamily: "'JetBrains Mono', monospace",
                      }}
                    >
                      #{t.rank}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3
                        className="text-lg sm:text-xl font-bold tracking-tight leading-snug"
                        style={{ color: "var(--text)" }}
                      >
                        {slug ? (
                          <Link
                            href={`/rankings/${slug}`}
                            className="hover:text-[var(--accent)] transition-colors"
                          >
                            {t.metro}
                          </Link>
                        ) : (
                          t.metro
                        )}
                      </h3>
                      <div
                        className="text-sm mt-1 flex flex-wrap items-center gap-2"
                        style={{ color: "var(--text-muted)" }}
                      >
                        <span style={{ color: "var(--text)" }} className="font-semibold">
                          {t.team}
                        </span>
                        {t.sport && (
                          <span
                            className="inline-block text-[10px] uppercase tracking-widest border rounded px-2 py-0.5"
                            style={{
                              borderColor: "var(--border)",
                              color: "var(--text-muted)",
                              fontFamily: "'JetBrains Mono', monospace",
                            }}
                          >
                            {sportLabel(t.sport)}
                          </span>
                        )}
                        {isContested && (
                          <span
                            className="inline-block text-[10px] uppercase tracking-widest border rounded px-2 py-0.5"
                            style={{
                              borderColor: "var(--accent)",
                              color: "var(--accent)",
                              fontFamily: "'JetBrains Mono', monospace",
                            }}
                          >
                            Co-equal
                          </span>
                        )}
                      </div>
                    </div>
                  </header>
                  {t.rationale && (
                    <p
                      className="text-sm leading-relaxed"
                      style={{ color: "var(--text)" }}
                    >
                      {t.rationale}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
