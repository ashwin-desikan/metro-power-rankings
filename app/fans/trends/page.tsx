import type { Metadata } from "next";
import { BASE_URL, SITE_NAME, ogImage } from "@/lib/seo";
import { FansCrumbs, FansNav, TabHeader } from "../_shared/ui";
import TrendsGate from "./TrendsGate";

export const dynamicParams = false;

const PAGE_PATH = "/fans/trends";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "Attention over time";
const PAGE_DESCRIPTION =
  "How Wikipedia attention for sports teams and leagues has moved month to month since June 2025 (the first clean window after a bot-traffic correction): compare teams directly, see the biggest risers and fallers within a league, and track whole leagues by size over time. Sign in with Google to view.";

export const metadata: Metadata = {
  title: `${PAGE_TITLE} | Citizen of Nowhere Fan Attention Index`,
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

// PUBLIC / UNAUTHENTICATED SHELL. This server component renders the same
// for every visitor -- title, short explainer, nav -- and hands off to
// TrendsGate (a client component) for the sign-in gate and the charts
// themselves, exactly the split app/fans/page.tsx uses for FanGate. No
// team-level or league-level number is ever read here; the full monthly
// history only ever reaches the browser client-side, from the auth-gated
// app/api/fans/history/route.ts, after a real sign-in.
export default function FansTrendsPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <FansCrumbs tab="Attention over time" />
      <TabHeader
        emoji="📈"
        title={PAGE_TITLE}
        sub="How attention has moved, month to month, since June 2025."
      />
      <FansNav active="trends" />

      <p className="text-[13.5px] text-[var(--text-muted)] max-w-3xl mb-2">
        Every series on this page is a team&apos;s or league&apos;s rolling 12-month all-language
        Wikipedia attention baseline, recomputed at the end of each month -- the same baseline the{" "}
        <a href="/fans" className="hover:underline text-[var(--accent)]">Fan Attention Index</a>{" "}
        itself ranks on, not a single month&apos;s raw pageview count. It is dampened by design (a
        month with one huge spike does not swing it the way a raw monthly figure would), so read
        these lines as attention <em>trending</em> up or down over a season, not as a week-to-week
        news reaction. The &quot;League attention over time&quot; section&apos;s cross-sport view is
        the exception: it applies the same revenue-based scaling the index itself uses, so leagues
        line up the way the index ranks them; every other line here is Wikipedia attention alone.
      </p>

      <p className="text-[13.5px] text-[var(--text-muted)] max-w-3xl mb-6">
        Earlier months are hidden: bot traffic inflated Wikipedia views for football pages until
        June 2024, and 12-month totals only became clean from June 2025.
      </p>

      <TrendsGate />
    </main>
  );
}
