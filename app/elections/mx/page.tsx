import type { Metadata } from "next";
import Link from "next/link";
import {
  getMxElections,
  computeMxRecords,
  mxPartyColor,
  mxFmtPct,
  type MxPresElection,
} from "@/lib/mxElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/mx";
const TITLE = "Mexican Elections";
const DESC =
  "Every Mexican presidential election from 1853 to 2024 and the Chamber of Deputies midterms since 1943 — Santa Anna, the Porfiriato, the Revolution, seventy years of one-party rule and the democratic transition, stated plainly throughout, for novices and experts alike.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

function PresCard({ e }: { e: MxPresElection }) {
  const byR1 = e.candidates.filter((c) => c.r1Share != null).sort((a, b) => (b.r1Share ?? 0) - (a.r1Share ?? 0));
  const winner = byR1[0] ?? null;
  const runnerUp = byR1[1] ?? null;
  return (
    <Link
      href={`/elections/mx/${e.id}`}
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
              <span style={{ color: mxPartyColor(winner.party) }}>{winner.name}</span>{" "}
              {mxFmtPct(winner.r1Share)}
            </span>
          ) : e.presAfter ? (
            <span>{e.presAfter.name}</span>
          ) : null}
          {runnerUp ? <span>def. {runnerUp.name}</span> : null}
          {e.turnout != null ? <span>turnout {mxFmtPct(e.turnout)}</span> : null}
        </div>
      </div>
      {winner && winner.r1Share != null ? (
        <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
          <div style={{ width: `${winner.r1Share}%`, backgroundColor: mxPartyColor(winner.party), marginRight: 1 }} title={`${winner.name}: ${mxFmtPct(winner.r1Share)}`} />
          {runnerUp && runnerUp.r1Share != null ? (
            <div style={{ width: `${runnerUp.r1Share}%`, backgroundColor: mxPartyColor(runnerUp.party) }} title={`${runnerUp.name}: ${mxFmtPct(runnerUp.r1Share)}`} />
          ) : null}
        </div>
      ) : null}
    </Link>
  );
}

export default function MxElectionsPage() {
  const { presEras, legEras, presidential, legislative, meta } = getMxElections();
  const records = computeMxRecords();
  const lastPres = presidential[presidential.length - 1];
  const lastLeg = legislative[legislative.length - 1];

  const presTurnout: ChartSeries = {
    name: "Presidential turnout",
    color: "#4ECDC4",
    points: presidential
      .filter((e) => e.turnout != null)
      .map((e) => ({ x: e.year, y: e.turnout as number, label: e.label })),
  };
  const winnerShare: ChartSeries = {
    name: "Winner's share",
    color: "#FFB400",
    points: presidential
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
        <span>Mexico</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="mx" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label="Presidential elections" value={String(presidential.length)} hint={`${presidential[0].year}–${lastPres.year}`} />
        <StatTile label="Chamber midterms" value={String(legislative.length)} hint={`${legislative[0].year}–${lastLeg.year}`} />
        <StatTile label="President today" value={lastPres.presAfter?.name ?? "—"} hint={`elected ${lastPres.year} · single six-year term`} />
        <StatTile label="One-party rule" value="71 years" hint="1929–2000, the longest run of the twentieth century" />
      </div>

      <JumpNav items={[["#presidential", "Presidential elections"], ["#chronology", "Chamber midterms"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      {/* ---------- presidential ---------- */}
      <section id="presidential" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Presidential elections</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
          All {presidential.length} presidential contests, newest first. The arranged elections of the
          Porfiriato and the hegemonic-party decades are labelled as such on every page — the numbers are
          the official record, not evidence of a free vote.
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
        colorOf={mxPartyColor}
        fmtPct={mxFmtPct}
        leaderTag="President"
        headline="Chamber of Deputies midterms"
        intro="The midterm elections for the Chamber of Deputies, newest first — the contests that turned from rituals of an official majority into genuine referendums on each presidency."
      />

      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The long arc in charts</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          Hover any point for the exact figure. Early figures are the official record of managed contests.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The winner&apos;s share, 1853–2024</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Near-unanimous &quot;victories&quot; under Díaz and the early PRI collapse into real numbers:
              the 50.7% of 1988, Calderón&apos;s 0.6-point win in 2006, and the Morena landslides.
            </p>
            <LineChart series={[winnerShare]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout where it was recorded</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Reliable turnout series begin late in Mexico; the competitive era has ranged from 77% in the
              watershed 1994 election to the low 60s since.
            </p>
            <LineChart series={[presTurnout]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Mexican elections work"
        cards={[
          ["One round, one term", "The presidency is won by simple plurality in a single round, for a single six-year term — the sexenio. No re-election, ever: the Revolution's founding slogan is written into the constitution."],
          ["A mixed Chamber", "The Chamber of Deputies mixes 300 district seats with 200 proportional seats, elected every three years — so every president faces a midterm referendum halfway through the sexenio."],
          ["From ritual to referee", "For six decades the official party controlled the count itself. The independent electoral institute built in the 1990s — today's INE — is the institution that made 1997, 2000 and everything since believable."],
          ["Alliances on the ballot", "Modern contests are fought by coalitions — Morena with the Greens and PT, the PAN with its rivals-turned-partners — so a candidate's vote is an alliance total across several party columns."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/mexico", "Mexico"],
          ["/elections/us", "US Presidential Elections"],
          ["/elections/br", "Brazilian Elections"],
          ["/leaders", "World Leaders"],
        ]}
      />
    </main>
  );
}
