import type { Metadata } from "next";
import Link from "next/link";
import { getRatesIndex, getBank } from "@/lib/economyRates";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import BusinessNav from "../../BusinessNav";
import { MONO, CARD } from "../../ui";
import EconomyNav from "../EconomyNav";
import CompareChart, { type CompareBank } from "./CompareChart";

// Overlay of every tracked policy rate's own history, /business/economy/compare.
// Data: reads each of the 49 listed bank files server-side (lib/economyRates.
// getBank(), one file per call - never a glob) and passes a compact
// {code, short, country, ended, path} array to the client chart, `path`
// thinned to at most one point per calendar month (always keeping the last
// point, so the current level is never lost to thinning).
//
// Measured payload size (all 49 banks, monthly-thinned, 2026-09-08 build):
// ~150 KB serialised (JSON.stringify of the exact {code, short, country,
// ended, path} shape below) - comfortably under the 400 KB budget this page
// is held to, with room for the dataset to grow before it needs its own trim.

export const revalidate = 21600;

const PATH = "/business/economy/compare";
const TITLE = "Compare Central Banks";
const DESC =
  "Every tracked central bank's own policy rate, in its own per cent terms, overlaid on one axis - not rebased, because a rate is not a return.";

export const metadata: Metadata = {
  title: `${TITLE} | Business of the Metros`,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

// Keep at most one point per YYYY-MM, plus the series' own last point (so the
// current level always survives thinning even mid-month).
function thinMonthly(path: [string, number][]): [string, number][] {
  if (!path.length) return path;
  const out: [string, number][] = [];
  let lastMonth = "";
  for (let i = 0; i < path.length; i++) {
    const [d] = path[i];
    const month = d.slice(0, 7);
    const isLast = i === path.length - 1;
    if (month !== lastMonth || isLast) {
      if (!(out.length && out[out.length - 1][0] === d)) out.push(path[i]);
      lastMonth = month;
    }
  }
  return out;
}

export default async function CompareRatesPage() {
  const index = await getRatesIndex();
  const banks = index?.banks ?? [];
  const files = await Promise.all(banks.map((b) => getBank(b.code)));
  const all: CompareBank[] = banks.flatMap((b, i) => {
    const file = files[i];
    if (!file) return [];
    return [{
      code: b.code,
      short: b.short,
      country: file.country,
      ended: b.ended,
      path: thinMonthly(file.path),
    }];
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/business" className="hover:underline">Business</Link>
        {" / "}
        <Link href="/business/economy" className="hover:underline">Economy</Link>
        {" / "}
        <span>Compare</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
          <span aria-hidden>⚖️</span> Compare central banks
        </h1>
        <p className="text-[15px] text-[var(--text-muted)] max-w-3xl">
          Rates are not rebased here, unlike the markets overlay: a policy rate is already in per
          cent, on the same scale for every bank, so the raw level is the honest comparison. Pick up
          to six.
        </p>
        {all.length > 0 && (
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mt-3" style={MONO}>
            {index ? `as of ${index.built} · ` : ""}{all.length} central banks · monthly-thinned history
          </p>
        )}
      </header>
      <BusinessNav />
      <EconomyNav />

      {all.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">The rates dataset has not loaded; try again shortly.</p>
      ) : (
        <CompareChart all={all} />
      )}

      <section className="mt-8 mb-6 rounded-2xl border p-5 sm:p-6" style={CARD}>
        <h2 className="text-lg font-bold mb-2">How to read this</h2>
        <p className="text-[13.5px] text-[var(--text-muted)] leading-relaxed max-w-3xl">
          Every line is a step: a policy rate holds between decisions and jumps on the date of one, so
          the chart never interpolates between two levels that were never actually crossed. A bank
          whose history starts after the chosen from-date is drawn from its own first point, and its
          legend entry says so. A bank superseded by the euro stops its line on the date its own rate
          stopped applying. None of this is investment advice; all of it is monetary policy with a
          time axis.
        </p>
      </section>
    </main>
  );
}
