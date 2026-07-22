import type { Metadata } from "next";
import Link from "next/link";
import {
  getRuElections,
  computeRuRecords,
  ruPartyColor,
  ruFmtPct,
  type RuPresElection,
} from "@/lib/ruElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/ru";
const TITLE = "Russian & Soviet Elections";
const DESC =
  "Russian voting from the Tsar's Dumas to the present, recorded honestly: the class-weighted imperial elections, the free 1917 vote the Bolsheviks overturned, the USSR's single-list rituals, the contested 1990s — and the managed votes that have kept one man in the Kremlin since 2000.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

function PresCard({ e }: { e: RuPresElection }) {
  const byBest = e.candidates
    .filter((c) => (c.r2Share ?? c.r1Share) != null)
    .sort((a, b) => ((b.r2Share ?? b.r1Share) ?? 0) - ((a.r2Share ?? a.r1Share) ?? 0));
  const winner = byBest[0] ?? null;
  const runnerUp = byBest[1] ?? null;
  return (
    <Link
      href={`/elections/ru/${e.id}`}
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
          {e.unfree || e.caveat ? (
            <span className="text-[10px] uppercase tracking-wider rounded-full border px-2 py-0.5 font-semibold" style={{ borderColor: "#B4540A", color: "#D97706" }}>
              {e.unfree ? "not a free vote" : "caveats apply"}
            </span>
          ) : null}
          <span className="text-xs text-[var(--text-dim)]">{e.date}</span>
        </div>
        <div className="text-xs text-[var(--text-muted)] tabular-nums flex gap-3">
          {winner ? (
            <span>
              <span style={{ color: ruPartyColor(winner.party) }}>{winner.name}</span>{" "}
              {ruFmtPct(winner.r2Share ?? winner.r1Share)}
            </span>
          ) : e.presAfter ? (
            <span>{e.presAfter.name}</span>
          ) : null}
          {runnerUp ? <span>def. {runnerUp.name}</span> : null}
          {e.turnout != null ? <span>turnout {ruFmtPct(e.turnout)}</span> : null}
        </div>
      </div>
      {winner && runnerUp && (winner.r2Share ?? winner.r1Share) != null && (runnerUp.r2Share ?? runnerUp.r1Share) != null ? (
        <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
          <div style={{ width: `${winner.r2Share ?? winner.r1Share}%`, backgroundColor: ruPartyColor(winner.party), marginRight: 1 }} title={`${winner.name}: ${ruFmtPct(winner.r2Share ?? winner.r1Share)}`} />
          <div style={{ width: `${runnerUp.r2Share ?? runnerUp.r1Share}%`, backgroundColor: ruPartyColor(runnerUp.party) }} title={`${runnerUp.name}: ${ruFmtPct(runnerUp.r2Share ?? runnerUp.r1Share)}`} />
        </div>
      ) : null}
    </Link>
  );
}

export default function RuElectionsPage() {
  const { presEras, legEras, presidential, legislative, meta } = getRuElections();
  const records = computeRuRecords();
  const lastPres = presidential[presidential.length - 1];

  const winnerShare: ChartSeries = {
    name: "Winner's announced share",
    color: "#C1121F",
    points: presidential
      .filter((e) => e.year >= 1991)
      .map((e) => {
        const w = e.candidates
          .filter((c) => (c.r2Share ?? c.r1Share) != null)
          .sort((a, b) => ((b.r2Share ?? b.r1Share) ?? 0) - ((a.r2Share ?? a.r1Share) ?? 0))[0];
        return w ? { x: e.year, y: (w.r2Share ?? w.r1Share) as number, label: `${e.label} — ${w.name}` } : null;
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
        <span>Russia</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="ru" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div
        className="rounded-xl border p-4 mb-8 max-w-3xl text-sm"
        style={{ borderColor: "#B4540A", backgroundColor: "rgba(217,119,6,0.06)" }}
      >
        <p className="text-[var(--text-muted)]">
          <span className="font-bold" style={{ color: "#D97706" }}>How to read this hub.</span>{" "}
          Most of the votes recorded here were not free contests. Soviet elections offered one
          approved name per seat; Russian elections have been progressively managed since 2000 and
          are no longer competitive. The numbers are preserved because they are historically
          revealing — announced turnout and announced majorities measured the state&apos;s reach, not
          the people&apos;s choice. Every entry carries its honest label: only the Constituent
          Assembly election of 1917 and the contested votes of the 1989–2003 window are treated as
          real races, and the caveats say exactly how real each one was.
        </p>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label="Presidential votes" value={String(presidential.length)} hint={`1990–${lastPres.year}, of which two were genuinely free`} />
        <StatTile label="Legislative elections" value={String(legislative.length)} hint="1906–2021: imperial Dumas, Soviet rituals, the Duma of today" />
        <StatTile label="Fully free presidential elections" value="1" hint="June 1991 — Yeltsin, while the USSR still stood" />
        <StatTile label="Kremlin incumbency" value="25 yrs" hint="one man in or behind the presidency since 2000" />
      </div>

      <JumpNav items={[["#presidential", "Presidential votes"], ["#chronology", "Legislative elections"], ["#charts", "The long arc in charts"], ["#records", "The numbers to know"], ["#how-it-works", "How it works"]]} />

      {/* ---------- presidential ---------- */}
      <section id="presidential" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Presidential votes</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
          All {presidential.length} contests for the Soviet and Russian presidency, newest first —
          from Gorbachev&apos;s uncontested election by the deputies to the wartime ritual of 2024.
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
        colorOf={ruPartyColor}
        fmtPct={ruFmtPct}
        leaderTag="PM"
        headline="Legislative elections"
        intro="Every national legislative vote, newest first — the managed Duma of the Putin era, the real and chaotic contests of the 1990s, the Soviet single-list rituals, the free 1917 election the Bolsheviks overturned, and the Tsar's four class-weighted Dumas, each labelled for what it was."
      />

      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The long arc in charts</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          Hover any point for the exact figure.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The winner&apos;s share, 1991–2024</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              The chart of managed democracy: Yeltsin&apos;s contested 57% and 54%, Putin&apos;s
              first bare majority — and then a line that only rises as competition is removed,
              to an announced 88% in 2024.
            </p>
            <LineChart series={[winnerShare]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Why announced turnout is not data</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Soviet elections reported turnout of 99.99%; the 2024 vote reported 77% during a war,
              with balloting extended into occupied territory. These figures are recorded in each
              entry, labelled as announcements of the state rather than measurements of behaviour —
              which is why no Soviet-era turnout chart appears here.
            </p>
            <div className="text-xs text-[var(--text-dim)] mt-6">
              Explore the chronologies above — every table sorts, and every entry carries its label.
            </div>
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} headline="The numbers to know" />

      <HowItWorks
        title="How Russian and Soviet votes worked"
        cards={[
          ["The Soviet method", "From 1937, every seat had exactly one candidate, nominated by the party or its organisations. Voting against meant using a screened booth to cross out the name — an observable act. Turnout and approval near 100% were the products of that design."],
          ["The 1990s window", "For one decade Russia held real elections: 1991's founding vote, the flawed but contested 1996 runoff, and Duma elections with genuine opposition. The window closed by stages — media first, then governors, then candidate registration itself."],
          ["Managed democracy", "Modern Russian elections keep the form of competition: several candidates, campaigns, observers. The substance is controlled upstream — who may run, who may broadcast, who counts. Since 2012 the strongest potential opponents have been excluded before a single vote was cast."],
          ["Why record them at all", "Because the numbers are evidence. The rising announced majorities, the turnout in occupied territory, the two-vote dissents — unfree elections document the state that stages them, and that is how this hub presents them."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/russia", "Russia"],
          ["/elections/cn", "Chinese National Congresses"],
          ["/elections/pl", "Polish Elections"],
          ["/leaders", "World Leaders"],
        ]}
      />
    </main>
  );
}
