import type { Metadata } from "next";
import Link from "next/link";
import { readFileSync } from "fs";
import { join } from "path";
import { getHousingIndex, housingHref, type HousingMsaRow } from "@/lib/economyHousing";
import { BASE_URL, SITE_NAME, ogImage } from "@/lib/seo";
import BusinessNav from "../../BusinessNav";
import { MONO, CARD, TH, THR, TD, TDR, SectionHead, Crumbs, TabHeader, TableBox } from "../../ui";
import EconomyNav from "../EconomyNav";
import { DivergingBar } from "@/app/_shared/DataBar";
import HousingTable, { type BoardRow } from "./HousingTable";
import HousingChart from "./HousingChart";

export const revalidate = 21600;

const PATH = "/business/economy/housing";
const TITLE = "House Prices";
const DESC =
  "House prices by US metro area since 1991, in real terms by default: FHFA's purchase-only index for the 100 largest metros, all-transactions for 310 more, ranked over one, five, ten and twenty-five years and through the 2007 to 2012 crash.";

export const metadata: Metadata = {
  title: `${TITLE} | Business of the Metros`,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: ogImage(TITLE, PATH), width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { images: [ogImage(TITLE, PATH)], card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

// Metro display names for the crosswalk, read once at build time from the
// metros file with a literal path (scripts/DATA-READS-RECIPE.md).
function metroNames(): Record<string, string> {
  try {
    const rows = JSON.parse(readFileSync(join(process.cwd(), "public", "data", "metros.json"), "utf-8")) as { slug: string; name: string }[];
    return Object.fromEntries(rows.map((m) => [m.slug, m.name]));
  } catch {
    return {};
  }
}

function quarterLabel(q: string): string {
  return q.replace("Q", " Q");
}

type Board = { title: string; sub: string; rows: HousingMsaRow[]; pick: (r: HousingMsaRow) => number | null; label: string };

export default async function HousingPage() {
  const index = await getHousingIndex();
  const names = metroNames();
  const msas = index?.msas ?? [];
  const usa = index?.national.find((n) => n.id === "USA") ?? null;
  const divisions = (index?.national ?? []).filter((n) => n.id !== "USA");

  const rows: BoardRow[] = msas.map((m) => ({
    cbsa: m.cbsa, name: m.name, states: m.states, division: m.division, flavor: m.flavor,
    metro: m.metro, metroName: m.metro ? names[m.metro] ?? m.metro : null,
    latest: m.latest, index: m.index, nominal: m.nominal, real: m.real,
  }));

  const withValue = (pick: (r: HousingMsaRow) => number | null) => msas.filter((r) => pick(r) != null);
  const top = (pick: (r: HousingMsaRow) => number | null, n = 10, desc = true) =>
    [...withValue(pick)].sort((a, b) => (desc ? pick(b)! - pick(a)! : pick(a)! - pick(b)!)).slice(0, n);

  const boards: Board[] = [
    { title: "Fastest over ten years", sub: "Real change since the same quarter of ten years ago.", rows: top((r) => r.real.y10), pick: (r) => r.real.y10, label: "real, 10 years" },
    { title: "Slowest over ten years", sub: "Real change, smallest first: where a house bought in the mid-2010s has gone nowhere.", rows: top((r) => r.real.y10, 10, false), pick: (r) => r.real.y10, label: "real, 10 years" },
    { title: "Fastest since 2000", sub: "Real change from the first quarter of 2000.", rows: top((r) => r.real.since2000), pick: (r) => r.real.since2000, label: "real, since 2000" },
    { title: "Fastest over one year", sub: "Nominal change over the last four quarters (the CPI has not printed for this year yet).", rows: top((r) => r.nominal.y1), pick: (r) => r.nominal.y1, label: "nominal, 1 year" },
    { title: "The deepest crash, 2007 to 2012", sub: "Largest real peak-to-trough fall inside the window, most severe first.", rows: top((r) => r.real.drawdown?.pct ?? null, 10, false), pick: (r) => r.real.drawdown?.pct ?? null, label: "real, peak to trough" },
    { title: "The shallowest crash", sub: "Metro areas that barely fell, or did not fall at all, in real terms.", rows: top((r) => r.real.drawdown?.pct ?? -1000, 10, true).filter((r) => r.real.drawdown), pick: (r) => r.real.drawdown?.pct ?? null, label: "real, peak to trough" },
  ];

  const po = msas.filter((m) => m.flavor === "purchase-only").length;
  const stamp = index
    ? `as of ${index.built} · FHFA to ${quarterLabel(index.latest)} · ${msas.length} metro areas (${po} purchase-only) · ${index.crosswalk.matched} joined to metro pages · real terms in ${index.base_year} dollars`
    : null;

  function MsaLink({ r }: { r: HousingMsaRow }) {
    return (
      <Link href={housingHref(r.cbsa)} className="hover:underline font-semibold" style={{ color: "var(--accent)" }}>
        {r.name}
      </Link>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Crumbs tab="Economy" />
      <TabHeader
        emoji="🏠"
        title="House prices"
        sub="Every US metro area FHFA tracks, in real terms by default, ranked over one, five, ten and twenty-five years and through the crash."
        stamp={stamp}
      />
      <BusinessNav />
      <EconomyNav />

      {!index || !usa ? (
        <p className="text-sm text-[var(--text-muted)]">The housing dataset has not loaded; try again shortly.</p>
      ) : (
        <>
          <section className="mb-10">
            <SectionHead
              title="The country"
              sub="FHFA purchase-only index for the United States, real and nominal, first quarter of 1991 = 100."
              more={`Real terms deflate each quarter by that year's US CPI and state the result in ${index.base_year} dollars; the CPI runs to ${index.cpi_last_year}, so later quarters are shown at ${index.cpi_last_year} prices until the next annual print. The nominal line is the index as FHFA publishes it (not seasonally adjusted). The shaded band is the 2007 to 2012 window the crash boards measure.`}
            />
            <div className="rounded-xl border p-4 sm:p-5 min-w-0" style={CARD}>
              <HousingChart series={usa.series} baseYear={index.base_year} title="United States" />
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {[
                  ["One year", usa.nominal.y1, "nominal"],
                  ["Ten years, real", usa.real.y10, "real"],
                  ["Since 2000, real", usa.real.since2000, "real"],
                  ["2007 to 2012, real", usa.real.drawdown?.pct ?? null, `${usa.real.drawdown?.peak ?? ""} to ${usa.real.drawdown?.trough ?? ""}`],
                ].map(([label, v, note]) => (
                  <div key={label as string} className="rounded-lg border p-3 min-w-0" style={{ borderColor: "var(--border)" }}>
                    <div className="uppercase tracking-wider text-[10px] text-[var(--text-dim)]" style={MONO}>{label as string}</div>
                    <div className="text-lg font-bold tabular-nums" style={MONO}><DivergingBar v={v as number | null} dp={1} label={label as string} /></div>
                    <div className="text-[11px] text-[var(--text-dim)]">{note as string}</div>
                  </div>
                ))}
              </div>
            </div>
            {divisions.length ? (
              <div className="mt-4">
                <div className="hidden sm:block">
                  <TableBox>
                    <thead>
                      <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                        <th className={TH}>Census division</th>
                        <th className={THR}>1 year</th>
                        <th className={THR}>10 years, real</th>
                        <th className={THR}>Since 2000, real</th>
                        <th className={THR}>2007 to 2012, real</th>
                      </tr>
                    </thead>
                    <tbody>
                      {divisions.map((d) => (
                        <tr key={d.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                          <td className={`${TD} whitespace-nowrap`}>{d.name}</td>
                          <td className={TDR} style={MONO}><DivergingBar v={d.nominal.y1} dp={1} label="one year" /></td>
                          <td className={TDR} style={MONO}><DivergingBar v={d.real.y10} dp={1} label="ten years real" /></td>
                          <td className={TDR} style={MONO}><DivergingBar v={d.real.since2000} dp={1} label="since 2000 real" /></td>
                          <td className={TDR} style={MONO}><DivergingBar v={d.real.drawdown?.pct ?? null} dp={1} label="crash" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </TableBox>
                </div>
                {/* Nine census divisions: bounded, no cap needed. */}
                <div data-mobile-uncapped className="sm:hidden rounded-xl border divide-y divide-[var(--border)] min-w-0" style={{ borderColor: "var(--border)" }}>
                  {divisions.map((d) => (
                    <div key={d.id} className="p-3">
                      <div className="flex items-center justify-between gap-2"><span className="font-semibold">{d.name}</span><span className="tabular-nums" style={MONO}><DivergingBar v={d.real.y10} dp={1} label="ten years real" /></span></div>
                      <div className="text-xs text-[var(--text-muted)]" style={MONO}>1y {d.nominal.y1 ?? "?"}% · since 2000 {d.real.since2000 ?? "?"}% · crash {d.real.drawdown?.pct ?? "?"}%</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <section className="mb-10">
            <SectionHead
              title="Where prices stand"
              sub="Every FHFA metro area, sortable; pick real or nominal and the horizon."
              more={`FHFA publishes a purchase-only index (repeat sales of the same homes, no refinance appraisals) for the 100 largest metro areas and an all-transactions index for every metro; the board shows purchase-only where it exists and says "all-trans." where it does not. The eleven largest metros exist in FHFA's file only as their principal metropolitan division, marked "division" here: New York is New York-Jersey City-White Plains, not Long Island or Newark. ${index.crosswalk.matched} of the site's ${index.crosswalk.us_metros} US metros are joined to an FHFA area by principal city and state; the rest are smaller than FHFA's coverage or are folded into a neighbour here.`}
            />
            <HousingTable rows={rows} baseYear={index.base_year} cpiLastYear={index.cpi_last_year} />
          </section>

          <section className="mb-10">
            <SectionHead title="The boards" sub="Ten metro areas each, from the same file, in real terms unless the title says otherwise." />
            <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
              {boards.map((b) => (
                <div key={b.title} className="rounded-xl border p-4 min-w-0" style={CARD}>
                  <div className="font-semibold">{b.title}</div>
                  <p className="text-xs text-[var(--text-muted)] mb-2">{b.sub}</p>
                  <ol className="m-0 p-0 list-none">
                    {b.rows.map((r, i) => (
                      <li key={r.cbsa} className="flex items-center gap-2 py-1 border-t text-[13px]" style={{ borderColor: "var(--border)" }}>
                        <span className="w-5 text-right text-[var(--text-dim)] tabular-nums text-xs" style={MONO}>{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate"><MsaLink r={r} /></span>
                        <span className="tabular-nums text-xs" style={MONO}><DivergingBar v={b.pick(r)} dp={1} label={b.label} /></span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-6 rounded-2xl border p-5 sm:p-6" style={CARD}>
            <h2 className="text-lg font-bold mb-2">Where these numbers come from</h2>
            <p className="text-[13.5px] text-[var(--text-muted)] leading-relaxed max-w-3xl">
              The Federal Housing Finance Agency&apos;s <Link href="https://www.fhfa.gov/data/hpi" target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "var(--accent)" }}>House Price Index</Link>, quarterly, from the all-series master file; purchase-only where published, all-transactions otherwise, not seasonally adjusted.
              Real terms use the World Bank&apos;s US consumer price index (FP.CPI.TOTL), annual. Growth is measured against the same quarter of the earlier year; the crash is the largest peak-to-trough fall between the first quarter of 2007 and the last of 2012.
              Case-Shiller&apos;s twenty cities are not yet on this page.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
