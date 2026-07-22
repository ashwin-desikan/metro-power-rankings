import type { Metadata } from "next";
import Link from "next/link";
import {
  getBrElections,
  computeBrRecords,
  brPartyColor,
  brFmtPct,
  type BrPresElection,
} from "@/lib/brElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/br";
const TITLE = "Brazilian Elections";
const DESC =
  "Every Brazilian presidential election from the first Republic in 1891 to the 2022 runoff, and the parliamentary contests from the 1934 Constituent Assembly to 1990 — the Old Republic's arranged counts, the dictatorship's electoral college and the New Republic's two-round battles, stated plainly throughout.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

function PresCard({ e }: { e: BrPresElection }) {
  const byR2 = e.candidates.filter((c) => c.r2Share != null).sort((a, b) => (b.r2Share ?? 0) - (a.r2Share ?? 0));
  const byR1 = e.candidates.filter((c) => c.r1Share != null).sort((a, b) => (b.r1Share ?? 0) - (a.r1Share ?? 0));
  const winner = byR2[0] ?? byR1[0] ?? null;
  const runnerUp = byR2[1] ?? byR1[1] ?? null;
  return (
    <Link
      href={`/elections/br/${e.id}`}
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
              <span style={{ color: brPartyColor(winner.party) }}>{winner.name}</span>{" "}
              {brFmtPct(winner.r2Share ?? winner.r1Share)}
            </span>
          ) : e.presAfter ? (
            <span>{e.presAfter.name}</span>
          ) : null}
          {runnerUp ? <span>def. {runnerUp.name}</span> : null}
          {e.turnout != null ? <span>turnout {brFmtPct(e.turnout)}</span> : null}
        </div>
      </div>
      {winner && runnerUp && (winner.r2Share ?? winner.r1Share) != null && (runnerUp.r2Share ?? runnerUp.r1Share) != null ? (
        <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
          <div style={{ width: `${winner.r2Share ?? winner.r1Share}%`, backgroundColor: brPartyColor(winner.party), marginRight: 1 }} title={`${winner.name}: ${brFmtPct(winner.r2Share ?? winner.r1Share)}`} />
          <div style={{ width: `${runnerUp.r2Share ?? runnerUp.r1Share}%`, backgroundColor: brPartyColor(runnerUp.party) }} title={`${runnerUp.name}: ${brFmtPct(runnerUp.r2Share ?? runnerUp.r1Share)}`} />
        </div>
      ) : null}
    </Link>
  );
}

export default function BrElectionsPage() {
  const { presEras, legEras, presidential, legislative, meta } = getBrElections();
  const records = computeBrRecords();
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
        <span>Brazil</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="br" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label="Presidential elections" value={String(presidential.length)} hint={`${presidential[0].year}–${lastPres.year} · next due October 2026`} />
        <StatTile label="Parliamentary elections" value={String(legislative.length)} hint={`${legislative[0].year}–${legislative[legislative.length - 1].year}`} />
        <StatTile label="President today" value={lastPres.presAfter?.name ?? "—"} hint={`elected ${lastPres.year} in the closest runoff ever`} />
        <StatTile label="Years without a direct vote" value="29" hint="1960–1989, under the military's electoral college" />
      </div>

      <JumpNav items={[["#presidential", "Presidential elections"], ["#chronology", "Parliamentary elections"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      {/* ---------- presidential ---------- */}
      <section id="presidential" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Presidential elections</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
          All {presidential.length} presidential contests, newest first. The Old Republic&apos;s machine
          counts and the dictatorship&apos;s electoral-college ratifications are labelled as such on every
          page.
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
        colorOf={brPartyColor}
        fmtPct={brFmtPct}
        leaderTag="President"
        headline="Parliamentary elections"
        intro="The Chamber of Deputies contests from the 1934 Constituent Assembly to the first Congress of the restored democracy in 1990, newest first — including the dictatorship's imposed two-party years."
      />

      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The long arc in charts</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          Hover any point for the exact figure.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The winner&apos;s decisive share, 1945–2022</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              From the populist republic&apos;s plurality wins through the runoff era: Collor over Lula,
              Cardoso&apos;s first-round victories, four Workers&apos; Party wins, and 2022&apos;s
              50.9%–49.1% — the narrowest ever.
            </p>
            <LineChart series={[runoffWinner]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout in the direct-vote eras</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Compulsory voting keeps Brazilian turnout near 80% — among the highest anywhere for an
              electorate of 150 million.
            </p>
            <LineChart series={[presTurnout]} yMax={100} yTicks={[50, 75]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Brazilian elections work"
        cards={[
          ["Two rounds since 1989", "The president needs an absolute majority; if nobody clears 50% in October's first round, the top two meet again three weeks later. Every election since 2002 has featured the Workers' Party in the runoff."],
          ["Compulsory voting", "Voting is compulsory for adults aged 18 to 70, and turnout runs near 80% of one of the world's largest electorates — with electronic voting machines counting the result within hours."],
          ["Open-list fragmentation", "Chamber seats are allocated by open-list proportional representation in state-wide districts, producing one of the world's most fragmented legislatures — every president governs by coalition."],
          ["The franchise's long climb", "The Old Republic barred illiterate Brazilians — most of the country — from voting; women gained the vote in 1932, illiterate citizens only in 1985. Universal suffrage in Brazil is younger than the personal computer."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/brazil", "Brazil"],
          ["/elections/mx", "Mexican Elections"],
          ["/elections/us", "US Presidential Elections"],
          ["/leaders", "World Leaders"],
        ]}
      />
    </main>
  );
}
