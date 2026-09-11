import type { Metadata } from "next";
import Link from "next/link";
import { getPricesIndex } from "@/lib/prices";
import { BASE_URL, SITE_NAME, ogImage } from "@/lib/seo";
import BusinessNav from "../../BusinessNav";
import { MONO, CARD, SectionHead, Crumbs, TabHeader } from "../../ui";
import EconomyNav from "../EconomyNav";
import { DivergingBar } from "@/app/_shared/DataBar";
import { flagUrlByCode, flagSrcSetByCode } from "@/lib/flags";
import SortableBoard, { type BoardRow } from "@/app/_shared/SortableBoard";
import PricesChart from "./PricesChart";

export const revalidate = 21600;

const PATH = "/business/economy/prices";
const TITLE = "Consumer Prices";
const DESC =
  "US and UK consumer prices monthly, BLS CPI-U and ONS CPIH, plus the World Bank's annual CPI index for every country the site tracks, ranked by five- and ten-year annualised inflation.";

export const metadata: Metadata = {
  title: `${TITLE} | Business of the Metros`,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: ogImage(TITLE, PATH), width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { images: [ogImage(TITLE, PATH)], card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

function HeadlineCard({ flag, name, series }: { flag: string; name: string; series: { source: string; latest_month: string; yoy: number | null; mom: number | null } }) {
  return (
    <div className="rounded-xl border p-4 min-w-0" style={CARD}>
      <div className="flex items-center gap-2 mb-2">
        <img src={flagUrlByCode(flag)} srcSet={flagSrcSetByCode(flag)} alt="" width={20} height={15} className="rounded-[2px]" loading="lazy" decoding="async" />
        <span className="font-semibold">{name}</span>
        <span className="text-xs text-[var(--text-dim)] ml-auto" style={MONO}>{monthLabel(series.latest_month)}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="uppercase tracking-wider text-[10px] text-[var(--text-dim)]" style={MONO}>Year on year</div>
          <div className="text-xl font-bold tabular-nums" style={MONO}><DivergingBar v={series.yoy} dp={1} label="year on year" /></div>
        </div>
        <div>
          <div className="uppercase tracking-wider text-[10px] text-[var(--text-dim)]" style={MONO}>Month on month</div>
          <div className="text-xl font-bold tabular-nums" style={MONO}><DivergingBar v={series.mom} dp={1} label="month on month" /></div>
        </div>
      </div>
      <p className="text-[11px] text-[var(--text-dim)] mt-2">{series.source}</p>
    </div>
  );
}

export default async function PricesPage() {
  const index = await getPricesIndex();

  const rows: BoardRow[] =
    index?.annual.map((c) => ({
      key: c.slug,
      sort: { country: c.name, index: c.latest_value, year: c.latest_year, cagr5: c.cagr5, cagr10: c.cagr10 },
      cells: [
        <span key="c" className="inline-flex items-center gap-1.5 min-w-0">
          <img src={flagUrlByCode(c.iso2)} srcSet={flagSrcSetByCode(c.iso2)} alt="" width={16} height={12} className="rounded-[2px] flex-shrink-0" loading="lazy" decoding="async" />
          <span className="truncate">{c.name}</span>
        </span>,
        <span key="i" style={MONO}>{c.latest_value.toFixed(1)}</span>,
        <span key="y" style={MONO}>{c.latest_year}</span>,
        <DivergingBar key="5" v={c.cagr5} dp={1} suffix="%" label="5-year annualised" />,
        <DivergingBar key="10" v={c.cagr10} dp={1} suffix="%" label="10-year annualised" />,
      ],
      mobile: {
        name: (
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <img src={flagUrlByCode(c.iso2)} srcSet={flagSrcSetByCode(c.iso2)} alt="" width={16} height={12} className="rounded-[2px] flex-shrink-0" loading="lazy" decoding="async" />
            <span className="truncate">{c.name}</span>
          </span>
        ),
        sub: `index ${c.latest_value.toFixed(1)} · ${c.latest_year}`,
        right: <DivergingBar v={c.cagr10} dp={1} suffix="%" label="10-year annualised" />,
        rightSub: `5y ${c.cagr5 != null ? `${c.cagr5 >= 0 ? "+" : ""}${c.cagr5.toFixed(1)}%` : "—"}`,
      },
    })) ?? [];

  const stamp = index
    ? `as of ${index.built} · ${index.us.latest_month} US · ${index.uk.latest_month} UK · ${index.annual.length} countries, World Bank annual index`
    : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Crumbs tab="Economy" />
      <TabHeader
        emoji="🧺"
        title="Consumer prices"
        sub="US and UK consumer prices monthly, and the World Bank's annual index for every country the site tracks."
        stamp={stamp}
      />
      <BusinessNav />
      <EconomyNav />

      {!index ? (
        <p className="text-sm text-[var(--text-muted)]">The prices dataset has not loaded; try again shortly.</p>
      ) : (
        <>
          <section className="mb-8">
            <SectionHead
              title="Where prices stand"
              sub="The headline reading for each country: the change over the last twelve months, and over the last one."
            />
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <HeadlineCard flag="us" name="United States, CPI-U" series={index.us} />
              <HeadlineCard flag="gb" name="United Kingdom, CPIH" series={index.uk} />
            </div>
          </section>

          <section className="mb-10">
            <SectionHead
              title="Thirty years of inflation"
              sub="Year-on-year change in each country's own index, computed the same way for both."
            />
            <div className="rounded-xl border p-4 sm:p-5 min-w-0" style={CARD}>
              <PricesChart us={index.us.series_30y} uk={index.uk.series_30y} />
            </div>
          </section>

          <section className="mb-10">
            <SectionHead
              title="Every country, annually"
              sub="The World Bank's consumer price index, 2010 = 100, by country. Sortable; five- and ten-year figures are annualised."
              more="Base years differ by country because the World Bank rebases each one on its own schedule; the annualised figures are unaffected, since they are a ratio of two years within the same country's own series. A country is on the board only when the World Bank publishes a CPI series for it AND the site holds a slug for it; nothing is estimated."
            />
            <SortableBoard
              cols={[
                { key: "country", label: "Country" },
                { key: "index", label: "Latest index", right: true, short: "Index" },
                { key: "year", label: "Year", right: true, short: "Year" },
                { key: "cagr5", label: "5y annualised", right: true, short: "5y" },
                { key: "cagr10", label: "10y annualised", right: true, short: "10y" },
              ]}
              rows={rows}
              initial={{ key: "cagr10", dir: "desc" }}
              mobileNoun="countries"
              id="prices-annual"
            />
          </section>

          <section className="mb-6 rounded-2xl border p-5 sm:p-6" style={CARD}>
            <h2 className="text-lg font-bold mb-2">Where these numbers come from</h2>
            <p className="text-[13.5px] text-[var(--text-muted)] leading-relaxed max-w-3xl">
              US: the Bureau of Labor Statistics&apos; CPI-U, all items (series CUUR0000SA0), via{" "}
              <Link href="https://datahub.io/core/cpi-us" target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "var(--accent)" }}>datahub.io&apos;s core/cpi-us</Link>.
              UK: the Office for National Statistics&apos; CPIH, all items (series L522, dataset MM23), from{" "}
              <Link href="https://www.ons.gov.uk/economy/inflationandpriceindices" target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "var(--accent)" }}>ons.gov.uk</Link>.
              Both monthly year-on-year and month-on-month figures are computed here from the index levels, not taken from either source&apos;s own published rate.
              Every country: the World Bank&apos;s consumer price index (<Link href="https://data.worldbank.org/indicator/FP.CPI.TOTL" target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "var(--accent)" }}>FP.CPI.TOTL</Link>), annual, 2010 = 100.
              Generated {index.built}.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
