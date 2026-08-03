import type { Metadata } from "next";
import Link from "next/link";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { getAllRivalries } from "@/lib/rivalries";
import RivalriesTable, { type RivalryRow } from "./RivalriesTable";

export const dynamicParams = false;

const PATH = "/sports/rivalries";
const TITLE = "Sports Rivalries";
const DESC =
  "A definitive, growing map of sporting rivalries: the derbies, classics and grudge matches that define cities and nations, each side linked to its team page. From El Clásico and the Old Firm to the Iron Bowl and India-Pakistan.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const ACCENT = "#d4af37";

export default function RivalriesHubPage() {
  const rows = getAllRivalries();
  const linked = rows.filter((r) => r.team.href && r.rival.href).length;
  const sports = Array.from(new Set(rows.map((r) => r.sport))).length;

  const tableRows = [...rows]
    .sort((a, b) => a.sport.localeCompare(b.sport) || a.rivalry.localeCompare(b.rivalry))
    .map<RivalryRow>((r) => ({
      sport: r.sport,
      rivalry: r.rivalry,
      teamName: r.team.name,
      teamHref: r.team.href,
      rivalName: r.rival.name,
      rivalHref: r.rival.href,
      country: r.country,
      twoWay: r.twoWay,
      top: r.top,
    }));

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/sports" className="hover:underline">Sports</Link>
        {" / "}
        <span>Rivalries</span>
      </nav>

      <header className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span aria-hidden className="text-2xl">⚔️</span>
          <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: ACCENT }}>
            Who hates whom
          </span>
        </div>
        <h1 className="text-4xl font-bold tracking-tight mb-2">Sports Rivalries</h1>
        <p className="text-[var(--text-muted)] max-w-3xl text-sm sm:text-base">
          The derbies, classics and grudge matches that define cities and nations, gathered on one
          board. Each side links to its team page where one exists; rivalries between clubs the site
          does not yet cover are listed in full and become live links as those leagues are added.
          A growing list, seeded from years of hand-tracking and expanding sport by sport.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-[var(--text-muted)] mt-3">
          <div>
            <strong className="text-[var(--text)] text-sm tabular-nums" style={mono}>{rows.length}</strong> rivalries
          </div>
          <div>
            <strong className="text-[var(--text)] text-sm tabular-nums" style={mono}>{sports}</strong> sports
          </div>
          <div>
            <strong className="text-[var(--text)] text-sm tabular-nums" style={mono}>{linked}</strong> fully linked
          </div>
        </div>
      </header>

      <div className="mt-6">
        <RivalriesTable rows={tableRows} />
      </div>

      <p className="text-xs text-[var(--text-dim)] mt-10">
        Source of truth: the hand-maintained rivalries ledger. Coverage is deliberately
        non-exhaustive and grows over time; suggestions welcome.
      </p>
    </main>
  );
}
