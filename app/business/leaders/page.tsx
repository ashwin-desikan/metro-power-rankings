import type { Metadata } from "next";
import Link from "next/link";
import { getBizLeaders, getBizLeaderChanges, type BizLeaderRow } from "@/lib/business";
import { formatMarketCap } from "@/lib/shared";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import BusinessNav from "../BusinessNav";
import { MONO, CARD, TH, THR, TD, TDR, MetroLink, SectionHead, Crumbs, TabHeader, TableBox } from "../ui";

export const revalidate = 21600;

const PATH = "/business/leaders";
const TITLE = "Business Leaders";
const DESC =
  "Who actually runs the money: CEOs of the world's biggest companies, the people behind the major funds and sovereign wealth vehicles, and every central bank governor - tracked for changes the way this site tracks political leaders.";

export const metadata: Metadata = {
  title: `${TITLE} | Business of the Metros`,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

function Person({ r }: { r: BizLeaderRow }) {
  if (!r.person) return <span style={{ color: "var(--text-dim)" }}>—</span>;
  return (
    <>
      <span className="font-semibold">{r.person}</span>
      {r.since && <span className="text-xs text-[var(--text-muted)]"> since {r.since.slice(0, 4)}</span>}
    </>
  );
}

export default async function BizLeadersPage() {
  const data = await getBizLeaders();
  const changes = getBizLeaderChanges().slice().reverse().slice(0, 20);
  const kinds = ["Asset manager", "Hedge fund", "Private equity", "Sovereign wealth", "Pension"];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Crumbs tab="Leaders" />
      <TabHeader
        emoji="🎩"
        title="Business Leaders"
        sub="The site tracks who runs every country; this board tracks who runs the money. CEOs of the biggest companies, the people behind the major funds, and every central bank governor, with changes logged as they happen."
        stamp={data ? `as of ${data.meta.as_of} · ${data.meta.resolved}/${data.meta.total} seats resolved · source: Wikidata` : null}
      />
      <BusinessNav />

      {!data ? (
        <p className="text-sm text-[var(--text-muted)]">The leaders dataset has not loaded; try again shortly.</p>
      ) : (
        <>
          <section className="mb-10" id="changes">
            <SectionHead
              title="The revolving door"
              sub="Leadership changes detected by the weekly refresh, newest first."
            />
            {changes.length > 0 ? (
              <div className="rounded-xl border divide-y" style={{ borderColor: "var(--border)" }}>
                {changes.map((c, i) => (
                  <div key={`${c.date}-${c.entity}-${i}`} className="px-3 py-2 text-[13px]" style={{ borderColor: "var(--border)" }}>
                    <span style={{ ...MONO, color: "var(--text-dim)" }}>{c.date}</span>{" "}
                    <span className="text-xs uppercase tracking-wide" style={{ ...MONO, color: "var(--text-muted)" }}>{c.group}</span>{" "}
                    <span className="font-semibold">{c.entity}</span>:{" "}
                    <span style={{ color: "#E2628B" }}>{c.from}</span> <span aria-hidden>→</span>{" "}
                    <span style={{ color: "#10b981" }}>{c.to}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border p-5" style={CARD}>
                <p className="text-sm text-[var(--text-muted)] max-w-3xl">
                  No changes on the log yet - tracking began with this dataset&apos;s first snapshot, and
                  every future refresh that finds a new name in any seat below records it here.
                </p>
              </div>
            )}
          </section>

          <section className="mb-10" id="central-banks">
            <SectionHead
              title="The central bankers"
              sub="The unelected officials whose signatures move more money than most parliaments."
              more="Each bank links to its country's page; the elections layer next door tracks who appoints them."
            />
            <TableBox>
              <thead>
                <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                  <th className={TH}>Institution</th>
                  <th className={TH}>Governor / Chair</th>
                  <th className={TH}>Country</th>
                </tr>
              </thead>
              <tbody>
                {data.centralBanks.map((b) => (
                  <tr key={b.entity} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className={`${TD} font-semibold whitespace-nowrap`}>{b.entity}</td>
                    <td className={TD}><Person r={b} /></td>
                    <td className={`${TD} text-[var(--text-muted)] whitespace-nowrap`}>
                      {b.countrySlug ? (
                        <Link href={`/countries/${b.countrySlug}`} className="hover:underline">{b.country}</Link>
                      ) : (
                        b.country
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableBox>
          </section>

          <section className="mb-10" id="funds">
            <SectionHead
              title="The fund chiefs"
              sub="Asset managers, hedge funds, private equity, sovereign wealth and pensions - the people who decide where the world's savings go."
            />
            <div className="grid gap-4 lg:grid-cols-2">
              {kinds.map((kind) => {
                const rows = data.funds.filter((f) => f.kind === kind);
                if (rows.length === 0) return null;
                return (
                  <div key={kind} className="min-w-0">
                    <h3 className="text-sm font-bold mb-2">{kind}s</h3>
                    <TableBox>
                      <tbody>
                        {rows.map((f) => (
                          <tr key={f.entity} className="border-t first:border-t-0" style={{ borderColor: "var(--border)" }}>
                            <td className={`${TD} font-semibold whitespace-nowrap`}>{f.entity}</td>
                            <td className={TD}><Person r={f} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </TableBox>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="mb-10" id="ceos">
            <SectionHead
              title="The corner offices"
              sub="Chief executives of the biggest public companies on Earth, with the metro each runs from."
            />
            <TableBox stickyCol={2}>
              <thead>
                <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                  <th className={THR}>#</th>
                  <th className={TH}>Company</th>
                  <th className={TH}>Chief executive</th>
                  <th className={THR}>Market cap</th>
                  <th className={TH}>Metro</th>
                </tr>
              </thead>
              <tbody>
                {data.ceos.map((c, i) => (
                  <tr key={c.entity} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className={TDR} style={{ ...MONO, color: "var(--text-dim)" }}>{i + 1}</td>
                    <td className={`${TD} font-semibold whitespace-nowrap`}>
                      {c.entity}{" "}
                      {c.symbol && <span className="text-xs font-normal" style={{ ...MONO, color: "var(--text-dim)" }}>{c.symbol}</span>}
                    </td>
                    <td className={TD}><Person r={c} /></td>
                    <td className={TDR} style={MONO}>{c.cap ? formatMarketCap(c.cap) : "—"}</td>
                    <td className={`${TD} whitespace-nowrap`}><MetroLink name={c.metro} slug={c.metroSlug ?? ""} /></td>
                  </tr>
                ))}
              </tbody>
            </TableBox>
          </section>

          <section className="mb-6 rounded-2xl border p-5 sm:p-6" style={CARD}>
            <h2 className="text-lg font-bold mb-2">How this board works</h2>
            <p className="text-[13.5px] text-[var(--text-muted)] leading-relaxed max-w-3xl">
              Officeholders come from Wikidata&apos;s current-officeholder claims - the same source the
              political leaders pages trust - resolved weekly against a hand-reviewable entity list.
              Seats showing a dash have no clean current claim yet; they fill in as the curation cache
              is corrected, and a wrong name is a one-line fix in that cache. Every refresh that finds
              a different name in a seat records the change above, so the revolving door builds its
              own history from the weeks this site actually watched. Compare{" "}
              <Link href="/leaders" className="hover:underline" style={{ color: "var(--accent)" }}>World Leaders</Link>{" "}
              for the political equivalent, and{" "}
              <Link href="/power" className="hover:underline" style={{ color: "var(--accent)" }}>The Nowhere 100</Link>{" "}
              for where the two worlds meet.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
