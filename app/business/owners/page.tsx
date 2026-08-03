import type { Metadata } from "next";
import { getOwners, type OwnerGiant } from "@/lib/business";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import BusinessNav from "../BusinessNav";
import { MONO, CARD, TH, THR, TD, TDR, SMCOL, fmtCap, MetroLink, SectionHead, Crumbs, TabHeader, TableBox } from "../ui";

export const revalidate = 21600;

const PATH = "/business/owners";
const TITLE = "The Owners";
const DESC =
  "Who owns the market: every institutional manager's quarterly SEC Form 13F reduced to a league table, the asset-manager capitals of the world by metro, the most widely held stocks, and the top holders of the giants.";

export const metadata: Metadata = {
  title: `${TITLE} | Business of the Metros`,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

function quarterLabel(asOf: string): string {
  const [y, m] = asOf.split("-").map(Number);
  return `Q${Math.ceil(m / 3)} ${y}`;
}

function GiantCard({ g }: { g: OwnerGiant }) {
  return (
    <div className="rounded-xl border p-4" style={CARD}>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <h3 className="font-bold">
          {g.name}{" "}
          {g.symbol && <span className="text-xs font-normal" style={{ ...MONO, color: "var(--text-dim)" }}>{g.symbol}</span>}
        </h3>
        <span className="text-sm font-semibold whitespace-nowrap" style={MONO}>{fmtCap(g.reported)}</span>
      </div>
      <p className="text-xs text-[var(--text-muted)] mb-2">
        {g.holders.toLocaleString()} reporting holders
        {g.pctOfCap ? ` · filings cover ${g.pctOfCap}% of today's market cap` : ""}
      </p>
      <ol className="text-[13px] space-y-0.5">
        {g.top.slice(0, 5).map((h, i) => (
          <li key={h.cik} className="flex justify-between gap-2">
            <span>
              <span style={{ ...MONO, color: "var(--text-dim)" }}>{i + 1}.</span> {h.name}
            </span>
            <span className="whitespace-nowrap" style={MONO}>{fmtCap(h.value)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default async function OwnersPage() {
  const data = await getOwners();
  const giants = (data?.giants ?? []).filter((g) => g.reported >= 1e10);
  const invisible = (data?.giants ?? []).filter((g) => g.reported < 1e10).map((g) => g.name);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Crumbs tab="Owners" />
      <TabHeader
        emoji="🏦"
        title="The Owners"
        sub="Every quarter, every institution managing over $100M tells the SEC exactly what it holds. This board reduces all of those filings to the questions this site cares about: who manages the most money, which metros they run it from, what everyone owns, and who holds the giants."
        stamp={
          data
            ? `${quarterLabel(data.meta.as_of)} holdings (as of ${data.meta.as_of}) · ${data.meta.filings.toLocaleString()} filings · ${fmtCap(data.meta.totalValue)} reported · source: SEC Form 13F`
            : null
        }
      />
      <BusinessNav />

      {!data ? (
        <p className="text-sm text-[var(--text-muted)]">The owners dataset has not loaded; try again shortly.</p>
      ) : (
        <>
          <section className="mb-10 grid gap-4 sm:grid-cols-3">
            {[
              [fmtCap(data.meta.totalValue), "in reported US-listed holdings"],
              [data.meta.managers.toLocaleString(), "institutional managers filing"],
              [`${Math.round((100 * data.meta.mappedValue) / data.meta.totalValue)}%`, "of that money mapped to a metro"],
            ].map(([big, small]) => (
              <div key={small as string} className="rounded-xl border p-4 text-center" style={CARD}>
                <div className="text-2xl font-bold" style={MONO}>{big}</div>
                <div className="text-xs text-[var(--text-muted)] mt-1">{small}</div>
              </div>
            ))}
          </section>

          <section className="mb-10" id="capitals">
            <SectionHead
              title="Asset-manager capitals"
              sub="Metros ranked by the 13F value their institutions manage. New York is the vault of the world; the surprise is how much of it sits in Vanguard's Philadelphia and fund-country Boston."
            />
            <TableBox stickyCol={2}>
              <thead>
                <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                  <th className={THR}>#</th>
                  <th className={TH}>Metro</th>
                  <th className={THR}>Managed value</th>
                  <th className={THR}>Filers</th>
                  <th className={`${TH} ${SMCOL}`}>Country</th>
                </tr>
              </thead>
              <tbody>
                {data.capitals.slice(0, 30).map((c, i) => (
                  <tr key={c.metroSlug} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className={TDR} style={{ ...MONO, color: "var(--text-dim)" }}>{i + 1}</td>
                    <td className={`${TD} font-semibold whitespace-nowrap`}><MetroLink name={c.metro} slug={c.metroSlug} /></td>
                    <td className={TDR} style={MONO}>{fmtCap(c.value)}</td>
                    <td className={TDR} style={MONO}>{c.filers.toLocaleString()}</td>
                    <td className={`${TD} ${SMCOL} text-[var(--text-muted)] whitespace-nowrap`}>{c.country}</td>
                  </tr>
                ))}
              </tbody>
            </TableBox>
          </section>

          <section className="mb-10" id="managers">
            <SectionHead
              title="The manager league table"
              sub="The biggest institutional managers on Earth by reported 13F value, with the metro each files from. A consolidated filing counts once, at headquarters."
            />
            <TableBox stickyCol={2}>
              <thead>
                <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                  <th className={THR}>#</th>
                  <th className={TH}>Manager</th>
                  <th className={THR}>Reported value</th>
                  <th className={THR}>Positions</th>
                  <th className={TH}>Metro</th>
                </tr>
              </thead>
              <tbody>
                {data.managers.map((m, i) => (
                  <tr key={m.cik} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className={TDR} style={{ ...MONO, color: "var(--text-dim)" }}>{i + 1}</td>
                    <td className={`${TD} font-semibold`}>{m.name}</td>
                    <td className={TDR} style={MONO}>{fmtCap(m.value)}</td>
                    <td className={TDR} style={MONO}>{m.positions.toLocaleString()}</td>
                    <td className={`${TD} whitespace-nowrap`}>
                      {m.metro ? <MetroLink name={m.metro} slug={m.metroSlug} /> : <span className="text-[var(--text-muted)]">{m.city}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableBox>
          </section>

          <section className="mb-10" id="widely-held">
            <SectionHead
              title="What everyone owns"
              sub="Stocks ranked by how many separate institutions report a position. Share classes count separately - both Alphabet lines make the list on their own."
            />
            <TableBox stickyCol={2}>
              <thead>
                <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                  <th className={THR}>#</th>
                  <th className={TH}>Issuer</th>
                  <th className={THR}>Holders</th>
                  <th className={THR}>Reported value</th>
                </tr>
              </thead>
              <tbody>
                {data.widelyHeld.slice(0, 25).map((w, i) => (
                  <tr key={w.cusip} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className={TDR} style={{ ...MONO, color: "var(--text-dim)" }}>{i + 1}</td>
                    <td className={`${TD} font-semibold`}>{w.issuer}</td>
                    <td className={TDR} style={MONO}>{w.holders.toLocaleString()}</td>
                    <td className={TDR} style={MONO}>{fmtCap(w.value)}</td>
                  </tr>
                ))}
              </tbody>
            </TableBox>
          </section>

          <section className="mb-10" id="giants">
            <SectionHead
              title="Who owns the giants"
              sub="The biggest companies in the site universe and their largest reporting holders. The index-fund trinity - BlackRock, Vanguard, State Street - tops almost every card, which is the story."
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {giants.map((g) => (
                <GiantCard key={g.symbol || g.name} g={g} />
              ))}
            </div>
            {invisible.length > 0 && (
              <p className="text-xs text-[var(--text-muted)] mt-4 max-w-3xl">
                Barely visible here: {invisible.join(", ")} - giants without a meaningful US listing
                sit outside the 13F system, however large they loom in the Money Table.
              </p>
            )}
          </section>

          <section className="mb-6 rounded-2xl border p-5 sm:p-6" style={CARD}>
            <h2 className="text-lg font-bold mb-2">How this board works</h2>
            <p className="text-[13.5px] text-[var(--text-muted)] leading-relaxed max-w-3xl">
              Form 13F is the SEC&apos;s quarterly disclosure of institutional holdings: every manager
              over $100M reports its US-listed long positions about 45 days after quarter end. This
              board reduces the full EDGAR data set - millions of holdings rows - once a quarter,
              keeping the latest filing per manager and folding restatements in. What 13F sees is
              partial by design: long positions in US-listed stocks only, no shorts, no bonds, no
              private stakes, and a manager&apos;s worldwide book consolidates into one filing at
              headquarters, which flatters the metro its nameplate hangs in. Giants are matched by
              issuer name across their share classes, and filer cities roll up to metros through the
              same hand-curated kind of table the leaders board uses. Values are what managers
              reported at quarter end; the percent-of-cap figures compare them to today&apos;s market
              caps, so a stock that has run since March shows a lower share.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
