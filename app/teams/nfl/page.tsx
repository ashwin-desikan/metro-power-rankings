import type { Metadata } from "next";
import Link from "next/link";
import { getAllFranchises, monogramFor, TITLE_COLORS } from "@/lib/nfl";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const dynamicParams = false;

const PAGE_PATH = "/teams/nfl";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "NFL franchises";
const PAGE_DESCRIPTION =
  "All 32 active NFL franchises, ranked by championships won across the NFL, AAFC, AFL, and Super Bowl era. Founded year, current city, host metro, and all-time record per franchise.";

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
    card: "summary",
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
  },
};

export default function NflIndexPage() {
  const franchises = getAllFranchises();
  // Pre-sorted by champs desc, then win pct desc, in the ETL.
  const totalChamps = franchises.reduce((s, f) => s + f.championships, 0);
  const withChamps = franchises.filter(f => f.championships > 0).length;
  const sbEra = totalChamps; // approximate; the page is for context, not stat-checking

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <header className="mb-8">
        <div className="text-xs uppercase tracking-widest text-[var(--text-dim)] mb-2">National Football League</div>
        <h1 className="text-4xl font-bold tracking-tight mb-2">NFL franchises</h1>
        <p className="text-[var(--text-muted)] max-w-3xl text-sm sm:text-base">
          All 32 active franchises, sorted by championships won across the NFL, AAFC, AFL, and Super Bowl era.
          Click any franchise for full history, stadium timeline, and award winners.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-[var(--text-muted)] mt-4">
          <div><strong className="text-[var(--text)] text-sm">{franchises.length}</strong> active franchises</div>
          <div><strong className="text-[var(--text)] text-sm">{withChamps}</strong> with at least one championship</div>
          <div><strong className="text-[var(--text)] text-sm">{totalChamps}</strong> combined titles (pre-Super Bowl + Super Bowl era)</div>
          <div>
            Defunct franchises: <Link href="/teams/nfl/historical" className="text-[var(--accent)] hover:underline">/teams/nfl/historical</Link>
          </div>
        </div>
      </header>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-[var(--text-muted)] mb-6">
        <span className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: TITLE_COLORS.pre_sb.bg }} />
          Pre-Super Bowl titles (1920-1965)
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: TITLE_COLORS.sb.bg }} />
          Super Bowl era (1966-present)
        </span>
      </div>

      {/* 32-team grid */}
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
        {franchises.map((f) => {
          const mono = monogramFor(f.slug);
          return (
            <Link
              key={f.slug}
              href={`/teams/nfl/${f.slug}`}
              className="rounded-xl border p-4 flex items-start gap-3 transition-colors"
              style={{
                background: "var(--bg-card)",
                borderColor: "var(--border)",
              }}
            >
              <div
                className="w-11 h-11 rounded-full grid place-items-center font-bold flex-shrink-0"
                style={{ background: mono.bg, color: mono.fg, fontSize: "13px", letterSpacing: "-0.02em" }}
                aria-hidden
              >
                {mono.mono}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm leading-tight">{f.name}</div>
                <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  {f.metro_slug ? (
                    <Link href={`/metros/${f.metro_slug}`} className="hover:text-[var(--text)]">
                      {f.metro}
                    </Link>
                  ) : (
                    f.metro
                  )}
                  {" · "}{f.division}
                </div>
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide"
                    style={{
                      background: f.championships > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)",
                      color: f.championships > 0 ? TITLE_COLORS.sb.bg : "var(--text-dim)",
                    }}
                  >
                    {f.championships === 0 ? "No titles" : f.championships === 1 ? "1 title" : `${f.championships} titles`}
                  </span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: "rgba(78,205,196,0.12)", color: "var(--accent)" }}
                  >
                    {f.win_pct.toFixed(3)} W%
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <p className="text-xs text-[var(--text-dim)] mt-8">
        Source: <a href="/methodology" className="hover:text-[var(--text-muted)]">methodology</a>.
        Franchise totals from NFL_all workbook, last refreshed 2026-05-12.
      </p>
    </main>
  );
}
