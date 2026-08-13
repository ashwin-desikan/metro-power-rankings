import type { Metadata } from "next";
import Link from "next/link";
import { getMarketsOverlay } from "@/lib/business";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import BusinessNav from "../../BusinessNav";
import { MONO, CARD } from "../../ui";
import CompareChart from "./CompareChart";

// Rebased overlay across every daily series the site tracks: 13 indices, 6
// commodities and 20 currencies. Data: public/data/business/markets-overlay.json
// (month-end observations, emitted from Supabase's market_series_daily), which
// keeps the whole comparison to one modest file instead of the 3.7 MB the daily
// read models would cost.

export const revalidate = 21600;

const PATH = "/business/markets/compare";
const TITLE = "Compare Markets";
const DESC =
  "Every benchmark index, commodity and major currency the site tracks, rebased to a common starting point so a century of the Dow and a decade of gold can be read on the same axis.";

export const metadata: Metadata = {
  title: `${TITLE} | Business of the Metros`,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

export default async function CompareMarketsPage() {
  const data = await getMarketsOverlay();
  const all = data?.series ?? [];
  const earliest = all.length ? all.reduce((a, s) => (s.start < a ? s.start : a), all[0].start) : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/business" className="hover:underline">Business</Link>
        {" / "}
        <Link href="/business/markets" className="hover:underline">Markets</Link>
        {" / "}
        <span>Compare</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
          <span aria-hidden>⚖️</span> Compare markets
        </h1>
        <p className="text-[15px] text-[var(--text-muted)] max-w-3xl">
          Index levels are not comparable with each other. The Nikkei is tens of thousands, the FTSE
          five figures, copper under five dollars. So everything here is rebased to 100 at a date you
          choose, which turns the question from which number is bigger into what each one would have
          done to the same money over the same years.
        </p>
        {all.length > 0 && (
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mt-3" style={MONO}>
            {all.length} series · earliest {earliest} · month-end observations · refreshed daily
          </p>
        )}
      </header>
      <BusinessNav />

      {all.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          The comparison dataset has not loaded; try again shortly.
        </p>
      ) : (
        <CompareChart all={all} />
      )}

      <section className="mt-8 mb-6 rounded-2xl border p-5 sm:p-6" style={CARD}>
        <h2 className="text-lg font-bold mb-2">How to read this, and how not to</h2>
        <p className="text-[13.5px] text-[var(--text-muted)] leading-relaxed max-w-3xl">
          A series that did not exist at the rebase date is left out rather than started late at 100.
          Two lines beginning at 100 on different dates are measuring different periods, which is the
          precise misreading a rebased chart invites. Indices are price returns in local currency, so
          they exclude dividends and take no account of exchange rates or inflation: a Japanese index
          rebased in dollars would tell a different story again. Commodities are continuous
          front-month futures, so the long series carries the discontinuities of contracts rolling
          over, not just the price of the metal. Currencies are units per US dollar, so a rising line
          means a weaker currency. None of this is investment advice; all of it is geography with a
          time axis.
        </p>
      </section>
    </main>
  );
}
