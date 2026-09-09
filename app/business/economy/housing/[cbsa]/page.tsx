import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getHousingIndex, getHousingMsa } from "@/lib/economyHousing";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import BusinessNav from "../../../BusinessNav";
import { MONO, CARD, TH, THR, TD, TDR, Crumbs, TabHeader, TableBox, SectionHead } from "../../../ui";
import EconomyNav from "../../EconomyNav";
import { CappedList } from "@/app/_shared/Disclosure";
import { DivergingBar } from "@/app/_shared/DataBar";
import HousingChart from "../HousingChart";

// One FHFA metro area, /business/economy/housing/[cbsa]. Reads exactly one
// series file through lib/economyHousing.getHousingMsa(), never the directory.

export const revalidate = 86400;

export const dynamicParams = false;
export async function generateStaticParams() {
  const index = await getHousingIndex();
  return (index?.msas ?? []).map((m) => ({ cbsa: m.cbsa }));
}

export async function generateMetadata({ params }: { params: Promise<{ cbsa: string }> }): Promise<Metadata> {
  const { cbsa } = await params;
  const index = await getHousingIndex();
  const row = index?.msas.find((m) => m.cbsa === cbsa);
  const name = row?.name ?? cbsa;
  const title = `${name} House Prices Since ${row?.first.slice(0, 4) ?? ""}`.trim();
  const description = row
    ? `FHFA ${row.flavor} house price index for ${name}, ${row.first.slice(0, 4)} to ${row.latest.replace("Q", " Q")}: ${row.real.since2000 != null ? `${row.real.since2000 > 0 ? "up" : "down"} ${Math.abs(row.real.since2000).toFixed(0)}% in real terms since 2000` : "charted in real and nominal terms"}.`
    : `House price history for ${name}.`;
  return {
    title: `${title} | Business of the Metros`,
    description,
    alternates: { canonical: `/business/economy/housing/${cbsa}` },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description, url: `${BASE_URL}/business/economy/housing/${cbsa}`, type: "website" },
    twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${title} | ${SITE_NAME}`, description },
  };
}

const HORIZONS: { key: "y1" | "y5" | "y10" | "y25" | "since2000"; label: string }[] = [
  { key: "y1", label: "One year" }, { key: "y5", label: "Five years" }, { key: "y10", label: "Ten years" }, { key: "y25", label: "Twenty-five years" }, { key: "since2000", label: "Since 2000" },
];

export default async function HousingMsaPage({ params }: { params: Promise<{ cbsa: string }> }) {
  const { cbsa } = await params;
  const [index, file] = await Promise.all([getHousingIndex(), getHousingMsa(cbsa)]);
  const row = index?.msas.find((m) => m.cbsa === cbsa);
  if (!index || !row || !file) notFound();

  const series = file.series;
  const last = series[series.length - 1];
  // Year-end rows for the table: the fourth quarter of every year, plus the
  // latest quarter when the year is still open. Newest first.
  const yearRows = [...series.filter((p) => p[1] === 4 || p === last)].reverse();
  const stamp = `FHFA ${row.flavor}${row.division ? ", principal metropolitan division" : ""} · ${row.first.replace("Q", " Q")} to ${row.latest.replace("Q", " Q")} · real terms in ${index.base_year} dollars · built ${index.built}`;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Crumbs tab="Economy" />
      <TabHeader
        emoji="🏠"
        title={row.name}
        sub={row.metro ? "House prices for this metro area, real and nominal, since FHFA's series begins." : "House prices for this FHFA metro area, real and nominal, since the series begins."}
        stamp={stamp}
      />
      <BusinessNav />
      <EconomyNav />

      <p className="text-sm text-[var(--text-muted)] mb-6">
        <Link href="/business/economy/housing" className="hover:underline" style={{ color: "var(--accent)" }}>All metro areas</Link>
        {row.metro ? <> · this area is <Link href={`/rankings/${row.metro}`} className="hover:underline" style={{ color: "var(--accent)" }}>{row.metro.replace(/-/g, " ")}</Link> on the rankings</> : null}
        {row.division ? <> · FHFA publishes the largest metros only as their principal metropolitan division, so this is the core of the metro rather than the whole of it.</> : null}
      </p>

      <section className="mb-10">
        <SectionHead
          title="The index"
          sub="Real and nominal, first quarter of the series = 100; the shaded band is 2007 to 2012."
          more={`Real terms deflate each quarter by that year's US CPI, stated in ${index.base_year} dollars; the CPI runs to ${index.cpi_last_year}, so later quarters sit at ${index.cpi_last_year} prices until the next print. ${row.flavor === "purchase-only" ? "Purchase-only means repeat sales of the same homes with refinance appraisals excluded, the cleaner of FHFA's two indices, published for the 100 largest metro areas." : "All-transactions includes refinance appraisals as well as sales; FHFA publishes purchase-only for the 100 largest metro areas only, and this is not one of them."}`}
        />
        <div className="rounded-xl border p-4 sm:p-5 min-w-0" style={CARD}>
          <HousingChart series={series} baseYear={index.base_year} title={row.name} />
        </div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          {HORIZONS.map((h) => (
            <div key={h.key} className="rounded-lg border p-3 min-w-0" style={{ borderColor: "var(--border)" }}>
              <div className="uppercase tracking-wider text-[10px] text-[var(--text-dim)]" style={MONO}>{h.label}</div>
              <div className="text-lg font-bold tabular-nums" style={MONO}><DivergingBar v={row.real[h.key]} dp={1} label={`${h.label} real`} /></div>
              <div className="text-[11px] text-[var(--text-dim)]" style={MONO}>nominal {row.nominal[h.key] != null ? `${row.nominal[h.key]! > 0 ? "+" : ""}${row.nominal[h.key]!.toFixed(1)}%` : "n/a"}</div>
            </div>
          ))}
          <div className="rounded-lg border p-3 min-w-0" style={{ borderColor: "var(--border)" }}>
            <div className="uppercase tracking-wider text-[10px] text-[var(--text-dim)]" style={MONO}>2007 to 2012</div>
            <div className="text-lg font-bold tabular-nums" style={MONO}><DivergingBar v={row.real.drawdown?.pct ?? null} dp={1} label="crash, real" /></div>
            <div className="text-[11px] text-[var(--text-dim)]" style={MONO}>{row.real.drawdown ? `${row.real.drawdown.peak} to ${row.real.drawdown.trough}` : "no fall in the window"}</div>
          </div>
        </div>
      </section>

      <section className="mb-10">
        <SectionHead title="Year by year" sub="Fourth quarter of each year, nominal and real, newest first." />
        <div className="hidden sm:block">
          <TableBox>
            <thead>
              <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                <th className={TH}>Quarter</th>
                <th className={THR}>Nominal</th>
                <th className={THR}>Real ({index.base_year} $)</th>
                <th className={THR}>Real, year on year</th>
              </tr>
            </thead>
            <tbody>
              {yearRows.map((p, i) => {
                const prev = yearRows[i + 1];
                const yoy = prev && prev[4] ? (p[4] / prev[4] - 1) * 100 : null;
                return (
                  <tr key={`${p[0]}-${p[1]}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className={TD} style={MONO}>{p[0]} Q{p[1]}</td>
                    <td className={TDR} style={MONO}>{p[2].toFixed(1)}</td>
                    <td className={TDR} style={MONO}>{p[4].toFixed(1)}</td>
                    <td className={TDR} style={MONO}><DivergingBar v={yoy} dp={1} label="real year on year" /></td>
                  </tr>
                );
              })}
            </tbody>
          </TableBox>
        </div>
        <div className="sm:hidden rounded-xl border divide-y divide-[var(--border)] min-w-0" style={{ borderColor: "var(--border)" }}>
          <CappedList
            initial={12}
            noun="years"
            bodyClassName="divide-y divide-[var(--border)]"
            items={yearRows.map((p, i) => {
              const prev = yearRows[i + 1];
              const yoy = prev && prev[4] ? (p[4] / prev[4] - 1) * 100 : null;
              return (
                <div key={`${p[0]}-${p[1]}`} className="p-3 flex items-center justify-between gap-2">
                  <span style={MONO}>{p[0]} Q{p[1]}</span>
                  <span className="text-xs text-[var(--text-muted)]" style={MONO}>{p[2].toFixed(0)} · real {p[4].toFixed(0)}</span>
                  <span className="tabular-nums" style={MONO}><DivergingBar v={yoy} dp={1} label="real year on year" /></span>
                </div>
              );
            })}
          />
        </div>
      </section>

      <section className="mb-6 rounded-2xl border p-5 sm:p-6" style={CARD}>
        <h2 className="text-lg font-bold mb-2">Source</h2>
        <p className="text-[13.5px] text-[var(--text-muted)] leading-relaxed max-w-3xl">
          FHFA House Price Index, {row.flavor}, quarterly, not seasonally adjusted, CBSA {row.cbsa}. Real terms by the World Bank&apos;s US consumer price index, annual.
        </p>
      </section>
    </main>
  );
}
