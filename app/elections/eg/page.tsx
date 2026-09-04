import type { Metadata } from "next";
import Link from "next/link";
import {
  getEgElections,
  computeEgRecords,
  egPartyColor,
  egFmtPct,
  type EgPresElection,
} from "@/lib/egElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/eg";
const TITLE = "Egyptian Elections";
const DESC =
  "Egypt's presidential and parliamentary record from the liberal monarchy of 1923 to the present: the Wafd winning every election it was allowed to contest and being dismissed each time, half a century of single-candidate confirmations, the one competitive presidential election in Egyptian history, and what followed it.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

function PresCard({ e }: { e: EgPresElection }) {
  const byR2 = e.candidates.filter((c) => c.r2Share != null).sort((a, b) => (b.r2Share ?? 0) - (a.r2Share ?? 0));
  const byR1 = e.candidates.filter((c) => c.r1Share != null).sort((a, b) => (b.r1Share ?? 0) - (a.r1Share ?? 0));
  const winner = byR2[0] ?? byR1[0] ?? null;
  const runnerUp = byR2[1] ?? byR1[1] ?? null;
  return (
    <Link
      href={`/elections/eg/${e.id}`}
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
          {winner ? (
            <span>
              <span style={{ color: egPartyColor(winner.party) }}>{winner.name}</span>{" "}
              {egFmtPct(winner.r2Share ?? winner.r1Share)}
            </span>
          ) : e.presAfter ? (
            <span>{e.presAfter.name}</span>
          ) : null}
          {runnerUp ? <span>def. {runnerUp.name}</span> : null}
          {e.turnout != null ? <span>turnout {egFmtPct(e.turnout)}</span> : null}
        </div>
      </div>
      {winner && runnerUp && (winner.r2Share ?? winner.r1Share) != null && (runnerUp.r2Share ?? runnerUp.r1Share) != null ? (
        <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
          <div style={{ width: `${winner.r2Share ?? winner.r1Share}%`, backgroundColor: egPartyColor(winner.party), marginRight: 1 }} title={`${winner.name}: ${egFmtPct(winner.r2Share ?? winner.r1Share)}`} />
          <div style={{ width: `${runnerUp.r2Share ?? runnerUp.r1Share}%`, backgroundColor: egPartyColor(runnerUp.party) }} title={`${runnerUp.name}: ${egFmtPct(runnerUp.r2Share ?? runnerUp.r1Share)}`} />
        </div>
      ) : null}
    </Link>
  );
}

export default function EgElectionsPage() {
  const { presEras, legEras, presidential, legislative, meta } = getEgElections();
  const records = computeEgRecords();
  const lastPres = presidential[presidential.length - 1];

  const presTurnout: ChartSeries = {
    name: "Presidential turnout",
    color: "#4ECDC4",
    points: presidential
      .filter((e) => e.turnout != null)
      .map((e) => ({ x: e.year, y: e.turnout as number, label: e.label })),
  };
  const runoffWinner: ChartSeries = {
    name: "Winner's decisive-round share",
    color: "#FFB400",
    points: presidential
      .filter((e) => e.year >= 1945)
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
        <span>Egypt</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="eg" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label="House seats" value="596" hint="including 28 presidential appointees" />
        <StatTile label="Contests on file" value={String(legislative.length + presidential.length)} hint="legislative and presidential" />
        <StatTile label="The one competitive race" value="2012" hint="51.7%, decided by fewer than 900,000 votes" />
      </div>

      <JumpNav items={[["#presidential", "Presidential elections"], ["#chronology", "Parliamentary elections"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      {/* ---------- presidential ---------- */}
      <section id="presidential" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Presidential elections</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
          Egypt's presidential contests, newest first. The half-century of single-candidate confirmations that preceded them is filed under referendums, where it belongs.
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
        colorOf={egPartyColor}
        fmtPct={egFmtPct}
        leaderTag="President"
        headline="Parliamentary elections"
        intro="Every parliamentary election from 1923, newest first. The liberal-monarchy elections are the only ones on this page whose outcome was ever in doubt."
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
              Reported turnout has ranged from 23% in 2005 to 67% in 2023, and the figures for the confirmation era are not independently verifiable.
            </p>
            <LineChart series={[runoffWinner]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The governing party's seat share</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              The NDP held between two-thirds and nine-tenths of the chamber for thirty years. The line barely moves, which is the finding.
            </p>
            <LineChart series={[presTurnout]} yMax={100} yTicks={[50, 75]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Egyptian elections work"
        cards={[
          [
            "A presidency confirmed, not contested",
            "From 1956 to 2005 Egyptians were not offered a choice of president. Parliament nominated one man and the public voted yes or no, six times, with approval between 90 and 99%. Those votes are filed in this atlas as referendums."
          ],
          [
            "Individual seats and closed lists",
            "The current House mixes individual constituency seats with absolute-majority closed lists, a design that hands a bloc winning a list plurality every seat on it. The pro-government coalition has taken all of them at each election since 2015."
          ],
          [
            "The Wafd problem",
            "Between 1923 and 1952 the Wafd won every honest election and was removed from office by the palace or the British every time. No Egyptian government of that period completed a full term, which is the argument the 1952 officers used."
          ],
          [
            "Read the caveats",
            "Most rows on this page are labelled restricted or unfree. That is not a judgement about Egyptians; it is a statement about the ballots they were given."
          ],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/egypt", "Egypt"],
          ["/elections/tr", "Turkish Elections"],
          ["/elections/iq", "Iraqi Elections"],
          ["/elections/ps", "Palestinian Elections"],
        ]}
      />
    </main>
  );
}
