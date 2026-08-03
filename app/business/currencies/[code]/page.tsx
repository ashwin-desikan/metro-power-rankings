import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFx, getFxSeries } from "@/lib/business";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import BusinessNav from "../../BusinessNav";
import { MONO, CARD } from "../../ui";
import FxChart from "./FxChart";

// Per-currency history page for the 20 majors carded on /business/currencies.
// Series data: public/data/business/fx-series/{code}.json - long-run history
// (monthly to 1970, near-daily after; era-clamped at introductions and
// redenominations by scripts/business/build_fx_series.py), extended every
// morning by the daily FX refresh. Read via the same GH-raw ISR pattern as
// the rest of the hub, so daily appends surface without a build.

export const revalidate = 21600;

// Mirrors build_fx.py MAJORS / the card grid on /business/currencies. A new
// card there means adding the code here (and seeding its series file).
const CODES = ["eur", "gbp", "jpy", "cny", "inr", "chf", "cad", "aud", "krw", "brl",
  "mxn", "sgd", "hkd", "sek", "nok", "zar", "try", "pln", "aed", "sar"];

export const dynamicParams = false;
export function generateStaticParams() {
  return CODES.map((code) => ({ code }));
}

// Hard pegs and managed bands worth saying out loud on the chart page.
const PEG_NOTE: Record<string, string> = {
  AED: "Pegged to the dollar at 3.6725 since 1997 - the flat line is the policy.",
  SAR: "Pegged to the dollar at 3.75 since 1986 - the flat line is the policy.",
  HKD: "Managed inside a 7.75-7.85 band since 1983 - the flatness is the policy, the wiggle is the band.",
};

function fmtRate(n: number): string {
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 100) return n.toFixed(1);
  if (n >= 10) return n.toFixed(2);
  return n.toFixed(4);
}

function pctChange(from: number | null, to: number): string | null {
  if (!from || from <= 0) return null;
  const p = ((to - from) / from) * 100;
  return `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
}

// Newest point at or before (latest date minus `years`).
function pointYearsBack(series: [string, number][], years: number): [string, number] | null {
  const [y, m, d] = series[series.length - 1][0].split("-").map(Number);
  const cut = `${String(y - years).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const eligible = series.filter(([dt]) => dt <= cut);
  return eligible.length ? eligible[eligible.length - 1] : null;
}

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const CODE = code.toUpperCase();
  const title = `${CODE} vs the US Dollar, Charted | Business of the Metros`;
  const description = `The ${CODE} exchange rate against the US dollar across its full modern history - daily chart, highs and lows, and the countries that use it.`;
  return {
    title,
    description,
    alternates: { canonical: `/business/currencies/${code}` },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description, url: `${BASE_URL}/business/currencies/${code}`, type: "website" },
    twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${title} | ${SITE_NAME}`, description },
  };
}

export default async function CurrencyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!CODES.includes(code)) notFound();
  const CODE = code.toUpperCase();

  const [fx, hist] = await Promise.all([getFx(), getFxSeries(CODE)]);
  const series = hist?.series ?? [];
  if (series.length < 2) notFound();

  const info = fx?.currencies.find((c) => c.code === CODE) ?? null;
  const [lastDate, lastRate] = series[series.length - 1];
  const yearAgo = pointYearsBack(series, 1);
  const fiveAgo = pointYearsBack(series, 5);
  const win52 = series.filter(([d]) => yearAgo === null || d >= yearAgo[0]);
  const hi52 = Math.max(...win52.map((p) => p[1]));
  const lo52 = Math.min(...win52.map((p) => p[1]));
  let atHi = series[0], atLo = series[0];
  for (const p of series) {
    if (p[1] > atHi[1]) atHi = p;
    if (p[1] < atLo[1]) atLo = p;
  }

  const stats: { k: string; v: string; d: string }[] = [
    { k: "Now", v: `${fmtRate(lastRate)}`, d: `per USD · ${lastDate}` },
    { k: "1-year", v: pctChange(yearAgo?.[1] ?? null, lastRate) ?? "—", d: `52w range ${fmtRate(lo52)}–${fmtRate(hi52)}` },
    { k: "5-year", v: pctChange(fiveAgo?.[1] ?? null, lastRate) ?? "—", d: fiveAgo ? `from ${fmtRate(fiveAgo[1])} in ${fiveAgo[0].slice(0, 4)}` : "series too young" },
    { k: "Weakest ever", v: fmtRate(atHi[1]), d: `per USD · ${atHi[0].slice(0, 7)}` },
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/business" className="hover:underline">Business</Link>
        {" / "}
        <Link href="/business/currencies" className="hover:underline">Currencies</Link>
        {" / "}
        <span>{CODE}</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
          <span aria-hidden>💱</span> <span className="capitalize">{info?.name ?? CODE}</span>{" "}
          <span className="text-[var(--text-dim)] font-normal" style={MONO}>{CODE}</span>
        </h1>
        <p className="text-[15px] text-[var(--text-muted)] max-w-3xl">
          One dollar buys <span className="font-semibold text-[var(--text)]" style={MONO}>{fmtRate(lastRate)} {CODE}</span>
          {" "}· one {CODE} buys <span className="font-semibold text-[var(--text)]" style={MONO}>${(1 / lastRate).toFixed(4)}</span>.
          {PEG_NOTE[CODE] ? ` ${PEG_NOTE[CODE]}` : ""}
        </p>
        <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mt-3" style={MONO}>
          {series.length.toLocaleString()} tracked days · {hist!.meta.start} to {hist!.meta.end} · refreshed daily
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
        <FxChart code={CODE} series={series} />
        <p className="text-xs text-[var(--text-muted)] mt-3">
          Units per US dollar - up means a weaker {CODE}. Strongest ever: {fmtRate(atLo[1])} ({atLo[0].slice(0, 7)});
          weakest: {fmtRate(atHi[1])} ({atHi[0].slice(0, 7)}).
        </p>
      </section>

      {info && info.countries.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-bold mb-2">Where it spends</h2>
          <p className="text-sm text-[var(--text-muted)]">
            {info.countries.map((k, i) => (
              <span key={k.slug}>
                {i > 0 && " · "}
                <Link href={`/countries/${k.slug}`} className="hover:underline" style={{ color: "var(--accent)" }}>{k.name}</Link>
              </span>
            ))}
            {info.countryCount > info.countries.length && ` + ${info.countryCount - info.countries.length} more`}
          </p>
        </section>
      )}

      <section className="mb-6 rounded-2xl border p-5 sm:p-6" style={CARD}>
        <h2 className="text-lg font-bold mb-2">About this chart</h2>
        <p className="text-[13.5px] text-[var(--text-muted)] leading-relaxed max-w-3xl">
          Rates are units per US dollar: month-end observations to 1970, near-daily after, and the
          site&apos;s own daily snapshots from August 2026 onward. Each series starts at the currency&apos;s
          modern era - its introduction or latest redenomination - rather than splicing rebased
          legacy units onto today&apos;s scale, so the euro begins in 1999 and the real at the Plano
          Real, not at numbers no one ever paid. None of this is investment advice; all of it is
          geography with a time axis.
        </p>
      </section>
    </main>
  );
}
