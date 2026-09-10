import type { Metadata } from "next";
import Link from "next/link";
import { getCuElections, computeCuRecords, cuPartyColor, cuFmtPct, type CuPresElection } from "@/lib/cuElections";
import { BASE_URL, SITE_NAME, ogImage } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/cu";
const TITLE = "Cuban Elections";
const DESC =
  "Every general election the Cuban republic held, 1901 to 1958, its House of Representatives elected alongside a presidency that saw real fraud accusations, one openly unopposed re-election and a revolution that stopped a winner from ever taking office, then every National Assembly of People's Power election since, 1976 to 2023, in which the Communist Party of Cuba's single list has always won exactly as many seats as there are to fill.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: ogImage(TITLE, PATH), width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

function PresCard({ e }: { e: CuPresElection }) {
  const byR2 = e.candidates.filter((c) => c.r2Share != null).sort((a, b) => (b.r2Share ?? 0) - (a.r2Share ?? 0));
  const byR1 = e.candidates.filter((c) => c.r1Share != null).sort((a, b) => (b.r1Share ?? 0) - (a.r1Share ?? 0));
  const winner = byR2[0] ?? byR1[0] ?? null;
  const runnerUp = byR2[1] ?? byR1[1] ?? null;
  return (
    <Link
      href={`/elections/cu/${e.id}`}
      className="block rounded-lg border p-3 transition-colors hover:border-[var(--accent)]"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1.5">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-bold text-[var(--text)]">{e.label}</span>
          {e.unfree ? (
            <span className="text-[10px] uppercase tracking-wider rounded-full border px-2 py-0.5 text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
              {e.unfree === "unfree" ? "Not a free vote" : "Restricted"}
            </span>
          ) : null}
          <span className="text-xs text-[var(--text-dim)]">{e.date}</span>
        </div>
        <div className="text-xs text-[var(--text-muted)] tabular-nums flex gap-3 flex-wrap">
          {winner ? (
            <span>
              <span style={{ color: cuPartyColor(winner.party) }}>{winner.name}</span>{" "}
              {cuFmtPct(winner.r2Share ?? winner.r1Share)}
            </span>
          ) : e.presAfter ? (
            <span>{e.presAfter.name}</span>
          ) : null}
          {runnerUp ? <span>def. {runnerUp.name}</span> : null}
          {e.turnout != null ? <span>turnout {cuFmtPct(e.turnout)}</span> : null}
        </div>
      </div>
      {winner && runnerUp && (winner.r2Share ?? winner.r1Share) != null && (runnerUp.r2Share ?? runnerUp.r1Share) != null ? (
        <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
          <div style={{ width: `${winner.r2Share ?? winner.r1Share}%`, backgroundColor: cuPartyColor(winner.party), marginRight: 1 }} title={`${winner.name}: ${cuFmtPct(winner.r2Share ?? winner.r1Share)}`} />
          <div style={{ width: `${runnerUp.r2Share ?? runnerUp.r1Share}%`, backgroundColor: cuPartyColor(runnerUp.party) }} title={`${runnerUp.name}: ${cuFmtPct(runnerUp.r2Share ?? runnerUp.r1Share)}`} />
        </div>
      ) : null}
    </Link>
  );
}

export default function CuElectionsPage() {
  const { presEras, legEras, presidential, legislative, meta } = getCuElections();
  const records = computeCuRecords();
  const modern = presidential;

  const presTurnout: ChartSeries = {
    name: "Presidential turnout",
    color: "#4ECDC4",
    points: modern
      .filter((e) => e.turnout != null && (e.turnout as number) <= 100)
      .map((e) => ({ x: e.year, y: e.turnout as number, label: e.label })),
  };
  const winnerShare: ChartSeries = {
    name: "Winner's decisive-round share",
    color: "#FFB400",
    points: modern
      .map((e) => {
        const w = e.candidates
          .filter((c) => (c.r2Share ?? c.r1Share) != null)
          .sort((a, b) => ((b.r2Share ?? b.r1Share) ?? 0) - ((a.r2Share ?? a.r1Share) ?? 0))[0];
        return w ? { x: e.year, y: (w.r2Share ?? w.r1Share) as number, label: `${e.label}: ${w.name}` } : null;
      })
      .filter((p): p is { x: number; y: number; label: string } => p != null),
  };

  const presByEra = [...presEras]
    .reverse()
    .map((era) => ({ era, list: presidential.filter((e) => e.era === era.key).slice().reverse() }))
    .filter(({ list }) => list.length > 0);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/elections" className="hover:underline">Elections</Link>
        {" / "}
        <span>Cuba</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="cu" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
        <p className="mt-2 text-xs uppercase tracking-widest text-[var(--text-dim)]">
          Source: Wikipedia election articles · as of {meta.built}
        </p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label={"National Assembly seats"} value={"470"} hint={"one list, one result, since 1993"} />
        <StatTile label={"Elections since 1901"} value={String(presidential.length + legislative.length)} hint={""} />
        <StatTile label={"2023 turnout"} value={"75.84%"} hint={"down nearly 10 points on 2018, the sharpest drop on record"} />
      </div>

      <JumpNav items={[["#presidential", "Presidential elections"], ["#chronology", "Legislative elections"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      {/* ---------- presidential first: the president makes the government ---------- */}
      <section id="presidential" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Presidential elections</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
          Every presidential election the Cuban republic held, 1901 to 1958, newest first. The republic elected no president after 1958; the National Assembly, not a popular vote, has chosen Cuba's head of government since.
        </p>
        {presByEra.map(({ era, list }) => (
          <div key={era.key} id={`pres-era-${era.key}`} className="mb-8">
            <div className="mb-3">
              <h3 className="text-lg font-bold text-[var(--text)]">
                {era.label} <span className="text-sm font-normal text-[var(--text-dim)]">· {era.span}</span>
              </h3>
              <p className="text-sm text-[var(--text-muted)] max-w-3xl">{era.blurb}</p>
            </div>
            <div className="grid gap-2">
              {list.map((e) => <PresCard key={e.id} e={e} />)}
            </div>
          </div>
        ))}
      </section>

      {/* ---------- legislative ---------- */}
      <Chronology
        eras={legEras}
        elections={legislative}
        hrefBase={PATH}
        colorOf={cuPartyColor}
        fmtPct={cuFmtPct}
        leaderTag="PM"
        headline="Legislative elections"
        intro={"Every general-election House of Representatives result the Cuban republic recorded, 1901 to 1958, then every National Assembly of People's Power election since, 1976 to 2023, newest first. No election was held between 1959 and 1976, and the National Assembly rows since 1993 carry the same caveat every time: one list, no contest."}
      />

      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The long arc in charts</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          Hover any point for the exact figure.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Turnout in the competitive republic ran as high as 78.70% in 1948; the National Assembly era has recorded turnout above 85% at every election through 2013 before falling to 75.84% in 2023, the lowest the National Assembly has recorded.
            </p>
            <LineChart series={[presTurnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The largest party or list's share</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              The republic's largest share on record is the Moderate Party's fraud-tainted 31 of 32 House seats in 1905; every National Assembly election since 1993 has returned the Communist Party of Cuba's list on 100% of the seats it contested.
            </p>
            <LineChart series={[winnerShare]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Cuban elections work"
        cards={[
          ["A republic that never quite escaped fraud",
           "Cuba's House of Representatives and presidency were elected together in every general election from 1901 to 1958 but one, and the source records real fraud accusations, substantiated by a US ambassador in 1920 and by a peace commission in 1905, at several of them."],
          ["A revolution mid-count",
           "The 1958 election proceeded despite a public rebel boycott call and elected a House and a president neither of whom ever took office: the Cuban Revolution triumphed on 1 January 1959, nine weeks after the vote."],
          ["Fourteen years with no election at all",
           "The republic's Congress was not replaced by anything elected until 1976, when voters chose municipal assembly members who in turn chose the first National Assembly of People's Power."],
          ["One list, every seat, since 1993",
           "Direct election of the National Assembly began in 1993, and the Communist Party of Cuba's single approved list has taken every seat at every election since, its declared result always exactly equal to the Assembly's own size."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/cuba", "Cuba"],
          ["/elections/ve", "Venezuelan Elections"],
          ["/elections/dd", "East German Elections"],
        ]}
      />
    </main>
  );
}
