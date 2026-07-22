import type { Metadata } from "next";
import Link from "next/link";
import {
  getNgElections,
  computeNgRecords,
  ngPartyColor,
  ngFmtPct,
  type NgPresElection,
} from "@/lib/ngElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/ng";
const TITLE = "Nigerian Elections";
const DESC =
  "Nigerian elections from Africa's first colonial vote in 1923 to the three-way contest of 2023 — the regional politics that broke the First Republic, the annulled June 12 election, and the Fourth Republic's unbroken run in Africa's largest democracy.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

function PresCard({ e }: { e: NgPresElection }) {
  const byBest = e.candidates
    .filter((c) => (c.r2Share ?? c.r1Share) != null)
    .sort((a, b) => ((b.r2Share ?? b.r1Share) ?? 0) - ((a.r2Share ?? a.r1Share) ?? 0));
  const winner = byBest[0] ?? null;
  const runnerUp = byBest[1] ?? null;
  return (
    <Link
      href={`/elections/ng/${e.id}`}
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
              <span style={{ color: ngPartyColor(winner.party) }}>{winner.name}</span>{" "}
              {ngFmtPct(winner.r2Share ?? winner.r1Share)}
            </span>
          ) : e.presAfter ? (
            <span>{e.presAfter.name}</span>
          ) : null}
          {runnerUp ? <span>def. {runnerUp.name}</span> : null}
          {e.turnout != null ? <span>turnout {ngFmtPct(e.turnout)}</span> : null}
        </div>
      </div>
      {winner && runnerUp && (winner.r2Share ?? winner.r1Share) != null && (runnerUp.r2Share ?? runnerUp.r1Share) != null ? (
        <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
          <div style={{ width: `${winner.r2Share ?? winner.r1Share}%`, backgroundColor: ngPartyColor(winner.party), marginRight: 1 }} title={`${winner.name}: ${ngFmtPct(winner.r2Share ?? winner.r1Share)}`} />
          <div style={{ width: `${runnerUp.r2Share ?? runnerUp.r1Share}%`, backgroundColor: ngPartyColor(runnerUp.party) }} title={`${runnerUp.name}: ${ngFmtPct(runnerUp.r2Share ?? runnerUp.r1Share)}`} />
        </div>
      ) : null}
    </Link>
  );
}

export default function NgElectionsPage() {
  const { presEras, legEras, presidential, legislative, meta } = getNgElections();
  const records = computeNgRecords();
  const lastPres = presidential[presidential.length - 1];
  const lastLeg = legislative[legislative.length - 1];

  const presTurnout: ChartSeries = {
    name: "Presidential turnout",
    color: "#4ECDC4",
    points: presidential
      .filter((e) => e.turnout != null)
      .map((e) => ({ x: e.year, y: e.turnout as number, label: `${e.label} presidential` })),
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
        <span>Nigeria</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="ng" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label="Presidential elections" value={String(presidential.length)} hint={`${presidential[0].year}–${lastPres.year}, including annulled June 12`} />
        <StatTile label="Parliamentary elections" value={String(legislative.length)} hint={`${legislative[0].year}–${lastLeg.year}, from four elected seats to 360`} />
        <StatTile label="President today" value={lastPres.presAfter?.name ?? "—"} hint={`elected ${lastPres.year} with 36.6% in a three-way race`} />
        <StatTile label="Fourth Republic" value="1999" hint="seven presidential votes without the army returning" />
      </div>

      <JumpNav items={[["#presidential", "Presidential elections"], ["#chronology", "Parliamentary elections"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      {/* ---------- presidential ---------- */}
      <section id="presidential" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Presidential elections</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
          All {presidential.length} presidential contests, newest first — with the rigged 1983
          re-election, the annulled election of June 12, 1993 and the flawed 2007 handover labelled
          for what they were.
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
        colorOf={ngPartyColor}
        fmtPct={ngFmtPct}
        leaderTag="PM"
        headline="Parliamentary elections"
        intro="Every legislative election, newest first — the Legislative Council's four elected seats, the regional parliaments of the First Republic, and the National Assembly since 1979."
      />

      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The long arc in charts</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          Hover any point for the exact figure.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The turnout collapse</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Nigerian presidential turnout has fallen at almost every Fourth Republic election —
              from above 50% in 2003 to 26.7% in 2023, the era&apos;s starkest warning sign.
            </p>
            <LineChart series={[presTurnout]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">From two parties to three</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              The PDP dominated 1999–2011; the APC merger won in 2015 and 2019; and in 2023 Peter
              Obi&apos;s Labour surge broke the duopoly, carrying Lagos and the capital — explore each
              contest above for the full result.
            </p>
            <div className="text-xs text-[var(--text-dim)] mt-6">
              Every table sorts, and every era carries its story.
            </div>
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Nigerian elections work"
        cards={[
          ["The federal spread rule", "Winning the presidency takes the most votes plus a quarter of the vote in two-thirds of the 36 states — a federal-character rule born of the 1979 'twelve two-thirds' dispute, designed to force coalitions across region and religion."],
          ["One day, three ballots", "Presidential, Senate and House elections are held together: 109 senators (three per state) and 360 representatives. Governorships follow weeks later — Nigeria elects almost everything in a single season."],
          ["June 12", "The freest election Nigeria had held was annulled in 1993 by the military regime that organised it. Its winner died in detention; its date is now Democracy Day, and its memory is the Fourth Republic's founding grievance."],
          ["Region is the fault line", "From the NPC-NCNC-AG triangle of the 1950s to today's north–south zoning conventions, Nigerian elections are won by assembling regional coalitions — the informal rule that the presidency rotates between north and south still shapes every contest."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/nigeria", "Nigeria"],
          ["/elections/za", "South African General Elections"],
          ["/elections/il", "Israeli Elections"],
          ["/leaders", "World Leaders"],
        ]}
      />
    </main>
  );
}
