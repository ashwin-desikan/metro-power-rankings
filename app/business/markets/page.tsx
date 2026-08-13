import type { Metadata } from "next";
import Link from "next/link";
import { getMarkets, getMarketsHistory } from "@/lib/business";
import { hasMarketPage, marketHref, MARKETS_COMPARE } from "@/lib/marketPages";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import BusinessNav from "../BusinessNav";
import { MONO, CARD, TH, THR, TD, TDR, MetroLink, SectionHead, Crumbs, TabHeader, TableBox } from "../ui";

// Every row deep-links to its own daily history at /business/markets/[symbol],
// back to 1885 for the Dow. A row whose slug has no page (an older cached
// markets.json, or a symbol added to the feed before its series was
// backfilled) renders as plain text rather than a dead link.
function SeriesName({ slug, name }: { slug?: string; name: string }) {
  if (!hasMarketPage(slug)) return <>{name}</>;
  return (
    <Link href={marketHref(slug)} className="hover:underline" style={{ color: "var(--accent)" }}>
      {name}
    </Link>
  );
}

export const revalidate = 21600;

const PATH = "/business/markets";
const TITLE = "Markets";
const DESC =
  "The world's benchmark stock indices tied to their home metros - New York to Mumbai to São Paulo - plus gold, oil and the other commodities that move economies, tracked daily.";

export const metadata: Metadata = {
  title: `${TITLE} | Business of the Metros`,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

function fmtLevel(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function MarketsPage() {
  const data = await getMarkets();
  const history = getMarketsHistory();
  const snaps = history?.snapshots ?? [];
  // Snapshots are daily since 2026-08 (business-daily-refresh.yml), so the
  // "Week" column compares against the newest snapshot at least six days
  // older than the latest - not simply the previous entry, which would be
  // yesterday. While the daily history is younger than a week, fall back to
  // the oldest snapshot so the column still shows real tracked movement.
  const latest = snaps.length ? snaps[snaps.length - 1] : null;
  let prev: (typeof snaps)[number] | null = null;
  if (latest && snaps.length >= 2) {
    const cutoff = new Date(new Date(`${latest.date}T00:00:00Z`).getTime() - 6 * 86400000)
      .toISOString()
      .slice(0, 10);
    const eligible = snaps.filter((s) => s.date <= cutoff);
    prev = eligible.length ? eligible[eligible.length - 1] : snaps[0];
  }

  function change(symbol: string, value: number): number | null {
    const old = prev?.values[symbol];
    return old && old > 0 ? (value - old) / old : null;
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Crumbs tab="Markets" />
      <TabHeader
        emoji="🌐"
        title="Markets"
        sub="Every major stock market is a metro institution: the S&P 500 and Nasdaq belong to New York the way the Nikkei belongs to Tokyo and the Bovespa to São Paulo. The world's benchmark indices tied back to their home metros, plus the commodities that move economies."
        stamp={data ? `as of ${data.meta.as_of} · ${data.meta.indices} indices · ${data.meta.commodities} commodities · refreshed daily` : null}
      />
      <BusinessNav />

      {!data ? (
        <p className="text-sm text-[var(--text-muted)]">The markets dataset has not loaded; try again shortly.</p>
      ) : (
        <>
          <section className="mb-8 rounded-2xl border p-4 sm:p-5 flex flex-wrap items-baseline justify-between gap-2" style={CARD}>
            <p className="text-[13.5px] text-[var(--text-muted)] max-w-2xl">
              Every name below now opens its own daily history, the Dow&apos;s running back to 1885.
              Or put them on one axis, rebased to a common date.
            </p>
            <Link
              href={MARKETS_COMPARE}
              className="rounded-md border px-3 py-1.5 text-xs font-medium whitespace-nowrap"
              style={{ borderColor: "var(--accent)", color: "var(--accent)", background: "var(--bg-card)" }}
            >
              Compare markets →
            </Link>
          </section>

          <section className="mb-10">
            <SectionHead title="The world's benchmarks" sub="Index levels at the latest daily snapshot, tied to their home markets. Each name opens its full daily history." />
            <TableBox>
              <thead>
                <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                  <th className={TH}>Index</th>
                  <th className={THR}>Level</th>
                  {prev && <th className={THR}>Week</th>}
                  <th className={TH}>Home metro</th>
                  <th className={TH}>Country</th>
                  <th className={THR}>Quote date</th>
                </tr>
              </thead>
              <tbody>
                {data.indices.map((ix) => {
                  const chg = prev ? change(ix.symbol, ix.value) : null;
                  return (
                    <tr key={ix.symbol} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className={`${TD} font-semibold whitespace-nowrap`}>
                        <SeriesName slug={ix.slug} name={ix.name} />
                      </td>
                      <td className={TDR} style={MONO}>{fmtLevel(ix.value)}</td>
                      {prev && (
                        <td className={TDR} style={{ ...MONO, color: chg == null ? "var(--text-dim)" : chg >= 0 ? "#10b981" : "#E2628B" }}>
                          {chg == null ? "—" : `${chg >= 0 ? "+" : ""}${(chg * 100).toFixed(1)}%`}
                        </td>
                      )}
                      <td className={`${TD} whitespace-nowrap`}><MetroLink name={ix.metro} slug={ix.metroSlug} /></td>
                      <td className={`${TD} text-[var(--text-muted)] whitespace-nowrap`}>{ix.country}</td>
                      <td className={TDR} style={{ ...MONO, color: "var(--text-muted)" }}>{ix.date}</td>
                    </tr>
                  );
                })}
              </tbody>
            </TableBox>
          </section>

          <section className="mb-10">
            <SectionHead title="Commodities" sub="The raw materials under everything above - priced in dollars, mostly out of New York and Chicago trading pits that no longer exist." />
            <TableBox>
              <thead>
                <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                  <th className={TH}>Commodity</th>
                  <th className={THR}>Price</th>
                  {prev && <th className={THR}>Week</th>}
                  <th className={TH}>Unit</th>
                  <th className={THR}>Quote date</th>
                </tr>
              </thead>
              <tbody>
                {data.commodities.map((c) => {
                  const chg = prev ? change(c.symbol, c.value) : null;
                  return (
                    <tr key={c.symbol} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className={`${TD} font-semibold whitespace-nowrap`}>
                        <SeriesName slug={c.slug} name={c.name} />
                      </td>
                      <td className={TDR} style={MONO}>{fmtLevel(c.value)}</td>
                      {prev && (
                        <td className={TDR} style={{ ...MONO, color: chg == null ? "var(--text-dim)" : chg >= 0 ? "#10b981" : "#E2628B" }}>
                          {chg == null ? "—" : `${chg >= 0 ? "+" : ""}${(chg * 100).toFixed(1)}%`}
                        </td>
                      )}
                      <td className={`${TD} text-[var(--text-muted)]`}>{c.unit}</td>
                      <td className={TDR} style={{ ...MONO, color: "var(--text-muted)" }}>{c.date}</td>
                    </tr>
                  );
                })}
              </tbody>
            </TableBox>
          </section>

          <section className="mb-6 rounded-2xl border p-5 sm:p-6" style={CARD}>
            <h2 className="text-lg font-bold mb-2">About this board</h2>
            <p className="text-[13.5px] text-[var(--text-muted)] leading-relaxed max-w-3xl">
              Levels come from Yahoo Finance&apos;s public quote feed at each weekly refresh; quote dates
              reflect each exchange&apos;s last close, so they differ across time zones.
              {snaps.length < 2
                ? " Week-over-week movement appears automatically once a second weekly snapshot is banked."
                : ` Weekly change compares against the ${prev?.date} snapshot.`}{" "}
              This is a weekly table, not a ticker - the interesting question here is geography, not
              timing.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
