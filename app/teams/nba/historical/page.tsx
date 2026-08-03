import type { Metadata } from "next";
import Link from "next/link";
import { getHistoricalFranchises, seasonLabel } from "@/lib/nba";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

const PAGE_PATH = "/teams/nba/historical";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "Historical NBA franchises";
const PAGE_DESCRIPTION =
  "Defunct basketball franchises: BAA charter members that folded before the 1949 merger, ABA-only franchises that did not join the NBA in 1976 (Kentucky Colonels, Spirits of St. Louis, Utah Stars, etc.), and short-lived early NBA clubs.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION, url: PAGE_URL, type: "website" },
  twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION },
};

export default function HistoricalPage() {
  const rows = getHistoricalFranchises();
  const abaOnly = rows.filter((r) => r.aba_only);
  const baaOnly = rows.filter((r) => !r.aba_only && (r.leagues.includes("BAA") || r.leagues.includes("NBA")));

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:text-[var(--text)]">Home</Link>
        <span className="mx-1">&rsaquo;</span>
        <Link href="/teams/nba" className="hover:text-[var(--text)]">NBA</Link>
        <span className="mx-1">&rsaquo;</span>
        <span className="text-[var(--text-dim)]">Historical</span>
      </nav>

      <div className="mb-4">
        <Link
          href="/teams/nba"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          <span aria-hidden>&larr;</span>
          <span>All 30 NBA franchises</span>
        </Link>
      </div>

      <header className="mb-6">
        <div className="text-xs uppercase tracking-widest text-[var(--text-dim)] mb-2">Defunct franchises</div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Historical NBA franchises</h1>
        <p className="text-sm text-[var(--text-muted)] mt-2 max-w-3xl">
          Franchises that played at least one season in the Basketball Association of America (1947-49),
          National Basketball Association (1949+), or American Basketball Association (1968-76) but no longer
          exist as independent clubs. Includes the 8 ABA-only franchises whose lineages did not survive the 1976
          NBA-ABA merger, the BAA charter members that folded before the 1949 merger, and one-season early NBA clubs.
        </p>
      </header>

      <HistoricalSection
        title="ABA-only franchises"
        deck="American Basketball Association franchises (1968-76) whose lineages did not merge into the NBA. The 1976 merger absorbed only the Pacers, Nets, Spurs, and Nuggets; everything below either folded, was bought out, or operated entirely outside the merger."
        rows={abaOnly}
        showAbaCol={true}
      />

      <HistoricalSection
        title="BAA / NBA defunct franchises"
        deck="Basketball Association of America (1947-49) and early NBA franchises that folded, mostly during the league's first decade of consolidation."
        rows={baaOnly}
        showAbaCol={false}
      />

      <p className="text-xs text-[var(--text-dim)] mt-8">
        Active 30: <Link href="/teams/nba" className="hover:text-[var(--text-muted)]">/teams/nba</Link>.
        Source: NBA workbook (Totals sheet, Defunct=Y rows). ABA championships rendered in slate on the active-franchise
        pages for the four ABA-NBA merger survivors.
      </p>
    </main>
  );
}

function HistoricalSection({
  title,
  deck,
  rows,
  showAbaCol,
}: {
  title: string;
  deck: string;
  rows: ReturnType<typeof getHistoricalFranchises>;
  showAbaCol: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <section
      className="rounded-xl border overflow-hidden mb-6"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <div className="px-5 pt-4 pb-2">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-xs text-[var(--text-muted)] mt-1 mb-3">{deck}</p>
      </div>

      {/* Mobile: one card per franchise instead of a 7-column table forcing
          horizontal scroll at phone widths. Same `rows` data as the table below. */}
      <div className="grid grid-cols-1 gap-2 px-4 pb-4 sm:hidden">
        {rows.map((r) => (
          <div
            key={r.slug}
            className="rounded-lg border p-3"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-sm truncate">{r.display_name}</span>
              {showAbaCol && (
                <span
                  className="flex-shrink-0 inline-block rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                  style={{ background: "#6e8aa6", color: "#0c1320" }}
                >
                  ABA
                </span>
              )}
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-0.5">
              {r.first_year && r.last_year
                ? `${seasonLabel(r.first_year)} – ${seasonLabel(r.last_year)}`
                : "—"}
            </div>
            <div className="mt-2.5 grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs">
              <StatChip label="Seasons" value={r.seasons || "—"} />
              <StatChip label="Titles" value={r.championships || "—"} />
              <StatChip label="Finals" value={r.championship_appearances || "—"} />
              <StatChip label="All-time" value={`${r.all_time_w}-${r.all_time_l}`} />
              <StatChip label="Win%" value={r.win_pct ? r.win_pct.toFixed(3).replace(/^0/, "") : "—"} />
            </div>
          </div>
        ))}
      </div>

      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-xs sm:text-sm tabular-nums">
          <thead>
            <tr className="text-left text-[var(--text-muted)] border-b border-t" style={{ borderColor: "var(--border)" }}>
              <th className="py-2 pl-5 pr-3 font-medium uppercase tracking-wider text-[10px]">Franchise</th>
              <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[10px]">Years</th>
              <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[10px] text-right">Seasons</th>
              <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[10px] text-right">Titles</th>
              <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[10px] text-right">Finals</th>
              <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[10px] text-right">All-time</th>
              <th className="py-2 pr-5 font-medium uppercase tracking-wider text-[10px] text-right">Win%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.slug} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                <td className="py-2 pl-5 pr-3">
                  <span className="font-semibold">{r.display_name}</span>
                  {showAbaCol && (
                    <span className="ml-2 inline-block rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                      style={{ background: "#6e8aa6", color: "#0c1320" }}>
                      ABA
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3 text-[var(--text-muted)]">
                  {r.first_year && r.last_year
                    ? `${seasonLabel(r.first_year)} – ${seasonLabel(r.last_year)}`
                    : "—"}
                </td>
                <td className="py-2 pr-3 text-right text-[var(--text-muted)]">{r.seasons || ""}</td>
                <td className="py-2 pr-3 text-right font-semibold">{r.championships || ""}</td>
                <td className="py-2 pr-3 text-right text-[var(--text-muted)]">{r.championship_appearances || ""}</td>
                <td className="py-2 pr-3 text-right text-[var(--text-muted)]">{r.all_time_w}-{r.all_time_l}</td>
                <td className="py-2 pr-5 text-right text-[var(--text-muted)]">
                  {r.win_pct ? r.win_pct.toFixed(3).replace(/^0/, "") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// Compact labeled stat chip for mobile cards: small uppercase label above a
// value, matching the mini-grid pattern used elsewhere (e.g. ChampionsTable).
function StatChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">{label}</div>
      <div className="text-[var(--text-muted)]">{value}</div>
    </div>
  );
}
