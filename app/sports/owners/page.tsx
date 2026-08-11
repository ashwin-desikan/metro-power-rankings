import type { Metadata } from "next";
import Link from "next/link";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { getOwnerPortfolios, getMultiTeamPortfolios, getWatchlist } from "@/lib/teamOwners";
import OwnersTable from "./OwnersTable";

export const dynamicParams = false;

const PAGE_PATH = "/sports/owners";
const PAGE_URL = `${BASE_URL}${PAGE_PATH}`;
const PAGE_TITLE = "The Owners";
const PAGE_DESCRIPTION =
  "Who actually owns world sport: every control entity behind the NFL, NBA, MLB, NHL, MLS, Liga MX and European football, ranked by the combined value of the franchises it controls.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: {
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    type: "website",
  },
  twitter: {
    images: ["/og-default.png"],
    card: "summary_large_image",
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
  },
};

export default function OwnersPage() {
  const all = getOwnerPortfolios();
  const multi = getMultiTeamPortfolios();
  const watchlist = getWatchlist();
  const teams = all.reduce((s, p) => s + p.teams.length, 0);
  const crossCode = multi.filter((p) => p.crossesCodes).length;
  const top = all[0];

  // Serialise to the client component's structural type. Kept explicit so the
  // client bundle never pulls the server-only lib/teamOwners module.
  const rows = all.map((p) => ({
    ownerKey: p.ownerKey,
    ownerDisplay: p.ownerDisplay,
    ownerType: p.ownerType,
    totalM: p.totalM,
    totalLabel: p.totalLabel,
    leagues: p.leagues,
    crossesCodes: p.crossesCodes,
    confidence: p.confidence,
    teams: p.teams.map((t) => ({
      team: t.team,
      displayName: t.displayName,
      league: t.league,
      valueLabel: t.valueLabel,
      href: t.href,
      stakeLabel: t.stakeLabel,
      confidence: t.confidence,
      note: t.note,
      coControllers: t.coControllers,
      minority: t.minority,
      sourceUrl: t.sourceUrl,
    })),
  }));

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <header className="mb-8">
        <div className="text-xs uppercase tracking-widest text-[var(--text-dim)] mb-2">
          <Link href="/sports" className="hover:text-[var(--accent)]">All Sports</Link> · Owners
        </div>
        <h1 className="text-4xl font-bold tracking-tight mb-2">The Owners</h1>
        <p className="text-[var(--text-muted)] max-w-3xl text-sm sm:text-base">
          The same {teams} franchises as the{" "}
          <Link href="/sports/valuations" className="text-[var(--accent)] hover:underline">valuations board</Link>,
          turned around to face the other way: not what the clubs are worth, but who holds them. Each entity is
          ranked by the combined value of the franchises it <em>controls</em>, so the people who own a stadium&apos;s
          worth of sport in three cities at once rise to the top.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-[var(--text-muted)] mt-4">
          <div><strong className="text-[var(--text)] text-sm">{all.length}</strong> control entities</div>
          <div><strong className="text-[var(--text)] text-sm">{multi.length}</strong> hold more than one club</div>
          <div><strong className="text-[var(--text)] text-sm">{crossCode}</strong> span North America and football</div>
          {top && (
            <div>
              Largest portfolio: <strong className="text-[var(--text)] text-sm">{top.ownerDisplay}</strong> ·{" "}
              {top.totalLabel}
            </div>
          )}
        </div>
      </header>

      {watchlist.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold tracking-tight mb-1">Deals in flight</h2>
          <p className="text-xs text-[var(--text-muted)] mb-3 max-w-3xl">
            {watchlist.length}{" "}franchises whose control is unresolved or mid-sale. Each still counts toward its
            current controller&apos;s portfolio, because the recorded owner is the one who holds control today
            &mdash; a vote that has not happened yet should not make a franchise disappear from the board.
          </p>
          {/* min-w-0 on every grid child: without it a grid item defaults to
              min-width:auto and long pending text would drag the page sideways
              at 390px. DESIGN-STANDARDS.md. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {watchlist.map((w) => (
              <div
                key={`${w.team}-${w.league}`}
                className="min-w-0 rounded-lg border p-3"
                style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
              >
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <span className="font-medium text-sm break-words">
                    {w.href ? (
                      <Link href={w.href} className="hover:text-[var(--accent)] hover:underline">
                        {w.displayName}
                      </Link>
                    ) : (
                      w.displayName
                    )}
                    <span className="ml-2 text-xs text-[var(--text-dim)]">{w.league}</span>
                  </span>
                  <span className="text-xs tabular-nums text-[var(--text-muted)]">{w.valueLabel}</span>
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-widest text-[var(--text-dim)]">
                  {w.pendingKind}
                </div>
                <p className="mt-1 text-xs text-[var(--text-muted)] break-words">{w.pendingSummary}</p>
                <p className="mt-1 text-xs text-[var(--text-dim)] break-words">
                  Holds control today: {w.ownerDisplay} · {w.pendingWhen}
                  {w.sourceUrl && (
                    <>
                      {" · "}
                      <a
                        href={w.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-[var(--accent)] hover:underline"
                      >
                        source
                      </a>
                    </>
                  )}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <OwnersTable rows={rows} />

      <div className="text-xs text-[var(--text-dim)] mt-8 max-w-3xl space-y-3">
        <p>
          <strong className="text-[var(--text-muted)]">How the total is built.</strong> Each portfolio sums the{" "}
          <em>full</em> published valuation of every franchise the entity controls. It is deliberately not
          pro-rated by stake: published stakes range from exact percentages to the word &ldquo;majority&rdquo;, and
          multiplying a real number by a vague one would invent precision that is not there. Read the figure as
          &ldquo;the value of the sport this entity controls&rdquo;, not &ldquo;what this entity&apos;s holding is
          worth&rdquo;. Minority stakes are shown but never summed, so no franchise is counted twice.
        </p>
        <p>
          <strong className="text-[var(--text-muted)]">One control entity per franchise.</strong> Where control is
          shared, the recognised control person is the row and the co-controllers are named alongside. Where
          control is genuinely unresolved or a sale is mid-flight, the row is marked and says what is outstanding
          rather than picking a plausible-looking answer.
        </p>
        <p>
          <strong className="text-[var(--text-muted)]">Sources.</strong> 94 of {teams} rows carry a primary source
          (league, club, exchange filing or tier-one outlet), linked on each row. The remainder carry a
          third-party aggregator value that has been checked against a control-change sweep covering January 2024
          to August 2026. UEFA&apos;s <em>European Club Finance and Investment Landscape 2025</em> supplies the
          framing that 122 European top-division clubs, 16% of the total, now sit in a cross-investment
          relationship with at least one other club, and that ultimate beneficial ownership and ultimate control
          have come apart as holding chains lengthen. This board records the latter.
        </p>
      </div>
    </main>
  );
}
