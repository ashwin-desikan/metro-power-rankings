import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  usElectionById,
  usNeighbours,
  usEraOf,
  congressAfter,
  getUsStateResults,
  statesCarried,
  usPartyColor,
  usFmtInt,
  usFmtPct,
} from "@/lib/usElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import SortableTable from "../../SortableTable";

export const dynamicParams = true;
export const revalidate = 604800; // elections are immutable history: prerender none, render + cache on demand (build cost)

export function generateStaticParams() {
  return []; // ISR: no build-time prerender; ids render on demand
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = usElectionById(id);
  if (!e) return {};
  const title = `${e.label} US Presidential Election`;
  const path = `/elections/us/${e.id}`;
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

export default async function UsElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = usElectionById(id);
  if (!e) notFound();
  const era = usEraOf(e.era);
  const { prev, next } = usNeighbours(e.id);
  const seated = congressAfter(e.year);
  const w = e.candidates.find((c) => c.name === e.winner.name) ?? e.candidates[0];
  const withEv = e.candidates.filter((c) => c.ev != null && c.ev > 0);
  const knownEv = withEv.reduce((s, c) => s + (c.ev ?? 0), 0);
  const rest = Math.max(0, e.evTotal - knownEv);
  const maxEv = Math.max(...withEv.map((c) => c.ev ?? 0), 1);
  const totalVotes = e.candidates.reduce((s, c) => s + (c.votes ?? 0), 0);
  const stateData = getUsStateResults(e.id);
  const carried = statesCarried(e.id);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/elections" className="hover:underline">Elections</Link>
        {" / "}
        <Link href="/elections/us" className="hover:underline">United States</Link>
        {" / "}
        <span>{e.label}</span>
      </nav>

      <header className="mb-6">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-3xl font-bold text-[var(--text)]">{e.label} Presidential Election</h1>
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
              <Link href={`/elections/us#era-${e.era}`} className="hover:text-[var(--accent)]">
                {era.label}
              </Link>
            </>
          ) : null}
          {" · "}
          {e.evTotal} electoral votes{e.majorityEv ? `, ${e.majorityEv} to win` : ""}
        </p>
        <p className="text-[var(--text-muted)] max-w-3xl mt-3">{e.summary}</p>
      </header>

      {/* EV strip with majority marker */}
      <div className="mb-6">
        <div className="flex h-4 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
          {withEv.map((c, i) => (
            <div
              key={`${c.name}-${i}`}
              style={{ width: `${((c.ev ?? 0) / e.evTotal) * 100}%`, backgroundColor: usPartyColor(c.party), marginRight: i < withEv.length - 1 || rest > 0 ? 2 : 0 }}
              title={`${c.name}: ${c.ev} electoral votes`}
            />
          ))}
          {rest > 0 ? <div style={{ width: `${(rest / e.evTotal) * 100}%`, backgroundColor: "#3a3a4a" }} title={`Not cast / scattered: ${rest}`} /> : null}
        </div>
        <div className="relative h-2">
          <div className="absolute top-0 h-2 w-px bg-[var(--text-dim)]" style={{ left: `${(e.majorityEv / e.evTotal) * 100}%` }} title={`${e.majorityEv} electoral votes for a majority`} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <Fact
          label={e.houseDecided ? "Elected by the House" : "Elected"}
          value={e.winner.name}
          sub={e.winner.party ?? undefined}
        />
        <Fact
          label="Electoral vote"
          value={w.ev != null ? `${w.ev} of ${e.evTotal}` : "—"}
          sub={e.inversion ? "won while losing the popular vote" : undefined}
        />
        <Fact
          label="Popular vote"
          value={w.share != null ? usFmtPct(w.share) : "—"}
          sub={w.votes != null ? `${usFmtInt(w.votes)} votes` : "not recorded"}
        />
        <Fact
          label="Turnout"
          value={usFmtPct(e.turnout)}
          sub={e.vepPct != null ? `VEP ${usFmtPct(e.vepPct)} · VAP ${usFmtPct(e.vapPct)}` : e.vapPct != null ? `VAP ${usFmtPct(e.vapPct)}` : undefined}
        />
      </div>

      {/* candidates table */}
      <section className="mb-8">
        <h2 className="text-xl font-bold mb-3 text-[var(--text)]">The result</h2>
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
          <SortableTable
            tableClassName="w-full text-sm"
            headClassName="text-left text-[10px] uppercase tracking-wider text-[var(--text-dim)]"
            cols={[
              { key: "candidate", label: "Candidate", className: "px-3 py-2" },
              { key: "party", label: "Party", className: "px-3 py-2" },
              { key: "mate", label: "Running mate", className: "px-3 py-2" },
              { key: "ev", label: "Electoral votes", className: "px-3 py-2 text-right" },
              { key: "evbar", label: "EV share", className: "px-3 py-2 w-1/5", sortable: false },
              { key: "votes", label: "Popular votes", className: "px-3 py-2 text-right" },
              { key: "share", label: "PV share", className: "px-3 py-2 text-right" },
              { key: "states", label: "States won", className: "px-3 py-2 text-right" },
            ]}
            rows={e.candidates.map((c, i) => ({
              key: `${c.name}-${i}`,
              sort: { candidate: c.name, party: c.party, mate: c.vp, ev: c.ev, votes: c.votes, share: c.share, states: carried[c.name] ?? null },
              cells: (
                <>
                  <td className="px-3 py-2 whitespace-nowrap font-semibold text-[var(--text)]">
                    <span className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle" style={{ backgroundColor: usPartyColor(c.party) }} />
                    {c.name}
                  </td>
                  <td className="px-3 py-2 text-[var(--text-muted)] whitespace-nowrap">{c.party ?? "—"}</td>
                  <td className="px-3 py-2 text-[var(--text-muted)]">{c.vp ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--text)]">{c.ev ?? "—"}</td>
                  <td className="px-3 py-2">
                    {c.ev != null && c.ev > 0 ? (
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--border)" }}>
                        <div className="h-full rounded-full" style={{ width: `${(c.ev / maxEv) * 100}%`, backgroundColor: usPartyColor(c.party) }} />
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">{usFmtInt(c.votes)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">{usFmtPct(c.share, 2)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">{carried[c.name] ?? "—"}</td>
                </>
              ),
            }))}
          />
        </div>
        {e.year <= 1820 ? (
          <p className="text-xs text-[var(--text-dim)] mt-2">
            Before 1824 most electors were chosen by state legislatures, so popular-vote figures cover only
            a handful of states{e.year <= 1800 ? ", and until the 12th Amendment each elector cast two votes, with the runner-up becoming vice president" : ""}.
          </p>
        ) : null}
        {totalVotes > 0 && e.year >= 1824 ? (
          <p className="text-xs text-[var(--text-dim)] mt-2">
            {usFmtInt(totalVotes)} votes recorded for the candidates listed.
          </p>
        ) : null}
      </section>

      {/* results by state */}
      {stateData && stateData.states.length > 0 ? (
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3 text-[var(--text)]">Results by state</h2>
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
            <SortableTable
              tableClassName="w-full text-xs"
              headClassName="text-left text-[10px] uppercase tracking-wider text-[var(--text-dim)]"
              cols={[
                { key: "state", label: "State", className: "px-3 py-2" },
                { key: "carried", label: "Carried by", className: "px-3 py-2" },
                { key: "share", label: "Share", className: "px-3 py-2 text-right" },
                { key: "ev", label: "Electoral votes", className: "px-3 py-2 text-right" },
                { key: "runnerUp", label: "Runner-up", className: "px-3 py-2" },
              ]}
              rows={stateData.states.map((s) => {
                const idxs = stateData.candidates.map((_, i) => i);
                const byEv = idxs.slice().sort((a, b) => (s.r[b]?.[0] ?? 0) - (s.r[a]?.[0] ?? 0) || (s.r[b]?.[1] ?? 0) - (s.r[a]?.[1] ?? 0));
                const wi = byEv[0];
                const w = stateData.candidates[wi];
                const wr = s.r[wi] ?? [0, null, null];
                const byVotes = idxs.filter((i) => i !== wi && s.r[i]?.[1] != null).sort((a, b) => (s.r[b]?.[1] ?? 0) - (s.r[a]?.[1] ?? 0));
                const ru = byVotes[0] != null ? stateData.candidates[byVotes[0]] : null;
                const rr = byVotes[0] != null ? s.r[byVotes[0]] : null;
                const splits = idxs.filter((i) => (s.r[i]?.[0] ?? 0) > 0);
                const evTotal = splits.reduce((n, i) => n + (s.r[i]?.[0] ?? 0), 0);
                const evLabel = splits.length > 1
                  ? splits.map((i) => `${s.r[i]?.[0]} ${stateData.candidates[i].name.split(" ").slice(-1)[0]}`).join(" · ")
                  : (wr[0] ?? 0) > 0 ? String(wr[0]) : "—";
                return {
                  key: s.state,
                  sort: { state: s.state, carried: w.name, share: wr[2] ?? null, ev: evTotal || null, runnerUp: ru?.name ?? null },
                  cells: (
                    <>
                      <td className="px-3 py-1.5 font-semibold text-[var(--text)] whitespace-nowrap">{s.state}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ backgroundColor: usPartyColor(w.party) }} />
                        <span className="text-[var(--text)]">{w.name}</span>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text-muted)]">{wr[2] != null ? usFmtPct(wr[2]) : "—"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text-muted)]">{evLabel}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap text-[var(--text-muted)]">
                        {ru && rr ? <>{ru.name}{rr[2] != null ? ` · ${usFmtPct(rr[2])}` : ""}</> : "—"}
                      </td>
                    </>
                  ),
                };
              })}
            />
          </div>
          {stateData.reconciliation && stateData.reconciliation.length > 0 ? (
            <p className="text-xs text-[var(--text-dim)] mt-2">
              The state table accounts for{" "}
              {stateData.reconciliation.map((r, i) => (
                <span key={r.name}>
                  {i > 0 ? "; " : ""}{r.tableEv} of {r.name}&apos;s {r.officialEv} official electoral votes
                </span>
              ))}
              . The remainder reflect split delegations, district allocations, faithless electors or votes
              not counted, as recorded at the electoral count.
            </p>
          ) : null}
          {e.year <= 1824 ? (
            <p className="text-xs text-[var(--text-dim)] mt-2">
              States marked without popular votes chose their electors in the legislature.
            </p>
          ) : null}
        </section>
      ) : null}

      {/* the Congress it seated */}
      {seated ? (
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-3 text-[var(--text)]">The Congress it seated</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Fact label={`${seated.n}th Congress`} value={seated.years} sub={seated.trifecta?.startsWith("Yes") ? "Unified government" : "Divided government"} />
            <Fact
              label="Senate"
              value={`${seated.senate.a}–${seated.senate.b}`}
              sub={`${seated.partyA} vs ${seated.partyB}${seated.senate.others ? ` · ${seated.senate.others} others` : ""}`}
            />
            <Fact
              label="House"
              value={`${seated.house.a}–${seated.house.b}`}
              sub={`${seated.partyA} vs ${seated.partyB}${seated.house.others ? ` · ${seated.house.others} others` : ""}`}
            />
          </div>
        </section>
      ) : null}

      <nav className="flex justify-between gap-3 border-t pt-4 text-sm" style={{ borderColor: "var(--border)" }}>
        {prev ? (
          <Link href={`/elections/us/${prev.id}`} className="text-[var(--accent)] hover:underline">
            ← {prev.label}
          </Link>
        ) : <span />}
        <Link href="/elections/us" className="text-[var(--text-muted)] hover:text-[var(--accent)]">
          All elections
        </Link>
        {next ? (
          <Link href={`/elections/us/${next.id}`} className="text-[var(--accent)] hover:underline">
            {next.label} →
          </Link>
        ) : <span />}
      </nav>
    </main>
  );
}
