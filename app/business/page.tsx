import type { Metadata } from "next";
import { getBusiness } from "@/lib/business";
import { getCountryByName, getCountryPopulation } from "@/lib/countries";
import { formatMarketCap } from "@/lib/shared";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import BusinessNav from "./BusinessNav";
import { MONO, CARD, TH, THR, TD, TDR, SMCOL, fmtT, MetroLink, SectionHead, Crumbs, TabHeader, TableBox } from "./ui";

// Business of the Metros - hub overview. The Money Table, the race to $5T,
// weekly movers and country/region rollups; the deeper boards live in the
// tabs (Companies, Private & Unicorns, S&P 500, Markets, Currencies,
// Crossovers). Data via lib/business (weekly snapshots, GH-raw ISR).

export const revalidate = 21600;

const PATH = "/business";
const TITLE = "Business of the Metros";
const DESC =
  "The world's public companies credited back to their home metros: money tables by metro and country, the race to the first $5 trillion company, weekly movers, the S&P 500 as a geography, markets, currencies, and crossovers into sport, elections, music and film.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

// Market cap per head. A total ranks countries mostly by how many people they
// contain, which is a fact about demography wearing the costume of a fact about
// business. Dividing by population is the cheapest way to make the table say
// something about a place rather than about its size.
//
// TWO FLOORS, AND THE SECOND ONE IS THE IMPORTANT ONE. A company count alone is
// not enough. Measured on the live data, a ten-company floor still put Bermuda
// top at $4.5m a head and the Cayman Islands third, because those forty and ten
// "companies" are incorporation domiciles rather than places anything is run
// from. A per-head board that opens with Bermuda has told the reader nothing
// except that it does not understand its own denominator.
//
// A population floor is the better rule: objective, self-explanatory, and no
// hand-curated blacklist of tax havens to defend or maintain. Below a million
// people a single listing dominates the ratio whatever the reason. It removes
// Bermuda (65k), the Caymans (70k) and Luxembourg (670k) without anyone having
// to adjudicate which of those is "really" an economy.
const PER_HEAD_MIN_COMPANIES = 10;
const PER_HEAD_MIN_POP = 1_000_000;
const PER_HEAD_SHOWN = 10;

function population(name: string): number | null {
  const slug = getCountryByName(name)?.slug;
  const pop = slug ? getCountryPopulation(slug) : null;
  return pop && pop.value > 0 ? pop.value : null;
}

function capPerHead(name: string, cap: number): number | null {
  const p = population(name);
  return p ? cap / p : null;
}

function fmtPerHead(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}m`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}

export default async function BusinessOverview() {
  const biz = await getBusiness();
  const meta = biz?.metros ? biz.meta : null;
  const mappedShare = meta ? Math.round((meta.mappedCap / meta.totalCap) * 100) : 0;
  const perHead = (biz?.countries ?? [])
    .filter((c) => c.count >= PER_HEAD_MIN_COMPANIES)
    .map((c) => ({ ...c, pop: population(c.name), per: capPerHead(c.name, c.cap) }))
    .filter((c): c is typeof c & { pop: number; per: number } =>
      c.per != null && c.pop != null && c.pop >= PER_HEAD_MIN_POP)
    .sort((a, b) => b.per - a.per)
    .slice(0, PER_HEAD_SHOWN);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Crumbs />
      <TabHeader
        emoji="💼"
        title="Business of the Metros"
        sub="Every metro page credits its public companies; this hub is the whole board at once. The world's listed companies (plus the big unicorns and private giants), credited back to the metros they run from - with tabs for the full universe, the private markets, the S&P 500, market indices, currencies, and the crossovers into everything else this site tracks."
        stamp={meta ? `snapshot ${meta.as_of} · ${meta.companies.toLocaleString()} companies · refreshes weekly` : null}
      />
      <BusinessNav />

      {!biz || !meta ? (
        <section className="rounded-2xl border p-6 mb-8" style={{ borderColor: "var(--border)" }}>
          <p className="text-sm text-[var(--text-muted)]">
            The business dataset has not loaded. It lives at <code>/data/business/business.json</code> and
            is rebuilt weekly by the market-cap pipeline; try again shortly.
          </p>
        </section>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-4 mb-10">
            {[
              { k: "Tracked value", v: fmtT(meta.totalCap), d: "all listed companies + big privates" },
              { k: "Companies", v: meta.companies.toLocaleString(), d: "public, unicorn and private" },
              { k: "Metro HQs", v: meta.metros.toLocaleString(), d: "metros with a tracked headquarters" },
              { k: "Mapped to metros", v: `${mappedShare}%`, d: `${fmtT(meta.mappedCap)} of value placed on the map` },
            ].map((s) => (
              <div key={s.k} className="rounded-xl border p-4" style={CARD}>
                <div className="text-[11px] uppercase tracking-widest mb-1" style={{ ...MONO, color: "var(--text-muted)" }}>{s.k}</div>
                <div className="text-2xl font-bold" style={MONO}>{s.v}</div>
                <div className="text-xs text-[var(--text-muted)]">{s.d}</div>
              </div>
            ))}
          </section>

          <section className="mb-10" id="metros">
            <SectionHead
              title="The Money Table"
              sub="Metros ranked by the combined market value of the companies headquartered there - the corporate league table to sit beside the sporting one."
            />
            <TableBox stickyCol={2}>
              <thead>
                <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                  <th className={THR}>#</th>
                  <th className={TH}>Metro</th>
                  <th className={THR}>Market cap</th>
                  <th className={THR}>Companies</th>
                  <th className={`${TH} ${SMCOL}`}>Country</th>
                  <th className={TH}>Led by</th>
                </tr>
              </thead>
              <tbody>
                {biz.metros.slice(0, 40).map((m, i) => (
                  <tr key={m.name} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className={TDR} style={{ ...MONO, color: "var(--text-dim)" }}>{i + 1}</td>
                    <td className={`${TD} font-semibold whitespace-nowrap`}><MetroLink name={m.name} slug={m.slug} /></td>
                    <td className={TDR} style={{ ...MONO, color: i < 3 ? "var(--accent)" : undefined }}>{formatMarketCap(m.cap)}</td>
                    <td className={TDR} style={MONO}>{m.count.toLocaleString()}</td>
                    <td className={`${TD} ${SMCOL} text-[var(--text-muted)] whitespace-nowrap`}>{m.country}</td>
                    <td className={`${TD} text-[var(--text-muted)]`}>{m.top.slice(0, 2).map((t) => t.name).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </TableBox>
          </section>

          <section className="mb-10 rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)" }} id="race">
            <SectionHead
              title="The race to five trillion"
              sub="No company has ever closed at a $5 trillion market value. The leaders, and how far each has left to run."
            />
            <div className="grid gap-2">
              {biz.race5t.map((c) => (
                <div key={c.symbol || c.name} className="flex items-center gap-3">
                  <span className="w-44 sm:w-56 font-semibold text-[14.5px] truncate">{c.name}</span>
                  <span className="hidden sm:block w-40 text-[12px] truncate" style={{ color: "var(--text-muted)" }}>
                    <MetroLink name={c.metro} slug={c.metroSlug} />
                  </span>
                  <span className="flex-1 h-2 rounded" style={{ background: "var(--bg-card)" }}>
                    <span className="block h-2 rounded" style={{ background: "var(--accent)", opacity: 0.75, width: `${Math.min(100, c.pctTo5T)}%` }} />
                  </span>
                  <span className="w-16 text-right text-[13px] font-bold" style={{ ...MONO, color: "var(--accent)" }}>{fmtT(c.cap)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-10" id="movers">
            <SectionHead title="The weekly movers" sub="Biggest week-over-week changes in value, by company and by metro." />
            {biz.movers ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {[
                  { rows: biz.movers.companies.slice(0, 10).map((m) => ({ key: m.symbol || m.name, label: m.name, cap: m.cap, pct: m.pct, chg: m.chg })), head: "Company" },
                  { rows: biz.movers.metros.slice(0, 10).map((m) => ({ key: m.metro, label: m.metro, cap: m.cap, pct: m.pct, chg: m.chg })), head: "Metro" },
                ].map((tbl) => (
                  <TableBox key={tbl.head}>
                    <thead>
                      <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                        <th className={TH}>{tbl.head}</th>
                        <th className={THR}>Now</th>
                        <th className={THR}>Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tbl.rows.map((m) => (
                        <tr key={m.key} className="border-t" style={{ borderColor: "var(--border)" }}>
                          <td className={`${TD} font-semibold`}>{m.label}</td>
                          <td className={TDR} style={MONO}>{formatMarketCap(m.cap)}</td>
                          <td className={TDR} style={{ ...MONO, color: m.chg >= 0 ? "#10b981" : "#E2628B" }}>
                            {m.chg >= 0 ? "+" : ""}{(m.pct * 100).toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </TableBox>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border p-5" style={CARD}>
                <p className="text-sm text-[var(--text-muted)] max-w-3xl">
                  Movement tracking arms itself automatically: the market-cap pipeline writes a snapshot
                  every Saturday, and this board lights up the moment there are two to compare.
                </p>
              </div>
            )}
          </section>

          <section className="mb-10" id="countries">
            <SectionHead
              title="Countries and regions"
              sub="The same value rolled up a level: which economies the tracked companies actually answer to. The Currencies tab takes this further, into exchange rates and market-cap-to-GDP."
            />
            <div className="flex flex-wrap gap-2 mb-4">
              {biz.regions.map((r) => (
                <span key={r.name} className="rounded-full border px-3 py-1 text-xs" style={{ ...CARD, ...MONO }}>
                  {r.name}: <span style={{ color: "var(--accent)" }}>{fmtT(r.cap)}</span>
                </span>
              ))}
            </div>
            <TableBox stickyCol={2}>
              <thead>
                <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                  <th className={THR}>#</th>
                  <th className={TH}>Country</th>
                  <th className={THR}>Market cap</th>
                  <th className={THR}>Per person</th>
                  <th className={THR}>Companies</th>
                  <th className={TH}>Led by</th>
                </tr>
              </thead>
              <tbody>
                {biz.countries.slice(0, 15).map((c, i) => (
                  <tr key={c.name} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className={TDR} style={{ ...MONO, color: "var(--text-dim)" }}>{i + 1}</td>
                    <td className={`${TD} font-semibold whitespace-nowrap`}>{c.name}</td>
                    <td className={TDR} style={MONO}>{formatMarketCap(c.cap)}</td>
                    <td className={TDR} style={{ ...MONO, color: "var(--text-muted)" }}>
                      {fmtPerHead(capPerHead(c.name, c.cap))}
                    </td>
                    <td className={TDR} style={MONO}>{c.count.toLocaleString()}</td>
                    <td className={`${TD} text-[var(--text-muted)]`}>{c.top?.name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </TableBox>
          </section>

          {perHead.length > 0 && (
            <section className="mb-10" id="per-person">
              <SectionHead
                title="The same board, per person"
                sub={`Market cap divided by population. A total mostly ranks countries by how many people they contain; this asks how much listed value each one carries per head, which is a different question with a different answer. Places under a million people or with fewer than ${PER_HEAD_MIN_COMPANIES} tracked companies are left out: without that floor the board opens with Bermuda and the Cayman Islands, which are where companies are registered rather than where anything is run.`}
              />
              <TableBox stickyCol={2}>
                <thead>
                  <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                    <th className={THR}>#</th>
                    <th className={TH}>Country</th>
                    <th className={THR}>Per person</th>
                    <th className={THR}>Market cap</th>
                    <th className={THR}>By total</th>
                  </tr>
                </thead>
                <tbody>
                  {perHead.map((c, i) => {
                    const byTotal = biz.countries.findIndex((x) => x.name === c.name) + 1;
                    return (
                      <tr key={c.name} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className={TDR} style={{ ...MONO, color: "var(--text-dim)" }}>{i + 1}</td>
                        <td className={`${TD} font-semibold whitespace-nowrap`}>{c.name}</td>
                        <td className={TDR} style={MONO}>{fmtPerHead(c.per)}</td>
                        <td className={TDR} style={{ ...MONO, color: "var(--text-muted)" }}>{formatMarketCap(c.cap)}</td>
                        {/* The interesting column: how far a country moves when
                            the denominator changes. */}
                        <td className={TDR} style={{ ...MONO, color: byTotal > i + 1 ? "#10b981" : byTotal < i + 1 ? "#E2628B" : "var(--text-dim)" }}>
                          #{byTotal}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableBox>
              <p className="text-xs text-[var(--text-muted)] mt-2">
                Population is the World Bank&apos;s latest year (SP.POP.TOTL), except Taiwan, which
                the World Bank does not report and which uses UN World Population Prospects
                estimates through 2023 instead. Every country page names its own source.
              </p>
            </section>
          )}

          <section className="mb-6 rounded-2xl border p-5 sm:p-6" style={CARD}>
            <h2 className="text-lg font-bold mb-2">Where these numbers come from</h2>
            <p className="text-[13.5px] text-[var(--text-muted)] leading-relaxed max-w-3xl">
              Company values are the weekly snapshot ({meta.as_of}) of this site&apos;s market-cap dataset:
              every listed company from companiesmarketcap.com, the CB Insights unicorn list and the
              largest private companies, each hand-assigned to the metro it is run from - the same
              dataset behind the Top Companies block on every metro page (metro pages refresh on their
              own weekly cycle, so the two stamps can differ by a few days). The tabs add Wikipedia&apos;s
              maintained S&amp;P 500 list, index and commodity levels, and daily exchange rates; each
              states its own source and as-of date. Values in this corner of the site are description,
              not investment advice.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
