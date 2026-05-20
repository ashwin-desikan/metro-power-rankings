import Link from "next/link";
import type { Metadata } from "next";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

// Root-level not-found page. Any call to notFound() from a dynamic route
// (e.g. /rankings/[slug], /teams/{league}/[slug], /states/[slug],
// /countries/[slug]) renders this page instead of the default Next 404.
// SiteNav is already mounted by app/layout.tsx so the user keeps top-level
// navigation even on a miss.

export const metadata: Metadata = {
  title: `Not Found | ${SITE_NAME}`,
  description: "The page you were looking for does not exist on the Global Metro Power Rankings.",
  alternates: { canonical: `${BASE_URL}/` },
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
      <div
        className="text-xs uppercase tracking-widest mb-3"
        style={{ color: "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace" }}
      >
        404 / Not Found
      </div>
      <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
        That page is not here.
      </h1>
      <p className="text-lg text-[var(--text-muted)] mb-8 max-w-xl">
        The URL you followed does not match any metro, team, state, country,
        or section in the corpus. The most likely cause is a stale link, a
        renamed slug, or a metro that has been merged into another. Try one
        of the entry points below.
      </p>
      <div className="flex flex-wrap gap-3 text-sm">
        <Link
          href="/"
          className="px-4 py-2 rounded border hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          style={{ borderColor: "var(--border)" }}
        >
          Rankings home
        </Link>
        <Link
          href="/sports"
          className="px-4 py-2 rounded border hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          style={{ borderColor: "var(--border)" }}
        >
          Sports map
        </Link>
        <Link
          href="/countries"
          className="px-4 py-2 rounded border hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          style={{ borderColor: "var(--border)" }}
        >
          Countries
        </Link>
        <Link
          href="/methodology"
          className="px-4 py-2 rounded border hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          style={{ borderColor: "var(--border)" }}
        >
          Methodology
        </Link>
        <Link
          href="/updates"
          className="px-4 py-2 rounded border hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          style={{ borderColor: "var(--border)" }}
        >
          What is new
        </Link>
      </div>
    </main>
  );
}
