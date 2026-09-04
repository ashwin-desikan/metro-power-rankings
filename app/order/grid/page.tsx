import type { Metadata } from "next";
import Link from "next/link";
import { DataBar, DivergingBar } from "@/app/_shared/DataBar";
import { CappedList, Disclosure } from "@/app/_shared/Disclosure";
import { SectionHead } from "@/app/_shared/SectionHead";
import { TableScroll } from "@/app/_shared/TableScroll";
import { cellMatrix, getOrderGrid, membersOf, type OrderCountry } from "@/lib/order";
import { AUTHOR, BASE_URL, PUBLISHER, SITE_NAME, serializeJsonLd } from "@/lib/seo";

const PATH = "/order/grid";
const TITLE = "The Order Grid";
const DESC =
  "Every state on two axes: force, the capacity to act, and integrity, the law that binds the ruler. Nine positions, and a tenth that stays empty because no state can hold it.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website", images: [{ url: "/og-default.png", width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC, images: ["/og-default.png"] },
};

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
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

function correlation(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

function CountryLink({ c }: { c: OrderCountry }) {
  return <Link href={`/countries/${c.slug}`} className="hover:text-[var(--accent)]">{c.name}</Link>;
}

export default function OrderGridPage() {
  const grid = getOrderGrid();
  const cov = grid.meta.coverage;
  const rows = grid.countries;
  const matrix = cellMatrix(grid);
  const vanguard = grid.meta.vanguard;
  const maxImbalance = Math.max(...rows.map((r) => Math.abs(r.imbalance)));
  const maxDistance = Math.max(...rows.map((r) => r.vanguardDistance));
  const r = correlation(rows.map((x) => x.force), rows.map((x) => x.integrity));
  const stretched = [...rows].sort((a, b) => b.imbalance - a.imbalance);
  const uk = rows.find((c) => c.slug === "united-kingdom");
  const ukDocs = uk?.constitutionDocs ?? null;
  const ukWords = uk?.constitutionWords ?? null;

  const ld = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: TITLE,
    description: DESC,
    url: `${BASE_URL}${PATH}`,
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: BASE_URL, publisher: PUBLISHER },
    author: AUTHOR,
    creator: PUBLISHER,
    temporalCoverage: String(grid.year),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(ld) }} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <nav className="mb-6 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={MONO}>
          <Link href="/order" className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">&larr; Order hub</Link>
          <Link href="/order/about" className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">What this is</Link>
          <Link href="/order/trajectory" className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">Direction of Travel</Link>
          <Link href="/order/recognition-gap" className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">The Recognition Gap &rarr;</Link>
        </nav>

        <h1 className="text-3xl sm:text-4xl font-extrabold text-[var(--text)]">{TITLE}</h1>
        <p className="mt-3 text-[var(--text-muted)] leading-relaxed max-w-3xl">
          A state needs the capacity to act and something above it that binds the ruler. Neither is worth much alone.
          This board places {cov.scored} of them on both at once, in {grid.year}, and keeps the corner empty.
        </p>

        <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile label="States placed" value={String(cov.scored)} hint={`${cov.unscored} without a rule of law reading`} />
          <StatTile label="Positions" value="9" hint="three bands on each axis" />
          <StatTile label="In the Vanguard" value={String(cov.vanguardCount)} hint="and there is no year in which it fills" />
          <StatTile label="Closest anything gets" value={String(cov.closestDistance ?? "—")} hint={`${cov.closestName}, on a scale where 0 is the corner`} />
        </div>

        <section className="mt-8 rounded-xl border p-6" style={{ ...CARD, borderLeftWidth: "4px", borderLeftColor: "var(--accent)" }}>
          <p className="text-[10px] uppercase tracking-widest mb-2" style={{ ...MONO, color: "var(--accent)" }}>The empty position</p>
          <h2 className="text-2xl font-bold mb-2">{vanguard.name}</h2>
          <p className="text-[15px] text-[var(--text-muted)] leading-relaxed max-w-3xl">{vanguard.blurb}</p>
          <p className="mt-3 text-[15px] text-[var(--text-muted)] leading-relaxed max-w-3xl">{vanguard.why}</p>
          <p className="mt-3 text-[15px] text-[var(--text-muted)] leading-relaxed max-w-3xl">
            The nearest any state gets is {cov.closestName} at {cov.closestDistance}, and it only gets there by holding
            roughly a third of the world&apos;s recognised power. The median state is {cov.medianDistance} away. Nothing
            here is a near miss.
          </p>
        </section>

        <section className="mt-10">
          <SectionHead
            title="The nine positions"
            sub="Read down for what binds a state, across for what it can do."
            more={
              <div className="space-y-2">
                <p>
                  Both axes are percentiles against contemporaries, not absolute scores, for the same reason the Power
                  Atlas ranks a state against its own era. Bands are thirds of each axis, so about a ninth of the field
                  would sit in each position if the two were unrelated. They are only weakly related, at {r.toFixed(2)},
                  which is why the corners are populated at all.
                </p>
                <p>
                  The top right band is called The Approach and not the Vanguard on purpose. The top third of a ranked
                  field is still the top third. Naming it the ideal would turn a description into a podium, and the
                  distance column is there to show how far from the ideal even the best-placed state sits.
                </p>
                <p>{grid.meta.notAMoralityRanking}</p>
              </div>
            }
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {matrix.flat().map((cell) => {
              const members = membersOf(grid, cell.key);
              return (
                <div key={cell.key} className="rounded-xl border p-4 min-w-0" style={CARD}>
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-bold text-[var(--text)]">{cell.name}</h3>
                    <span className="text-xs tabular-nums text-[var(--text-dim)]">{members.length}</span>
                  </div>
                  <p className="mt-1 text-[12px] text-[var(--text-muted)]">{cell.blurb}</p>
                  <p className="mt-2 text-[12px] text-[var(--text-muted)] leading-relaxed">
                    {members.slice(0, 4).map((m, i) => (
                      <span key={m.slug}>
                        {i > 0 ? ", " : ""}
                        <CountryLink c={m} />
                      </span>
                    ))}
                    {members.length > 4 ? <span className="text-[var(--text-dim)]"> and {members.length - 4} more</span> : null}
                  </p>
                </div>
              );
            })}
            <div className="rounded-xl border border-dashed p-4 min-w-0 sm:col-span-3" style={{ borderColor: "var(--accent)", backgroundColor: "transparent" }}>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-bold text-[var(--text)]">{vanguard.name}</h3>
                <span className="text-xs tabular-nums text-[var(--text-dim)]">{cov.vanguardCount}</span>
              </div>
              <p className="mt-1 text-[12px] text-[var(--text-muted)]">
                Off the grid, and not a tenth position to be promoted into. It is what the axes point at.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <SectionHead
            title="Capacity against constraint"
            sub="Positive means a state can do more than anything binding it, negative the reverse."
            more={
              <p>
                This is the column the three-legged argument is actually about. A high reading on both axes is less
                interesting than a wide gap between them, in either direction. The zero line is where a state&apos;s
                reach and its restraints sit at the same percentile.
              </p>
            }
          />
          <TableScroll className="mt-4 hidden sm:block rounded-xl border" style={CARD}>
            <table className="w-full text-sm" data-sticky-col={2}>
              <thead className="text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2 w-10">#</th>
                  <th className="px-3 py-2">Country</th>
                  <th className="px-3 py-2">Capacity over constraint</th>
                  <th className="px-3 py-2">Force</th>
                  <th className="px-3 py-2">Integrity</th>
                  <th className="px-3 py-2">From the Vanguard</th>
                  <th className="px-3 py-2">Position</th>
                </tr>
              </thead>
              <tbody>
                {stretched.map((c, i) => (
                  <tr key={c.slug} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-2.5 tabular-nums text-[var(--text-dim)]">{i + 1}</td>
                    <td className="px-3 py-2.5 font-medium"><CountryLink c={c} /></td>
                    <td className="px-3 py-2.5">
                      <DivergingBar v={c.imbalance} max={maxImbalance} dp={0} suffix="" label={`${c.name} capacity minus constraint`} />
                    </td>
                    <td className="px-3 py-2.5"><DataBar v={c.force} max={100} dp={0} width={80} label={`${c.name} force percentile`} /></td>
                    <td className="px-3 py-2.5"><DataBar v={c.integrity} max={100} dp={0} width={80} color="var(--seq-2)" label={`${c.name} integrity percentile`} /></td>
                    <td className="px-3 py-2.5 tabular-nums text-[var(--text-muted)]">{c.vanguardDistance.toFixed(1)}</td>
                    <td className="px-3 py-2.5 text-[var(--text-muted)]">{c.cellName}</td>
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
              items={stretched.map((c, i) => (
                <div key={c.slug} className="rounded-lg border p-3" style={CARD}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 font-medium text-[var(--text)]">
                      <span className="mr-2 text-xs tabular-nums text-[var(--text-dim)]">{i + 1}</span>
                      <CountryLink c={c} />
                    </span>
                    <span className="shrink-0 text-lg font-bold tabular-nums text-[var(--text)]">
                      {c.imbalance > 0 ? "+" : ""}{Math.round(c.imbalance)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 text-xs tabular-nums text-[var(--text-muted)]">
                    <span>force {Math.round(c.force)}</span>
                    <span>integrity {Math.round(c.integrity)}</span>
                    <span>{c.vanguardDistance.toFixed(0)} from the corner</span>
                    <span className="tracking-normal">{c.cellName}</span>
                  </div>
                </div>
              ))}
            />
          </div>
        </section>

        <section className="mt-10">
          <SectionHead
            title="Distance from the Vanguard"
            sub="Absolute, not ranked against the field: 0 is the corner and nothing comes near it."
            more={
              <p>{grid.meta.vanguardDistance}</p>
            }
          />
          <TableScroll className="mt-4 hidden sm:block rounded-xl border" style={CARD}>
            <table className="w-full text-sm" data-sticky-col={2}>
              <thead className="text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2">Country</th>
                  <th className="px-3 py-2">Distance</th>
                  <th className="px-3 py-2 text-right">Share of world power</th>
                  <th className="px-3 py-2 text-right">Rule of law</th>
                  <th className="px-3 py-2 text-right">Constitution</th>
                </tr>
              </thead>
              <tbody>
                {[...rows].sort((a, b) => a.vanguardDistance - b.vanguardDistance).slice(0, 30).map((c) => (
                  <tr key={c.slug} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-2.5 font-medium"><CountryLink c={c} /></td>
                    <td className="px-3 py-2.5">
                      <DataBar v={c.vanguardDistance} max={maxDistance} dp={1} width={130} color="var(--seq-3)" label={`${c.name} distance from the corner`} />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{(c.rec * 100).toFixed(1)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{c.ruleOfLaw == null ? "—" : c.ruleOfLaw.toFixed(3)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {c.constitutionForm === "uncodified"
                        ? <span className="text-[var(--text-muted)]">uncodified</span>
                        : c.constitutionAdopted ?? "—"}
                    </td>
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
              items={[...rows].sort((a, b) => a.vanguardDistance - b.vanguardDistance).slice(0, 30).map((c) => (
                <div key={c.slug} className="rounded-lg border p-3" style={CARD}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 font-medium text-[var(--text)]"><CountryLink c={c} /></span>
                    <span className="shrink-0 text-lg font-bold tabular-nums text-[var(--text)]">{c.vanguardDistance.toFixed(1)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 text-xs tabular-nums text-[var(--text-muted)]">
                    <span>{(c.rec * 100).toFixed(1)}% of world power</span>
                    <span>rule of law {c.ruleOfLaw == null ? "—" : c.ruleOfLaw.toFixed(3)}</span>
                  </div>
                </div>
              ))}
            />
          </div>
        </section>

        <div className="mt-10 space-y-3">
          <Disclosure title="This is not a ranking of good countries" meta="read this one">
            <div className="space-y-3 text-sm text-[var(--text-muted)]">
              <p>{grid.meta.notAMoralityRanking}</p>
              <p>
                Two things follow. A state near the top of the force axis is a state that can act, which is as true of
                the ones you admire as of the ones you do not. And a rule of law reading describes what the law is able
                to bind, not what the government of the day chooses to do inside it.
              </p>
              <p>
                The reading is also a single recent cross-section, so this board cannot yet show a country going
                backwards. A state whose institutions are eroding right now still shows the position its institutions
                had when they were last measured. That is the largest thing wrong with the board, and it is fixed by a
                time series rather than by an adjustment.
              </p>
            </div>
          </Disclosure>

          <Disclosure title="How the axes are built" meta={`built ${grid.built}`}>
            <div className="space-y-3 text-sm text-[var(--text-muted)]">
              <p><strong className="text-[var(--text)]">Force.</strong> {grid.meta.axes.force}</p>
              <p><strong className="text-[var(--text)]">Integrity.</strong> {grid.meta.axes.integrity}</p>
              <p><strong className="text-[var(--text)]">Distance.</strong> {grid.meta.vanguardDistance}</p>
              <p>
                Constitutional durability is the age of the constitution in force, on a log scale against the oldest
                still standing. {cov.durabilityFromAge} states are dated from the constitutional chronology, fifteen of
                them from curated adoption years the chronology cannot supply because their founding document predates
                the state system it is keyed to. Norway is the clearest case: the constitution dates from 1814, the entry
                in that system from 1905. Each curated year carries its own source and note.
              </p>
              <ul className="list-disc pl-5 space-y-1">
                {grid.meta.sources.map((s) => <li key={s}>{s}</li>)}
              </ul>
            </div>
          </Disclosure>

          <Disclosure title="Countries with no written constitution" meta={`${cov.durabilityUncodified} states`}>
            <div className="space-y-3 text-sm text-[var(--text-muted)]">
              <p>
                Two states here have no single founding document: the United Kingdom and New Zealand. That is a fact
                about them, not a gap in the data, and the board says so in the constitution column rather than leaving
                a blank.
              </p>
              <p>
                The United Kingdom&apos;s constitution is {ukDocs ?? "several"} separate documents and roughly{" "}
                {ukWords ? `${Math.round(ukWords / 1000)},000` : "280,000"} words, assembled over centuries, and the
                chronology records no replacement and no suspension of it since 1789. Durability here measures how long
                the arrangement in force has survived, so an order that has never been replaced scores level with the
                oldest written constitution, which is the United States at 236 years.
              </p>
              <p>
                That is worth stating plainly because it is the argument. A designed constitution and an accumulated one
                can reach the same place, and a board that could only see the designed kind would have missed half the
                evidence.
              </p>
            </div>
          </Disclosure>

          <Disclosure title="What this board is still missing" meta={`${grid.meta.pending.length} known gaps`}>
            <ul className="list-disc pl-5 space-y-1 text-sm text-[var(--text-muted)]">
              {grid.meta.pending.map((p) => <li key={p}>{p}</li>)}
              <li>
                A state that disputes its own reading is still reported as measured. China scores{" "}
                {rows.find((c) => c.slug === "china")?.ruleOfLaw?.toFixed(3) ?? "—"} on the rule of law index used here
                and argues that it holds those features in another form. The board reports the measure and names the
                dispute.
              </li>
            </ul>
          </Disclosure>

          <Disclosure title="States not on the grid" meta={`${cov.unscored} of ${cov.inPowerAtlas}`} desktopOpen={false}>
            <p className="text-sm text-[var(--text-muted)]">
              {grid.unscored.map((u) => u.name).join(", ")}. Each is in the Power Atlas but has no rule of law reading, so
              it has one axis and not the other.
            </p>
          </Disclosure>
        </div>
      </main>
    </>
  );
}
