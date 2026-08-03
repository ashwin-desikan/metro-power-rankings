import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getUkElectionTrends,
  getUkConstituencies,
  UK_FAMILY_COLORS,
  electionById,
  neighbours,
  eraOf,
  partyColor,
  fmtInt,
  fmtPct,
} from "@/lib/ukElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import ConstituencyExplorer from "./ConstituencyExplorer";
import SortableTable from "../../SortableTable";

export const dynamicParams = true;
export const revalidate = 604800; // elections are immutable history: prerender none, render + cache on demand (build cost)

export function generateStaticParams() {
  return []; // ISR: no build-time prerender; ids render on demand
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = electionById(id);
  if (!e) return {};
  const title = `${e.label} UK General Election`;
  const desc = e.summary;
  const path = `/elections/uk/${e.id}`;
  return {
    title,
    description: desc,
    alternates: { canonical: path },
    openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${title} | ${SITE_NAME}`, description: desc, url: `${BASE_URL}${path}`, type: "article" },
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

export default async function UkElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = electionById(id);
  if (!e) notFound();
  const era = eraOf(e.era);
  const { prev, next } = neighbours(e.id);
  const nations = getUkElectionTrends().turnout.find((t) => t.id === e.id) ?? null;
  const constituencies = getUkConstituencies(e.id);
  const changed = !!(e.pmBefore && e.pmAfter && e.pmBefore.name !== e.pmAfter.name);
  const withSeats = e.parties.filter((p) => p.seats != null && p.seats > 0);
  const knownSeats = withSeats.reduce((s, p) => s + (p.seats ?? 0), 0);
  const rest = Math.max(0, e.totalSeats - knownSeats);
  const maxSeats = Math.max(...withSeats.map((p) => p.seats ?? 0), 1);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/elections" className="hover:underline">Elections</Link>
        {" / "}
        <Link href="/elections/uk" className="hover:underline">United Kingdom</Link>
        {" / "}
        <span>{e.label}</span>
      </nav>

      <header className="mb-6">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-3xl font-bold text-[var(--text)]">{e.label} General Election</h1>
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
              <Link href={`/elections/uk#era-${e.era}`} className="hover:text-[var(--accent)]">
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
              style={{ width: `${((p.seats ?? 0) / e.totalSeats) * 100}%`, backgroundColor: partyColor(p.name), marginRight: i < withSeats.length - 1 || rest > 0 ? 2 : 0 }}
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
          sub={
            e.government && e.government.majority != null
              ? `majority of ${e.government.majority}`
              : e.government
                ? "no overall majority"
                : undefined
          }
        />
        <Fact
          label="Turnout"
          value={fmtPct(e.turnout)}
          sub={e.electorate ? `electorate ${fmtInt(e.electorate)}` : undefined}
        />
      </div>

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
              { key: "bar", label: "Share of Commons", className: "px-3 py-2 w-1/4", sortable: false },
              { key: "votes", label: "Votes", className: "px-3 py-2 text-right" },
              { key: "share", label: "Vote share", className: "px-3 py-2 text-right" },
              { key: "swing", label: "Swing", className: "px-3 py-2 text-right" },
            ]}
            rows={e.parties.map((p, i) => ({
              key: `${p.name}-${i}`,
              sort: { party: p.name, leader: p.leader, seats: p.seats, votes: p.votes, share: p.share, swing: p.swing },
              cells: (
                <>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle" style={{ backgroundColor: partyColor(p.name) }} />
                    <span className="font-semibold text-[var(--text)]">{p.name}</span>
                  </td>
                  <td className="px-3 py-2 text-[var(--text-muted)]">{p.leader ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--text)]">{p.seats != null ? p.seats : "—"}</td>
                  <td className="px-3 py-2">
                    {p.seats != null ? (
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--border)" }}>
                        <div className="h-full rounded-full" style={{ width: `${(p.seats / maxSeats) * 100}%`, backgroundColor: partyColor(p.name) }} />
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
        {e.year < 1918 ? (
          <p className="text-xs text-[var(--text-dim)] mt-2">
            Before 1918, party labels were looser and many seats went uncontested, so vote totals and shares
            understate real support. Seat counts are the reliable measure.
          </p>
        ) : null}
        {rest > 0 && e.year >= 1918 ? (
          <p className="text-xs text-[var(--text-dim)] mt-2">
            {rest} further {rest === 1 ? "seat" : "seats"} went to parties and independents outside the main
            contenders listed above.
          </p>
        ) : null}
      </section>

      {/* turnout by nation + note */}
      {nations && (nations.england != null || nations.scotland != null) ? (
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3 text-[var(--text)]">Turnout by nation</h2>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
            {(
              [
                ["England", nations.england],
                ["Wales", nations.wales],
                ["Scotland", nations.scotland],
                ["N. Ireland", nations.ni],
                ["United Kingdom", nations.uk],
              ] as const
            ).map(([n, v]) => (
              <Fact key={n} label={n} value={fmtPct(v)} />
            ))}
          </div>
        </section>
      ) : null}

      {e.government && e.government.note ? (
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-2 text-[var(--text)]">The government it made</h2>
          <p className="text-sm text-[var(--text-muted)] max-w-3xl">{e.government.note}</p>
        </section>
      ) : null}

      {/* constituency results (1918+) */}
      {constituencies ? (
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-1 text-[var(--text)]">The result by constituency</h2>
          <p className="text-sm text-[var(--text-muted)] mb-4 max-w-3xl">
            All {constituencies.n} constituencies on the {constituencies.boundarySet} boundaries, from the
            House of Commons Library dataset. Search, filter by country or region, and click any column
            heading to sort.
            {constituencies.unopposed > 0
              ? ` ${constituencies.unopposed} ${constituencies.unopposed === 1 ? "seat was" : "seats were"} returned unopposed, with no poll held.`
              : ""}
          </p>

          {/* superlatives */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-5">
            {constituencies.superlatives.highestTurnout ? (
              <Fact
                label="Highest turnout"
                value={fmtPct(constituencies.superlatives.highestTurnout.value)}
                sub={`${constituencies.superlatives.highestTurnout.name}, ${constituencies.superlatives.highestTurnout.region}`}
              />
            ) : null}
            {constituencies.superlatives.lowestTurnout ? (
              <Fact
                label="Lowest turnout"
                value={fmtPct(constituencies.superlatives.lowestTurnout.value)}
                sub={`${constituencies.superlatives.lowestTurnout.name}, ${constituencies.superlatives.lowestTurnout.region}`}
              />
            ) : null}
            {constituencies.superlatives.biggestWin ? (
              <Fact
                label="Biggest single-party share"
                value={fmtPct(constituencies.superlatives.biggestWin.value)}
                sub={`${constituencies.labels[constituencies.superlatives.biggestWin.family]}, ${constituencies.superlatives.biggestWin.name}`}
              />
            ) : null}
            {constituencies.superlatives.closest ? (
              <Fact
                label="Tightest main-family margin"
                value={`${constituencies.superlatives.closest.value.toFixed(1)} pts`}
                sub={`${constituencies.superlatives.closest.name}, ${constituencies.superlatives.closest.region}`}
              />
            ) : null}
          </div>

          {/* regional table */}
          <div className="overflow-x-auto rounded-xl border mb-5" style={{ borderColor: "var(--border)" }}>
            <SortableTable
              tableClassName="w-full text-xs"
              headClassName="text-left text-[10px] uppercase tracking-wider text-[var(--text-dim)]"
              cols={[
                { key: "region", label: "Country / region", className: "px-2 py-1.5" },
                { key: "n", label: "Seats", className: "px-2 py-1.5 text-right" },
                ...constituencies.families.map((f) => ({ key: `f-${f}`, label: constituencies.labels[f], className: "px-2 py-1.5 text-right" })),
                { key: "turnout", label: "Turnout", className: "px-2 py-1.5 text-right" },
                { key: "led", label: "Most votes, by seat", className: "px-2 py-1.5", sortable: false },
              ]}
              rows={constituencies.regions.map((g) => ({
                key: g.name,
                sort: {
                  region: g.name,
                  n: g.n,
                  ...Object.fromEntries(constituencies.families.map((f) => [`f-${f}`, g.shares[f] ?? null])),
                  turnout: g.turnout,
                },
                cells: (
                  <>
                    <td className="px-2 py-1.5 font-semibold text-[var(--text)] whitespace-nowrap">{g.name}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-[var(--text-muted)]">{g.n}</td>
                    {constituencies.families.map((f) => (
                      <td key={f} className="px-2 py-1.5 text-right tabular-nums text-[var(--text-muted)]">
                        {g.shares[f] != null && (g.shares[f] as number) > 0 ? fmtPct(g.shares[f]) : "—"}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right tabular-nums text-[var(--text-muted)]">{g.turnout != null ? fmtPct(g.turnout) : "—"}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {constituencies.families
                        .filter((f) => g.led[f] > 0)
                        .map((f) => (
                          <span key={f} className="mr-2 tabular-nums">
                            <span className="inline-block w-2 h-2 rounded-full mr-1 align-middle" style={{ backgroundColor: UK_FAMILY_COLORS[f] }} />
                            <span className="text-[var(--text-muted)]">{g.led[f]}</span>
                          </span>
                        ))}
                    </td>
                  </>
                ),
              }))}
            />
          </div>

          <ConstituencyExplorer
            rows={constituencies.rows}
            families={constituencies.families}
            labels={constituencies.labels}
            colors={UK_FAMILY_COLORS}
          />

          <p className="text-xs text-[var(--text-dim)] mt-3 max-w-3xl">
            The dataset groups candidates into five party families: Conservative (including Ulster
            Unionists before February 1974), the Liberal family (Liberal, SDP–Liberal Alliance, Liberal
            Democrats), Labour, SNP and Plaid Cymru, and all others combined. &ldquo;Most votes&rdquo;
            marks the family with the largest vote in each constituency, not necessarily the seat&apos;s
            winner: the Other column aggregates many parties
            {e.year <= 1950 ? ", and some constituencies elected two or three members in this period" : ""}.
          </p>
        </section>
      ) : null}

      {/* prev / next */}
      <nav className="flex justify-between gap-3 border-t pt-4 text-sm" style={{ borderColor: "var(--border)" }}>
        {prev ? (
          <Link href={`/elections/uk/${prev.id}`} className="text-[var(--accent)] hover:underline">
            ← {prev.label}
          </Link>
        ) : <span />}
        <Link href="/elections/uk" className="text-[var(--text-muted)] hover:text-[var(--accent)]">
          All elections
        </Link>
        {next ? (
          <Link href={`/elections/uk/${next.id}`} className="text-[var(--accent)] hover:underline">
            {next.label} →
          </Link>
        ) : <span />}
      </nav>
    </main>
  );
}
