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
import { QUALIFIERS, SKIPS } from "@/lib/neighborhoods";

export const dynamicParams = false;

const PAGE_PATH = "/neighborhoods";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "The Last of the Marylebones";
const PAGE_DESCRIPTION =
  "A taxonomy of the world's dense, historic, walkable, elite residential neighborhoods. 103 qualifiers out of 4,200+ global metros. Full criteria, rationales, and the hard skips.";
const PAGE_PUBLISHED = "2026-04-20";
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
    "walkable cities",
    "historic neighborhoods",
    "urban form",
    "Marylebone",
    "global neighborhoods",
    "dense urban fabric",
    "elite residential",
  ],
};

/**
 * Build a lookup from display metro name to dataset slug.
 * Dataset names sometimes differ from essay names (accents, punctuation),
 * so normalize aggressively before matching.
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

// Manual overrides for essay-to-dataset name differences.
const SLUG_ALIASES: Record<string, string> = {
  "rhine-ruhr": "rhine-ruhr",
  "sao-paulo": "sao-paulo",
  "osaka-kyoto-kobe": "osaka-kyoto-kobe",
  "san-francisco-san-jose": "san-francisco-san-jose",
  "washington-baltimore": "washington-baltimore",
  "tel-aviv": "tel-aviv",
  "mexico-city": "mexico-city",
  "st-louis": "st-louis",
  "st-petersburg": "st-petersburg",
  "padua-venice": "padua-venice",
  "rotterdam-the-hague": "rotterdam-the-hague",
  "dubai-sharjah": "dubai-sharjah",
  "busan-ulsan": "busan-ulsan",
  "raleigh-durham": "raleigh-durham",
  "quebec-city": "quebec-city",
  "new-haven": "new-haven",
  "new-orleans": "new-orleans",
  "new-york": "new-york",
  "hong-kong": "hong-kong",
  "mexico-cdmx": "mexico-city",
  "buenos-aires": "buenos-aires",
  "san-sebastian": "san-sebastian",
  "cape-town": "cape-town",
  "rio-de-janeiro": "rio-de-janeiro",
  "las-vegas": "las-vegas",
  "san-diego": "san-diego",
  "abu-dhabi": "abu-dhabi",
};

function resolveSlug(metro: string, index: Map<string, string>): string | null {
  const n = normalize(metro);
  const direct = index.get(n);
  if (direct) return direct;
  const aliasTarget = SLUG_ALIASES[n];
  if (aliasTarget && index.get(aliasTarget)) return index.get(aliasTarget)!;
  return null;
}

export default function NeighborhoodsPage() {
  const slugIndex = buildSlugIndex();
  const qualifierCount = QUALIFIERS.length;
  const skipCount = SKIPS.length;

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
        name: "Global Neighborhoods",
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
      "A taxonomy of the world's dense, historic, walkable, elite residential neighborhoods",
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
      "walkable cities",
      "historic neighborhoods",
      "urban form",
      "Marylebone",
      "global neighborhoods",
      "dense urban fabric",
      "elite residential",
    ],
    about: QUALIFIERS.flatMap((q) =>
      q.neighborhoods.map((n) => ({
        "@type": "Place",
        name: `${n}, ${q.metro}`,
      })),
    ),
  };

  // ItemList JSON-LD for the 103 qualifying metros
  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Global Neighborhoods: Qualifying Metros",
    description:
      "Metros whose neighborhoods pass the four-criteria Marylebone test: dense urban fabric, historic architectural legacy, elite residential, sustained walkability.",
    numberOfItems: qualifierCount,
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    itemListElement: QUALIFIERS.map((q, i) => {
      const slug = resolveSlug(q.metro, slugIndex);
      return {
        "@type": "ListItem",
        position: i + 1,
        name: `${q.metro}: ${q.neighborhoods.join(", ")}`,
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
            Global Neighborhoods · Reference
          </div>
          <h1
            className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight mb-6"
            style={{ color: "var(--text)" }}
          >
            The Last of the Marylebones
          </h1>
          <p
            className="text-lg sm:text-xl leading-relaxed mb-8 max-w-3xl"
            style={{ color: "var(--text-muted)" }}
          >
            A taxonomy of the world&rsquo;s dense, historic, walkable, elite residential
            neighborhoods. Out of {METRO_UNIVERSE_LABEL} metros in the Global Metro Power
            Rankings dataset, {qualifierCount} clear the four-criteria bar. The full list, every
            rationale, every hard skip.
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
              {qualifierCount} qualifying metros
            </span>
            <span
              className="inline-block border rounded px-3 py-1.5"
              style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
            >
              {skipCount} hard skips inside top 100
            </span>
            <span
              className="inline-block border rounded px-3 py-1.5"
              style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
            >
              {METRO_UNIVERSE_LABEL} metros in corpus
            </span>
            <span
              className="inline-block border rounded px-3 py-1.5"
              style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
            >
              under 2.5% pass rate
            </span>
          </div>

          <div className="mt-8 text-sm" style={{ color: "var(--text-muted)" }}>
            Based on the Substack essay{" "}
            <a
              href="https://citizenofnowhere.substack.com/p/the-last-of-the-marylebones"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:opacity-80 transition"
              style={{ color: "var(--accent)" }}
            >
              The Last of the Marylebones
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
            The Framework
          </h2>
          <p className="mb-5 text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Four criteria. A neighborhood has to pass all four to appear on this list.
          </p>
          <ol
            className="space-y-3 text-sm leading-relaxed mb-6 ml-6 list-decimal"
            style={{ color: "var(--text)" }}
          >
            <li>
              <strong>Dense urban fabric.</strong> Pre-war, intact, multi-story, continuous
              streetwall.
            </li>
            <li>
              <strong>Historic architectural legacy.</strong> Pre-1930s construction as the
              dominant building stock.
            </li>
            <li>
              <strong>Elite residential.</strong> Genuinely lived-in by people at the top of the
              local income distribution.
            </li>
            <li>
              <strong>Walkable at 12 to 20 miles per day, sustained.</strong> The bar that kills
              the candidates.
            </li>
          </ol>
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
            A <strong style={{ color: "var(--text)" }}>self-sufficiency test</strong> sits on top
            of the four: the neighborhood must sustain daily life inside its own boundaries. A{" "}
            <strong style={{ color: "var(--text)" }}>covered-walkway rescue clause</strong>{" "}
            applies only where (as in Singapore) the network genuinely extends across neighborhood
            edges.
          </p>
        </section>

        {/* Qualifying neighborhoods */}
        <section id="qualifying" className="mb-20">
          <div className="flex items-baseline justify-between mb-8 flex-wrap gap-3">
            <h2
              className="text-2xl sm:text-3xl font-bold tracking-tight"
              style={{ color: "var(--text)" }}
            >
              Qualifying Neighborhoods
            </h2>
            <span
              className="text-xs uppercase tracking-widest"
              style={{
                color: "var(--text-muted)",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {qualifierCount} metros · ordered by rank
            </span>
          </div>

          <div className="grid gap-5">
            {QUALIFIERS.map((q) => {
              const slug = resolveSlug(q.metro, slugIndex);
              return (
                <article
                  key={`${q.rank}-${q.metro}`}
                  className="rounded-lg border p-5 sm:p-6 transition hover:border-[var(--accent)]"
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
                      #{q.rank}
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
                            {q.metro}
                          </Link>
                        ) : (
                          q.metro
                        )}
                      </h3>
                      <div
                        className="text-sm mt-1"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {q.neighborhoods.join(" · ")}
                      </div>
                    </div>
                  </header>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: "var(--text)" }}
                  >
                    {q.rationale}
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        {/* Hard Skips */}
        <section id="skips" className="mb-20">
          <div className="flex items-baseline justify-between mb-8 flex-wrap gap-3">
            <h2
              className="text-2xl sm:text-3xl font-bold tracking-tight"
              style={{ color: "var(--text)" }}
            >
              Hard Skips
            </h2>
            <span
              className="text-xs uppercase tracking-widest"
              style={{
                color: "var(--text-muted)",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {skipCount} metros inside top 100
            </span>
          </div>
          <p
            className="text-sm leading-relaxed mb-8 max-w-3xl"
            style={{ color: "var(--text-muted)" }}
          >
            Metros inside the top-100 band where no neighborhood passes the four-criteria bar.
            The rationales explain why. These are not editorial preferences; they are the
            framework applied consistently.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            {SKIPS.map((s) => {
              const slug = resolveSlug(s.metro, slugIndex);
              return (
                <article
                  key={`${s.rank}-${s.metro}`}
                  className="rounded-lg border p-5"
                  style={{
                    borderColor: "var(--border)",
                    backgroundColor: "var(--bg-card)",
                  }}
                >
                  <header className="flex items-start gap-3 mb-2">
                    <div
                      className="text-xs font-semibold px-2 py-0.5 rounded border whitespace-nowrap"
                      style={{
                        color: "var(--text-muted)",
                        borderColor: "var(--border)",
                        fontFamily: "'JetBrains Mono', monospace",
                      }}
                    >
                      #{s.rank}
                    </div>
                    <h3
                      className="text-base font-bold leading-snug"
                      style={{ color: "var(--text)" }}
                    >
                      {slug ? (
                        <Link
                          href={`/rankings/${slug}`}
                          className="hover:text-[var(--accent)] transition-colors"
                        >
                          {s.metro}
                        </Link>
                      ) : (
                        s.metro
                      )}
                    </h3>
                  </header>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {s.rationale}
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        {/* Notes */}
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
            Notes
          </h2>
          <div className="space-y-5 text-sm leading-relaxed" style={{ color: "var(--text)" }}>
            <p>
              <strong>Consistency claim.</strong> Every qualifying neighborhood passes the same
              test. Belgravia and the Wilshire Corridor were both excluded for the same reason:
              residentially inert, cannot sustain a day inside their own boundaries. DIFC and BGC
              were both excluded for the same reason: vertical pod, car-severed edges. The rule
              is consistent; the outcomes follow.
            </p>
            <p>
              <strong>Self-corrections.</strong> Denver, St. Louis, Houston, Seattle, Atlanta,
              Minneapolis, Pittsburgh, Portland, New Orleans, Kyoto, Valencia, Stuttgart, Mumbai,
              and Detroit were all initially skipped on a global-prestige filter and reversed on
              criteria review. Flagged openly because they demonstrate that the bar is about the
              four criteria, not about whether a city is famous.
            </p>
            <p>
              <strong>Methodology.</strong> This is not a quantitative ranking. The four criteria
              are applied as binary pass/fail, with the self-sufficiency test and the
              covered-walkway rescue clause modifying the call at the margins. Disagreement is
              welcome, but should be on the criteria, the walking-radius scale, or the individual
              neighborhood call.
            </p>
            <p>
              <strong>Reader corrections welcome.</strong> If a neighborhood is missing or
              miscalled,{" "}
              <a
                href="https://citizenofnowhere.substack.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:opacity-80 transition"
                style={{ color: "var(--accent)" }}
              >
                tell me
              </a>
              . Structural corrections (a category I did not weight, a city I undercounted) are
              more useful than cosmetic ones.
            </p>
          </div>
        </section>

        {/* Footer nav */}
        <footer className="pt-8 border-t" style={{ borderColor: "var(--border)" }}>
          <div className="flex flex-wrap gap-4 text-sm">
            <Link
              href="/"
              className="hover:text-[var(--accent)] transition-colors"
              style={{ color: "var(--text-muted)" }}
            >
              ← Back to Rankings
            </Link>
            <a
              href="https://citizenofnowhere.substack.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--accent)] transition-colors"
              style={{ color: "var(--text-muted)" }}
            >
              Citizen of Nowhere →
            </a>
          </div>
        </footer>
      </div>
    </main>
  );
}
