import type { Metadata } from "next";
import Link from "next/link";
import { getPopulation2100Index } from "@/lib/population2100";
import { aggregateBloc, fmtPop, PROPOSED_BLOCS, type Pop2100Bloc } from "@/lib/population2100Shape";
import { getOrgMembers, ORG_DEFS } from "@/lib/orgs";
import { getAllCountries } from "@/lib/countries";
import { BASE_URL, SITE_NAME, ogImage } from "@/lib/seo";
import { SectionHead } from "@/app/_shared/SectionHead";
import Board2100 from "./Board2100";
import Chart2100 from "./Chart2100";

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
  openGraph: { images: [{ url: ogImage(PAGE_TITLE, PAGE_PATH), width: 1200, height: 630 }], title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION, url: `${BASE_URL}${PAGE_PATH}`, type: "website" },
  twitter: { images: [ogImage(PAGE_TITLE, PAGE_PATH)], card: "summary_large_image", title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION },
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
  // Blocs: every organisation the site tracks, the UN included (Ashwin:
  // "add the United Nations as another bloc"), on its CURRENT full members,
  // plus the proposed unions in PROPOSED_BLOCS. Summed on the median, year
  // by year; no bands.
  // "Today" is the CURRENT year and the population this site tracks for it
  // (countries.json, official estimates), not the UN's 2025 median: the
  // column and the multiple move with the calendar until the 2030 projection
  // (Ashwin, 2026-09-10). Blocs sum their members' tracked figures.
  const nowYear = Math.min(new Date().getUTCFullYear(), 2029);
  const nowPop: Record<string, number> = Object.fromEntries(
    getAllCountries().filter((c) => c.pop != null && c.pop > 0).map((c) => [c.slug, c.pop as number]),
  );
  const blocMeta = { pathStart: index._meta.path_start, baseYear: nowYear, lastEstimate: index._meta.last_estimate, nowPop };
  const blocs: Pop2100Bloc[] = [
    ...ORG_DEFS.map((o) =>
      aggregateBloc(rows, blocMeta, {
        key: `org-${o.key.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        // The full name, unless it is a mouthful (OECD, BIMSTEC, CPTPP): the row is not a glossary.
        name: o.label.length > 44 ? o.abbr : o.label,
        kind: "org",
        note: `Current full members of the ${o.label}, as tracked on this site's organisations page; candidates, observers and partners are not counted.`,
        href: "/orgs",
        // A suspended member is still a member state (the AU's Mali, Mercosur's Venezuela); it counts.
        members: getOrgMembers(o.key).filter((m) => m.status === "Member" || m.status === "Suspended").map((m) => m.slug),
      }),
    ),
    ...PROPOSED_BLOCS.map((b) => aggregateBloc(rows, blocMeta, { ...b, kind: "proposed" })),
  ].filter((b): b is Pop2100Bloc => b != null);
  // The continent each country is assigned on this site (countries.json),
  // for the board's continent filter; a bloc answers to every continent a
  // member sits in (Ashwin: "if somebody selects Europe, any bloc that has
  // a country in modern-day Europe should show up there, even if Russia
  // spans Asia").
  const continents: Record<string, string> = Object.fromEntries(
    getAllCountries().filter((c) => c.continent).map((c) => [c.slug, c.continent as string]),
  );

  return (
    <main className="min-h-screen pt-8 pb-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl 2xl:max-w-7xl mx-auto">
        <nav className="mb-6 text-xs text-[var(--text-muted)]" style={MONO}>
          <Link href="/" className="hover:text-[var(--accent)]">Home</Link> / <Link href="/countries" className="hover:text-[var(--accent)]">Countries</Link> / <span>To 2100</span>
        </nav>
        <header className="mb-8 border-b border-[var(--border)] pb-6">
          <p className="text-xs tracking-widest text-[var(--text-muted)] mb-3" style={MONO}>COUNTRIES · TO 2100</p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-3">The world in 2100, country by country.</h1>
          {/* One line. The method, the caveats and the sourcing live at the foot of the
              page (DESIGN-STANDARDS §2A: the top of a page is minimal, references go
              last; Ashwin, 2026-09-10). */}
          <p className="text-lg text-[var(--text-muted)] leading-relaxed max-w-3xl">
            Every country and bloc on the UN median to 2100, with the multiple on today and the year each peaks.
          </p>
        </header>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-3 mb-6">
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
          title={`Every country and bloc, ${index._meta.path_start} to ${index._meta.end}`}
          sub={`2100 on the UN median, the multiple on ${nowYear} and the peak year first; then each decade back to 2000 (UN estimates from 2020), with ${nowYear} as this site tracks it; ${blocs.length} blocs summed from their members sit in the same ranking.`}
          more={`Click any heading (or the sort control on a phone) to rank by any column. Columns: 2100 on the median, the multiple on ${nowYear}, the peak year ("peaked" in red once it is behind us), then each decade back to 2000, with ${nowYear} highlighted as this site's own count and the UN estimates before it dimmed; the 95% band at 2100 on the widest screens. Filter to countries, blocs or proposed unions, and by continent; a bloc answers to every continent a member is on, or to Global when it spans three or more.`}
        />
        <Board2100 rows={rows} blocs={blocs} continents={continents} nowYear={nowYear} nowPop={nowPop} pathStart={index._meta.path_start} lastEstimate={index._meta.last_estimate} />

        <section className="mt-10 mb-10">
          <SectionHead
            id="chart"
            title={`Every year, ${index._meta.path_start} to ${index._meta.end}`}
            sub={`UN estimates from ${index._meta.path_start} to ${index._meta.last_estimate} and the median after, for up to six countries or blocs on one axis, in people or indexed to ${nowYear}.`}
            more={`The six largest in 2100 open the chart; add any country or bloc from the list and remove any with its ×. "People" shows the median itself; "${nowYear} = 100" divides every path by its value today, so a country of 5 million and one of 500 million can be compared on how far each grows or shrinks. Tap or drag across the chart and the line beneath names every series' figure for that year.`}
          />
          <div className="rounded-xl border p-3 sm:p-4" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
            <Chart2100 rows={rows} blocs={blocs} baseYear={nowYear} pathStart={index._meta.path_start} lastEstimate={index._meta.last_estimate} end={index._meta.end} />
          </div>
        </section>

        <section id="about" className="mt-10 rounded-xl border p-4 text-xs text-[var(--text-muted)] space-y-2" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <p>
            Not this site&rsquo;s model: the figures are the UN&rsquo;s probabilistic median from the {index._meta.revision} revision (estimates to {index._meta.last_estimate}, projections to {index._meta.end}), and the site says what they imply. The {nowYear} column is the exception: it is the population this site tracks for each country, the same figure as the country hub. Each country row opens that hub&rsquo;s fan chart with the 80% and 95% bands.
          </p>
          <p>
            {rows.length} countries; territories the UN folds into a parent are absent ({index.unmatched.length} listed in the data file). Blocs sum their current member states&rsquo; medians year by year, so a bloc has no band; the UN itself is one of them. Proposed rows are unions that do not exist yet, summed from the members the proposal names.
          </p>
          <p className="text-[var(--text-dim)]">Source: {index._meta.source_credit} CC BY 3.0 IGO.</p>
        </section>
      </div>
    </main>
  );
}
