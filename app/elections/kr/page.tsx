import type { Metadata } from "next";
import Link from "next/link";
import {
  getKrElections,
  computeKrRecords,
  krPartyColor,
  krFmtPct,
  type KrPresElection,
} from "@/lib/krElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/kr";
const TITLE = "South Korean Elections";
const DESC =
  "Every South Korean presidential election from 1948 to the post-martial-law snap vote of 2025, and every National Assembly election since 1948 — the rigged and rubber-stamp contests of the authoritarian decades labelled as such, and the fierce two-camp democracy since 1987.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

function PresCard({ e }: { e: KrPresElection }) {
  const byR1 = e.candidates.filter((c) => c.r1Share != null).sort((a, b) => (b.r1Share ?? 0) - (a.r1Share ?? 0));
  const winner = byR1[0] ?? null;
  const runnerUp = byR1[1] ?? null;
  return (
    <Link
      href={`/elections/kr/${e.id}`}
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
              <span style={{ color: krPartyColor(winner.party) }}>{winner.name}</span>{" "}
              {krFmtPct(winner.r1Share)}
            </span>
          ) : e.presAfter ? (
            <span>{e.presAfter.name}</span>
          ) : null}
          {runnerUp ? <span>def. {runnerUp.name}</span> : null}
          {e.turnout != null ? <span>turnout {krFmtPct(e.turnout)}</span> : null}
        </div>
      </div>
      {winner && winner.r1Share != null ? (
        <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
          <div style={{ width: `${winner.r1Share}%`, backgroundColor: krPartyColor(winner.party), marginRight: 1 }} title={`${winner.name}: ${krFmtPct(winner.r1Share)}`} />
          {runnerUp && runnerUp.r1Share != null ? (
            <div style={{ width: `${runnerUp.r1Share}%`, backgroundColor: krPartyColor(runnerUp.party) }} title={`${runnerUp.name}: ${krFmtPct(runnerUp.r1Share)}`} />
          ) : null}
        </div>
      ) : null}
    </Link>
  );
}

export default function KrElectionsPage() {
  const { presEras, legEras, presidential, legislative, meta } = getKrElections();
  const records = computeKrRecords();
  const lastPres = presidential[presidential.length - 1];
  const lastLeg = legislative[legislative.length - 1];

  const presTurnout: ChartSeries = {
    name: "Presidential turnout",
    color: "#4ECDC4",
    points: presidential
      .filter((e) => e.turnout != null && !e.caveat)
      .map((e) => ({ x: e.year, y: e.turnout as number, label: e.label })),
  };
  const winnerShare: ChartSeries = {
    name: "Winner's share (direct votes)",
    color: "#FFB400",
    points: presidential
      .filter((e) => !e.caveat)
      .map((e) => {
        const w = e.candidates.filter((c) => c.r1Share != null).sort((a, b) => (b.r1Share ?? 0) - (a.r1Share ?? 0))[0];
        return w ? { x: e.year, y: w.r1Share as number, label: `${e.label}: ${w.name}` } : null;
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
        <span>South Korea</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="kr" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label="Presidential elections" value={String(presidential.length)} hint={`${presidential[0].year}–${lastPres.year}`} />
        <StatTile label="Assembly elections" value={String(legislative.length)} hint={`${legislative[0].year}–${lastLeg.year}`} />
        <StatTile label="President today" value={lastPres.presAfter?.name ?? "—"} hint={`elected ${lastPres.year} · single five-year term`} />
        <StatTile label="Democratic era" value="1987" hint="the June Uprising forced direct elections" />
      </div>

      <JumpNav items={[["#presidential", "Presidential elections"], ["#chronology", "Assembly elections"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      {/* ---------- presidential ---------- */}
      <section id="presidential" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Presidential elections</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
          All {presidential.length} presidential contests, newest first. The rigged 1960 vote and the
          rubber-stamp rituals of the Yushin and Fifth Republic years are labelled as such on every page.
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
        colorOf={krPartyColor}
        fmtPct={krFmtPct}
        leaderTag="President"
        headline="National Assembly elections"
        intro="Every National Assembly election, newest first — from the 1948 Constitutional Assembly through the appointed-seat Assemblies of the Yushin years to the democratic era's midterm verdicts on each presidency."
      />

      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The long arc in charts</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          Direct presidential votes only; the rubber-stamp rituals are excluded. Hover for exact figures.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout in direct elections</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              The founding democratic election of 1987 drew 89%; the 2025 snap election&apos;s 79.4% was the
              highest in nearly three decades.
            </p>
            <LineChart series={[presTurnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The winner&apos;s share</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Single-round plurality means narrow mandates: Roh Tae-woo won the founding contest with under
              37% against a split opposition, and 2022 was decided by 0.73 points.
            </p>
            <LineChart series={[winnerShare]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How South Korean elections work"
        cards={[
          ["One round, one term", "The president is elected by simple plurality in a single round, for one five-year term with no re-election — a constitutional answer to the decades of strongmen extending their rule."],
          ["A mixed Assembly", "The National Assembly's 300 seats mix constituency winners with proportional list seats, elected every four years — deliberately out of phase with the presidency, so every president faces a mid-term verdict."],
          ["The two camps", "Since democratisation, politics has been a duel between a conservative camp (today's People Power Party, in red) and a liberal one (the Democratic Party, in blue) — with third-candidate splits deciding several presidencies."],
          ["Impeachment as a feature", "Two presidents have been removed by impeachment since 2017, each removal triggering a 60-day snap election — the constitutional machinery that produced both the 2017 and 2025 contests."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/south-korea", "South Korea"],
          ["/elections/jp", "Japanese General Elections"],
          ["/elections/id", "Indonesian Elections"],
          ["/leaders", "World Leaders"],
        ]}
      />
    </main>
  );
}
