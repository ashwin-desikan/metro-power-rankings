import type { Metadata } from "next";
import Link from "next/link";
import {
  getUkElections,
  getUkElectionTrends,
  getUkElectionsBeyond,
  computeRecords,
  partyColor,
  fmtInt,
  fmtPct,
  type UkElection,
} from "@/lib/ukElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import SortableTable from "../SortableTable";

const PATH = "/elections/uk";
const TITLE = "UK General Elections";
const DESC =
  "Every United Kingdom general election from 1802 to 2024: the results, the leaders, the turnout, the governments they made, and the story of each — plus referendums, devolved elections, European elections and mayoral contests.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

// ---------- small pieces ----------
function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
      <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">{label}</p>
      <p className="text-2xl font-bold text-[var(--text)] tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-[var(--text-muted)] mt-0.5">{hint}</p> : null}
    </div>
  );
}

function SeatStrip({ e }: { e: UkElection }) {
  const withSeats = e.parties.filter((p) => p.seats != null && p.seats > 0);
  const known = withSeats.reduce((s, p) => s + (p.seats ?? 0), 0);
  const rest = Math.max(0, e.totalSeats - known);
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
      {withSeats.map((p, i) => (
        <div
          key={`${p.name}-${i}`}
          style={{
            width: `${((p.seats ?? 0) / e.totalSeats) * 100}%`,
            backgroundColor: partyColor(p.name),
            marginRight: i < withSeats.length - 1 || rest > 0 ? 1 : 0,
          }}
          title={`${p.name}: ${p.seats} seats`}
        />
      ))}
      {rest > 0 ? <div style={{ width: `${(rest / e.totalSeats) * 100}%`, backgroundColor: "#3a3a4a" }} title={`Others / not shown: ${rest} seats`} /> : null}
    </div>
  );
}

const xOf = (id: string): number => {
  const yr = Number(id.slice(0, 4));
  if (id.endsWith("jan") || id.endsWith("feb")) return yr + 0.1;
  if (id.endsWith("oct")) return yr + 0.7;
  if (id.endsWith("dec")) return yr + 0.9;
  return yr + 0.5;
};

const MONTH_LABEL: Record<string, string> = { jan: "Jan", feb: "Feb", oct: "Oct", dec: "Dec" };
const idLabel = (id: string): string => {
  const [yr, mon] = id.split("-");
  return mon ? `${MONTH_LABEL[mon] ?? mon} ${yr}` : yr;
};

// ---------- page ----------
export default async function UkElectionsPage() {
  const { eras, elections, meta } = getUkElections();
  const trends = getUkElectionTrends();
  const beyond = await getUkElectionsBeyond();
  const records = computeRecords();
  const last = elections[elections.length - 1];

  // Newest era first, and newest election first within each era.
  const byEra = [...eras]
    .reverse()
    .map((era) => ({ era, list: elections.filter((e) => e.era === era.key).slice().reverse() }));

  const turnoutSeries: ChartSeries = {
    name: "Turnout",
    color: "#4ECDC4",
    points: trends.turnout
      .filter((t) => t.uk != null && Number(t.id.slice(0, 4)) >= 1918)
      .map((t) => ({ x: xOf(t.id), y: t.uk as number, label: idLabel(t.id) })),
  };
  const twoPartyVotes: ChartSeries = {
    name: "Vote share",
    color: "#8A7CA8",
    points: trends.twoParty.map((t) => ({ x: xOf(t.id), y: t.share, label: idLabel(t.id) })),
  };
  const twoPartySeats: ChartSeries = {
    name: "Seat share",
    color: "#4ECDC4",
    points: trends.twoParty.map((t) => ({ x: xOf(t.id), y: t.seatPct, label: idLabel(t.id) })),
  };
  const womenSeries: ChartSeries = {
    name: "Women MPs",
    color: "#FF6B9D",
    points: trends.womenMPs
      .filter((t) => t.pct != null)
      .map((t) => ({ x: xOf(t.id), y: t.pct as number, label: idLabel(t.id) })),
  };
  const councillorSeries: ChartSeries[] = (
    [
      ["Con", partyColor("CON"), (c: (typeof beyond.local.councillors)[number]) => c.con],
      ["Lab", partyColor("LAB"), (c: (typeof beyond.local.councillors)[number]) => c.lab],
      ["LD", partyColor("LD"), (c: (typeof beyond.local.councillors)[number]) => c.ld],
      ["Reform", partyColor("Reform"), (c: (typeof beyond.local.councillors)[number]) => c.reform ?? null],
    ] as const
  ).map(([name, color, get]) => ({
    name,
    color,
    points: beyond.local.councillors
      .filter((c) => /^\d{4}$/.test(c.year) && get(c) != null)
      .map((c) => ({ x: Number(c.year), y: get(c) as number, label: c.year })),
  }));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/elections" className="hover:underline">Elections</Link>
        {" / "}
        <span>United Kingdom</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl font-bold mb-2 text-[var(--text)]">{TITLE}</h1>
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label="General elections" value={String(elections.length)} hint={`${elections[0].year}–${last.year}`} />
        <StatTile label="Latest" value={last.label} hint={`${last.seatLeader ?? ""} · ${last.pmAfter ? last.pmAfter.name : ""}`} />
        <StatTile label="Commons seats today" value={fmtInt(last.totalSeats)} hint={last.majoritySeats ? `${last.majoritySeats} for a majority` : undefined} />
        <StatTile label="Electorate" value={last.electorate ? `${(last.electorate / 1e6).toFixed(1)}m` : "—"} hint="registered voters, 2024" />
      </div>

      {/* jump nav */}
      <div className="flex flex-wrap gap-2 mb-10 text-xs">
        {[
          ["#chronology", "Chronology"],
          ["#charts", "A century in charts"],
          ["#records", "Records"],
          ["#referendums", "Referendums"],
          ["#devolved", "Devolved & European"],
          ["#local", "Local & mayoral"],
          ["#how-it-works", "How it works"],
        ].map(([href, label]) => (
          <a key={href} href={href} className="rounded-full border px-3 py-1 text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors" style={{ borderColor: "var(--border)" }}>
            {label}
          </a>
        ))}
      </div>

      {/* ---------- chronology ---------- */}
      <section id="chronology" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The chronology</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
          Every general election, newest first, grouped into eight eras. Click any election for the full
          result, the party table and the story.
        </p>
        {byEra.map(({ era, list }) => (
          <div key={era.key} id={`era-${era.key}`} className="mb-8">
            <div className="mb-3">
              <h3 className="text-lg font-bold text-[var(--text)]">
                {era.label} <span className="text-sm font-normal text-[var(--text-dim)]">· {era.span}</span>
              </h3>
              <p className="text-sm text-[var(--text-muted)] max-w-3xl">{era.blurb}</p>
            </div>
            <div className="grid gap-2">
              {list.map((e) => {
                const winner = e.parties.find((p) => p.name === e.seatLeader) ?? e.parties[0];
                return (
                  <Link
                    key={e.id}
                    href={`/elections/uk/${e.id}`}
                    className="block rounded-lg border p-3 transition-colors hover:border-[var(--accent)]"
                    style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
                  >
                    <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1.5">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-bold text-[var(--text)]">{e.label}</span>
                        {e.knownAs ? (
                          <span className="text-[10px] uppercase tracking-wider rounded-full border px-2 py-0.5 text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
                            {e.knownAs}
                          </span>
                        ) : null}
                        <span className="text-xs text-[var(--text-dim)]">{e.date}</span>
                      </div>
                      <div className="text-xs text-[var(--text-muted)] tabular-nums flex gap-3">
                        {winner && winner.seats != null ? (
                          <span>
                            <span style={{ color: partyColor(winner.name) }}>{winner.name}</span>{" "}
                            {winner.seats}/{e.totalSeats}
                          </span>
                        ) : null}
                        {e.turnout != null ? <span>turnout {fmtPct(e.turnout)}</span> : null}
                        {e.pmAfter ? <span>PM: {e.pmAfter.name}</span> : null}
                      </div>
                    </div>
                    <SeatStrip e={e} />
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">A century in charts</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          The statistical arc since the 1918 franchise revolution, from the House of Commons Library dataset.
          Hover any point for the exact figure.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout, 1918–2024</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              The 1950 peak of 83.9% and the modern slide: no election since 1997 has cleared 70%.
            </p>
            <LineChart series={[turnoutSeries]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The two-party grip</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Conservative + Labour share of votes versus seats. The gap between the lines is first-past-the-post
              at work: the vote share collapsed after 1970, the seat share barely moved until 2024.
            </p>
            <LineChart series={[twoPartySeats, twoPartyVotes]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Women in the Commons</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              One woman was elected in 1918. The share passed 10% only in 1997, on Labour&apos;s all-women
              shortlists, and reached a third by 2019.
            </p>
            <LineChart series={[womenSeries]} yMax={40} yTicks={[10, 20, 30]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Votes versus seats, {last.year}</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              The most disproportional result in British history: each bar pair shows a party&apos;s vote share
              (muted) against its seat share (solid).
            </p>
            <div className="space-y-2 mt-3">
              {last.parties.slice(0, 6).map((p) => {
                const seatPct = p.seats != null ? (p.seats / last.totalSeats) * 100 : null;
                return (
                  <div key={p.name ?? ""}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="text-[var(--text)]">{p.name}</span>
                      <span className="text-[var(--text-muted)] tabular-nums">
                        {fmtPct(p.share)} votes → {seatPct != null ? fmtPct(seatPct) : "—"} seats
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden mb-0.5" style={{ backgroundColor: "var(--border)" }}>
                      <div className="h-full rounded-full" style={{ width: `${p.share ?? 0}%`, backgroundColor: partyColor(p.name), opacity: 0.45 }} />
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--border)" }}>
                      <div className="h-full rounded-full" style={{ width: `${seatPct ?? 0}%`, backgroundColor: partyColor(p.name) }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- records ---------- */}
      <section id="records" className="mb-12">
        <h2 className="text-2xl font-bold mb-4 text-[var(--text)]">Records &amp; superlatives</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {records.map((r) => (
            <Link
              key={r.label}
              href={`/elections/uk/${r.electionId}`}
              className="block rounded-xl border p-4 transition-colors hover:border-[var(--accent)]"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
            >
              <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">{r.label}</p>
              <p className="text-xl font-bold text-[var(--text)] tabular-nums">{r.value}</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">{r.detail}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* ---------- referendums ---------- */}
      <section id="referendums" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The referendums</h2>
        <p className="text-sm text-[var(--text-muted)] mb-4 max-w-3xl">
          Britain governed without referendums until 1973; it has held them at every constitutional fork since.
        </p>
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
          <SortableTable
            tableClassName="w-full text-sm"
            headClassName="text-left text-[10px] uppercase tracking-wider text-[var(--text-dim)]"
            rowClassName="border-t align-top"
            cols={[
              { key: "date", label: "Date", className: "px-3 py-2" },
              { key: "scope", label: "Scope", className: "px-3 py-2" },
              { key: "question", label: "Question", className: "px-3 py-2" },
              { key: "outcome", label: "Outcome", className: "px-3 py-2" },
              { key: "win", label: "Winning side", className: "px-3 py-2 text-right" },
              { key: "turnout", label: "Turnout", className: "px-3 py-2 text-right" },
            ]}
            rows={beyond.referendums.map((r) => ({
              key: `${r.date}-${r.scope}`,
              sort: { date: r.date, scope: r.scope, question: r.name, outcome: r.outcome, win: Math.max(r.yesPct, 100 - r.yesPct), turnout: r.turnout },
              cells: (
                <>
                  <td className="px-3 py-2 whitespace-nowrap text-[var(--text)]">{r.date}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-[var(--text-muted)]">{r.scope}</td>
                  <td className="px-3 py-2 text-[var(--text-muted)]">
                    {r.name}
                    {r.note ? <span className="block text-xs text-[var(--text-dim)]">{r.note}</span> : null}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap font-semibold text-[var(--text)]">{r.outcome}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--text)]">{fmtPct(Math.max(r.yesPct, 100 - r.yesPct))}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--text-muted)]">{fmtPct(r.turnout)}</td>
                </>
              ),
            }))}
          />
        </div>
      </section>

      {/* ---------- devolved & european ---------- */}
      <section id="devolved" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Devolved &amp; European elections</h2>
        <p className="text-sm text-[var(--text-muted)] mb-4 max-w-3xl">
          Since 1999 the UK has run parallel democracies under proportional systems, where the SNP and Plaid
          Cymru routinely outperform their Westminster results. May 2026 redrew the map: the SNP won a fifth
          term at Holyrood while Plaid Cymru ended a Labour winning streak in Wales that stretched back to
          1922, leaving all three devolved governments led by parties opposed to the union for the first
          time. European Parliament elections ran from 1979 until Brexit.
        </p>
        <div className="grid gap-4 lg:grid-cols-3 mb-4">
          {(["scotland", "wales", "northernIreland"] as const).map((k) => {
            const d = beyond.devolved[k];
            return (
              <div key={k} className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
                <h3 className="font-bold text-[var(--text)] mb-2">{d.name}</h3>
                <div className="space-y-2">
                  {d.elections.map((el) => {
                    const top = el.parties[0];
                    return (
                      <div key={el.year} className="text-xs">
                        <div className="flex justify-between mb-0.5">
                          <span className="text-[var(--text)] font-semibold tabular-nums">{el.year}</span>
                          <span className="text-[var(--text-muted)]">
                            <span style={{ color: partyColor(top.party) }}>{top.party}</span> {top.seats}/{el.totalSeats}
                          </span>
                        </div>
                        <div className="flex h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
                          {el.parties.map((p, i) => (
                            <div key={`${p.party}-${i}`} style={{ width: `${(p.seats / el.totalSeats) * 100}%`, backgroundColor: partyColor(p.party), marginRight: 1 }} title={`${p.party}: ${p.seats}`} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
          <h3 className="font-bold text-[var(--text)] mb-1">European Parliament, 1979–2019</h3>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            {beyond.europarl.note} The last two contests were won by insurgent parties that no longer exist:
            UKIP in 2014 and the Brexit Party in 2019.
          </p>
          <div className="overflow-x-auto">
            <SortableTable
              tableClassName="w-full text-xs"
              headClassName="text-left text-[10px] uppercase tracking-wider text-[var(--text-dim)]"
              cols={[
                { key: "year", label: "Election", className: "px-2 py-1.5" },
                { key: "largest", label: "Largest party (MEPs)", className: "px-2 py-1.5" },
                { key: "runnerUp", label: "Runner-up", className: "px-2 py-1.5" },
                { key: "turnout", label: "Turnout", className: "px-2 py-1.5 text-right" },
              ]}
              rows={beyond.europarl.elections.map((el) => {
                const [a, b] = el.parties;
                return {
                  key: String(el.year),
                  sort: { year: el.year, largest: a?.party ?? null, runnerUp: b?.party ?? null, turnout: el.turnout },
                  cells: (
                    <>
                      <td className="px-2 py-1.5 font-semibold text-[var(--text)] tabular-nums">{el.year}</td>
                      <td className="px-2 py-1.5 text-[var(--text-muted)]">
                        {a ? <><span style={{ color: partyColor(a.party) }}>{a.party}</span> · {a.meps} MEPs{a.share != null ? ` · ${fmtPct(a.share)}` : ""}</> : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-[var(--text-muted)]">
                        {b ? <><span style={{ color: partyColor(b.party) }}>{b.party}</span> · {b.meps} MEPs</> : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-[var(--text-muted)]">{fmtPct(el.turnout)}</td>
                    </>
                  ),
                };
              })}
            />
          </div>
        </div>
      </section>

      {/* ---------- local & mayoral ---------- */}
      <section id="local" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Local &amp; mayoral elections</h2>
        <p className="text-sm text-[var(--text-muted)] mb-4 max-w-3xl">
          Local elections are Britain&apos;s rolling opinion poll: some 20,000 councillors elected in annual
          waves, plus directly elected mayors (London since 2000, metro mayors since 2017) and police
          commissioners since 2012.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Metro-mayoral contests</h3>
            <p className="text-xs text-[var(--text-muted)] mb-3">{beyond.metroMayors.note}</p>
            <div className="overflow-x-auto">
              <SortableTable
                tableClassName="w-full text-xs"
                headClassName="text-left text-[10px] uppercase tracking-wider text-[var(--text-dim)]"
                cols={[
                  { key: "authority", label: "Authority", className: "px-2 py-1.5" },
                  { key: "winner", label: "Winner", className: "px-2 py-1.5" },
                  { key: "elected", label: "Elected", className: "px-2 py-1.5 text-right" },
                  { key: "turnout", label: "Turnout", className: "px-2 py-1.5 text-right" },
                ]}
                rows={beyond.metroMayors.latest.map((m) => ({
                  key: m.authority,
                  sort: { authority: m.authority, winner: m.mayor, elected: Number(m.date.slice(0, 4)), turnout: m.turnout },
                  cells: (
                    <>
                      <td className="px-2 py-1.5 text-[var(--text)]">{m.authority}</td>
                      <td className="px-2 py-1.5 text-[var(--text-muted)]">
                        {m.mayor} <span style={{ color: partyColor(m.party) }}>({m.party})</span>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-[var(--text-muted)]">{m.date.slice(0, 4)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-[var(--text-muted)]">{fmtPct(m.turnout)}</td>
                    </>
                  ),
                }))}
              />
            </div>
            <p className="text-xs mt-2">
              <Link href="/mayors" className="text-[var(--accent)] hover:underline">Current mayors, kept fresh weekly →</Link>
            </p>
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Council seats held, 1973–2026</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Total councillors by party across Great Britain: the Commons Library series to 2025, with the
              July 2026 composition from Open Council Data. Labour&apos;s base peaked in the mid-1990s before
              the 1997 landslide; Reform UK went from 14 seats in 2024 to over 2,300 after May 2026, when
              they won 1,453 of the seats up for election.
            </p>
            <LineChart yMax={12000} yTicks={[4000, 8000]} unit="" series={councillorSeries} />
          </div>
        </div>
      </section>

      {/* ---------- how it works ---------- */}
      <section id="how-it-works" className="mb-10">
        <h2 className="text-2xl font-bold mb-4 text-[var(--text)]">How UK general elections work</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          {[
            ["First past the post", "One MP per constituency; the candidate with the most votes wins, no majority required. The system rewards geographically concentrated support and punishes evenly spread votes."],
            ["650 constituencies", "The Commons has had between 615 and 707 seats since 1918. A party needs 326 for a bare majority today, though Sinn Féin's abstention lowers the practical bar."],
            ["The timetable", "Parliaments run a maximum of five years; Prime Ministers choose the date within that window. Two elections in one year has happened twice, in 1910 and 1974."],
            ["Governments, not presidents", "Voters elect a Parliament; the Crown appoints whoever can command it. Hung parliaments produce minority governments or coalitions, as in 1910, the 1920s, 1974, 2010 and 2017."],
          ].map(([h, b]) => (
            <div key={h} className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
              <p className="font-bold text-[var(--text)] mb-1">{h}</p>
              <p className="text-xs text-[var(--text-muted)]">{b}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="text-xs text-[var(--text-dim)] border-t pt-4" style={{ borderColor: "var(--border)" }}>
        <p>Sources: {meta.sources.join("; ")}. Referendum figures from the same Commons Library briefing.</p>
        <p className="mt-1">
          See also{" "}
          <Link href="/elections/forecast" className="text-[var(--accent)] hover:underline">Forecast: the next election</Link>
          {" · "}
          <Link href="/uk-political-leadership" className="text-[var(--accent)] hover:underline">UK Political Leadership</Link>
          {" · "}
          <Link href="/countries/united-kingdom" className="text-[var(--accent)] hover:underline">United Kingdom</Link>
          {" · "}
          <Link href="/leaders" className="text-[var(--accent)] hover:underline">World Leaders</Link>
        </p>
      </footer>
    </main>
  );
}
