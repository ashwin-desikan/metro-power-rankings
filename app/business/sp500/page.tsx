import type { Metadata } from "next";
import { getSp500 } from "@/lib/business";
import { formatMarketCap } from "@/lib/shared";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import BusinessNav from "../BusinessNav";
import { MONO, TH, THR, TD, TDR, MetroLink, SectionHead, Crumbs, TabHeader, TableBox } from "../ui";
import Sp500Table from "./Sp500Table";

export const revalidate = 21600;

const PATH = "/business/sp500";
const TITLE = "The S&P 500, Mapped onto Metros";
const DESC =
  "America's benchmark index as a geography: every constituent with its sector, headquarters metro and market value, which metros hold the seats, the longest-tenured survivors, and a running feed of index changes.";

export const metadata: Metadata = {
  title: `${TITLE} | Business of the Metros`,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

export default async function Sp500Page() {
  const sp = await getSp500();
  const rows = sp?.constituents ?? [];

  const byMetro = new Map<string, { metro: string; slug: string; n: number; cap: number; sample: string[] }>();
  const bySector = new Map<string, { sector: string; n: number; cap: number }>();
  for (const c of rows) {
    const s = bySector.get(c.sector) ?? { sector: c.sector, n: 0, cap: 0 };
    s.n += 1; s.cap += c.cap ?? 0;
    bySector.set(c.sector, s);
    if (!c.metro) continue;
    const m = byMetro.get(c.metro) ?? { metro: c.metro, slug: c.metroSlug, n: 0, cap: 0, sample: [] };
    m.n += 1; m.cap += c.cap ?? 0;
    if (m.sample.length < 3) m.sample.push(c.symbol);
    byMetro.set(c.metro, m);
  }
  const spMetros = [...byMetro.values()].sort((a, b) => b.n - a.n || b.cap - a.cap).slice(0, 15);
  const spSectors = [...bySector.values()].sort((a, b) => b.cap - a.cap);
  const tenured = [...rows].filter((c) => /^\d{4}/.test(c.dateAdded)).sort((a, b) => a.dateAdded.localeCompare(b.dateAdded)).slice(0, 10);
  const changes = sp?.changes ?? [];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Crumbs tab="S&P 500" />
      <TabHeader
        emoji="📈"
        title="The S&P 500, Mapped onto Metros"
        sub="America's benchmark index treated as a geography rather than a portfolio: who holds the seats, where they sit, and how the club's membership turns over."
        stamp={sp ? `${sp.meta.count} constituents · ${sp.meta.matched} matched to the site universe · source: Wikipedia's maintained list` : null}
      />
      <BusinessNav />

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">The S&amp;P 500 dataset has not loaded; try again shortly.</p>
      ) : (
        <>
          <section className="mb-10 grid gap-4 lg:grid-cols-2">
            <div className="min-w-0">
              <h3 className="text-sm font-bold mb-2">Seats by metro</h3>
              <TableBox>
                <thead>
                  <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                    <th className={TH}>Metro</th>
                    <th className={THR}>Seats</th>
                    <th className={THR}>Value</th>
                    <th className={TH}>e.g.</th>
                  </tr>
                </thead>
                <tbody>
                  {spMetros.map((m) => (
                    <tr key={m.metro} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className={`${TD} font-semibold whitespace-nowrap`}><MetroLink name={m.metro} slug={m.slug} /></td>
                      <td className={TDR} style={MONO}>{m.n}</td>
                      <td className={TDR} style={MONO}>{formatMarketCap(m.cap)}</td>
                      <td className={`${TD} text-[var(--text-muted)]`} style={MONO}>{m.sample.join(" ")}</td>
                    </tr>
                  ))}
                </tbody>
              </TableBox>
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold mb-2">Value by sector</h3>
              <TableBox>
                <thead>
                  <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                    <th className={TH}>Sector</th>
                    <th className={THR}>Members</th>
                    <th className={THR}>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {spSectors.map((s) => (
                    <tr key={s.sector} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className={`${TD} font-semibold`}>{s.sector}</td>
                      <td className={TDR} style={MONO}>{s.n}</td>
                      <td className={TDR} style={MONO}>{formatMarketCap(s.cap)}</td>
                    </tr>
                  ))}
                </tbody>
              </TableBox>
            </div>
          </section>

          <section className="mb-10">
            <SectionHead
              title="Every constituent"
              sub="All 503 seats, sortable and searchable - by name, ticker, sector or headquarters metro."
            />
            <Sp500Table rows={rows} />
          </section>

          <section className="mb-6 grid gap-4 lg:grid-cols-2">
            <div className="min-w-0">
              <h3 className="text-sm font-bold mb-2">The survivors</h3>
              <p className="text-xs text-[var(--text-muted)] mb-2">Longest-tenured members, by date added.</p>
              <TableBox>
                <tbody>
                  {tenured.map((c) => (
                    <tr key={c.symbol} className="border-t first:border-t-0" style={{ borderColor: "var(--border)" }}>
                      <td className={`${TD} font-semibold whitespace-nowrap`}>{c.name}</td>
                      <td className={`${TD} text-[var(--text-muted)] whitespace-nowrap`}><MetroLink name={c.metro} slug={c.metroSlug} /></td>
                      <td className={TDR} style={{ ...MONO, color: "var(--text-muted)" }}>since {c.dateAdded.slice(0, 4)}</td>
                    </tr>
                  ))}
                </tbody>
              </TableBox>
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold mb-2">The turnstile</h3>
              <p className="text-xs text-[var(--text-muted)] mb-2">Index changes, newest first ({changes.length} on record).</p>
              <div className="rounded-xl border divide-y max-h-[480px] overflow-y-auto" style={{ borderColor: "var(--border)" }}>
                {changes.map((ch, i) => (
                  <div key={`${ch.date}-${i}`} className="px-3 py-2 text-[13px]" style={{ borderColor: "var(--border)" }}>
                    <span style={{ ...MONO, color: "var(--text-dim)" }}>{ch.date}</span>{" "}
                    {ch.added && <span><span style={{ color: "#10b981" }}>+ {ch.added}</span>{" "}</span>}
                    {ch.removed && <span style={{ color: "#E2628B" }}>− {ch.removed}</span>}
                    {ch.reason && <span className="block text-xs text-[var(--text-muted)]">{ch.reason}</span>}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
