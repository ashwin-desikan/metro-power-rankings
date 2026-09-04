import type { Metadata } from "next";
import Link from "next/link";
import { DataBar, DivergingBar } from "@/app/_shared/DataBar";
import { CappedList, Disclosure } from "@/app/_shared/Disclosure";
import { SectionHead } from "@/app/_shared/SectionHead";
import { TableScroll } from "@/app/_shared/TableScroll";
import { getTrajectory, type TrajectoryCountry } from "@/lib/order";
import { AUTHOR, BASE_URL, PUBLISHER, SITE_NAME, serializeJsonLd } from "@/lib/seo";

const PATH = "/order/trajectory";
const TITLE = "Direction of Travel";
const DESC =
  "Who is moving toward the ideal and who is moving away: flagged leadership since the 1930s, constitutional ruptures, turnout against each country's own post-war median, and a century of power.";

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

function CountryLink({ c }: { c: TrajectoryCountry }) {
  return <Link href={`/countries/${c.slug}`} className="hover:text-[var(--accent)]">{c.name}</Link>;
}

function spellLabel(s: { from: number; to: number | null; who: string[] }): string {
  const span = s.to === null ? `${s.from} to now` : s.from === s.to ? `${s.from}` : `${s.from} to ${s.to}`;
  return `${span}, ${s.who.join(", ")}`;
}

export default function TrajectoryPage() {
  const t = getTrajectory();
  const cov = t.meta.coverage;
  const rows = t.countries;
  const movers = rows.filter((c) => c.flags.newlyFlagged).sort((a, b) => (b.flags.flaggedSince ?? 0) - (a.flags.flaggedSince ?? 0));
  const record = rows.filter((c) => c.flags.spellCount > 0).sort((a, b) => b.flags.spellCount - a.flags.spellCount || b.flags.yearsFlaggedSince1900 - a.flags.yearsFlaggedSince1900);
  const drift = rows
    .filter((c) => c.accountability?.turnoutDelta != null)
    .sort((a, b) => (a.accountability!.turnoutDelta as number) - (b.accountability!.turnoutDelta as number));
  const maxSpells = Math.max(...record.map((c) => c.flags.spellCount));
  const maxYears = Math.max(...record.map((c) => c.flags.yearsFlaggedSince1900));
  const maxDrift = Math.max(...drift.map((c) => Math.abs(c.accountability!.turnoutDelta as number)));
  const flaggedTerms = record.reduce((n, c) => n + c.flags.spells.reduce((m, s) => m + s.who.length, 0), 0);

  const ld = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: TITLE,
    description: DESC,
    url: `${BASE_URL}${PATH}`,
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: BASE_URL, publisher: PUBLISHER },
    author: AUTHOR,
    creator: PUBLISHER,
    temporalCoverage: `${t.meta.windows.panelFrom}/${t.year}`,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(ld) }} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <nav className="mb-6 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={MONO}>
          <Link href="/order" className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">&larr; Order hub</Link>
          <Link href="/order/grid" className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">The Order Grid</Link>
          <Link href="/order/about" className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">What this is</Link>
        </nav>

        <h1 className="text-3xl sm:text-4xl font-extrabold text-[var(--text)]">{TITLE}</h1>
        <p className="mt-3 text-[var(--text-muted)] leading-relaxed max-w-3xl">
          Nothing reaches the corner, so where a country stands is the least interesting thing about it. Which way it is
          moving is the question. Six signals, reported separately, because they do not cover the same countries.
        </p>

        <div className="mt-6 rounded-xl border p-4" style={{ ...CARD, borderLeftWidth: "4px", borderLeftColor: "var(--cat-3)" }}>
          <p className="text-[10px] uppercase tracking-widest mb-1" style={{ ...MONO, color: "var(--text-dim)" }}>Read this before the boards</p>
          <p className="text-sm text-[var(--text-muted)] leading-relaxed">{t.meta.curatedFlagWarning}</p>
        </div>

        <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile label="Flagged terms" value={String(flaggedTerms)} hint={`since ${t.meta.windows.panelFrom}, across ${cov.withFlagHistory} countries`} />
          <StatTile label="Flagged today" value={String(cov.currentlyFlagged)} hint="of roughly two hundred states" />
          <StatTile label="Entered in the last decade" value={String(cov.newlyFlagged)} hint="the largest move on this signal" />
          <StatTile label="Ruptures in 25 years" value={String(cov.withRuptureInWindow)} hint="countries that replaced or lost an order" />
        </div>

        <section className="mt-10">
          <SectionHead
            title="The movers"
            sub="Countries that entered a flagged period within the last decade."
            more={
              <div className="space-y-2">
                <p>
                  Entering a spell is the largest single change available on this signal, and it is the one a static
                  board cannot see. A country flagged for forty years is not moving. A country flagged last year is.
                </p>
                <p>{t.meta.signals.flags}</p>
              </div>
            }
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {movers.map((c) => (
              <div key={c.slug} className="rounded-xl border p-4 min-w-0" style={{ ...CARD, borderLeftWidth: "3px", borderLeftColor: "var(--cat-3)" }}>
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-bold text-[var(--text)]"><CountryLink c={c} /></h3>
                  <span className="text-xs tabular-nums text-[var(--text-dim)]">since {c.flags.flaggedSince}</span>
                </div>
                <p className="mt-1 text-[12px] text-[var(--text-muted)]">
                  {c.cellName ? <>Sits in {c.cellName} on the grid. </> : null}
                  Spell {c.flags.spellCount} of its recorded history, {c.flags.yearsFlaggedSince1900} years flagged since {t.meta.windows.panelFrom}.
                </p>
                <ul className="mt-2 space-y-0.5 text-[12px] text-[var(--text-muted)]" style={MONO}>
                  {c.flags.spells.map((s) => (
                    <li key={`${s.from}-${s.to ?? "now"}`}>{spellLabel(s)}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <SectionHead
            title="The record"
            sub="How often a country has returned to flagged leadership, and for how long."
            more={
              <p>
                Consecutive terms merge into one spell, so a junta that ran through four men counts once. The column
                that matters is not the total but the recurrence: a country that keeps going back is telling you
                something a single episode does not.
              </p>
            }
          />
          <TableScroll className="mt-4 hidden sm:block rounded-xl border" style={CARD}>
            <table className="w-full text-sm" data-sticky-col={2}>
              <thead className="text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2 w-10">#</th>
                  <th className="px-3 py-2">Country</th>
                  <th className="px-3 py-2">Spells</th>
                  <th className="px-3 py-2">Years flagged</th>
                  <th className="px-3 py-2 text-right">Last ended</th>
                  <th className="px-3 py-2 hidden sm:table-cell">Position now</th>
                </tr>
              </thead>
              <tbody>
                {record.map((c, i) => (
                  <tr key={c.slug} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-2.5 tabular-nums text-[var(--text-dim)]">{i + 1}</td>
                    <td className="px-3 py-2.5 font-medium"><CountryLink c={c} /></td>
                    <td className="px-3 py-2.5"><DataBar v={c.flags.spellCount} max={maxSpells} dp={0} width={70} label={`${c.name} flagged spells`} /></td>
                    <td className="px-3 py-2.5"><DataBar v={c.flags.yearsFlaggedSince1900} max={maxYears} dp={0} suffix="y" width={100} color="var(--seq-3)" label={`${c.name} years flagged`} /></td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-muted)]">
                      {c.flags.currentlyFlagged ? "ongoing" : c.flags.yearsSinceLastFlagEnded == null ? "—" : `${c.flags.yearsSinceLastFlagEnded}y ago`}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--text-muted)] hidden sm:table-cell">{c.cellName ?? "—"}</td>
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
              items={record.map((c, i) => (
                <div key={c.slug} className="rounded-lg border p-3" style={CARD}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 font-medium text-[var(--text)]">
                      <span className="mr-2 text-xs tabular-nums text-[var(--text-dim)]">{i + 1}</span>
                      <CountryLink c={c} />
                    </span>
                    <span className="shrink-0 text-lg font-bold tabular-nums text-[var(--text)]">{c.flags.spellCount}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 text-xs tabular-nums text-[var(--text-muted)]">
                    <span>{c.flags.yearsFlaggedSince1900} years flagged</span>
                    <span>{c.flags.currentlyFlagged ? "ongoing" : c.flags.yearsSinceLastFlagEnded == null ? "—" : `last ended ${c.flags.yearsSinceLastFlagEnded}y ago`}</span>
                  </div>
                </div>
              ))}
            />
          </div>
        </section>

        <section className="mt-10">
          <SectionHead
            title="Turnout against a country's own history"
            sub="The last election measured against that country's own median since 1945, in points."
            more={
              <div className="space-y-2">
                <p>{t.meta.signals.accountability}</p>
                <p>
                  Comparing a country to itself rather than to the field is the point. A turnout of sixty per cent means
                  nothing in isolation and a great deal against a country that used to manage eighty five.
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
                  <th className="px-3 py-2">Against its own median</th>
                  <th className="px-3 py-2 text-right">Latest</th>
                  <th className="px-3 py-2 text-right">Median since 1945</th>
                </tr>
              </thead>
              <tbody>
                {drift.map((c, i) => (
                  <tr key={c.slug} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-2.5 tabular-nums text-[var(--text-dim)]">{i + 1}</td>
                    <td className="px-3 py-2.5 font-medium"><CountryLink c={c} /></td>
                    <td className="px-3 py-2.5">
                      <DivergingBar v={c.accountability!.turnoutDelta} max={maxDrift} dp={1} suffix="" label={`${c.name} turnout against its own median`} />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{c.accountability!.turnoutLatest?.toFixed(1) ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-muted)]">{c.accountability!.turnoutMedianPost1945?.toFixed(1) ?? "—"}</td>
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
              items={drift.map((c, i) => (
                <div key={c.slug} className="rounded-lg border p-3" style={CARD}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 font-medium text-[var(--text)]">
                      <span className="mr-2 text-xs tabular-nums text-[var(--text-dim)]">{i + 1}</span>
                      <CountryLink c={c} />
                    </span>
                    <span className="shrink-0 text-lg font-bold tabular-nums text-[var(--text)]">
                      {(c.accountability!.turnoutDelta as number) > 0 ? "+" : ""}{c.accountability!.turnoutDelta}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 text-xs tabular-nums text-[var(--text-muted)]">
                    <span>latest {c.accountability!.turnoutLatest?.toFixed(1) ?? "—"}</span>
                    <span>median {c.accountability!.turnoutMedianPost1945?.toFixed(1) ?? "—"}</span>
                  </div>
                </div>
              ))}
            />
          </div>
        </section>

        <div className="mt-10 space-y-3">
          <Disclosure title="Why there is no single direction score" meta="on purpose">
            <div className="space-y-3 text-sm text-[var(--text-muted)]">
              <p>{t.meta.noComposite}</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Flagged leadership: {cov.withFlagHistory} countries have a record, {cov.currentlyFlagged} are flagged now.</li>
                <li>Power trend: {cov.withForceTrend} countries.</li>
                <li>Turnout and proportionality: {cov.withAccountability} countries.</li>
                <li>Constitutional rupture in the last {t.meta.windows.stressWindow} years: {cov.withRuptureInWindow} countries.</li>
              </ul>
              <p>
                The signals also disagree with each other, and they are published disagreeing. A country can enter a
                flagged period, lose ground on power and raise its turnout in the same decade. Reconciling that into one
                decimal would be an opinion wearing a number.
              </p>
            </div>
          </Disclosure>

          <Disclosure title="What the flag means, and what it does not" meta="the criteria">
            <div className="space-y-3 text-sm text-[var(--text-muted)]">
              <p>
                A leader carries the warning glyph on this site when at least one of three written criteria is met:
                command or direct responsibility for grave crimes against civilians as found by a court or a UN inquiry;
                systemic subversion of the constitutional order from inside it; or a criminal conviction. Each flag
                carries the dated acts behind it.
              </p>
              <p>{t.meta.curatedFlagWarning}</p>
              <p>
                It is a judgement about recorded acts, not about a person&apos;s worth, and it is not a measure of a
                country. A flagged leader is one fact about a state among the several on this page.
              </p>
            </div>
          </Disclosure>

          <Disclosure title="Sources" meta={`built ${t.built}`} desktopOpen={false}>
            <ul className="list-disc pl-5 space-y-1 text-sm text-[var(--text-muted)]">
              {t.meta.sources.map((s) => <li key={s}>{s}</li>)}
            </ul>
          </Disclosure>
        </div>
      </main>
    </>
  );
}
