import Link from "next/link";
import { getHousingForMetro } from "@/lib/economyHousing";
import { Disclosure } from "@/app/_shared/Disclosure";
import { DivergingBar } from "@/app/_shared/DataBar";
import HousingChart from "@/app/business/economy/housing/HousingChart";

// The house-price panel on a metro page (/rankings/[slug]), for the 285 US
// metros the FHFA crosswalk joins. Real terms by default, a nominal line
// alongside, the same four figures the hub quotes, and a link out to the
// area's own page. Renders nothing for a metro with no FHFA area, so the
// section never appears empty.

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;

export default async function HousingPanel({ slug }: { slug: string }) {
  const h = await getHousingForMetro(slug).catch(() => null);
  if (!h || !h.file) return null;
  const { row, file, index } = h;
  const tiles: [string, number | null, string][] = [
    ["One year", row.nominal.y1, "nominal"],
    ["Ten years", row.real.y10, `real, ${index.base_year} $`],
    ["Since 2000", row.real.since2000, `real, ${index.base_year} $`],
    ["2007 to 2012", row.real.drawdown?.pct ?? null, row.real.drawdown ? `${row.real.drawdown.peak} to ${row.real.drawdown.trough}` : "no fall"],
  ];
  return (
    <Disclosure
      id="housing"
      className="border-0 bg-transparent"
      summaryClassName="px-0"
      bodyClassName="border-0 pt-4"
      meta={`FHFA to ${row.latest.replace("Q", " Q")}`}
      title={<h2 className="text-2xl font-bold text-[var(--text)]">House Prices</h2>}
    >
      <p className="text-sm text-[var(--text-muted)] mb-3">
        FHFA {row.flavor} index for {row.name}{row.division ? ", the principal metropolitan division" : ""}, since {row.first.slice(0, 4)}. Real terms in {index.base_year} dollars.{" "}
        <Link href={`/business/economy/housing/${row.cbsa}`} className="hover:underline" style={{ color: "var(--accent)" }}>Full history and the year-by-year table</Link>.
      </p>
      <div className="rounded-xl border p-4 min-w-0" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <HousingChart series={file.series} baseYear={index.base_year} title={row.name} compact />
      </div>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        {tiles.map(([label, v, note]) => (
          <div key={label} className="rounded-lg border p-3 min-w-0" style={{ borderColor: "var(--border)" }}>
            <div className="uppercase tracking-wider text-[10px] text-[var(--text-dim)]" style={MONO}>{label}</div>
            <div className="text-lg font-bold tabular-nums" style={MONO}><DivergingBar v={v} dp={1} label={label} /></div>
            <div className="text-[11px] text-[var(--text-dim)]">{note}</div>
          </div>
        ))}
      </div>
    </Disclosure>
  );
}
