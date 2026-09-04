import type { Metadata } from "next";
import Link from "next/link";
import OrderNav from "@/app/order/_shared/OrderNav";
import { OrderCrumbs, OrderHeader } from "@/app/order/_shared/ui";
import { DivergingBar } from "@/app/_shared/DataBar";
import { CappedList, Disclosure } from "@/app/_shared/Disclosure";
import { SectionHead } from "@/app/_shared/SectionHead";
import { Sparkline } from "@/app/_shared/Sparkline";
import { TableScroll } from "@/app/_shared/TableScroll";
import { getRecognitionGap } from "@/lib/order";
import { AUTHOR, BASE_URL, PUBLISHER, SITE_NAME, serializeJsonLd } from "@/lib/seo";

const PATH = "/order/recognition-gap";
const TITLE = "The Recognition Gap";
const DESC =
  "The distance between what a country weighs and what it is treated as weighing, for every ranked state today and back to 1816 for the powers that have led the table.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website", images: [{ url: "/og-default.png", width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC, images: ["/og-default.png"] },
};

const CARD = { borderColor: "var(--border)", backgroundColor: "var(--bg-card)" } as const;

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border p-3" style={CARD}>
      <div className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-[var(--text)]">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-[var(--text-muted)]">{hint}</div> : null}
    </div>
  );
}

const pts = (v: number) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}`;

export default function RecognitionGapPage() {
  const data = getRecognitionGap();
  const rows = data.current;
  const maxGap = Math.max(...rows.map((x) => Math.abs(x.gap)));
  const under = [...rows].sort((a, b) => b.gap - a.gap);
  const over = [...rows].sort((a, b) => a.gap - b.gap);
  const tracked = Object.entries(data.series)
    .map(([slug, series]) => ({
      slug,
      name: rows.find((x) => x.slug === slug)?.name ?? slug,
      series,
      now: series[series.length - 1]?.[1] ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const ld = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: TITLE,
    description: DESC,
    url: `${BASE_URL}${PATH}`,
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: BASE_URL, publisher: PUBLISHER },
    author: AUTHOR,
    creator: PUBLISHER,
    temporalCoverage: `${data.meta.seriesFrom}/${data.year}`,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(ld) }} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <OrderCrumbs tab="Recognition" />
        <OrderHeader
          emoji="⚖️"
          title={TITLE}
          sub="Status and substance are not the same thing. The Power Atlas measures both: what a country has, and what the world treats it as having."
          stamp={`${rows.length} states · ${data.meta.seriesFrom} to ${data.year} · Correlates of War, Maddison, site power score · built ${data.built}`}
        />
        <OrderNav />

        <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile label="States" value={String(rows.length)} hint={`ranked in ${data.year}`} />
          <StatTile label="Most under-recognised" value={under[0] ? pts(under[0].gap) : "—"} hint={under[0]?.name} />
          <StatTile label="Most over-recognised" value={over[0] ? pts(over[0].gap) : "—"} hint={over[0]?.name} />
          <StatTile label="Tracked since" value={String(data.meta.seriesFrom)} hint={`${tracked.length} powers with a full series`} />
        </div>

        <section className="mt-10">
          <SectionHead
            title="Today"
            sub="Points of world power share: positive is mass not yet priced in, negative is status the base does not carry."
            more={
              <div className="space-y-2">
                <p>{data.meta.definition}</p>
                <p>
                  Latent power is material mass. Recognised power adds what a state spends, how far it reaches, and the
                  standing it has been granted: a permanent seat, a nuclear arsenal, leadership of a bloc. A country can
                  have one without the other, and the interesting cases are the ones where the two have come apart.
                </p>
              </div>
            }
          />
          <TableScroll className="mt-4 hidden sm:block rounded-xl border" style={CARD}>
            <table className="w-full text-sm" data-sticky-col={2}>
              <thead className="text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2 w-10">#</th>
                  <th className="px-3 py-2">Country</th>
                  <th className="px-3 py-2">Gap</th>
                  <th className="px-3 py-2 text-right">Latent</th>
                  <th className="px-3 py-2 text-right">Recognised</th>
                  <th className="px-3 py-2 text-right">Power rank</th>
                </tr>
              </thead>
              <tbody>
                {under.map((c, i) => (
                  <tr key={c.slug} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-2.5 tabular-nums text-[var(--text-dim)]">{i + 1}</td>
                    <td className="px-3 py-2.5 font-medium">
                      <Link href={`/countries/${c.slug}`} className="hover:text-[var(--accent)]">{c.name}</Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <DivergingBar v={c.gap} max={maxGap} scale={100} dp={1} suffix="" label={`${c.name} recognition gap in points of world share`} />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{(c.lat * 100).toFixed(1)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{(c.rec * 100).toFixed(1)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-muted)]">{c.rank ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:hidden">
            <CappedList
              initial={12}
              noun="countries"
              className="rounded-lg border border-[var(--border)]"
              bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
              items={under.map((c, i) => (
                <div key={c.slug} className="rounded-lg border p-3" style={CARD}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 font-medium text-[var(--text)]">
                      <span className="mr-2 text-xs tabular-nums text-[var(--text-dim)]">{i + 1}</span>
                      <Link href={`/countries/${c.slug}`} className="hover:text-[var(--accent)]">{c.name}</Link>
                    </span>
                    <span className="shrink-0 text-lg font-bold tabular-nums text-[var(--text)]">{pts(c.gap)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 text-xs tabular-nums text-[var(--text-muted)]">
                    <span>latent {(c.lat * 100).toFixed(1)}</span>
                    <span>recognised {(c.rec * 100).toFixed(1)}</span>
                    <span>power rank {c.rank ?? "—"}</span>
                  </div>
                </div>
              ))}
            />
          </div>
        </section>

        <section className="mt-10">
          <SectionHead
            title="Since 1816"
            sub="Every state that has held a top eight place, with its gap in every year it was ranked."
            more={<p>{data.meta.seriesNote}</p>}
          />
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {tracked.map((t) => (
              <div key={t.slug} className="rounded-lg border p-3 min-w-0 flex items-center justify-between gap-3" style={CARD}>
                <span className="min-w-0 font-medium text-[var(--text)] truncate">
                  <Link href={`/countries/${t.slug}`} className="hover:text-[var(--accent)]">{t.name}</Link>
                </span>
                <span className="flex items-center gap-3 shrink-0">
                  <Sparkline values={t.series.map((p) => p[1])} label={`${t.name} recognition gap since ${data.meta.seriesFrom}`} />
                  <span className="text-sm font-bold tabular-nums text-[var(--text)] w-12 text-right">{pts(t.now)}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-10 space-y-3">
          <Disclosure title="An open question, not a finding" meta="unresolved">
            <div className="space-y-3 text-sm text-[var(--text-muted)]">
              <p>{data.meta.openQuestion}</p>
              <p>
                The obvious thing to ask of this series is whether a wide gap comes before a war. The site holds 623 wars
                back to 1500 and could join them to this board tomorrow. It will not, yet, for three reasons: the war data
                records two sides but not who started it, there are no controls for how violent a given era was, and part
                of the recognised score is a curated status layer assigned with hindsight, which could be circular with
                war itself. Any of the three is enough to make a result look real when it is not.
              </p>
              <p>
                When those are resolved the answer goes on the{" "}
                <Link href="/predictions/scoreboard" className="underline hover:text-[var(--accent)]">Ledger</Link>, with a
                date, whichever way it comes out.
              </p>
            </div>
          </Disclosure>

          <Disclosure title="Sources" meta={`built ${data.built}`} desktopOpen={false}>
            <ul className="list-disc pl-5 space-y-1 text-sm text-[var(--text-muted)]">
              {data.meta.sources.map((s) => <li key={s}>{s}</li>)}
            </ul>
          </Disclosure>
        </div>
      </main>
    </>
  );
}
