import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getEuElections,
  euElectionById,
  euNeighbours,
  euEraOf,
  euGroupColor,
  fmtInt,
  fmtPct,
} from "@/lib/euElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export function generateStaticParams() {
  return getEuElections().elections.map((e) => ({ id: e.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = euElectionById(id);
  if (!e) return {};
  const title = `${e.label} European Parliament Election`;
  const desc = e.summary;
  const path = `/elections/eu/${e.id}`;
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

export default async function EuElectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = euElectionById(id);
  if (!e) notFound();
  const era = euEraOf(e.era);
  const { prev, next } = euNeighbours(e.id);
  const maxSeats = Math.max(...e.groups.map((g) => g.seats), 1);
  const beforeOffice = e.before?.office ?? "";
  const afterOffice = e.after?.office ?? "";
  const sameOffice = beforeOffice === afterOffice;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/elections" className="hover:underline">Elections</Link>
        {" / "}
        <Link href="/elections/eu" className="hover:underline">European Parliament</Link>
        {" / "}
        <span>{e.label}</span>
      </nav>

      <header className="mb-6">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-3xl font-bold text-[var(--text)]">{e.label} European Parliament Election</h1>
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
              <Link href={`/elections/eu#era-${e.era}`} className="hover:text-[var(--accent)]">
                {era.label}
              </Link>
            </>
          ) : null}
          {" · "}
          {e.totalSeats} seats, {e.majoritySeats} for a majority · {e.memberStates} member states
        </p>
        <p className="text-[var(--text-muted)] max-w-3xl mt-3">{e.summary}</p>
      </header>

      {/* result strip */}
      <div className="mb-6">
        <div className="flex h-4 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
          {e.groups.map((g, i) => (
            <div
              key={`${g.abbr}-${i}`}
              style={{ width: `${(g.seats / e.totalSeats) * 100}%`, backgroundColor: euGroupColor(g.abbr), marginRight: i < e.groups.length - 1 ? 2 : 0 }}
              title={`${g.abbr}: ${g.seats} seats`}
            />
          ))}
        </div>
        <div className="relative h-2">
          <div className="absolute top-0 h-2 w-px bg-[var(--text-dim)]" style={{ left: `${(e.majoritySeats / e.totalSeats) * 100}%` }} title={`${e.majoritySeats} seats for a majority`} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <Fact
          label={sameOffice && e.before ? `${beforeOffice} before` : e.before ? `Before · ${beforeOffice}` : "Before the election"}
          value={e.before ? e.before.name : "—"}
          sub={e.before ? e.before.party : "First direct election"}
        />
        <Fact
          label={sameOffice && e.after ? `${afterOffice} after` : e.after ? `After · ${afterOffice}` : "After the election"}
          value={e.after ? e.after.name : "—"}
          sub={e.after ? e.after.party : undefined}
        />
        <Fact label="Largest group" value={e.seatLeader} sub={`${e.groups.find((g) => g.abbr === e.seatLeader)?.seats ?? "—"} of ${e.totalSeats} seats`} />
        <Fact label="Turnout" value={fmtPct(e.turnout)} sub={`across ${e.memberStates} member states`} />
      </div>

      {/* groups table */}
      <section className="mb-8">
        <h2 className="text-xl font-bold mb-3 text-[var(--text)]">The Parliament it elected</h2>
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--text-dim)]">
                <th className="px-3 py-2">Group</th>
                <th className="px-3 py-2">Political family</th>
                <th className="px-3 py-2">Leading figure</th>
                <th className="px-3 py-2 text-right">MEPs</th>
                <th className="px-3 py-2 w-1/5">Share of chamber</th>
                <th className="px-3 py-2 text-right">Vote share</th>
              </tr>
            </thead>
            <tbody>
              {e.groups.map((g, i) => (
                <tr key={`${g.abbr}-${i}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle" style={{ backgroundColor: euGroupColor(g.abbr) }} />
                    <span className="font-semibold text-[var(--text)]">{g.abbr}</span>
                  </td>
                  <td className="px-3 py-2 text-[var(--text-muted)]">{g.name}</td>
                  <td className="px-3 py-2 text-[var(--text-muted)]">{g.leader ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--text)]">{g.seats}</td>
                  <td className="px-3 py-2">
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--border)" }}>
                      <div className="h-full rounded-full" style={{ width: `${(g.seats / maxSeats) * 100}%`, backgroundColor: euGroupColor(g.abbr) }} />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">
                    {g.share != null ? fmtPct(g.share) : "—"}
                    {g.votes != null ? <span className="block text-[10px] text-[var(--text-dim)]">{fmtInt(g.votes)} votes</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[var(--text-dim)] mt-2">
          Group composition at or immediately after the Parliament&apos;s constitutive session; groups form
          and dissolve between elections, so totals elsewhere may differ. Vote shares are EU-wide shares
          for the parties that formed each group, where the source reports them.
        </p>
      </section>

      {/* member-state breakdown */}
      {e.countries ? (
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-1 text-[var(--text)]">The result by member state</h2>
          <p className="text-sm text-[var(--text-muted)] mb-4 max-w-3xl">
            How each of the {e.countries.rows.length} member states&apos; MEPs divided among the political
            groups{e.countries.rows.some((r) => r.detail) ? ", with the national parties behind each delegation" : ""}.
            {e.countries.note ? ` ${e.countries.note}` : ""}
          </p>
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--text-dim)]">
                  <th className="px-2 py-1.5 sticky left-0" style={{ backgroundColor: "var(--bg-card)" }}>Member state</th>
                  {e.countries.groups.map((g) => (
                    <th key={g} className="px-2 py-1.5 text-right whitespace-nowrap">
                      <span className="inline-block w-2 h-2 rounded-full mr-1 align-middle" style={{ backgroundColor: euGroupColor(g) }} />
                      {g}
                    </th>
                  ))}
                  <th className="px-2 py-1.5 text-right">MEPs</th>
                </tr>
              </thead>
              <tbody>
                {e.countries.rows.map((r) => (
                  <tr key={r.name} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                    <td className="px-2 py-1.5 font-semibold text-[var(--text)] whitespace-nowrap sticky left-0" style={{ backgroundColor: "var(--bg-card)" }}>
                      {r.name}
                    </td>
                    {r.byGroup.map((n, gi) => (
                      <td
                        key={e.countries!.groups[gi]}
                        className="px-2 py-1.5 text-right tabular-nums"
                        title={r.detail && r.detail[gi] ? `${e.countries!.groups[gi]}: ${r.detail[gi]}` : undefined}
                      >
                        {n > 0 ? (
                          <>
                            <span className="font-semibold text-[var(--text)]">{n}</span>
                            {r.detail && r.detail[gi] ? (
                              <span className="block text-[10px] text-[var(--text-dim)] max-w-[9rem] truncate ml-auto">{r.detail[gi]}</span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-[var(--text-dim)]"></span>
                        )}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-[var(--text)]">{r.total}</td>
                  </tr>
                ))}
                <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-2 py-1.5 font-semibold text-[var(--text)] sticky left-0" style={{ backgroundColor: "var(--bg-card)" }}>Total</td>
                  {e.countries.groups.map((g, gi) => (
                    <td key={g} className="px-2 py-1.5 text-right tabular-nums font-semibold text-[var(--text)]">
                      {e.countries!.rows.reduce((s, r) => s + r.byGroup[gi], 0)}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-[var(--text)]">
                    {e.countries.rows.reduce((s, r) => s + r.total, 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* prev / next */}
      <nav className="flex justify-between gap-3 border-t pt-4 text-sm" style={{ borderColor: "var(--border)" }}>
        {prev ? (
          <Link href={`/elections/eu/${prev.id}`} className="text-[var(--accent)] hover:underline">
            ← {prev.label}
          </Link>
        ) : <span />}
        <Link href="/elections/eu" className="text-[var(--text-muted)] hover:text-[var(--accent)]">
          All elections
        </Link>
        {next ? (
          <Link href={`/elections/eu/${next.id}`} className="text-[var(--accent)] hover:underline">
            {next.label} →
          </Link>
        ) : <span />}
      </nav>
    </main>
  );
}
