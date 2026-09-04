import type { Metadata } from "next";
import Link from "next/link";
import {
  getFrElections,
  computeFrRecords,
  frPartyColor,
  frFmtPct,
  type FrPresElection,
} from "@/lib/frElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/fr";
const TITLE = "French Elections";
const DESC =
  "Every French legislative election from the Revolution of 1791 to the snap vote of 2024, and every Fifth Republic presidential election from 1958 to 2022: the results, the leaders and the story of each, across five republics, two empires and three monarchies.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

function PresCard({ e }: { e: FrPresElection }) {
  const byR2 = e.candidates.filter((c) => c.r2Share != null).sort((a, b) => (b.r2Share ?? 0) - (a.r2Share ?? 0));
  const byR1 = e.candidates.filter((c) => c.r1Share != null).sort((a, b) => (b.r1Share ?? 0) - (a.r1Share ?? 0));
  const winner = byR2[0] ?? byR1[0] ?? null;
  const runnerUp = byR2[1] ?? byR1[1] ?? null;
  return (
    <Link
      href={`/elections/fr/${e.id}`}
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
              <span style={{ color: frPartyColor(winner.party) }}>{winner.name}</span>{" "}
              {frFmtPct(winner.r2Share ?? winner.r1Share)}
            </span>
          ) : null}
          {runnerUp ? <span>def. {runnerUp.name}</span> : null}
          {e.turnout != null ? <span>turnout {frFmtPct(e.turnout)}</span> : null}
        </div>
      </div>
      {winner && runnerUp && winner.r2Share != null && runnerUp.r2Share != null ? (
        <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
          <div style={{ width: `${winner.r2Share}%`, backgroundColor: frPartyColor(winner.party), marginRight: 1 }} title={`${winner.name}: ${frFmtPct(winner.r2Share)}`} />
          <div style={{ width: `${runnerUp.r2Share}%`, backgroundColor: frPartyColor(runnerUp.party) }} title={`${runnerUp.name}: ${frFmtPct(runnerUp.r2Share)}`} />
        </div>
      ) : null}
    </Link>
  );
}

export default function FrElectionsPage() {
  const { legEras, presEras, legislative, presidential, meta } = getFrElections();
  const records = computeFrRecords();
  const lastLeg = legislative[legislative.length - 1];
  const lastPres = presidential[presidential.length - 1];

  const legTurnout: ChartSeries = {
    name: "Legislative turnout",
    color: "#4ECDC4",
    points: legislative
      .filter((e) => e.turnout != null)
      .map((e) => ({ x: e.year, y: e.turnout as number, label: e.label })),
  };
  const presTurnout: ChartSeries = {
    name: "Presidential turnout (first round)",
    color: "#8A7CA8",
    points: presidential
      .filter((e) => e.turnout != null && e.year >= 1965)
      .map((e) => ({ x: e.year, y: e.turnout as number, label: `${e.label} presidential` })),
  };
  const runoffWinner: ChartSeries = {
    name: "Winner's runoff share",
    color: "#FFB400",
    points: presidential
      .filter((e) => e.year >= 1965)
      .map((e) => {
        const w = e.candidates.filter((c) => c.r2Share != null).sort((a, b) => (b.r2Share ?? 0) - (a.r2Share ?? 0))[0];
        return w ? { x: e.year, y: w.r2Share as number, label: `${e.label}: ${w.name}` } : null;
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
        <span>France</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="fr" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label="Legislative elections" value={String(legislative.length)} hint={`${legislative[0].year}–${lastLeg.year}, across every regime since 1791`} />
        <StatTile label="Presidential elections" value={String(presidential.length)} hint={`${presidential[0].year}–${lastPres.year}, Fifth Republic`} />
        <StatTile label="National Assembly seats" value={String(lastLeg.totalSeats ?? "—")} hint={lastLeg.majoritySeats ? `${lastLeg.majoritySeats} for a majority` : undefined} />
        <StatTile label="President today" value={lastPres.presAfter?.name ?? "—"} hint={`re-elected ${lastPres.year} · next due 2027`} />
      </div>

      <JumpNav items={[["#presidential", "Presidential elections"], ["#chronology", "Legislative chronology"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      {/* ---------- presidential ---------- */}
      <section id="presidential" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Presidential elections</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
          The Fifth Republic&apos;s twelve presidential contests, newest first, one by electoral college in
          1958, then by direct two-round vote since 1965. Click any election for both rounds in full.
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
        colorOf={frPartyColor}
        fmtPct={frFmtPct}
        leaderTag="PM"
        headline="Legislative elections"
        intro="Every election to France's lower chamber, newest first, grouped into seven eras from the Revolution to the Fifth Republic. Click any election for the full result and the story."
      />

      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The long arc in charts</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          Hover any point for the exact figure.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Two turnouts, two stories</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Presidential elections still draw quorums above 70%, but legislative turnout collapsed once the
              Assembly vote became the presidency&apos;s echo, from 80% before 2002 to under 48% in 2022,
              before 2024&apos;s snap election snapped it back.
            </p>
            <LineChart series={[legTurnout, presTurnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The runoff verdicts, 1965–2022</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              The winner&apos;s second-round share: Giscard&apos;s 50.8% squeaker in 1974, Chirac&apos;s 82%
              republican-front landslide against Le Pen in 2002, and Macron&apos;s narrowing rematch margin
              in 2022.
            </p>
            <LineChart series={[runoffWinner]} yMax={100} yTicks={[50, 75]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase="/elections/fr" />

      <HowItWorks
        title="How French elections work"
        cards={[
          ["Two rounds, always", "Both the presidency and Assembly seats use runoffs: if nobody wins outright, the top candidates meet again two weeks later. Round one is for choosing, round two for eliminating, the system that built the 'republican front'."],
          ["President and Assembly", "The president is head of state, but governments answer to the Assembly. When the two disagree, 1986, 1993, 1997, France gets cohabitation: a president of one camp, a prime minister of the other."],
          ["The five-year alignment", "Since 2002 presidential terms match the Assembly's, with legislative elections held weeks after the presidential vote, designed to hand new presidents a majority, which worked every time until 2022."],
          ["A history of franchises", "France has voted under property qualifications, universal male suffrage (1848, a European first), and full universal suffrage only from 1945, the same country, five republics, and a dozen electoral systems along the way."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/france", "France"],
          ["/elections/de", "German Federal Elections"],
          ["/elections/eu", "European Parliament Elections"],
          ["/leaders", "World Leaders"],
        ]}
      />
    </main>
  );
}
