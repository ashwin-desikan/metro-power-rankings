import type { Metadata } from "next";
import Link from "next/link";
import { getBusiness, getFx, computeGdpBoard } from "@/lib/business";
import { formatMarketCap } from "@/lib/shared";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import BusinessNav from "../BusinessNav";
import { MONO, CARD, TH, THR, TD, TDR, SectionHead, Crumbs, TabHeader, TableBox } from "../ui";

export const revalidate = 21600;

const PATH = "/business/currencies";
const TITLE = "Currencies";
const DESC =
  "The world's currencies against the dollar, each tied back to the countries that use it, plus market-cap-to-GDP for every major economy - the money layer under the money tables.";

export const metadata: Metadata = {
  title: `${TITLE} | Business of the Metros`,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

function fmtRate(n: number): string {
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 10) return n.toFixed(2);
  return n.toFixed(4);
}

export default async function CurrenciesPage() {
  const [fx, biz] = await Promise.all([getFx(), getBusiness()]);
  const currencies = fx?.currencies ?? [];
  const byCode = new Map(currencies.map((c) => [c.code, c]));
  const majors = (fx?.majors ?? []).flatMap((code) => {
    const c = byCode.get(code);
    return c ? [c] : [];
  });
  const gdp = biz ? computeGdpBoard(biz.countries).slice(0, 20) : [];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Crumbs tab="Currencies" />
      <TabHeader
        emoji="💱"
        title="Currencies"
        sub="Every market cap on this site is a dollar number, so here is the dollar's relationship with everyone else - each currency tied back to the countries that use it, with the site's own daily history building movement over time."
        stamp={fx ? `as of ${fx.meta.as_of} · ${fx.meta.count} currencies vs USD · source: exchangerate-api.com` : null}
      />
      <BusinessNav />

      {!fx ? (
        <p className="text-sm text-[var(--text-muted)]">The currency dataset has not loaded; try again shortly.</p>
      ) : (
        <>
          <section className="mb-10">
            <SectionHead title="The majors" sub="Units per US dollar at the latest refresh (and what one unit buys back). Every card opens that currency's full history against the dollar." />
            <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
              {majors.map((c) => (
                <Link
                  key={c.code}
                  href={`/business/currencies/${c.code.toLowerCase()}`}
                  className="rounded-xl border p-3 transition hover:border-[var(--accent)] hover:bg-[var(--bg-card-hover)]"
                  style={CARD}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-bold" style={MONO}>{c.code}</span>
                    <span className="text-[10px] text-[var(--text-dim)] truncate ml-1">{c.name}</span>
                  </div>
                  <div className="text-lg font-bold mt-1" style={MONO}>{fmtRate(c.perUsd)}</div>
                  <div className="text-[11px] text-[var(--text-muted)]" style={MONO}>1 {c.code} = ${c.usdPer.toFixed(4)}</div>
                  <div className="text-[10px] mt-1.5 font-medium" style={{ color: "var(--accent)" }}>History →</div>
                </Link>
              ))}
            </div>
          </section>

          <section className="mb-10">
            <SectionHead
              title="Every currency"
              sub="All tracked currencies against the dollar, linked to the countries that use them - the euro to twenty economies, the CFA francs to whole regions, the rest to their home pages."
            />
            <TableBox>
              <thead>
                <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                  <th className={TH}>Code</th>
                  <th className={TH}>Currency</th>
                  <th className={THR}>Per USD</th>
                  <th className={THR}>In USD</th>
                  <th className={TH}>Used in</th>
                </tr>
              </thead>
              <tbody>
                {currencies.map((c) => (
                  <tr key={c.code} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className={`${TD} font-bold whitespace-nowrap`} style={MONO}>{c.code}</td>
                    <td className={`${TD} whitespace-nowrap`}>{c.name}</td>
                    <td className={TDR} style={MONO}>{fmtRate(c.perUsd)}</td>
                    <td className={TDR} style={{ ...MONO, color: "var(--text-muted)" }}>{c.usdPer >= 0.0001 ? `$${c.usdPer.toFixed(4)}` : "<$0.0001"}</td>
                    <td className={`${TD} text-[var(--text-muted)]`}>
                      {c.countries.map((k, i) => (
                        <span key={k.slug}>
                          {i > 0 && " · "}
                          <Link href={`/countries/${k.slug}`} className="hover:underline">{k.name}</Link>
                        </span>
                      ))}
                      {c.countryCount > c.countries.length && ` + ${c.countryCount - c.countries.length} more`}
                      {c.countryCount === 0 && "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableBox>
          </section>

          {gdp.length > 0 && (
            <section className="mb-10">
              <SectionHead
                title="Market cap vs GDP"
                sub="The Buffett indicator, per country: the value of a country's listed companies against the size of its economy. High ratios mean expensive markets or global companies that happen to be listed there - Amsterdam hosts giants that sell everywhere, which is exactly the caveat."
              />
              <TableBox stickyCol={2}>
                <thead>
                  <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                    <th className={THR}>#</th>
                    <th className={TH}>Country</th>
                    <th className={THR}>Listed value</th>
                    <th className={THR}>GDP</th>
                    <th className={THR}>Ratio</th>
                  </tr>
                </thead>
                <tbody>
                  {gdp.map((g, i) => (
                    <tr key={g.slug} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className={TDR} style={{ ...MONO, color: "var(--text-dim)" }}>{i + 1}</td>
                      <td className={`${TD} font-semibold whitespace-nowrap`}>
                        <Link href={`/countries/${g.slug}`} className="hover:underline">{g.name}</Link>
                      </td>
                      <td className={TDR} style={MONO}>{formatMarketCap(g.cap)}</td>
                      <td className={TDR} style={{ ...MONO, color: "var(--text-muted)" }}>{formatMarketCap(g.gdpUsd)}</td>
                      <td className={TDR} style={{ ...MONO, color: g.ratio >= 1.5 ? "var(--accent)" : undefined }}>
                        {Math.round(g.ratio * 100)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableBox>
            </section>
          )}

          <section className="mb-6 rounded-2xl border p-5 sm:p-6" style={CARD}>
            <h2 className="text-lg font-bold mb-2">About this board</h2>
            <p className="text-[13.5px] text-[var(--text-muted)] leading-relaxed max-w-3xl">
              Rates come from exchangerate-api.com (updated daily at source and snapshotted here
              daily, and the site keeps its own history so movement boards grow from real
              tracked days rather than backfilled data). Currency-to-country ties come from this
              site&apos;s country dataset. GDP is the World Bank current-dollar series from the country
              indicators pipeline. None of this is investment advice; all of it is geography.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
