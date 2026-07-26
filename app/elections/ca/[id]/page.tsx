import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  caElectionById,
  caNeighbours,
  caEraOf,
  caPartyColor,
  fmtInt,
  fmtPct,
} from "@/lib/caElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import SortableTable from "../../SortableTable";

export const dynamicParams = true;
export const revalidate = 604800; // elections are immutable history: prerender none, render + cache on demand (build cost)

export function generateStaticParams() {
  return []; // ISR: no build-time prerender; ids render on demand
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = caElectionById(id);
  if (!e) return {};
  const title = `${e.label} Canadian Federal Election`;
  const desc = e.summary;
  const path = `/elections/ca/${e.id}`;
  return {
    title,
    description: desc,
    alternates: { canonical: path },
    openGraph: { title: `${title} | ${SITE_NAME}`, description: desc, url: `${BASE_URL}${path}`, type: "article" },
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

export default async function CaElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = caElectionById(id);
  if (!e) notFound();
  const era = caEraOf(e.era);
  const { prev, next } = caNeighbours(e.id);
  const changed = !!(e.pmBefore && e.pmAfter && e.pmBefore.name !== e.pmAfter.name);
  const withSeats = e.parties.filter((p) => p.seats != null && p.seats > 0);
  const knownSeats = withSeats.reduce((s, p) => s + (p.seats ?? 0), 0);
  const rest = Math.max(0, e.totalSeats - knownSeats);
  const maxSeats = Math.max(...withSeats.map((p) => p.seats ?? 0), 1);
  const secondPlaceGov = !!(e.government && e.seatLeader && e.government.party !== e.seatLeader);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/elections" className="hover:underline">Elections</Link>
        {" / "}
        <Link href="/elections/ca" className="hover:underline">Canada</Link>
        {" / "}
        <span>{e.label}</span>
      </nav>

      <header className="mb-6">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-3xl font-bold text-[var(--text)]">{e.label} Canadian Federal Election</h1>
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
              <Link href={`/elections/ca#era-${e.era}`} className="hover:text-[var(--accent)]">
                {era.label}
              </Link>
            </>
          ) : null}
          {" · "}
          {e.totalSeats} seats
          {e.majoritySeats ? `, ${e.majoritySeats} for a majority` : ""}
        </p>
        <p className="text-[var(--text-muted)] max-w-3xl mt-3">{e.summary}</p>
      </header>

      {/* result strip */}
      <div className="mb-6">
        <div className="flex h-4 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
          {withSeats.map((p, i) => (
            <div
              key={`${p.name}-${i}`}
              style={{ width: `${((p.seats ?? 0) / e.totalSeats) * 100}%`, backgroundColor: caPartyColor(p.name), marginRight: i < withSeats.length - 1 || rest > 0 ? 2 : 0 }}
              title={`${p.name}: ${p.seats} seats`}
            />
          ))}
          {rest > 0 ? <div style={{ width: `${(rest / e.totalSeats) * 100}%`, backgroundColor: "#3a3a4a" }} title={`Others / not listed: ${rest} seats`} /> : null}
        </div>
        {e.majoritySeats ? (
          <div className="relative h-2">
            <div className="absolute top-0 h-2 w-px bg-[var(--text-dim)]" style={{ left: `${(e.majoritySeats / e.totalSeats) * 100}%` }} title={`${e.majoritySeats} seats for a majority`} />
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <Fact
          label="Prime Minister before"
          value={e.pmBefore ? e.pmBefore.name : "—"}
          sub={e.pmBefore ? e.pmBefore.party : undefined}
        />
        <Fact
          label={changed ? "Prime Minister after" : "Prime Minister (continued)"}
          value={e.pmAfter ? e.pmAfter.name : "—"}
          sub={e.pmAfter ? e.pmAfter.party : undefined}
        />
        <Fact
          label="Government formed"
          value={e.government ? e.government.party : e.pmAfter ? e.pmAfter.party : "—"}
          sub={e.government ? `${e.government.type} government` : undefined}
        />
        <Fact label="Turnout" value={fmtPct(e.turnout)} />
      </div>

      {secondPlaceGov ? (
        <p className="text-sm text-[var(--text-muted)] mb-8 max-w-3xl rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
          Note: the {e.seatLeader} party won the most seats, but {e.government!.pm} formed the government —
          under Westminster convention the incumbent Prime Minister may meet the House and govern with its
          confidence, whatever the seat count.
        </p>
      ) : null}

      {/* parties table */}
      <section className="mb-8">
        <h2 className="text-xl font-bold mb-3 text-[var(--text)]">The result</h2>
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
          <SortableTable
            tableClassName="w-full text-sm"
            headClassName="text-left text-[10px] uppercase tracking-wider text-[var(--text-dim)]"
            cols={[
              { key: "party", label: "Party", className: "px-3 py-2" },
              { key: "leader", label: "Leader", className: "px-3 py-2" },
              { key: "seats", label: "Seats", className: "px-3 py-2 text-right" },
              { key: "change", label: "±", className: "px-3 py-2 text-right" },
              { key: "bar", label: "Share of House", className: "px-3 py-2 w-1/5", sortable: false },
              { key: "votes", label: "Votes", className: "px-3 py-2 text-right" },
              { key: "share", label: "Vote share", className: "px-3 py-2 text-right" },
              { key: "swing", label: "Swing", className: "px-3 py-2 text-right" },
            ]}
            rows={e.parties.map((p, i) => ({
              key: `${p.name}-${i}`,
              sort: { party: p.name, leader: p.leader, seats: p.seats, change: p.seatChange ?? null, votes: p.votes, share: p.share, swing: p.swing },
              cells: (
                <>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle" style={{ backgroundColor: caPartyColor(p.name) }} />
                    <span className="font-semibold text-[var(--text)]">{p.name}</span>
                  </td>
                  <td className="px-3 py-2 text-[var(--text-muted)]">{p.leader ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--text)]">{p.seats != null ? p.seats : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">
                    {p.seatChange == null ? "—" : `${p.seatChange > 0 ? "+" : ""}${Math.round(p.seatChange)}`}
                  </td>
                  <td className="px-3 py-2">
                    {p.seats != null ? (
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--border)" }}>
                        <div className="h-full rounded-full" style={{ width: `${(p.seats / maxSeats) * 100}%`, backgroundColor: caPartyColor(p.name) }} />
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">{fmtInt(p.votes)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">{fmtPct(p.share)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">
                    {p.swing == null ? "—" : `${p.swing > 0 ? "+" : ""}${p.swing.toFixed(1)}`}
                  </td>
                </>
              ),
            }))}
          />
        </div>
        {rest > 0 ? (
          <p className="text-xs text-[var(--text-dim)] mt-2">
            {rest} further {rest === 1 ? "seat" : "seats"} went to parties and independents outside the main
            contenders listed above.
          </p>
        ) : null}
        {e.year <= 1874 ? (
          <p className="text-xs text-[var(--text-dim)] mt-2">
            Elections before 1874 were held over several weeks of open (non-secret) voting, and many seats
            went uncontested, so vote totals understate real support.
          </p>
        ) : null}
      </section>

      {/* province & territory results */}
      {e.provinces ? (
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-1 text-[var(--text)]">The result by province &amp; territory</h2>
          <p className="text-sm text-[var(--text-muted)] mb-4 max-w-3xl">
            Seats won and vote share in each province and territory. Blank cells mean the party did not
            contest the province; the results table splits allied labels (Liberal-Conservatives, farmers&apos;
            candidates, independents) that the headline figures group together.
          </p>
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
            <SortableTable
              tableClassName="w-full text-xs"
              headClassName="text-left text-[10px] uppercase tracking-wider text-[var(--text-dim)]"
              rowClassName="border-t align-top"
              cols={[
                { key: "party", label: "Party", className: "px-2 py-1.5 sticky left-0" },
                ...e.provinces.codes.map((c) => ({ key: `p-${c}`, label: c, className: "px-2 py-1.5 text-right" })),
                { key: "total", label: "Total", className: "px-2 py-1.5 text-right" },
              ]}
              rows={e.provinces.parties.map((p) => ({
                key: p.name,
                sort: {
                  party: p.name,
                  ...Object.fromEntries(e.provinces!.codes.map((c, i) => [`p-${c}`, p.seats[i] ?? p.votes[i] ?? null])),
                  total: p.totalSeats ?? p.totalVote ?? null,
                },
                cells: (
                  <>
                    <td className="px-2 py-1.5 whitespace-nowrap sticky left-0" style={{ backgroundColor: "var(--bg-card)" }}>
                      <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ backgroundColor: caPartyColor(p.name) }} />
                      <span className="font-semibold text-[var(--text)]">{p.name}</span>
                    </td>
                    {e.provinces!.codes.map((c, i) => (
                      <td key={c} className="px-2 py-1.5 text-right tabular-nums">
                        <span className={p.seats[i] ? "font-semibold text-[var(--text)]" : "text-[var(--text-dim)]"}>
                          {p.seats[i] != null ? p.seats[i] : p.votes[i] != null ? 0 : ""}
                        </span>
                        <span className="block text-[10px] text-[var(--text-dim)]">
                          {p.votes[i] != null ? (p.votes[i] === 0 ? "<0.1%" : `${p.votes[i]!.toFixed(1)}%`) : ""}
                        </span>
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      <span className="font-semibold text-[var(--text)]">{p.totalSeats ?? "—"}</span>
                      <span className="block text-[10px] text-[var(--text-dim)]">
                        {p.totalVote != null ? `${p.totalVote.toFixed(1)}%` : ""}
                      </span>
                    </td>
                  </>
                ),
              }))}
              footer={e.provinces.seatTotals ? (
                <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-2 py-1.5 font-semibold text-[var(--text)] sticky left-0" style={{ backgroundColor: "var(--bg-card)" }}>
                    Total seats
                  </td>
                  {e.provinces.seatTotals.map((v, i) => (
                    <td key={e.provinces!.codes[i]} className="px-2 py-1.5 text-right tabular-nums font-semibold text-[var(--text)]">{v}</td>
                  ))}
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-[var(--text)]">{e.provinces.totalSeats}</td>
                </tr>
              ) : undefined}
            />
          </div>
        </section>
      ) : null}

      {/* prev / next */}
      <nav className="flex justify-between gap-3 border-t pt-4 text-sm" style={{ borderColor: "var(--border)" }}>
        {prev ? (
          <Link href={`/elections/ca/${prev.id}`} className="text-[var(--accent)] hover:underline">
            ← {prev.label}
          </Link>
        ) : <span />}
        <Link href="/elections/ca" className="text-[var(--text-muted)] hover:text-[var(--accent)]">
          All elections
        </Link>
        {next ? (
          <Link href={`/elections/ca/${next.id}`} className="text-[var(--accent)] hover:underline">
            {next.label} →
          </Link>
        ) : <span />}
      </nav>
    </main>
  );
}
