import type { Metadata } from "next";
import Link from "next/link";
import { getPopulation2100Index } from "@/lib/population2100";
import { fmtPop } from "@/lib/population2100Shape";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { SectionHead } from "@/app/_shared/SectionHead";
import Board2100 from "./Board2100";

// The world in 2100, one row per country: the UN's median with its 95%
// band, the multiple on 2025, the peak year. The country hubs carry the fan
// chart; this board is the ranking across them. Read only from the index
// the builder writes, so every number here is the number on the hub.

const PAGE_PATH = "/countries/2100";
const PAGE_TITLE = "Population to 2100";
const PAGE_DESCRIPTION =
  "Every country's population in 2050 and 2100 on the UN's probabilistic median, with the 95% band, the multiple on today and the year each peaks.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION, url: `${BASE_URL}${PAGE_PATH}`, type: "website" },
  twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION },
};

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;

export default function Population2100Page() {
  const index = getPopulation2100Index();
  if (!index) return null;
  const rows = index.countries;
  const past = rows.filter((r) => r.peak.past).length;
  const falling = rows.filter((r) => r.declineFrom).length;
  const soon = rows.filter((r) => !r.peak.past && r.peak.year <= 2050).length;
  const world2100 = rows.reduce((n, r) => n + r.y2100.med, 0);
  const world2025 = rows.reduce((n, r) => n + (r.base.value ?? 0), 0);

  return (
    <main className="min-h-screen pt-8 pb-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <nav className="mb-6 text-xs text-[var(--text-muted)]" style={MONO}>
          <Link href="/" className="hover:text-[var(--accent)]">Home</Link> / <Link href="/countries" className="hover:text-[var(--accent)]">Countries</Link> / <span>To 2100</span>
        </nav>
        <header className="mb-8 border-b border-[var(--border)] pb-6">
          <p className="text-xs tracking-widest text-[var(--text-muted)] mb-3" style={MONO}>COUNTRIES · TO 2100</p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-3">The world in 2100, country by country.</h1>
          <p className="text-lg text-[var(--text-muted)] leading-relaxed max-w-3xl">
            The UN&rsquo;s probabilistic median for every country, with the 95% band it comes in, the multiple on {index._meta.base_year}, and the year each peaks. Not this site&rsquo;s model: the site reads the {index._meta.revision} revision and says what it implies. Each row opens the country&rsquo;s fan chart.
          </p>
          <p className="mt-3 text-xs text-[var(--text-dim)]" style={MONO}>
            {index._meta.revision} · estimates to {index._meta.last_estimate}, projections to {index._meta.end} · {rows.length} countries · CC BY 3.0 IGO
          </p>
        </header>

        <div className="flex flex-wrap gap-3 mb-8">
          {[
            { k: "Already past their peak", v: String(past), d: `of ${rows.length} countries, on the UN estimates` },
            { k: "Peak by 2050", v: String(soon), d: "on the median, not yet reached" },
            { k: "Falling by 2100", v: String(falling), d: "median declining at the end of the century" },
            { k: `${rows.length} countries, 2100`, v: fmtPop(world2100), d: `from ${fmtPop(world2025)} in ${index._meta.base_year}, ${(world2100 / world2025).toFixed(2)}×` },
          ].map((c) => (
            <div key={c.k} className="rounded-lg border px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]" style={MONO}>{c.k}</div>
              <div className="font-semibold mt-0.5" style={MONO}>{c.v}</div>
              <div className="text-xs text-[var(--text-muted)]">{c.d}</div>
            </div>
          ))}
        </div>

        <SectionHead
          id="board"
          title="Every country, 2025 to 2100"
          sub="The UN median for 2050 and 2100, the 95% band at 2100, the multiple on 2025 and the peak year."
          more={`Sorted by 2100 on the median by default; sort by the multiple to see who grows and who shrinks, or by peak year to see who has already turned. The 95% band is the UN's own prediction interval from its probabilistic projections; for most countries it is wider than the gap between the median and today, which is the point of showing it. Territories the UN folds into a parent are absent (${index.unmatched.length} listed in the data file).`}
        />
        <Board2100 rows={rows} baseYear={index._meta.base_year} />

        <div className="mt-10 rounded-xl border p-4 text-xs text-[var(--text-dim)]" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          Source: {index._meta.source_credit}
        </div>
      </div>
    </main>
  );
}
