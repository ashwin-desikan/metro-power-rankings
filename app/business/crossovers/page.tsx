import type { Metadata } from "next";
import Link from "next/link";
import { getBusiness, computeCrossovers, computeStateBoard } from "@/lib/business";
import { getAllMetros } from "@/lib/data";
import { formatMarketCap } from "@/lib/shared";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import BusinessNav from "../BusinessNav";
import { MONO, TH, THR, TD, TDR, fmtEmpDash, MetroLink, SectionHead, Crumbs, TabHeader, TableBox } from "../ui";

export const revalidate = 21600;

const PATH = "/business/crossovers";
const TITLE = "Business Crossovers";
const DESC =
  "Where the money meets everything else this site tracks: sporting giants vs corporate giants, US states by headquartered value with election links, the Fortune 500's biggest employers, and the companies that own music and film.";

export const metadata: Metadata = {
  title: `${TITLE} | Business of the Metros`,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { card: "summary", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

export default async function CrossoversPage() {
  const biz = await getBusiness();
  const metrosMaster = getAllMetros();
  const cross = computeCrossovers(metrosMaster);
  const states = computeStateBoard(metrosMaster).slice(0, 15);
  const totalG500Employees = (biz?.employers ?? []).reduce((s, e) => s + (e.employees ?? 0), 0);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Crumbs tab="Crossovers" />
      <TabHeader
        emoji="🔀"
        title="Business Crossovers"
        sub="The whole point of putting money data on this site: it can shake hands with the sport, election, employment and culture layers that live next door."
      />
      <BusinessNav />

      <section className="mb-10" id="sport">
        <SectionHead
          title="Sporting money, corporate money"
          sub="The flagship Metro Power Rankings measure sporting weight; the Money Table measures corporate weight. These metros disagree hardest with themselves: sporting giants without the boardrooms, and boardroom giants without the trophies."
        />
        <div className="grid gap-4 lg:grid-cols-2">
          {[
            { title: "Sporting giants, corporate minnows", rows: cross.sportsOverBusiness },
            { title: "Corporate giants, sporting minnows", rows: cross.businessOverSports },
          ].map((board) => (
            <div key={board.title}>
              <h3 className="text-sm font-bold mb-2">{board.title}</h3>
              <TableBox>
                <thead>
                  <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                    <th className={TH}>Metro</th>
                    <th className={THR}>Sports</th>
                    <th className={THR}>Money</th>
                    <th className={THR}>Market cap</th>
                  </tr>
                </thead>
                <tbody>
                  {board.rows.map((r) => (
                    <tr key={r.slug} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className={`${TD} font-semibold whitespace-nowrap`}>
                        <MetroLink name={r.name} slug={r.slug} />
                        <span className="block text-xs font-normal text-[var(--text-muted)]">{r.country}</span>
                      </td>
                      <td className={TDR} style={MONO}>#{r.sportsRank}</td>
                      <td className={TDR} style={MONO}>{r.capRank ? `#${r.capRank}` : "—"}</td>
                      <td className={TDR} style={{ ...MONO, color: "var(--text-muted)" }}>
                        {r.cap > 0 ? formatMarketCap(r.cap) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableBox>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-10" id="states">
        <SectionHead
          title="The state of money"
          sub="US states by the market value headquartered in their metros (each metro counts toward its primary state). The same states whose politics this site tracks all year."
        />
        <TableBox>
          <thead>
            <tr className="text-left" style={{ background: "var(--bg-card)" }}>
              <th className={THR}>#</th>
              <th className={TH}>State</th>
              <th className={THR}>Market cap</th>
              <th className={THR}>Companies</th>
              <th className={TH}>Led by</th>
            </tr>
          </thead>
          <tbody>
            {states.map((s, i) => (
              <tr key={s.state} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className={TDR} style={{ ...MONO, color: "var(--text-dim)" }}>{i + 1}</td>
                <td className={`${TD} font-semibold whitespace-nowrap`}>
                  {s.slug ? <Link href={`/states/${s.slug}`} className="hover:underline">{s.state}</Link> : s.state}
                </td>
                <td className={TDR} style={MONO}>{formatMarketCap(s.cap)}</td>
                <td className={TDR} style={MONO}>{s.companies.toLocaleString()}</td>
                <td className={`${TD} text-[var(--text-muted)]`}><MetroLink name={s.topMetro.name} slug={s.topMetro.slug} /></td>
              </tr>
            ))}
          </tbody>
        </TableBox>
        <p className="text-xs text-[var(--text-muted)] mt-2">
          How these states vote:{" "}
          <Link href="/elections/us" className="hover:underline" style={{ color: "var(--accent)" }}>US election history</Link>
          {" · "}
          <Link href="/elections/forecast#us" className="hover:underline" style={{ color: "var(--accent)" }}>2026 forecasts</Link>
          {" · "}
          <Link href="/governors" className="hover:underline" style={{ color: "var(--accent)" }}>Governors</Link>
        </p>
      </section>

      {biz && (
        <>
          <section className="mb-10" id="employers">
            <SectionHead
              title="Who employs the world"
              sub={`Market cap measures what investors think; headcount measures who signs the pay cheques. The Fortune Global 500's biggest employers - ${(totalG500Employees / 1e6).toFixed(1)} million people across just the top thirty.`}
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <TableBox>
                <thead>
                  <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                    <th className={TH}>Company</th>
                    <th className={THR}>Employees</th>
                    <th className={TH}>Metro</th>
                  </tr>
                </thead>
                <tbody>
                  {biz.employers.slice(0, 12).map((e) => (
                    <tr key={e.name} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className={`${TD} font-semibold`}>{e.name}</td>
                      <td className={TDR} style={MONO}>{fmtEmpDash(e.employees)}</td>
                      <td className={`${TD} text-[var(--text-muted)] whitespace-nowrap`}><MetroLink name={e.metro} slug={e.metroSlug} /></td>
                    </tr>
                  ))}
                </tbody>
              </TableBox>
              <TableBox>
                <thead>
                  <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                    <th className={TH}>Metro</th>
                    <th className={THR}>G500 employees</th>
                    <th className={THR}>Companies</th>
                  </tr>
                </thead>
                <tbody>
                  {biz.employeesByMetro.slice(0, 12).map((e) => (
                    <tr key={e.metro} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className={`${TD} font-semibold whitespace-nowrap`}><MetroLink name={e.metro} slug={e.slug} /></td>
                      <td className={TDR} style={MONO}>{e.employees.toLocaleString()}</td>
                      <td className={TDR} style={MONO}>{e.companies}</td>
                    </tr>
                  ))}
                </tbody>
              </TableBox>
            </div>
          </section>

          <section className="mb-6 rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)" }} id="culture">
            <SectionHead
              title="Who owns culture"
              sub="The public companies behind this site's Sound and Screen layers: the studios, streamers and label groups whose catalogues fill the charts and the box office."
            />
            <TableBox>
              <thead>
                <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                  <th className={TH}>Company</th>
                  <th className={THR}>Market cap</th>
                  <th className={TH}>Metro</th>
                  <th className={TH}>Owns</th>
                  <th className={TH}>Layer</th>
                </tr>
              </thead>
              <tbody>
                {biz.culture.map((c) => (
                  <tr key={c.symbol} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className={`${TD} font-semibold whitespace-nowrap`}>{c.name}</td>
                    <td className={TDR} style={MONO}>{formatMarketCap(c.cap)}</td>
                    <td className={`${TD} text-[var(--text-muted)] whitespace-nowrap`}><MetroLink name={c.metro} slug={c.metroSlug} /></td>
                    <td className={`${TD} text-[var(--text-muted)]`}>{c.owns}</td>
                    <td className={`${TD} whitespace-nowrap`}>
                      {c.screen && <Link href="/screen" className="hover:underline" title="Screen of the Metros"><span aria-hidden>🎬</span></Link>}
                      {c.screen && c.sound && " "}
                      {c.sound && <Link href="/sound" className="hover:underline" title="Sound of the Metros"><span aria-hidden>🎵</span></Link>}
                    </td>
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
