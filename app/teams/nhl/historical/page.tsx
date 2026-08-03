import type { Metadata } from "next";
import Link from "next/link";
import { getAllHistorical, TITLE_COLORS } from "@/lib/nhl";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;

const PAGE_PATH = "/teams/nhl/historical";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "Defunct NHL & pre-NHL franchises";
const PAGE_DESCRIPTION =
  "Defunct hockey franchises from the NHL and its predecessors (NHA, PCHA, WCHL) plus the rival WHA, reaching back to the pre-NHL amateur era and the Stanley Cup Challenges from 1893. Includes the original Ottawa Senators / St. Louis Eagles dynasty (canonical Senators (Org)), the Quebec Bulldogs / Hamilton Tigers, the Montreal Maroons, and the relocated Arizona Coyotes.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: {
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
  },
};

function seasonLabel(year: number): string {
  if (!year) return "";
  const start = year - 1;
  return `${start}-${String(year).slice(-2)}`;
}

export default function NhlHistoricalPage() {
  const historical = getAllHistorical();
  const withCups = historical.filter(h => h.championships > 0).length;
  const totalCups = historical.reduce((s, h) => s + h.championships, 0);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="text-xs uppercase tracking-widest text-[var(--text-dim)] mb-3">
        <Link href="/teams/nhl" className="hover:text-[var(--accent)]">← All active NHL franchises</Link>
      </div>

      <header className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">Defunct hockey franchises</h1>
        <p className="text-[var(--text-muted)] max-w-3xl text-sm sm:text-base">
          Franchises that played in the NHL or one of its predecessor / rival leagues but no longer exist as continuing
          operations, now reaching back to the pre-NHL amateur era and the Stanley Cup Challenge years (1893 onwards).
          Includes the original Ottawa Senators / St. Louis Eagles dynasty (one franchise, canonical &ldquo;Senators (Org)&rdquo;,
          ended 1935), the Quebec Bulldogs / Hamilton Tigers, the Montreal Maroons and Wanderers, the relocated Arizona Coyotes,
          the WHA clubs, and the early amateur Stanley Cup challengers. The modern Ottawa Senators (1992+) and Utah Mammoth
          (2025+) are listed separately under the active franchises.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-[var(--text-muted)] mt-4">
          <div><strong className="text-[var(--text)] text-sm">{historical.length}</strong> defunct franchises</div>
          <div><strong className="text-[var(--text)] text-sm">{withCups}</strong> with at least one Cup</div>
          <div><strong className="text-[var(--text)] text-sm">{totalCups}</strong> Cups across all defunct teams</div>
        </div>
      </header>

      {/* Mobile: one stacked card per franchise instead of an 8-column table. */}
      <div className="grid grid-cols-1 gap-2 sm:hidden">
        {historical.map((h) => (
          <div
            key={`${h.slug}-card`}
            className="rounded-lg border p-3"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium text-sm">{h.canonical}</div>
                <div className="text-xs text-[var(--text-muted)] truncate">
                  {h.display_name || `${h.last_city} ${h.last_team}`}
                </div>
                <div className="text-[11px] text-[var(--text-dim)]">{h.league_history}</div>
              </div>
              {h.championships > 0 ? (
                <span
                  className="flex-shrink-0 inline-flex items-center justify-center font-semibold px-1.5 rounded text-xs"
                  style={{ background: TITLE_COLORS.stanley.bg, color: TITLE_COLORS.stanley.text }}
                >
                  {h.championships} Cup{h.championships === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>
            <div className="mt-2.5 grid grid-cols-4 gap-x-3 gap-y-2 text-xs">
              <div>
                <div className="text-[9px] uppercase tracking-wide text-[var(--text-dim)]">Final apps</div>
                <div className="tabular-nums font-medium">{h.champ_appearances}</div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wide text-[var(--text-dim)]">Seasons</div>
                <div className="tabular-nums font-medium text-[var(--text-muted)]">{h.seasons}</div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wide text-[var(--text-dim)]">From</div>
                <div className="tabular-nums font-medium text-[var(--text-muted)]">{seasonLabel(h.founded || 0)}</div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wide text-[var(--text-dim)]">To</div>
                <div className="tabular-nums font-medium text-[var(--text-muted)]">{seasonLabel(h.ended || 0)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <section
        className="rounded-xl border overflow-x-auto hidden sm:block"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <table className="w-full text-xs sm:text-sm tabular-nums">
          <thead>
            <tr className="text-left text-[var(--text-muted)] border-b" style={{ borderColor: "var(--border)" }}>
              <th className="pl-4 py-2 font-medium text-[10px] uppercase tracking-wider">Franchise</th>
              <th className="py-2 px-2 font-medium text-[10px] uppercase tracking-wider">Last team</th>
              <th className="py-2 px-2 font-medium text-[10px] uppercase tracking-wider">Leagues</th>
              <th className="py-2 px-2 font-medium text-[10px] uppercase tracking-wider text-right">Cups</th>
              <th className="py-2 px-2 font-medium text-[10px] uppercase tracking-wider text-right">Final apps</th>
              <th className="py-2 px-2 font-medium text-[10px] uppercase tracking-wider text-right">Seasons</th>
              <th className="py-2 px-2 font-medium text-[10px] uppercase tracking-wider text-right">From</th>
              <th className="py-2 pr-4 font-medium text-[10px] uppercase tracking-wider text-right">To</th>
            </tr>
          </thead>
          <tbody>
            {historical.map((h) => (
              <tr key={h.slug} className="border-b last:border-b-0 hover:bg-[var(--bg-card-hover)]" style={{ borderColor: "var(--border)" }}>
                <td className="pl-4 py-2 font-medium">{h.canonical}</td>
                <td className="py-2 px-2 text-[var(--text-muted)]">{h.display_name || `${h.last_city} ${h.last_team}`}</td>
                <td className="py-2 px-2 text-[var(--text-dim)]">{h.league_history}</td>
                <td className="py-2 px-2 text-right">
                  {h.championships > 0 ? (
                    <span
                      className="inline-flex items-center justify-center font-semibold px-1.5 rounded"
                      style={{ background: TITLE_COLORS.stanley.bg, color: TITLE_COLORS.stanley.text }}
                    >
                      {h.championships}
                    </span>
                  ) : (
                    <span className="text-[var(--text-dim)]">0</span>
                  )}
                </td>
                <td className="py-2 px-2 text-right">{h.champ_appearances}</td>
                <td className="py-2 px-2 text-right text-[var(--text-muted)]">{h.seasons}</td>
                <td className="py-2 px-2 text-right text-[var(--text-muted)]">{seasonLabel(h.founded || 0)}</td>
                <td className="py-2 pr-4 text-right text-[var(--text-muted)]">{seasonLabel(h.ended || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="text-xs text-[var(--text-dim)] mt-8">
        Source: <Link href="/methodology" className="hover:text-[var(--text-muted)]">methodology</Link>.
        Workbook Totals + Year by Year sheets. Pre-1910 Stanley Cup challenge era is intentionally excluded from v1.
      </p>
    </main>
  );
}
