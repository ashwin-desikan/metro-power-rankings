import type { Metadata } from "next";
import Link from "next/link";
import {
  getIqElections,
  computeIqRecords,
  iqPartyColor,
  iqFmtPct,
  type IqPresElection,
} from "@/lib/iqElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/iq";
const TITLE = "Iraqi Elections";
const DESC =
  "Eighty years of Iraqi voting, recorded honestly: the managed chambers of the Hashemite monarchy, Saddam's single-list rituals and 99.99% referendums, the purple-finger election of 2005 held under fire — and an unbroken run of competitive parliamentary elections since, through civil war, ISIS and the Tishreen uprising.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

function PresCard({ e }: { e: IqPresElection }) {
  const byBest = e.candidates
    .filter((c) => (c.r2Share ?? c.r1Share) != null)
    .sort((a, b) => ((b.r2Share ?? b.r1Share) ?? 0) - ((a.r2Share ?? a.r1Share) ?? 0));
  const winner = byBest[0] ?? null;
  const runnerUp = byBest[1] ?? null;
  return (
    <Link
      href={`/elections/iq/${e.id}`}
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
              {e.unfree ? "not a free vote" : "indirect vote"}
            </span>
          ) : null}
          <span className="text-xs text-[var(--text-dim)]">{e.date}</span>
        </div>
        <div className="text-xs text-[var(--text-muted)] tabular-nums flex gap-3">
          {winner ? (
            <span>
              <span style={{ color: iqPartyColor(winner.party) }}>{winner.name}</span>{" "}
              {iqFmtPct(winner.r2Share ?? winner.r1Share)}
            </span>
          ) : e.presAfter ? (
            <span>{e.presAfter.name}</span>
          ) : null}
          {runnerUp ? <span>def. {runnerUp.name}</span> : null}
          {e.turnout != null ? <span>turnout {iqFmtPct(e.turnout)}</span> : null}
        </div>
      </div>
      {winner && runnerUp && (winner.r2Share ?? winner.r1Share) != null && (runnerUp.r2Share ?? runnerUp.r1Share) != null ? (
        <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
          <div style={{ width: `${winner.r2Share ?? winner.r1Share}%`, backgroundColor: iqPartyColor(winner.party), marginRight: 1 }} title={`${winner.name}: ${iqFmtPct(winner.r2Share ?? winner.r1Share)}`} />
          <div style={{ width: `${runnerUp.r2Share ?? runnerUp.r1Share}%`, backgroundColor: iqPartyColor(runnerUp.party) }} title={`${runnerUp.name}: ${iqFmtPct(runnerUp.r2Share ?? runnerUp.r1Share)}`} />
        </div>
      ) : null}
    </Link>
  );
}

export default function IqElectionsPage() {
  const { presEras, legEras, presidential, legislative, meta } = getIqElections();
  const records = computeIqRecords();

  const turnoutSeries: ChartSeries = {
    name: "Turnout",
    color: "#006233",
    points: legislative
      .filter((e) => e.turnout != null && e.year >= 2005)
      .map((e) => ({ x: e.year, y: e.turnout as number, label: `${e.label} parliamentary` })),
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
        <span>Iraq</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="iq" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label="Parliamentary elections" value={String(legislative.length)} hint="1946–2025: monarchy, Ba'athist rituals, and the federal republic" />
        <StatTile label="Presidential votes" value={String(presidential.length)} hint="two Saddam referendums, four parliamentary elections of a ceremonial president" />
        <StatTile label="Competitive elections since 2005" value="7" hint="an unbroken run from the purple fingers of January 2005 to November 2025" />
        <StatTile label="Saddam's 2002 score" value="100%" hint="eleven million official votes, none against — recorded as an artefact of terror" />
      </div>

      <JumpNav items={[["#presidential", "Presidential votes"], ["#chronology", "Parliamentary elections"], ["#charts", "The long arc in charts"], ["#records", "The numbers to know"], ["#how-it-works", "How it works"]]} />

      {/* ---------- presidential ---------- */}
      <section id="presidential" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Presidential votes</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
          Two kinds of contest that could not be less alike: Saddam&apos;s yes-or-no referendums,
          and the parliament&apos;s repeatedly deadlocked elections of a ceremonial president —
          by convention a Kurd — since 2014.
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
        colorOf={iqPartyColor}
        fmtPct={iqFmtPct}
        leaderTag="PM"
        headline="Parliamentary elections"
        intro="Every national parliamentary vote, newest first — the Council of Representatives era with real winners and losers, the Ba'athist National Assembly rituals labelled for what they were, and the managed chambers of the monarchy."
      />

      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The long arc in charts</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          Hover any point for the exact figure.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout in the federal era, 2005–2025</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              The slide and the rebound: from the defiant queues of 2005 down to 43% after the
              Tishreen uprising shattered faith in the party system, then back above 56% in 2025.
            </p>
            <LineChart series={[turnoutSeries]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Why the Ba&apos;athist numbers are not data</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              The National Assembly elections of 1980–2000 and the referendums of 1995 and 2002
              reported whatever the regime required — 99.99%, then a perfect 100. They appear in
              the chronology with their honest labels, and in no chart: announced unanimity
              measures fear, not opinion.
            </p>
            <div className="text-xs text-[var(--text-dim)] mt-6">
              Explore the chronologies above — every table sorts, and every entry carries its label.
            </div>
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} headline="The numbers to know" />

      <HowItWorks
        title="How Iraqi elections work"
        cards={[
          ["The Council of Representatives", "329 seats elected by proportional representation by governorate, with quota seats for women (a quarter of the chamber) and for Christian, Yazidi, Shabak, Mandaean and Feyli Kurd minorities. The electoral law has changed before nearly every election."],
          ["Forming a government", "No party has ever approached a majority, so governments emerge from months of negotiation between Shia, Sunni and Kurdish blocs. The record: nine months after 2010, a year after 2021, and five months to elect a president after 2025."],
          ["The ethno-sectarian convention", "By convention since 2005 the presidency goes to a Kurd, the premiership to a Shia Arab and the speakership to a Sunni Arab. The president is elected by parliament with a two-thirds quorum — the source of repeated deadlocks."],
          ["What the labels mean", "Monarchy-era elections were managed by the palace; Ba'athist votes were rituals under state terror; everything since January 2005 has been genuinely competitive, held under violence but not falsified — each entry says which it is."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/iraq", "Iraq"],
          ["/elections/tr", "Turkish Elections"],
          ["/elections/il", "Israeli Elections"],
          ["/elections/under-fire", "Elections Under Fire"],
        ]}
      />
    </main>
  );
}
