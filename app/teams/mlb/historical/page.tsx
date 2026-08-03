import type { Metadata } from "next";
import Link from "next/link";
import { getHistoricalFranchises, getHistoricalSeasons } from "@/lib/mlb";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import HistoricalTable from "./HistoricalTable";

const PAGE_PATH = "/teams/mlb/historical";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "Historical MLB franchises";
const PAGE_DESCRIPTION =
  "Defunct and historical Major League Baseball franchises: 19th-century NL/AA charter members, American Association teams absorbed in the 1891 settlement, Players League and Federal League survivors, and short-lived 1870s clubs.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: { title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION, url: PAGE_URL, type: "website" },
  twitter: { card: "summary_large_image", title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION },
};

export default function HistoricalPage() {
  const rows = getHistoricalFranchises();
  const histSeasons = getHistoricalSeasons();

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:text-[var(--text)]">Home</Link>
        <span className="mx-1">&rsaquo;</span>
        <Link href="/teams/mlb" className="hover:text-[var(--text)]">MLB</Link>
        <span className="mx-1">&rsaquo;</span>
        <span className="text-[var(--text-dim)]">Historical</span>
      </nav>

      {/* Back-to-league chip. Mirrors the per-team page so readers always
          have a one-click path back to the active-franchise list. */}
      <div className="mb-4">
        <Link
          href="/teams/mlb"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          <span aria-hidden>&larr;</span>
          <span>All 30 MLB franchises</span>
        </Link>
      </div>

      <header className="mb-6">
        <div className="text-xs uppercase tracking-widest text-[var(--text-dim)] mb-2">Defunct franchises</div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Historical MLB franchises</h1>
        <p className="text-sm text-[var(--text-muted)] mt-2 max-w-3xl">
          Franchises that played at least one National League, American League, American Association,
          Players League, Federal League, or Union Association season but no longer exist as independent
          clubs. Includes 19th-century charter members and short-lived 1870s and 1880s teams. Disambiguators
          in parens for name collisions (Orioles (1) is the 1882-1899 American Association club; Reds (1)
          is the early Cincinnati franchise; and so on).
        </p>
      </header>

      <HistoricalTable rows={rows} histSeasons={histSeasons} />

      <p className="text-xs text-[var(--text-dim)] mt-8">
        Active 30: <Link href="/teams/mlb" className="hover:text-[var(--text-muted)]">/teams/mlb</Link>.
        Source: MLB workbook (Totals sheet, defunct rows). Championships count pre-1903 cup wins and NL pennants.
      </p>
    </main>
  );
}
