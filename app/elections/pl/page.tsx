import type { Metadata } from "next";
import Link from "next/link";
import {
  getPlElections,
  computePlRecords,
  plPartyColor,
  plFmtPct,
  type PlPresElection,
} from "@/lib/plElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/pl";
const TITLE = "Polish Elections";
const DESC =
  "Polish elections from the Commonwealth's royal free elections of 1573 to the knife-edge presidential runoff of 2025: the Second Republic, the communist rituals labelled as such, the round-table breakthrough of 1989 and the Third Republic's fierce two-camp politics.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

function PresCard({ e }: { e: PlPresElection }) {
  const byBest = e.candidates
    .filter((c) => (c.r2Share ?? c.r1Share) != null)
    .sort((a, b) => ((b.r2Share ?? b.r1Share) ?? 0) - ((a.r2Share ?? a.r1Share) ?? 0));
  const winner = byBest[0] ?? null;
  const runnerUp = byBest[1] ?? null;
  return (
    <Link
      href={`/elections/pl/${e.id}`}
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
              <span style={{ color: plPartyColor(winner.party) }}>{winner.name}</span>{" "}
              {plFmtPct(winner.r2Share ?? winner.r1Share)}
            </span>
          ) : e.presAfter ? (
            <span>{e.presAfter.name}</span>
          ) : null}
          {runnerUp ? <span>def. {runnerUp.name}</span> : null}
          {e.turnout != null ? <span>turnout {plFmtPct(e.turnout)}</span> : null}
        </div>
      </div>
      {winner && runnerUp && (winner.r2Share ?? winner.r1Share) != null && (runnerUp.r2Share ?? runnerUp.r1Share) != null ? (
        <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
          <div style={{ width: `${winner.r2Share ?? winner.r1Share}%`, backgroundColor: plPartyColor(winner.party), marginRight: 1 }} title={`${winner.name}: ${plFmtPct(winner.r2Share ?? winner.r1Share)}`} />
          <div style={{ width: `${runnerUp.r2Share ?? runnerUp.r1Share}%`, backgroundColor: plPartyColor(runnerUp.party) }} title={`${runnerUp.name}: ${plFmtPct(runnerUp.r2Share ?? runnerUp.r1Share)}`} />
        </div>
      ) : null}
    </Link>
  );
}

export default function PlElectionsPage() {
  const { presEras, legEras, presidential, legislative, meta } = getPlElections();
  const records = computePlRecords();
  const lastPres = presidential[presidential.length - 1];
  const lastLeg = legislative[legislative.length - 1];

  const legTurnout: ChartSeries = {
    name: "Sejm-election turnout",
    color: "#4ECDC4",
    points: legislative
      .filter((e) => e.turnout != null && e.year >= 1989)
      .map((e) => ({ x: e.year, y: e.turnout as number, label: e.label })),
  };
  const presTurnout: ChartSeries = {
    name: "Presidential turnout (decisive round)",
    color: "#8A7CA8",
    points: presidential
      .filter((e) => e.year >= 1990)
      .map((e) => ({ x: e.year, y: (e.turnout2 ?? e.turnout) as number, label: `${e.label} presidential` }))
      .filter((p) => p.y != null),
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
        <span>Poland</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="pl" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label="Presidential & royal elections" value={String(presidential.length)} hint={`${presidential[0].year}–${lastPres.year}, from elected kings to direct runoffs`} />
        <StatTile label="Parliamentary elections" value={String(legislative.length)} hint={`${legislative[0].year}–${lastLeg.year}`} />
        <StatTile label="President today" value={lastPres.presAfter?.name ?? "—"} hint={`elected ${lastPres.year} in a knife-edge runoff`} />
        <StatTile label="2023 turnout" value="74.3%" hint="the Third Republic's record, beating even 1989" />
      </div>

      <JumpNav items={[["#chronology", "Parliamentary elections"], ["#presidential", "Presidents & kings"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      {/* ---------- legislative ---------- */}
      <Chronology
        eras={legEras}
        elections={legislative}
        hrefBase={PATH}
        colorOf={plPartyColor}
        fmtPct={plFmtPct}
        leaderTag="PM"
        headline="Parliamentary elections"
        intro="Every Sejm election, newest first: the Second Republic, the communist rituals labelled as such, the semi-free breakthrough of June 1989 and the fully free Third Republic."
      />

      {/* ---------- presidential & royal ---------- */}
      <section id="presidential" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Presidents, and elected kings</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
          All {presidential.length} contests for the Polish head of state, newest first: the direct
          two-round elections of the Third Republic, the National Assembly votes of the Second, and the
          Commonwealth&apos;s eleven royal free elections, when the assembled nobility chose the king.
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

      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The long arc in charts</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          The free era since 1989. Hover any point for the exact figure.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout since the round table</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Polish turnout was long the puzzle of postcommunist Europe, barely 40% in 2005, until the
              stakes of 2020, 2023 and 2025 drove record participation.
            </p>
            <LineChart series={[legTurnout, presTurnout]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">A two-camp republic</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Since 2005 every parliament and presidency has been a duel between Law and Justice and the
              Civic Platform camp, with the 2023 Sejm and the 2020 and 2025 runoffs each decided by a few
              points or less.
            </p>
            <div className="text-xs text-[var(--text-dim)] mt-6">
              Explore the chronology above for each contest&apos;s full result: every table sorts, and
              every era carries its story.
            </div>
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Polish elections work"
        cards={[
          ["Two rounds for president", "The president is directly elected for five years: a majority in round one, or a runoff between the top two a fortnight later, and the runoffs of 1995, 2020 and 2025 were all decided by roughly two points or less."],
          ["A proportional Sejm", "The Sejm's 460 seats are elected by open-list PR with a 5% threshold (8% for coalitions), thresholds that have repeatedly redrawn the map by wasting or rescuing whole blocs of votes."],
          ["Cohabitation by design", "President and Sejm are elected on different cycles, so opposing camps regularly share power: a presidential veto takes a three-fifths Sejm majority to override, which is the fulcrum of Polish politics today."],
          ["The oldest electoral habit", "Poland elected its kings for two centuries: every nobleman could vote in person on the election field. The franchise was nobility-only, but the tradition of the ballot deciding the throne is older here than almost anywhere."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/poland", "Poland"],
          ["/elections/de", "German Federal Elections"],
          ["/elections/eu", "European Parliament Elections"],
          ["/leaders", "World Leaders"],
        ]}
      />
    </main>
  );
}
