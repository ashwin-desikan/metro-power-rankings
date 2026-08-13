import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMarketSeries } from "@/lib/business";
import { MARKET_PAGE_SLUGS, hasMarketPage, MARKETS_COMPARE } from "@/lib/marketPages";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import BusinessNav from "../../BusinessNav";
import { MONO, CARD } from "../../ui";
import SeriesChart from "./SeriesChart";

// Per-series history page for the nineteen indices and commodities on
// /business/markets. Series data: public/data/business/markets-series/{slug}.json
// - the read model emitted from Supabase's market_series_daily by
// scripts/business/emit_market_series.py and extended every morning by
// build_markets.py. Read through the same GH-raw ISR path as the rest of the
// hub, so the daily append surfaces without a build.

export const revalidate = 21600;

export const dynamicParams = false;
export function generateStaticParams() {
  return MARKET_PAGE_SLUGS.map((symbol) => ({ symbol }));
}

function fmtLevel(n: number): string {
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 100) return n.toFixed(1);
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

function pct(from: number | null, to: number): string | null {
  if (!from || from <= 0) return null;
  const p = ((to - from) / from) * 100;
  return `${p >= 0 ? "+" : ""}${p.toFixed(Math.abs(p) > 100 ? 0 : 1)}%`;
}

// Newest point at or before (latest date minus `years`).
function pointYearsBack(series: [string, number][], years: number): [string, number] | null {
  const [y, m, d] = series[series.length - 1][0].split("-").map(Number);
  const cut = `${String(y - years).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const eligible = series.filter(([dt]) => dt <= cut);
  return eligible.length ? eligible[eligible.length - 1] : null;
}

export async function generateMetadata({ params }: { params: Promise<{ symbol: string }> }): Promise<Metadata> {
  const { symbol } = await params;
  const doc = await getMarketSeries(symbol);
  const name = doc?.meta.name ?? symbol;
  const from = doc?.meta.start.slice(0, 4);
  const title = `${name}, Charted Since ${from ?? ""}`.trim();
  const description = doc
    ? `The full daily history of the ${name}, ${Number(doc.meta.points).toLocaleString()} closes from ${doc.meta.start} to today, with highs, lows and long-run growth.`
    : `Daily history for ${name}.`;
  return {
    title: `${title} | Business of the Metros`,
    description,
    alternates: { canonical: `/business/markets/${symbol}` },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description, url: `${BASE_URL}/business/markets/${symbol}`, type: "website" },
    twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${title} | ${SITE_NAME}`, description },
  };
}

export default async function MarketSeriesPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  if (!hasMarketPage(symbol)) notFound();
  const doc = await getMarketSeries(symbol);
  const series = doc?.series ?? [];
  if (!doc || series.length < 2) notFound();

  const m = doc.meta;
  const [lastDate, lastVal] = series[series.length - 1];
  const yearAgo = pointYearsBack(series, 1);
  const fiveAgo = pointYearsBack(series, 5);
  let atHi = series[0], atLo = series[0];
  for (const p of series) {
    if (p[1] > atHi[1]) atHi = p;
    if (p[1] < atLo[1]) atLo = p;
  }
  const firstVal = series[0][1];
  const years = (Date.parse(`${lastDate}T00:00:00Z`) - Date.parse(`${series[0][0]}T00:00:00Z`)) / 31557600000;
  // Compound annual growth over the whole series. Worth stating plainly because
  // the headline "up 173,000%" is true and useless; the annualised number is
  // what a reader can actually compare across markets.
  const cagr = firstVal > 0 && years > 1 ? (Math.pow(lastVal / firstVal, 1 / years) - 1) * 100 : null;

  const stats: { k: string; v: string; d: string }[] = [
    { k: "Latest", v: fmtLevel(lastVal), d: `${m.unit ? m.unit + " · " : ""}${lastDate}` },
    { k: "1-year", v: pct(yearAgo?.[1] ?? null, lastVal) ?? "—", d: yearAgo ? `from ${fmtLevel(yearAgo[1])}` : "series too young" },
    { k: "5-year", v: pct(fiveAgo?.[1] ?? null, lastVal) ?? "—", d: fiveAgo ? `from ${fmtLevel(fiveAgo[1])} in ${fiveAgo[0].slice(0, 4)}` : "series too young" },
    {
      k: cagr != null ? "Annualised" : "Record high",
      v: cagr != null ? `${cagr >= 0 ? "+" : ""}${cagr.toFixed(1)}%` : fmtLevel(atHi[1]),
      d: cagr != null ? `a year since ${series[0][0].slice(0, 4)}` : `on ${atHi[0]}`,
    },
  ];

  const kindLabel = m.kind === "commodity" ? "Commodity" : "Index";

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/business" className="hover:underline">Business</Link>
        {" / "}
        <Link href="/business/markets" className="hover:underline">Markets</Link>
        {" / "}
        <span>{m.name}</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
          <span aria-hidden>{m.kind === "commodity" ? "🛢️" : "📈"}</span> {m.name}{" "}
          <span className="text-[var(--text-dim)] font-normal" style={MONO}>{m.symbol}</span>
        </h1>
        <p className="text-[15px] text-[var(--text-muted)] max-w-3xl">
          {kindLabel}
          {m.country ? <> · {m.country}</> : null}
          {m.metroSlug ? (
            <>
              {" · "}
              <Link href={`/rankings/${m.metroSlug}`} className="hover:underline" style={{ color: "var(--accent)" }}>
                home metro
              </Link>
            </>
          ) : null}
          {" · "}
          <Link href={MARKETS_COMPARE} className="hover:underline" style={{ color: "var(--accent)" }}>
            compare against everything else
          </Link>
        </p>
        <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mt-3" style={MONO}>
          {Number(m.points).toLocaleString()} tracked days · {m.start} to {m.end} · refreshed daily
        </p>
      </header>
      <BusinessNav />

      <section className="mb-8 grid gap-3 grid-cols-2 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.k} className="rounded-xl border p-4 min-w-0" style={CARD}>
            <div className="text-[11px] uppercase tracking-widest mb-1" style={{ ...MONO, color: "var(--text-muted)" }}>{s.k}</div>
            <div className="text-xl font-bold" style={MONO}>{s.v}</div>
            <div className="text-xs text-[var(--text-muted)]">{s.d}</div>
          </div>
        ))}
      </section>

      <section className="mb-8 rounded-2xl border p-4 sm:p-6" style={{ borderColor: "var(--border)" }}>
        <SeriesChart name={m.name} unit={m.unit} series={series} />
        <p className="text-xs text-[var(--text-muted)] mt-3">
          Record high {fmtLevel(atHi[1])} on {atHi[0]}; lowest close {fmtLevel(atLo[1])} on {atLo[0]}.
        </p>
      </section>

      <section className="mb-6 rounded-2xl border p-5 sm:p-6" style={CARD}>
        <h2 className="text-lg font-bold mb-2">About this series</h2>
        <p className="text-[13.5px] text-[var(--text-muted)] leading-relaxed max-w-3xl">
          Closing levels, one point per trading day. {m.source}.
          {m.sourceNote ? <> {m.sourceNote}</> : null}{" "}
          Index levels are price returns in local currency, so they exclude dividends and are not
          adjusted for inflation or exchange rates: a chart of the Nikkei against the S&amp;P compares
          two different things in two different currencies. None of this is investment advice; all of
          it is geography with a time axis.
        </p>
      </section>
    </main>
  );
}
