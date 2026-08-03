import type { Metadata } from "next";
import Link from "next/link";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { getAllValuations } from "@/lib/valuations";
import ValuationsTable from "./ValuationsTable";

export const dynamicParams = false;

const PAGE_PATH = "/sports/valuations";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "Team Valuations";
const PAGE_DESCRIPTION =
  "Estimated franchise valuations across the NFL, NBA, MLB, NHL and global football, on one sortable board. Forbes for US leagues, Sportico for football.";

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
  twitter: { card: "summary_large_image", title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION },
};

export default function ValuationsPage() {
  const rows = getAllValuations();
  const linked = rows.filter((r) => r.href).length;
  const leagues = new Set(rows.map((r) => r.league)).size;
  const top = rows[0];

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <header className="mb-8">
        <div className="text-xs uppercase tracking-widest text-[var(--text-dim)] mb-2">
          <Link href="/sports" className="hover:text-[var(--accent)]">All Sports</Link> · Valuations
        </div>
        <h1 className="text-4xl font-bold tracking-tight mb-2">Team Valuations</h1>
        <p className="text-[var(--text-muted)] max-w-3xl text-sm sm:text-base">
          Estimated franchise valuations across the big four North American leagues and global football, on one
          sortable board. US figures are Forbes&apos; latest; football figures are Sportico&apos;s. Click any team to
          open its page; the same figure appears on each team&apos;s page and links back here.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-[var(--text-muted)] mt-4">
          <div><strong className="text-[var(--text)] text-sm">{rows.length}</strong> teams</div>
          <div><strong className="text-[var(--text)] text-sm">{leagues}</strong> leagues &amp; countries</div>
          <div><strong className="text-[var(--text)] text-sm">{linked}</strong> with team pages</div>
          {top && (
            <div>Most valuable: <strong className="text-[var(--text)] text-sm">{top.displayName}</strong> · {top.valueLabel}</div>
          )}
        </div>
      </header>

      <ValuationsTable rows={rows} />

      <p className="text-xs text-[var(--text-dim)] mt-8 max-w-3xl">
        Curated, non-exhaustive snapshot — the latest published valuation per team, not a full league-by-league
        ranking. Sources: Forbes (NFL/NBA/MLB/NHL, 2025) and Sportico&apos;s 2026 most-valuable football-club
        valuations (with the country shown in place of a league). Figures in USD; values shown in billions above
        $1B, otherwise millions.
      </p>
    </main>
  );
}
