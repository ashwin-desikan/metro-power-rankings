import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  frElectionById,
  frLegNeighbours,
  frPresNeighbours,
  frLegEraOf,
  frPresEraOf,
  frPartyColor,
  frFmtInt,
  frFmtPct,
  type FrPresElection,
} from "@/lib/frElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LegElectionDetail from "../../LegDetailShared";
import SortableTable from "../../SortableTable";
import { DetailPager } from "../../HubShared";

export const dynamicParams = true;
export const revalidate = 604800; // elections are immutable history: prerender none, render + cache on demand (build cost)

export function generateStaticParams() {
  return []; // ISR: no build-time prerender; ids render on demand
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = frElectionById(id);
  if (!e) return {};
  const title = e.kind === "presidential" ? `${e.label} French Presidential Election` : `${e.label} French Legislative Election`;
  const path = `/elections/fr/${e.id}`;
  return {
    title,
    description: e.summary,
    alternates: { canonical: path },
    openGraph: { title: `${title} | ${SITE_NAME}`, description: e.summary, url: `${BASE_URL}${path}`, type: "article" },
  };
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
      <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">{label}</p>
      <p className="text-lg font-bold text-[var(--text)]">{value}</p>
      {sub ? <p className="text-xs text-[var(--text-muted)] mt-0.5">{sub}</p> : null}
    </div>
  );
}

function PresDetail({ e }: { e: FrPresElection }) {
  const era = frPresEraOf(e.era);
  const { prev, next } = frPresNeighbours(e.id);
  const twoRounds = e.candidates.some((c) => c.r2Share != null);
  const byR2 = e.candidates.filter((c) => c.r2Share != null).sort((a, b) => (b.r2Share ?? 0) - (a.r2Share ?? 0));
  const byR1 = e.candidates.filter((c) => c.r1Share != null).sort((a, b) => (b.r1Share ?? 0) - (a.r1Share ?? 0));
  const winner = byR2[0] ?? byR1[0] ?? null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/elections" className="hover:underline">Elections</Link>
        {" / "}
        <Link href="/elections/fr" className="hover:underline">France</Link>
        {" / "}
        <span>{e.label} presidential</span>
      </nav>

      <DetailPager hubHref="/elections/fr" hubName="France" prev={prev} next={next} suffix="presidential" />

      <header className="mb-6">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-3xl font-bold text-[var(--text)]">{e.label} French Presidential Election</h1>
          {e.knownAs ? (
            <span className="text-[10px] uppercase tracking-wider rounded-full border px-2 py-1 text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
              {e.knownAs}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-[var(--text-dim)] mt-1">
          {e.date}
          {era ? (
            <>
              {" · "}
              <Link href={`/elections/fr#pres-era-${era.key}`} className="hover:text-[var(--accent)]">{era.label}</Link>
            </>
          ) : null}
          {e.year === 1958 ? " · chosen by an electoral college" : " · direct two-round vote"}
        </p>
        <p className="text-[var(--text-muted)] max-w-3xl mt-3">{e.summary}</p>
      </header>

      {/* runoff strip */}
      {twoRounds && byR2.length >= 2 && byR2[0].r2Share != null && byR2[1].r2Share != null ? (
        <div className="mb-6">
          <div className="flex h-4 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
            <div style={{ width: `${byR2[0].r2Share}%`, backgroundColor: frPartyColor(byR2[0].party), marginRight: 2 }} title={`${byR2[0].name}: ${frFmtPct(byR2[0].r2Share)}`} />
            <div style={{ width: `${byR2[1].r2Share}%`, backgroundColor: frPartyColor(byR2[1].party) }} title={`${byR2[1].name}: ${frFmtPct(byR2[1].r2Share)}`} />
          </div>
          <div className="relative h-2">
            <div className="absolute top-0 h-2 w-px bg-[var(--text-dim)]" style={{ left: "50%" }} title="50%" />
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <Fact label="President before" value={e.presBefore ? e.presBefore.name : "—"} sub={e.presBefore?.party ?? undefined} />
        <Fact
          label={e.presBefore && e.presAfter && e.presBefore.name === e.presAfter.name ? "President (re-elected)" : "Elected President"}
          value={e.presAfter ? e.presAfter.name : "—"}
          sub={e.presAfter?.party ?? undefined}
        />
        <Fact
          label="Winning share"
          value={winner ? frFmtPct(winner.r2Share ?? winner.r1Share) : "—"}
          sub={winner ? (winner.r2Share != null ? "second round" : "first round") : undefined}
        />
        <Fact
          label="Turnout"
          value={frFmtPct(e.turnout)}
          sub={e.turnout2 != null ? `second round ${frFmtPct(e.turnout2)}` : undefined}
        />
      </div>

      {/* candidates table */}
      {e.candidates.length > 0 ? (
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3 text-[var(--text)]">The result</h2>
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
            <SortableTable
              tableClassName="w-full text-sm"
              headClassName="text-left text-[10px] uppercase tracking-wider text-[var(--text-dim)]"
              cols={[
                { key: "candidate", label: "Candidate", className: "px-3 py-2" },
                { key: "party", label: "Party", className: "px-3 py-2" },
                { key: "r1v", label: twoRounds ? "First-round votes" : "Votes", className: "px-3 py-2 text-right" },
                { key: "r1s", label: twoRounds ? "First round" : "Share", className: "px-3 py-2 text-right" },
                ...(twoRounds
                  ? [
                      { key: "r2v", label: "Second-round votes", className: "px-3 py-2 text-right" },
                      { key: "r2s", label: "Second round", className: "px-3 py-2 text-right" },
                    ]
                  : []),
              ]}
              rows={e.candidates.map((c, i) => ({
                key: `${c.name}-${i}`,
                sort: { candidate: c.name, party: c.party, r1v: c.r1Votes, r1s: c.r1Share, r2v: c.r2Votes, r2s: c.r2Share },
                cells: (
                  <>
                    <td className="px-3 py-2 whitespace-nowrap font-semibold text-[var(--text)]">
                      <span className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle" style={{ backgroundColor: frPartyColor(c.party) }} />
                      {c.name}
                    </td>
                    <td className="px-3 py-2 text-[var(--text-muted)]">{c.party ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">{frFmtInt(c.r1Votes)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--text)]">{frFmtPct(c.r1Share, 2)}</td>
                    {twoRounds ? (
                      <>
                        <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">{frFmtInt(c.r2Votes)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--text)]">
                          {c.r2Share != null ? frFmtPct(c.r2Share, 2) : "—"}
                        </td>
                      </>
                    ) : null}
                  </>
                ),
              }))}
            />
          </div>
          {e.year === 1958 ? (
            <p className="text-xs text-[var(--text-dim)] mt-2">
              The 1958 president was chosen by an electoral college of some 80,000 parliamentarians and
              local notables, not by direct vote; percentages are shares of the college.
            </p>
          ) : null}
        </section>
      ) : null}

      {/* prev / next */}
      <nav className="flex justify-between gap-3 border-t pt-4 text-sm" style={{ borderColor: "var(--border)" }}>
        {prev ? (
          <Link href={`/elections/fr/${prev.id}`} className="text-[var(--accent)] hover:underline">
            ← {prev.label} presidential
          </Link>
        ) : <span />}
        <Link href="/elections/fr" className="text-[var(--text-muted)] hover:text-[var(--accent)]">
          All French elections
        </Link>
        {next ? (
          <Link href={`/elections/fr/${next.id}`} className="text-[var(--accent)] hover:underline">
            {next.label} presidential →
          </Link>
        ) : <span />}
      </nav>
    </main>
  );
}

export default async function FrElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = frElectionById(id);
  if (!e) notFound();
  if (e.kind === "presidential") {
    return <PresDetail e={e} />;
  }
  const { prev, next } = frLegNeighbours(e.id);
  return (
    <LegElectionDetail
      e={e}
      era={frLegEraOf(e.era)}
      prev={prev}
      next={next}
      cfg={{
        hubHref: "/elections/fr",
        hubName: "France",
        headingSuffix: "French Legislative Election",
        roleLabel: "Prime Minister",
        chamberFallback: "the chamber",
        colorOf: frPartyColor,
        fmtInt: frFmtInt,
        fmtPct: frFmtPct,
      }}
    />
  );
}
