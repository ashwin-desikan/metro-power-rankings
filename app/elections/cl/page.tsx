import type { Metadata } from "next";
import Link from "next/link";
import {
  getClElections,
  computeClRecords,
  clPartyColor,
  clFmtPct,
  type ClPresElection,
} from "@/lib/clElections";
import { BASE_URL, SITE_NAME, ogImage } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/cl";
const TITLE = "Chilean Elections";
const DESC =
  "Every Chilean presidential contest from 1826 to December 2025 and every parliamentary election since 1909: a century of presidents chosen by colleges of electors, the Parliamentary Republic in which Congress governed, Allende confirmed by Congress on 36.6%, the sixteen years without a vote, the plebiscite that ended them, and the return of compulsory voting.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: ogImage(TITLE, PATH), width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

function PresCard({ e }: { e: ClPresElection }) {
  const byR2 = e.candidates.filter((c) => c.r2Share != null).sort((a, b) => (b.r2Share ?? 0) - (a.r2Share ?? 0));
  const byR1 = e.candidates.filter((c) => c.r1Share != null).sort((a, b) => (b.r1Share ?? 0) - (a.r1Share ?? 0));
  const winner = byR2[0] ?? byR1[0] ?? null;
  const runnerUp = byR2[1] ?? byR1[1] ?? null;
  return (
    <Link
      href={`/elections/cl/${e.id}`}
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
              <span style={{ color: clPartyColor(winner.party) }}>{winner.name}</span>{" "}
              {clFmtPct(winner.r2Share ?? winner.r1Share)}
            </span>
          ) : e.presAfter ? (
            <span>{e.presAfter.name}</span>
          ) : null}
          {runnerUp ? <span>def. {runnerUp.name}</span> : null}
          {e.turnout != null ? <span>turnout {clFmtPct(e.turnout)}</span> : null}
        </div>
      </div>
      {winner && runnerUp && (winner.r2Share ?? winner.r1Share) != null && (runnerUp.r2Share ?? runnerUp.r1Share) != null ? (
        <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
          <div style={{ width: `${winner.r2Share ?? winner.r1Share}%`, backgroundColor: clPartyColor(winner.party), marginRight: 1 }} title={`${winner.name}: ${clFmtPct(winner.r2Share ?? winner.r1Share)}`} />
          <div style={{ width: `${runnerUp.r2Share ?? runnerUp.r1Share}%`, backgroundColor: clPartyColor(runnerUp.party) }} title={`${runnerUp.name}: ${clFmtPct(runnerUp.r2Share ?? runnerUp.r1Share)}`} />
        </div>
      ) : null}
    </Link>
  );
}

export default function ClElectionsPage() {
  const { presEras, legEras, presidential, legislative, meta } = getClElections();
  const records = computeClRecords();

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
        <span>Chile</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="cl" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
        <p className="mt-2 text-xs uppercase tracking-widest text-[var(--text-dim)]">
          Source: Wikipedia election articles · as of {meta.built}
        </p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label={"Chamber of Deputies"} value={"155"} hint={"78 for a majority; the Senate has 50"} />
        <StatTile label={"Contests on file"} value={String(presidential.length + legislative.length)} hint={""} />
        <StatTile label={"December 2025"} value={"58.2%"} hint={"Kast in the runoff, on 85.4% first-round turnout"} />
      </div>

      <JumpNav items={[["#presidential", "Presidential elections"], ["#chronology", "Parliamentary elections"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      {/* ---------- presidential first: the president makes the government ---------- */}
      <section id="presidential" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Presidential elections</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
          Every Chilean presidential contest from 1826, newest first. Everything before 1925 was decided by a college of electors, and where no candidate had a majority Congress chose between the top two; that vote is shown as the deciding round.
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
        colorOf={clPartyColor}
        fmtPct={clFmtPct}
        leaderTag="President"
        headline="Parliamentary elections"
        intro={"Every parliamentary election since 1909, reported as the Chamber of Deputies. The gap between 1973 and 1989 is the dictatorship."}
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
              Above 80% for most of the twentieth century, down to 46.7% in 2017 under voluntary voting, and back above 85% in 2025 when the fine returned.
            </p>
            <LineChart series={[presTurnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The winner's decisive-round share</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Indirect elections produced overwhelming margins on paper. Since 1989 the runoff has kept every winner between 51% and 62%.
            </p>
            <LineChart series={[winnerShare]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Chilean elections work"
        cards={[
          ["A president elected in two rounds",
           "Since 1989 the president needs an absolute majority and all but two elections have gone to a runoff. The term is four years with no consecutive re-election, which is why Bachelet and Piñera each served twice with a gap in between."],
          ["A century of indirect election",
           "From 1826 to 1920 Chileans did not elect presidents directly. Parishes chose electors and the electors chose the president, and the 1925 election was the first direct one. Where Congress had to settle a contest with no majority, as in 1970, that vote is shown here as the deciding round."],
          ["From the binomial system to proportional representation",
           "The dictatorship's electoral law paired every district and gave the second seat to the runner-up list unless the leading list doubled its vote, which locked two coalitions in place for twenty-four years. Larger proportional districts replaced it in 2017 and the chamber has fragmented at every election since."],
          ["Voting that was compulsory, then was not, then was again",
           "Registration became automatic and voting voluntary in 2012 and turnout fell to the forties. Compulsory voting returned for 2025 and 85% of the roll voted, so read the turnout line on this page as a story about the law rather than about enthusiasm."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/chile", "Chile"],
          ["/elections/ar", "Argentine Elections"],
          ["/elections/br", "Brazilian Elections"],
          ["/elections/co", "Colombian Elections"],
        ]}
      />
    </main>
  );
}
