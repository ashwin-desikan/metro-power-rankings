import type { Metadata } from "next";
import Link from "next/link";
import SoundNav from "../SoundNav";
import { getAppleCharts } from "@/lib/appleCharts";

// Apple Music charts refresh daily; revalidate a few times a day.
export const revalidate = 10800;

export const metadata: Metadata = {
  title: "Live Charts — Apple Music Top Songs",
  description:
    "This week's most-played songs on Apple Music in the US and UK, updated daily. Apple Music's chart (not the official Billboard Hot 100 or UK Official Singles Chart), with links to both official charts.",
  alternates: { canonical: "/sound/charts" },
};

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;

function fmtUpdated(rfc822: string): string {
  const d = new Date(rfc822);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export default async function LiveChartsPage() {
  const charts = await getAppleCharts();

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <SoundNav />

      <header className="mb-4">
        <p className="text-[11px] uppercase tracking-widest mb-2" style={{ ...MONO, color: "var(--accent)" }}>
           Updated daily
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Live Charts</h1>
        <p className="mt-2 max-w-2xl text-[15px]" style={{ color: "var(--text-muted)" }}>
          The most-played songs on Apple Music right now, in the US and the UK.
        </p>
        {/* MONO uppercase provenance stamp, per the TabHeader idiom in
            app/business/ui.tsx and the DESIGN-STANDARDS rule that every data
            page states its source and as-of date. */}
        {charts.length > 0 ? (
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mt-3" style={MONO}>
            {charts.length} {charts.length === 1 ? "chart" : "charts"} ·{" "}
            {charts.reduce((n, c) => n + c.tracks.length, 0)} tracks
            {charts[0]?.updated ? ` · as of ${fmtUpdated(charts[0].updated)}` : ""} · source: Apple Music
          </p>
        ) : null}
      </header>

      {/* What this is / is not — labeling + links to the official charts. */}
      <div
        className="mb-8 rounded-lg border p-4 text-sm"
        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <p className="text-[var(--text-muted)]">
          <span className="font-semibold text-[var(--text)]">This is Apple Music&apos;s chart.</span>{" "}
          It reflects what is most played on Apple Music, updated daily. It is{" "}
          <span className="font-semibold text-[var(--text)]">not</span> the official{" "}
          <a
            href="https://www.billboard.com/charts/hot-100/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-[var(--accent)]"
          >
            Billboard Hot 100
          </a>{" "}
          (US) or{" "}
          <a
            href="https://www.officialcharts.com/charts/singles-chart/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-[var(--accent)]"
          >
            Official Singles Chart
          </a>{" "}
          (UK), which combine sales, streams and airplay across every platform and are published weekly. For the
          official weekly rankings, follow those two links.
        </p>
      </div>

      {charts.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)", ...MONO }}>
          The live chart feed is temporarily unavailable. Please check back shortly.
        </div>
      ) : (
        <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
          {charts.map((chart) => (
            <section
              key={chart.code}
              id={`chart-${chart.code}`}
              className="rounded-lg border overflow-hidden min-w-0"
              style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
            >
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://flagcdn.com/40x30/${chart.code}.png`}
                    alt=""
                    width={24}
                    height={18}
                    className="rounded-[2px] flex-shrink-0"
                    style={{ objectFit: "cover" }} loading="lazy" decoding="async"
                  />
                  <div className="min-w-0">
                    <div className="font-semibold text-sm leading-tight">Apple Music Top Songs</div>
                    <div className="text-[11px] text-[var(--text-dim)]" style={MONO}>
                      {chart.label}
                      {chart.updated ? ` · ${fmtUpdated(chart.updated)}` : ""}
                    </div>
                  </div>
                </div>
                <a
                  href={chart.official.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] whitespace-nowrap flex-shrink-0 hover:text-[var(--accent)] transition-colors"
                  style={{ ...MONO, color: "var(--text-muted)" }}
                >
                  {chart.official.name} ↗
                </a>
              </div>

              {/* HEIGHT-CAPPED per DESIGN-STANDARDS ("cap the mobile card
                  fallback too"). Each chart is 100 tracks and the grid stacks
                  to one column on a phone, so uncapped you had to scroll past
                  all 100 US tracks to reach the UK chart at all - 15.5 screens
                  against 7.8 on desktop. Capping gives each chart its own
                  scroll area with its header pinned above it, so both charts
                  are reachable without a scroll marathon. overscroll-contain
                  stops a flick inside a chart running on into the page. */}
              <ol className="max-h-[70vh] overflow-y-auto overscroll-contain">
                {chart.tracks.map((t) => (
                  <li key={t.rank}>
                    <a
                      href={t.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-4 py-2 border-b hover:bg-[var(--bg-card-hover)] transition-colors group"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <span
                        className="w-6 text-right flex-shrink-0 text-[13px] font-semibold tabular-nums"
                        style={{ ...MONO, color: "var(--text-dim)" }}
                      >
                        {t.rank}
                      </span>
                      {t.artwork ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={t.artwork}
                          alt=""
                          width={40}
                          height={40}
                          loading="lazy"
                          className="rounded flex-shrink-0"
                          style={{ objectFit: "cover" }}
                        />
                      ) : (
                        <span className="w-10 h-10 rounded flex-shrink-0" style={{ background: "var(--bg)" }} aria-hidden />
                      )}
                      <span className="min-w-0">
                        <span className="block text-sm font-medium truncate group-hover:text-[var(--accent)] transition-colors">
                          {t.title}
                        </span>
                        <span className="block text-[12px] text-[var(--text-muted)] truncate">{t.artist}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}

      <p className="mt-6 text-[11px] leading-relaxed" style={{ ...MONO, color: "var(--text-dim)" }}>
        Chart data from Apple Music (© Apple Inc.), via Apple&apos;s public RSS feeds. Song links open in Apple Music.
        This page is not affiliated with or endorsed by Apple, Billboard, or the Official Charts Company.
      </p>
    </main>
  );
}
