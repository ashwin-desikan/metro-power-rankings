import type { Metadata } from "next";
import Link from "next/link";
import {
  getHistoricalFranchises,
  getHistoricalChampionships,
  getHistoricalSeasons,
} from "@/lib/nfl";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import HistoricalTable from "./HistoricalTable";

const PAGE_PATH = "/teams/nfl/historical";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "Historical NFL franchises";
const PAGE_DESCRIPTION =
  "Defunct and historical NFL franchises: APFA charter members, AAFC entries that did not survive the 1949 merger, AFL clubs absorbed in 1970, and short-lived 1920s teams. Includes the Pottsville Maroons' stolen 1925 championship, attributed to the Bulldogs (Boston) lineage.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION, url: PAGE_URL, type: "website" },
  twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION },
};

export default function HistoricalPage() {
  const rows = getHistoricalFranchises();
  const histChamps = getHistoricalChampionships();
  const histSeasons = getHistoricalSeasons();

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:text-[var(--text)]">Home</Link>
        <span className="mx-1">&rsaquo;</span>
        <Link href="/teams/nfl" className="hover:text-[var(--text)]">NFL</Link>
        <span className="mx-1">&rsaquo;</span>
        <span className="text-[var(--text-dim)]">Historical</span>
      </nav>

      {/* Back-to-league chip. Mirrors the per-team page so readers always
          have a one-click path back to the active-franchise list. */}
      <div className="mb-4">
        <Link
          href="/teams/nfl"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          <span aria-hidden>&larr;</span>
          <span>All 32 NFL franchises</span>
        </Link>
      </div>

      <header className="mb-6">
        <div className="text-xs uppercase tracking-widest text-[var(--text-dim)] mb-2">Defunct franchises</div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Historical NFL franchises</h1>
        <p className="text-sm text-[var(--text-muted)] mt-2 max-w-3xl">
          Franchises that played at least one NFL, APFA, AAFC, or AFL season but no longer exist as independent
          clubs. Includes APFA charter members, AAFC entries that did not survive the 1949 merger,
          and short-lived 1920s teams. Click any column header to sort, and the +/&minus; to expand a franchise&apos;s
          season-by-season record.
        </p>
      </header>

      <HistoricalTable rows={rows} histChamps={histChamps} histSeasons={histSeasons} />

      {/* Stolen-title footnote. The 1925 championship belongs to the
          Pottsville Maroons / Boston Bulldogs lineage (canonical:
          Bulldogs (Boston)), not the separate Toledo/Kenosha Maroons. */}
      <aside
        className="mt-6 p-4 sm:p-5 rounded-lg border-l-4"
        style={{
          background: "rgba(212, 175, 55, 0.06)",
          borderColor: "#d4af37",
        }}
      >
        <h3 className="text-sm font-semibold mb-2" style={{ color: "#d4af37" }}>
          The 1925 Pottsville asterisk (Bulldogs (Boston) lineage)
        </h3>
        <p className="text-xs sm:text-sm text-[var(--text-muted)] leading-relaxed">
          The Pottsville Maroons (1925-28) and the Boston Bulldogs (1929) are one franchise in the
          NFL ledger, listed here under the canonical Bulldogs (Boston). The separate Maroons
          franchise played in Toledo and Kenosha (1922-24) and folded before Pottsville existed.
          In 1925 Pottsville finished 10-2 and beat the 9-1-1 Chicago Cardinals 21-7 in the de facto
          championship game on December 6. Six days later they played a Notre Dame All-Stars
          exhibition at Shibe Park in Philadelphia, inside the Frankford Yellow Jackets&apos;
          protected territory. League President Joseph Carr suspended the franchise. The Cardinals,
          who hastily scheduled two games against the dissolved Milwaukee Badgers and Hammond Pros
          to pad their record, were awarded the title. Pete Rozelle reviewed the case in 1963 and
          again in 1972, declining to restore Pottsville. NFL owners voted 30-2 in 2003 to leave the
          title with the Cardinals. The asterisk stands.
        </p>
      </aside>

      <p className="text-xs text-[var(--text-dim)] mt-8">
        Active 32: <Link href="/teams/nfl" className="hover:text-[var(--text-muted)]">/teams/nfl</Link>.
        Source: NFL_all workbook, last refreshed 2026-05-12.
      </p>
    </main>
  );
}
