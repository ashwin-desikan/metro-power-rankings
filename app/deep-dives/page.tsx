import type { Metadata } from "next";
import Link from "next/link";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import HubNav from "@/app/teams/HubNav";
import { getSubstackPosts } from "@/lib/substack";
import { DEEP_DIVES, featuredDeepDive, DEEP_DIVE_SUBSTACK_URLS, type DeepDive } from "@/lib/deepDives";

// Regenerate hourly so new Substack posts surface in the Writing zone without
// a rebuild (same ISR approach as the home page).
export const revalidate = 3600;

const PAGE_PATH = "/deep-dives";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "Deep Dives";
const PAGE_DESCRIPTION =
  "Interactive features and essays behind the Global Metro Power Rankings: ghost sports franchises, the team that wins each city, the geography of producer-driven music, and more.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    type: "website",
  },
  twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION },
};

function formatMonthYear(iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(m[2], 10) - 1]} ${m[1]}`;
}

function FeatureCard({ d, featured = false }: { d: DeepDive; featured?: boolean }) {
  return (
    <div
      className={`rounded-xl border transition-colors hover:bg-[var(--bg-card-hover)] ${featured ? "p-6" : "p-5"}`}
      style={{ background: "var(--bg-card)", borderColor: "var(--border)", borderLeftWidth: featured ? "4px" : "3px", borderLeftColor: d.accent }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: d.accent }}>{d.tag}</span>
        {featured && <span className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-dim)]">Featured</span>}
      </div>
      <Link href={d.href} className="group block">
        <div className={`font-bold tracking-tight mb-2 group-hover:text-[var(--accent)] ${featured ? "text-2xl" : "text-lg"}`}>{d.title}</div>
      </Link>
      <p className="text-sm text-[var(--text-muted)] max-w-2xl">{d.dek}</p>
      <div className="mt-3 flex items-center gap-4 text-xs font-semibold">
        <Link href={d.href} style={{ color: d.accent }}>Explore &rarr;</Link>
        {d.substackUrl && (
          <a href={d.substackUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--text-muted)] hover:text-[var(--accent)]">
            Essay on Substack &#8599;
          </a>
        )}
      </div>
    </div>
  );
}

export default async function DeepDivesPage() {
  const featured = featuredDeepDive();
  const rest = DEEP_DIVES.filter((d) => d.slug !== featured.slug);
  const posts = await getSubstackPosts(30);
  const writing = posts.filter((p) => !DEEP_DIVE_SUBSTACK_URLS.has(p.url));

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <header className="mb-6">
        <div className="text-xs uppercase tracking-widest text-[var(--text-dim)] mb-2">Editorial</div>
        <h1 className="text-4xl font-bold tracking-tight mb-2">Deep Dives</h1>
        <p className="text-[var(--text-muted)] max-w-3xl text-sm sm:text-base">
          The interactive features and essays behind the rankings. Some of the thinking becomes software; some becomes writing.
        </p>
      </header>

      <HubNav
        items={[
          { label: "Features", href: "#features" },
          { label: "Writing", href: "#writing" },
        ]}
      />

      <section id="features" className="mb-14 scroll-mt-20">
        <h2 className="text-lg font-semibold mb-1">Features</h2>
        <p className="text-xs text-[var(--text-muted)] mb-4">Interactive pieces you can explore on the site.</p>
        <div className="mb-3">
          <FeatureCard d={featured} featured />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rest.map((d) => (
            <FeatureCard key={d.slug} d={d} />
          ))}
        </div>
      </section>

      <section id="writing" className="mb-10 scroll-mt-20">
        <h2 className="text-lg font-semibold mb-1">Writing</h2>
        <p className="text-xs text-[var(--text-muted)] mb-4">Notes, essays, and field reports on Substack.</p>
        {writing.length > 0 ? (
          <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
            {writing.map((p) => (
              <li key={p.slug} className="py-4 first:pt-0">
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="group block">
                  <div className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mb-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {formatMonthYear(p.pubDate)} &middot; Substack
                  </div>
                  <div className="text-lg font-semibold tracking-tight group-hover:text-[var(--accent)]">
                    {p.title} <span className="text-[var(--text-muted)]" aria-hidden>&#8599;</span>
                  </div>
                  <p className="text-sm text-[var(--text-muted)] max-w-2xl mt-1">{p.description}</p>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">The Substack feed is unavailable right now. Read everything on{" "}
            <a href="https://citizenofnowhere.substack.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--accent)]">Citizen of Nowhere</a>.
          </p>
        )}
        <a
          href="https://citizenofnowhere.substack.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-6 text-sm font-semibold text-[var(--accent)] hover:underline"
        >
          Read and subscribe on Substack &#8599;
        </a>
      </section>
    </main>
  );
}
