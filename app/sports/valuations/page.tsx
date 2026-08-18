import type { Metadata } from "next";
import Link from "next/link";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { getAllValuations } from "@/lib/valuations";
import { getTeamOwnerByName } from "@/lib/teamOwners";
import ValuationsTable from "./ValuationsTable";

export const dynamicParams = false;

const PAGE_PATH = "/sports/valuations";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "Team Valuations";
const PAGE_DESCRIPTION =
  "Estimated valuations across the NFL, NBA, MLB, NHL, global football, Formula 1 and the WNBA, on one sortable board. The higher of Sportico's and Football Benchmark's 2026 figures, with the source shown on every row.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    type: "website",
  },
  twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${PAGE_TITLE} | ${SITE_NAME}`, description: PAGE_DESCRIPTION },
};

export default function ValuationsPage() {
  // Owner is attached here rather than inside lib/valuations so the valuations
  // module stays the single source of truth for figures and knows nothing about
  // ownership. The join is by (team, league), the same key the build script
  // validates, so a missing owner row fails the data build rather than
  // rendering a blank cell here.
  const rows = getAllValuations().map((r) => {
    const owner = getTeamOwnerByName(r.team, r.league);
    return {
      ...r,
      owner: owner?.ownerDisplay ?? null,
      ownerHref: owner ? "/sports/owners" : null,
    };
  });
  const linked = rows.filter((r) => r.href).length;
  const leagues = new Set(rows.map((r) => r.league)).size;
  const top = rows[0];
  const fb = rows.filter((r) => r.sourceTag === "Football Benchmark").length;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <header className="mb-8">
        <div className="text-xs uppercase tracking-widest text-[var(--text-dim)] mb-2">
          <Link href="/sports" className="hover:text-[var(--accent)]">All Sports</Link> · Valuations
        </div>
        <h1 className="text-4xl font-bold tracking-tight mb-2">Team Valuations</h1>
        <p className="text-[var(--text-muted)] max-w-3xl text-sm sm:text-base">
          Estimated valuations across the big four North American leagues, global football, Formula 1
          and the WNBA, on one sortable board. Each row shows the <em>higher</em> of the figures we hold for
          that team, and says which house it came from: Sportico for most of the board, Football Benchmark for
          European football where its number is larger. Click any team to
          open its page; the same figure appears on each team&apos;s page and links back here. Every row also
          carries its control owner &mdash; see{" "}
          <Link href="/sports/owners" className="text-[var(--accent)] hover:underline">The Owners</Link> for the
          same board grouped by who holds it.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-[var(--text-muted)] mt-4">
          <div><strong className="text-[var(--text)] text-sm">{rows.length}</strong> teams</div>
          <div><strong className="text-[var(--text)] text-sm">{leagues}</strong> leagues &amp; countries</div>
          <div><strong className="text-[var(--text)] text-sm">{linked}</strong> with team pages</div>
          <div><strong className="text-[var(--text)] text-sm">{fb}</strong> from Football Benchmark</div>
          {top && (
            <div>Most valuable: <strong className="text-[var(--text)] text-sm">{top.displayName}</strong> · {top.valueLabel}</div>
          )}
        </div>
      </header>

      <ValuationsTable rows={rows} />

      <p className="text-xs text-[var(--text-dim)] mt-8 max-w-3xl">
        Curated, non-exhaustive snapshot — the <strong className="text-[var(--text-muted)]">highest published
        valuation</strong> we hold per team, not a full league-by-league ranking. Two sources, marked on every
        row. <strong className="text-[var(--text-muted)]">SP</strong> is Sportico&apos;s 2026 Most Valuable
        Sports Franchises, 206 clubs across the big four, football, Formula 1, the WNBA and the NWSL.{" "}
        <strong className="text-[var(--text-muted)]">FB</strong> is Football Benchmark&apos;s The European Elite
        2026, 32 European clubs, converted from euros at its own stated rate.
      </p>
      <p className="text-xs text-[var(--text-dim)] mt-3 max-w-3xl">
        The two are not measuring quite the same thing, which is why the marker matters. Football Benchmark
        publishes an <em>enterprise value</em> — equity plus debt less cash, deliberately neutral to how a club
        is financed — as the midpoint of a range, built from filed accounts. Sportico publishes a franchise
        value and does not state its basis. And only the 26 clubs both houses cover can be lifted by taking the
        higher of two: eleven European clubs sit on one source alone and cannot move, so a little of the order
        around them reflects who was measured rather than what they are worth.
      </p>
      <p className="text-xs text-[var(--text-dim)] mt-3 max-w-3xl">
        Football rows show the country in place of a league. Five clubs neither house ranked this year keep
        their last published figure, and the year column says so. Formula 1 constructors have no team page here
        yet, so those rows do not link. Figures in USD; values shown in billions above $1B, otherwise millions.
      </p>
    </main>
  );
}
