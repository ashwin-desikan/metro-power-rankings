import type { Metadata } from "next";
import Link from "next/link";
import {
  getIdElections,
  computeIdRecords,
  idPartyColor,
  idFmtPct,
  type IdPresElection,
} from "@/lib/idElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/id";
const TITLE = "Indonesian Elections";
const DESC =
  "Indonesian elections from the colonial Volksraad of 1917 to the 2024 vote — the 1955 experiment, the New Order's managed contests labelled as such, and the reformasi era's single-day elections of over 200 million voters, the largest ever held.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

function PresCard({ e }: { e: IdPresElection }) {
  const byBest = e.candidates
    .filter((c) => (c.r2Share ?? c.r1Share) != null)
    .sort((a, b) => ((b.r2Share ?? b.r1Share) ?? 0) - ((a.r2Share ?? a.r1Share) ?? 0));
  const winner = byBest[0] ?? null;
  const runnerUp = byBest[1] ?? null;
  return (
    <Link
      href={`/elections/id/${e.id}`}
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
              <span style={{ color: idPartyColor(winner.party) }}>{winner.name}</span>{" "}
              {idFmtPct(winner.r2Share ?? winner.r1Share)}
            </span>
          ) : e.presAfter ? (
            <span>{e.presAfter.name}</span>
          ) : null}
          {runnerUp ? <span>def. {runnerUp.name}</span> : null}
          {e.turnout != null ? <span>turnout {idFmtPct(e.turnout)}</span> : null}
        </div>
      </div>
      {winner && runnerUp && (winner.r2Share ?? winner.r1Share) != null && (runnerUp.r2Share ?? runnerUp.r1Share) != null ? (
        <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
          <div style={{ width: `${winner.r2Share ?? winner.r1Share}%`, backgroundColor: idPartyColor(winner.party), marginRight: 1 }} title={`${winner.name}: ${idFmtPct(winner.r2Share ?? winner.r1Share)}`} />
          <div style={{ width: `${runnerUp.r2Share ?? runnerUp.r1Share}%`, backgroundColor: idPartyColor(runnerUp.party) }} title={`${runnerUp.name}: ${idFmtPct(runnerUp.r2Share ?? runnerUp.r1Share)}`} />
        </div>
      ) : null}
    </Link>
  );
}

export default function IdElectionsPage() {
  const { presEras, legEras, presidential, legislative, meta } = getIdElections();
  const records = computeIdRecords();
  const lastPres = presidential[presidential.length - 1];
  const lastLeg = legislative[legislative.length - 1];

  const legTurnout: ChartSeries = {
    name: "Legislative turnout",
    color: "#4ECDC4",
    points: legislative
      .filter((e) => e.turnout != null)
      .map((e) => ({ x: e.year, y: e.turnout as number, label: e.label })),
  };
  const golkarShare: ChartSeries = {
    name: "Golkar vote share",
    color: idPartyColor("Golkar"),
    points: legislative
      .filter((e) => e.year >= 1971)
      .map((e) => {
        const g = e.parties.find((p) => /Golkar|Golongan/i.test(p.name ?? ""));
        return g && g.share != null ? { x: e.year, y: g.share, label: e.label } : null;
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
        <span>Indonesia</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="id" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label="Presidential elections" value={String(presidential.length)} hint={`${presidential[0].year}–${lastPres.year}; direct since 2004`} />
        <StatTile label="Legislative elections" value={String(legislative.length)} hint={`${legislative[0].year}–${lastLeg.year}, including the Volksraad`} />
        <StatTile label="President today" value={lastPres.presAfter?.name ?? "—"} hint={`elected ${lastPres.year} in the first round`} />
        <StatTile label="2024 electorate" value="~205m" hint="the largest single-day election ever held" />
      </div>

      <JumpNav items={[["#presidential", "Presidential elections"], ["#chronology", "Legislative elections"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      {/* ---------- presidential ---------- */}
      <section id="presidential" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Presidential elections</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
          The six presidential contests of democratic Indonesia, newest first — one indirect Assembly vote
          in 1999, then five direct elections.
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
        colorOf={idPartyColor}
        fmtPct={idFmtPct}
        leaderTag="President"
        headline="Legislative elections"
        intro="Every legislative contest, newest first — the colonial Volksraad, the 1955 experiment, the New Order's managed votes and the reformasi DPR, each era labelled for what it was."
      />

      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The long arc in charts</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          Hover any point for the exact figure. New Order-era numbers are the regime&apos;s official record.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Golkar&apos;s official share, 1971–2024</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Engineered majorities of 60–75% under Suharto collapse to ordinary-party numbers the moment
              the elections turn real in 1999.
            </p>
            <LineChart series={[golkarShare]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout where recorded</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Indonesian turnout runs high — the New Order compelled it, and the reformasi era has kept it
              above 70% by choice, topping 80% in the 2019 and 2024 single-day votes.
            </p>
            <LineChart series={[legTurnout]} yMax={100} yTicks={[50, 75]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Indonesian elections work"
        cards={[
          ["The world's biggest election day", "Indonesia votes for president, the DPR and regional councils on a single day across three time zones and seventeen thousand islands — over 200 million voters, five ballots each, counted by hand."],
          ["Direct president, two rounds if needed", "Since 2004 the president is directly elected, needing a majority plus 20% in half the provinces; otherwise a runoff. A nomination threshold forces candidates to assemble big party coalitions first."],
          ["Open-list DPR", "The DPR's 580 seats are filled by open-list proportional representation with a 4% national threshold — a fragmented chamber in which no party has ever come close to a majority."],
          ["The New Order's shadow", "For three decades elections were staged with exactly three permitted parties and a mobilised bureaucracy. The reformasi rules — independent commission, freed parties, direct presidency — are all reactions to that machinery."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/indonesia", "Indonesia"],
          ["/elections/in", "Indian General Elections"],
          ["/elections/kr", "South Korean Elections"],
          ["/leaders", "World Leaders"],
        ]}
      />
    </main>
  );
}
