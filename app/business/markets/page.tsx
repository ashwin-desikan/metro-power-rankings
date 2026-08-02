import type { Metadata } from "next";
import { getMarkets, getMarketsHistory } from "@/lib/business";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import BusinessNav from "../BusinessNav";
import { MONO, CARD, TH, THR, TD, TDR, MetroLink, SectionHead, Crumbs, TabHeader, TableBox } from "../ui";

export const revalidate = 21600;

const PATH = "/business/markets";
const TITLE = "Markets";
const DESC =
  "The world's benchmark stock indices tied to their home metros - New York to Mumbai to São Paulo - plus gold, oil and the other commodities that move economies, tracked weekly.";

export const metadata: Metadata = {
  title: `${TITLE} | Business of the Metros`,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { card: "summary", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

function fmtLevel(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function MarketsPage() {
  const data = await getMarkets();
  const history = getMarketsHistory();
  const snaps = history?.snapshots ?? [];
  const prev = snaps.length >= 2 ? snaps[snaps.length - 2] : null;

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
        stamp={data ? `as of ${data.meta.as_of} · ${data.meta.indices} indices · ${data.meta.commodities} commodities · refreshed weekly` : null}
      />
      <BusinessNav />

      {!data ? (
        <p className="text-sm text-[var(--text-muted)]">The markets dataset has not loaded; try again shortly.</p>
      ) : (
        <>
          <section className="mb-10">
            <SectionHead title="The world's benchmarks" sub="Index levels at the latest weekly snapshot, tied to their home markets." />
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
                      <td className={`${TD} font-semibold whitespace-nowrap`}>{ix.name}</td>
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
                      <td className={`${TD} font-semibold whitespace-nowrap`}>{c.name}</td>
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
