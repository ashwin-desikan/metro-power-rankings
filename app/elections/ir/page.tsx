import type { Metadata } from "next";
import Link from "next/link";
import {
  getIrElections,
  computeIrRecords,
  irPartyColor,
  irFmtPct,
  type IrPresElection,
} from "@/lib/irElections";
import { BASE_URL, SITE_NAME, ogImage } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/ir";
const TITLE = "Iranian Elections";
const DESC =
  "Iran's presidential record since 1980 and its parliamentary record since the Constitutional Revolution of 1906: a Majlis that forced a constitution out of a shah and was then bombarded, half a century of elections the court controlled, the single-party assembly of 1975, and the republic in which voters choose from a field an unelected council has already cut down.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: ogImage(TITLE, PATH), width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

function PresCard({ e }: { e: IrPresElection }) {
  const byR2 = e.candidates.filter((c) => c.r2Share != null).sort((a, b) => (b.r2Share ?? 0) - (a.r2Share ?? 0));
  const byR1 = e.candidates.filter((c) => c.r1Share != null).sort((a, b) => (b.r1Share ?? 0) - (a.r1Share ?? 0));
  const winner = byR2[0] ?? byR1[0] ?? null;
  const runnerUp = byR2[1] ?? byR1[1] ?? null;
  return (
    <Link
      href={`/elections/ir/${e.id}`}
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
              <span style={{ color: irPartyColor(winner.party) }}>{winner.name}</span>{" "}
              {irFmtPct(winner.r2Share ?? winner.r1Share)}
            </span>
          ) : e.presAfter ? (
            <span>{e.presAfter.name}</span>
          ) : null}
          {runnerUp ? <span>def. {runnerUp.name}</span> : null}
          {e.turnout != null ? <span>turnout {irFmtPct(e.turnout)}</span> : null}
        </div>
      </div>
      {winner && runnerUp && (winner.r2Share ?? winner.r1Share) != null && (runnerUp.r2Share ?? runnerUp.r1Share) != null ? (
        <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
          <div style={{ width: `${winner.r2Share ?? winner.r1Share}%`, backgroundColor: irPartyColor(winner.party), marginRight: 1 }} title={`${winner.name}: ${irFmtPct(winner.r2Share ?? winner.r1Share)}`} />
          <div style={{ width: `${runnerUp.r2Share ?? runnerUp.r1Share}%`, backgroundColor: irPartyColor(runnerUp.party) }} title={`${runnerUp.name}: ${irFmtPct(runnerUp.r2Share ?? runnerUp.r1Share)}`} />
        </div>
      ) : null}
    </Link>
  );
}

export default function IrElectionsPage() {
  const { presEras, legEras, presidential, legislative, meta } = getIrElections();
  const records = computeIrRecords();

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
        <span>Iran</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="ir" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
        <p className="mt-2 text-xs uppercase tracking-widest text-[var(--text-dim)]">
          Source: Wikipedia election articles · as of {meta.built}
        </p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label={"Majlis seats"} value={"290"} hint={"including five reserved for religious minorities"} />
        <StatTile label={"Contests on file"} value={String(presidential.length + legislative.length)} hint={""} />
        <StatTile label={"March 2024"} value={"40.6%"} hint={"the lowest turnout the republic has recorded"} />
      </div>

      <JumpNav items={[["#presidential", "Presidential elections"], ["#chronology", "Majlis elections"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      {/* ---------- presidential first: the president makes the government ---------- */}
      <section id="presidential" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Presidential elections</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
          Iran's presidential elections since 1980, newest first. Every one of them was fought on a field the Guardian Council had already cut down, which is what the restricted label on each row means.
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
        colorOf={irPartyColor}
        fmtPct={irFmtPct}
        leaderTag="President"
        headline="Majlis elections"
        intro={"Every Majlis election from the Constitutional Revolution of 1906, newest first. The 1975 assembly returned a single party in every seat and is marked as what it was."}
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
              From 80% in 1997 to 48% in 2021 and under 40% in the first round of 2024. The line falls fastest where the field was cut hardest.
            </p>
            <LineChart series={[presTurnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The winner's decisive-round share</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Landslides are normal when the alternatives have been removed: 94.5% in 1989, 69% in 1997, 72% in 2021. The exceptions are the elections that went to a runoff.
            </p>
            <LineChart series={[winnerShare]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Iranian elections work"
        cards={[
          ["The Guardian Council decides who may stand",
           "Twelve jurists, half of them appointed by the Supreme Leader, vet every candidate for the presidency and the Majlis before a vote is held. In 2021 they disqualified more than six hundred presidential applicants, including every woman who registered, and approved seven. That is why every contest on this page is marked as a restricted field."],
          ["A president who is not the head of state",
           "The president runs the government and is directly elected for four years, twice at most. The Supreme Leader commands the armed forces, appoints the judiciary and half the Guardian Council, and is chosen by an Assembly of Experts whose own candidates the Guardian Council vets. The presidency is a real office with a ceiling."],
          ["Factions, not parties",
           "Iranian elections are contested by lists and coalitions that form for one campaign and dissolve after it, which is why the tables here name alliances such as the List of Hope or the Coalition Council rather than parties. Reading them as a party system will mislead you."],
          ["Turnout as the opposition's ballot",
           "With the field pre-selected, the number that moves is participation. It ran at 80% for Khatami in 1997 and 41% for the Majlis in 2024, after reformist organisations called for a boycott and the outgoing president called the low figure a blow to the republic's opponents."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/iran", "Iran"],
          ["/elections/tr", "Turkish Elections"],
          ["/elections/iq", "Iraqi Elections"],
          ["/elections/eg", "Egyptian Elections"],
        ]}
      />
    </main>
  );
}
