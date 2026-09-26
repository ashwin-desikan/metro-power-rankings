import type { Metadata } from "next";
import Link from "next/link";
import { BASE_URL, SITE_NAME, serializeJsonLd, ogImage } from "@/lib/seo";
import { getFanIndexPreview, fanIndexWindowLabel } from "@/lib/fanIndex";
import { FansCrumbs, FansNav, TabHeader, MONO } from "./_shared/ui";
import FanGate from "./FanGate";

export const dynamicParams = false;

const PAGE_PATH = "/fans";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
// Branded name (2026-09-24): used for <title>/OG, the H1, JSON-LD name and
// the citation line, matching the "Citizen of Nowhere Picks" house pattern
// for a named feature. Nav labels stay the short "Fan Attention Index" (see
// app/DesktopNav.tsx, app/MobileMenu.tsx, lib/sportsCatalog.ts,
// lib/deepDives.ts, app/sports/page.tsx): the site's nav never carries the
// "Citizen of Nowhere" prefix for any other branded page either (compare
// "Metro Power Rankings" in nav vs. its own full name), so this matches
// the house pattern rather than diverging from it.
const PAGE_TITLE = "Citizen of Nowhere Fan Attention Index";
const PAGE_DESCRIPTION =
  "The annual attention sports teams earn on Wikipedia, across every language edition: a public, reproducible measure of attention, not a fan count. Football, the major American leagues (NFL, NBA, MLB, NHL, college football, college basketball), and the rest of the world's sports (WNBA, women's football, EuroLeague, AFL, NRL, IPL, Formula 1, NPB, CFL, Top 14, Handball-Bundesliga, SuperLega), ranked within their own group and across sports on one shared scale. The top 20 are free to view; sign in with Google to see the full index.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: {
    images: [{ url: ogImage(PAGE_TITLE, PAGE_URL), width: 1200, height: 630 }],
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    type: "website",
  },
  twitter: {
    images: [ogImage(PAGE_TITLE, PAGE_URL)],
    card: "summary_large_image",
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
  },
};

function windowLabel(start: string, end: string): string {
  const fmt = (ym: string) => {
    const [y, m] = ym.split("-");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[parseInt(m, 10) - 1]} ${y}`;
  };
  return `${fmt(start)} to ${fmt(end)}`;
}

// PUBLIC / UNAUTHENTICATED PAGE. This server component must only ever read
// getFanIndexPreview() (top 20 rows, four fields each), never getFanIndex()
// (the full dataset): whatever this function returns as JSX -- directly, or
// via a prop into <FanGate> -- is what every anonymous visitor's browser
// receives, full stop. The preview TABLE MARKUP itself lives in FanGate.tsx
// now (2026-09-24), not here: FanGate is the one client component that owns
// the whole table area (preview, loading skeleton, gate, full table) so it
// can hide the preview the instant a session is detected, rather than the
// preview being a separate server block with no way to react to client
// auth state. The full table's DATA still only ever exists client-side,
// fetched from the auth-gated app/api/fans/route.ts after a real sign-in.
// See lib/fanIndex.ts's GATING note for the reasoning.
export default function FansPage() {
  const preview = getFanIndexPreview();
  const winLabel = windowLabel(preview.meta.window.start, preview.meta.window.end);
  const attentionWindowLabel = fanIndexWindowLabel(preview.meta.window.start, preview.meta.window.end);
  const stamp = `Wikimedia Pageviews API · window ${winLabel} · ${preview.meta.totalTeams} teams · v${preview.meta.version.replace(/^v/i, "")}`;

  const datasetJsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    identifier: PAGE_URL,
    license: "https://creativecommons.org/licenses/by/4.0/",
    creator: { "@type": "Organization", name: "Citizen of Nowhere", url: BASE_URL },
    version: preview.meta.version,
    dateModified: preview.meta.generated,
    temporalCoverage: `${preview.meta.window.start}/${preview.meta.window.end}`,
    // The top 20 are free to view without sign-in; the rest require a
    // (free) Google sign-in, so this is not an unconditional "free dataset"
    // claim, and there is deliberately no `distribution` field: the raw
    // JSON is no longer a public URL (see scripts/fans/README.md).
    isAccessibleForFree: true,
    variableMeasured: [
      "All-language Wikipedia pageviews, human traffic only (12-month median baseline x 12)",
      "Attention score, within group (0-100)",
      "Cross-sport score, across every team (0-100, revenue-scaled share of the top team)",
    ],
    citation: `${PAGE_TITLE} ${preview.meta.version} (2026), rankings.citizenofnowhere.org/fans`,
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(datasetJsonLd) }}
      />
      <FansCrumbs />
      <TabHeader
        emoji="🎟️"
        title={PAGE_TITLE}
        sub="The annual attention each team earns on Wikipedia across every language, a public, reproducible measure of attention, not a fan count."
        stamp={stamp}
      />
      <FansNav active="index" />

      <FanGate totalTeams={preview.meta.totalTeams} previewRows={preview.rows} windowLabel={attentionWindowLabel} />

      <p className="text-xs text-[var(--text-dim)] mt-4" style={MONO}>
        Version {preview.meta.version}, data window {winLabel}. See{" "}
        <Link href="/fans/methodology" className="hover:underline text-[var(--text-muted)]">Methodology</Link>.
      </p>

      <div className="mt-8 pt-6 border-t rounded-2xl" style={{ borderColor: "var(--border)" }}>
        <h2 className="text-sm font-semibold mb-2 text-[var(--text)]">Where these numbers come from</h2>
        <p className="text-[13.5px] text-[var(--text-muted)] max-w-3xl">
          Every figure on this page starts from the Wikimedia Pageviews API (human traffic only,
          <code className="mx-1">agent=user</code>) and each team&apos;s Wikidata sitelinks, summed across
          every language edition of Wikipedia. For most groups that Wikipedia baseline is blended with a
          Google Trends search-interest signal; a small number of groups whose team names collide with
          common words (football, AFL, F1, NRL, college football and college basketball) are scored on
          Wikipedia alone, because Trends cannot tell the team from the word. Full method, sources,
          caveats and per-group regression fit are on the{" "}
          <Link href="/fans/methodology" className="hover:underline text-[var(--accent)]">Methodology</Link> page.
        </p>
        <p className="text-[13.5px] text-[var(--text-muted)] max-w-3xl mt-2">
          Suggested citation: <em>{PAGE_TITLE} {preview.meta.version} (2026), rankings.citizenofnowhere.org/fans</em>.
          Released under{" "}
          <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer" className="hover:underline text-[var(--accent)]">CC BY 4.0</a>.
        </p>
      </div>
    </main>
  );
}
