import type { Metadata } from "next";
import Link from "next/link";
import {
  getCoElections,
  computeCoRecords,
  coPartyColor,
  coFmtPct,
  type CoPresElection,
} from "@/lib/coElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/co";
const TITLE = "Colombian Elections";
const DESC =
  "Colombia's presidential record from 1825 to June 2026 and its congressional record from the Liberal Republic onwards: election by the sovereign states, the Conservative hegemony, the Violencia, sixteen years in which the two parties simply divided the country between them, and a runoff era that has produced the sharpest turns in the republic's history.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

function PresCard({ e }: { e: CoPresElection }) {
  const byR2 = e.candidates.filter((c) => c.r2Share != null).sort((a, b) => (b.r2Share ?? 0) - (a.r2Share ?? 0));
  const byR1 = e.candidates.filter((c) => c.r1Share != null).sort((a, b) => (b.r1Share ?? 0) - (a.r1Share ?? 0));
  const winner = byR2[0] ?? byR1[0] ?? null;
  const runnerUp = byR2[1] ?? byR1[1] ?? null;
  return (
    <Link
      href={`/elections/co/${e.id}`}
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
              <span style={{ color: coPartyColor(winner.party) }}>{winner.name}</span>{" "}
              {coFmtPct(winner.r2Share ?? winner.r1Share)}
            </span>
          ) : e.presAfter ? (
            <span>{e.presAfter.name}</span>
          ) : null}
          {runnerUp ? <span>def. {runnerUp.name}</span> : null}
          {e.turnout != null ? <span>turnout {coFmtPct(e.turnout)}</span> : null}
        </div>
      </div>
      {winner && runnerUp && (winner.r2Share ?? winner.r1Share) != null && (runnerUp.r2Share ?? runnerUp.r1Share) != null ? (
        <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
          <div style={{ width: `${winner.r2Share ?? winner.r1Share}%`, backgroundColor: coPartyColor(winner.party), marginRight: 1 }} title={`${winner.name}: ${coFmtPct(winner.r2Share ?? winner.r1Share)}`} />
          <div style={{ width: `${runnerUp.r2Share ?? runnerUp.r1Share}%`, backgroundColor: coPartyColor(runnerUp.party) }} title={`${runnerUp.name}: ${coFmtPct(runnerUp.r2Share ?? runnerUp.r1Share)}`} />
        </div>
      ) : null}
    </Link>
  );
}

export default function CoElectionsPage() {
  const { presEras, legEras, presidential, legislative, meta } = getCoElections();
  const records = computeCoRecords();

  const presTurnout: ChartSeries = {
    name: "Presidential turnout",
    color: "#4ECDC4",
    points: presidential
      .filter((e) => e.turnout != null && (e.turnout as number) <= 100)
      .map((e) => ({ x: e.year, y: e.turnout as number, label: e.label })),
  };
  const winnerShare: ChartSeries = {
    name: "Winner's decisive-round share",
    color: "#FFB400",
    points: presidential
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
        <span>Colombia</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="co" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
        <p className="mt-2 text-xs uppercase tracking-widest text-[var(--text-dim)]">
          Source: Wikipedia election articles · as of {meta.built}
        </p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label={"Senate seats"} value={"108"} hint={"100 elected nationally, plus reserved seats"} />
        <StatTile label={"Contests on file"} value={String(presidential.length + legislative.length)} hint={""} />
        <StatTile label={"June 2026"} value={"49.7%"} hint={"de la Espriella over Cepeda by under a point"} />
      </div>

      <JumpNav items={[["#presidential", "Presidential elections"], ["#chronology", "Congressional elections"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      {/* ---------- presidential first: the president makes the government ---------- */}
      <section id="presidential" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Presidential elections</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
          Every Colombian presidential contest from 1825, newest first. The elections of 1860 to 1884 were decided by the nine sovereign states rather than by voters, so they carry a winner and no figures.
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
        colorOf={coPartyColor}
        fmtPct={coFmtPct}
        leaderTag="President"
        headline="Congressional elections"
        intro={"Colombia's congressional elections, newest first, reported as the Senate. The National Front years divide each party's total between its factions, because that is what voters were choosing between."}
      />

      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The long arc in charts</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          Hover any point for the exact figure.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Presidential turnout</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Colombia has the lowest participation of any large democracy in the Americas: under 50% at most elections since 1970, and 57.9% in the 2026 runoff, its highest in decades.
            </p>
            <LineChart series={[presTurnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The winner's decisive-round share</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              One-round pluralities under 45% were normal before 1991. Every winner since has needed a majority, and two of the last three runoffs were decided by fewer than three points.
            </p>
            <LineChart series={[winnerShare]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Colombian elections work"
        cards={[
          ["A president elected in two rounds",
           "Since the 1991 constitution the president needs an absolute majority, so all but one election has gone to a runoff four weeks later. The term is four years, and re-election was allowed in 2005 and abolished again in 2015."],
          ["A Senate elected as one national district",
           "All 100 elected senators are chosen by the whole country voting as a single constituency, with two further seats reserved for indigenous communities. It was designed to break the regional machines and instead produced hundreds of personal lists until a threshold was imposed in 2003. The congressional figures on this page are the Senate."],
          ["The National Front",
           "Between 1958 and 1974 the Liberals and Conservatives alternated the presidency by written agreement and split every elected body equally between them. Voters chose between factions of one party, which is why the tables of those years read as lists of names rather than parties. Those rows are marked as contests on a tilted field."],
          ["Congress votes in March, the president in May",
           "The two are held eleven weeks apart, which makes the March congressional result the closest thing Colombia has to a national primary. In 2026 the Historic Pact topped the Senate poll in March and lost the presidency in June."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/colombia", "Colombia"],
          ["/elections/br", "Brazilian Elections"],
          ["/elections/mx", "Mexican Elections"],
          ["/elections/ar", "Argentine Elections"],
        ]}
      />
    </main>
  );
}
