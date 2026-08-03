import type { Metadata } from "next";
import { getUnicorns } from "@/lib/business";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import BusinessNav from "../BusinessNav";
import { MONO, CARD, TH, THR, TD, TDR, SMCOL, fmtCap, fmtT, MetroLink, SectionHead, Crumbs, TabHeader, TableBox } from "../ui";

export const revalidate = 21600;

const PATH = "/business/private";
const TITLE = "Private Markets & Unicorns";
const DESC =
  "The companies without a ticker: 1,400 unicorns at their last-raise valuations, the biggest private companies on Earth, the metros they cluster in, the investors behind them, and the ones that just graduated to the public markets.";

export const metadata: Metadata = {
  title: `${TITLE} | Business of the Metros`,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

export default async function PrivatePage() {
  const data = await getUnicorns();
  const unicorns = data?.unicorns ?? [];
  const graduated = data?.graduated ?? [];
  const priv = data?.private ?? [];
  const totalUni = unicorns.reduce((s, u) => s + u.valuation, 0);

  // Aggregations
  const byMetro = new Map<string, { metro: string; slug: string; n: number; sum: number }>();
  const byIndustry = new Map<string, { industry: string; n: number; sum: number }>();
  const byInvestor = new Map<string, number>();
  for (const u of unicorns) {
    if (u.metro) {
      const m = byMetro.get(u.metro) ?? { metro: u.metro, slug: u.metroSlug, n: 0, sum: 0 };
      m.n += 1; m.sum += u.valuation;
      byMetro.set(u.metro, m);
    }
    if (u.industry) {
      const ind = byIndustry.get(u.industry) ?? { industry: u.industry, n: 0, sum: 0 };
      ind.n += 1; ind.sum += u.valuation;
      byIndustry.set(u.industry, ind);
    }
    for (const inv of u.investors.split(",").map((s) => s.trim()).filter(Boolean)) {
      byInvestor.set(inv, (byInvestor.get(inv) ?? 0) + 1);
    }
  }
  const capitals = [...byMetro.values()].sort((a, b) => b.n - a.n || b.sum - a.sum).slice(0, 12);
  const industries = [...byIndustry.values()].sort((a, b) => b.sum - a.sum);
  const investors = [...byInvestor.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  const newest = [...unicorns].filter((u) => u.dateJoined).sort((a, b) => b.dateJoined.localeCompare(a.dateJoined)).slice(0, 10);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Crumbs tab="Private & Unicorns" />
      <TabHeader
        emoji="🦄"
        title="Private Markets & Unicorns"
        sub="The companies without a ticker. Unicorns carry their last-raise valuations (CB Insights), private giants an estimated value - both are softer numbers than a market close, and the boards below say so rather than pretending otherwise."
        stamp={data ? `snapshot ${data.meta.as_of} · ${unicorns.length.toLocaleString()} unicorns · ${priv.length} private giants` : null}
      />
      <BusinessNav />

      {!data ? (
        <p className="text-sm text-[var(--text-muted)]">The private-markets dataset has not loaded; try again shortly.</p>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-4 mb-10">
            {[
              { k: "Unicorns", v: unicorns.length.toLocaleString(), d: "private companies valued ≥ $1B" },
              { k: "Herd value", v: fmtT(totalUni), d: "sum of last-raise valuations" },
              { k: "Private giants", v: priv.length.toLocaleString(), d: "the biggest unlisted companies" },
              { k: "Graduates", v: graduated.length.toLocaleString(), d: "unicorns now trading publicly" },
            ].map((s) => (
              <div key={s.k} className="rounded-xl border p-4" style={CARD}>
                <div className="text-[11px] uppercase tracking-widest mb-1" style={{ ...MONO, color: "var(--text-muted)" }}>{s.k}</div>
                <div className="text-2xl font-bold" style={MONO}>{s.v}</div>
                <div className="text-xs text-[var(--text-muted)]">{s.d}</div>
              </div>
            ))}
          </section>

          <section className="mb-10">
            <SectionHead title="The biggest unicorns" sub="Last-raise valuations, with the industry and the metro each is run from." />
            <TableBox stickyCol={2}>
              <thead>
                <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                  <th className={THR}>#</th>
                  <th className={TH}>Company</th>
                  <th className={THR}>Valuation</th>
                  <th className={TH}>Industry</th>
                  <th className={TH}>Metro</th>
                  <th className={THR}>Unicorn since</th>
                </tr>
              </thead>
              <tbody>
                {unicorns.slice(0, 20).map((u, i) => (
                  <tr key={u.name} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className={TDR} style={{ ...MONO, color: "var(--text-dim)" }}>{i + 1}</td>
                    <td className={`${TD} font-semibold whitespace-nowrap`}>{u.name}</td>
                    <td className={TDR} style={MONO}>{fmtCap(u.valuation)}</td>
                    <td className={`${TD} text-[var(--text-muted)]`}>{u.industry || "—"}</td>
                    <td className={`${TD} whitespace-nowrap`}><MetroLink name={u.metro} slug={u.metroSlug} /></td>
                    <td className={TDR} style={{ ...MONO, color: "var(--text-muted)" }}>{u.dateJoined ? u.dateJoined.slice(0, 4) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </TableBox>
          </section>

          <section className="mb-10 grid gap-4 lg:grid-cols-2">
            <div className="min-w-0">
              <h3 className="text-sm font-bold mb-2">Unicorn capitals</h3>
              <p className="text-xs text-[var(--text-muted)] mb-2">Metros by number of resident unicorns.</p>
              <TableBox stickyCol={2}>
                <tbody>
                  {capitals.map((m, i) => (
                    <tr key={m.metro} className="border-t first:border-t-0" style={{ borderColor: "var(--border)" }}>
                      <td className={TDR} style={{ ...MONO, color: "var(--text-dim)" }}>{i + 1}</td>
                      <td className={`${TD} font-semibold whitespace-nowrap`}><MetroLink name={m.metro} slug={m.slug} /></td>
                      <td className={TDR} style={MONO}>{m.n}</td>
                      <td className={TDR} style={{ ...MONO, color: "var(--text-muted)" }}>{fmtCap(m.sum)}</td>
                    </tr>
                  ))}
                </tbody>
              </TableBox>
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold mb-2">Where the money believes</h3>
              <p className="text-xs text-[var(--text-muted)] mb-2">Industries by combined unicorn valuation.</p>
              <TableBox>
                <tbody>
                  {industries.slice(0, 12).map((ind) => (
                    <tr key={ind.industry} className="border-t first:border-t-0" style={{ borderColor: "var(--border)" }}>
                      <td className={`${TD} font-semibold`}>{ind.industry}</td>
                      <td className={TDR} style={MONO}>{ind.n}</td>
                      <td className={TDR} style={{ ...MONO, color: "var(--text-muted)" }}>{fmtCap(ind.sum)}</td>
                    </tr>
                  ))}
                </tbody>
              </TableBox>
            </div>
          </section>

          <section className="mb-10 grid gap-4 lg:grid-cols-2">
            <div className="min-w-0">
              <h3 className="text-sm font-bold mb-2">The newest members</h3>
              <p className="text-xs text-[var(--text-muted)] mb-2">Most recent arrivals at a $1B valuation.</p>
              <TableBox>
                <tbody>
                  {newest.map((u) => (
                    <tr key={u.name} className="border-t first:border-t-0" style={{ borderColor: "var(--border)" }}>
                      <td className={`${TD} font-semibold whitespace-nowrap`}>{u.name}</td>
                      <td className={`${TD} text-[var(--text-muted)]`}>{u.industry || "—"}</td>
                      <td className={TDR} style={MONO}>{fmtCap(u.valuation)}</td>
                      <td className={TDR} style={{ ...MONO, color: "var(--text-muted)" }}>{u.dateJoined}</td>
                    </tr>
                  ))}
                </tbody>
              </TableBox>
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold mb-2">The graduates</h3>
              <p className="text-xs text-[var(--text-muted)] mb-2">
                Unicorns that reached the public markets - last private valuation against what the market says now.
              </p>
              <TableBox>
                <thead>
                  <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                    <th className={TH}>Company</th>
                    <th className={THR}>Last private</th>
                    <th className={THR}>Public now</th>
                  </tr>
                </thead>
                <tbody>
                  {graduated.map((g) => (
                    <tr key={g.name} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className={`${TD} font-semibold whitespace-nowrap`}>{g.name}</td>
                      <td className={TDR} style={{ ...MONO, color: "var(--text-muted)" }}>{fmtCap(g.valuation)}</td>
                      <td className={TDR} style={{ ...MONO, color: "var(--accent)" }}>{fmtCap(g.publicCap)}</td>
                    </tr>
                  ))}
                </tbody>
              </TableBox>
              <p className="text-xs text-[var(--text-muted)] mt-3 mb-1 font-bold">Most-cited early investors</p>
              <p className="text-xs text-[var(--text-muted)]">
                {investors.map(([name, n]) => `${name} (${n})`).join(" · ")}
              </p>
            </div>
          </section>

          <section className="mb-6">
            <SectionHead
              title="The private giants"
              sub="The biggest companies that never listed - family firms, trading houses, state-adjacent groups. Values are estimates (revenue-based), which is exactly why they live on their own board."
            />
            <TableBox stickyCol={2}>
              <thead>
                <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                  <th className={THR}>#</th>
                  <th className={TH}>Company</th>
                  <th className={THR}>Est. value</th>
                  <th className={`${TH} ${SMCOL}`}>Country</th>
                  <th className={TH}>Metro</th>
                </tr>
              </thead>
              <tbody>
                {priv.slice(0, 25).map((p, i) => (
                  <tr key={p.name} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className={TDR} style={{ ...MONO, color: "var(--text-dim)" }}>{i + 1}</td>
                    <td className={`${TD} font-semibold whitespace-nowrap`}>{p.name}</td>
                    <td className={TDR} style={MONO}>{fmtCap(p.cap)}</td>
                    <td className={`${TD} ${SMCOL} text-[var(--text-muted)] whitespace-nowrap`}>{p.country}</td>
                    <td className={`${TD} whitespace-nowrap`}><MetroLink name={p.metro} slug={p.metroSlug} /></td>
                  </tr>
                ))}
              </tbody>
            </TableBox>
          </section>
        </>
      )}
    </main>
  );
}
