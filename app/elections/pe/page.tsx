import type { Metadata } from "next";
import Link from "next/link";
import { getPeElections, computePeRecords, pePartyColor, peFmtPct, type PePresElection } from "@/lib/peElections";
import { BASE_URL, SITE_NAME, ogImage } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/pe";
const TITLE = "Peruvian Elections";
const DESC =
  "Peru's presidential record from the electoral college of 1866 to the disputed runoff of June 2026, and its congressional record from 1931: a literacy bar on the franchise that lasted until 1979, two elections annulled outright, a self-coup that rewrote the constitution, a third-term election the article documents as fraudulent, and a Congress that has swung from two chambers to one and, in 2026, back to two.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: ogImage(TITLE, PATH), width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

function PresCard({ e }: { e: PePresElection }) {
  const byR2 = e.candidates.filter((c) => c.r2Share != null).sort((a, b) => (b.r2Share ?? 0) - (a.r2Share ?? 0));
  const byR1 = e.candidates.filter((c) => c.r1Share != null).sort((a, b) => (b.r1Share ?? 0) - (a.r1Share ?? 0));
  const winner = byR2[0] ?? byR1[0] ?? null;
  const runnerUp = byR2[1] ?? byR1[1] ?? null;
  return (
    <Link
      href={`/elections/pe/${e.id}`}
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
              <span style={{ color: pePartyColor(winner.party) }}>{winner.name}</span>{" "}
              {peFmtPct(winner.r2Share ?? winner.r1Share)}
            </span>
          ) : e.presAfter ? (
            <span>{e.presAfter.name}</span>
          ) : null}
          {runnerUp ? <span>def. {runnerUp.name}</span> : null}
          {e.turnout != null ? <span>turnout {peFmtPct(e.turnout)}</span> : null}
        </div>
      </div>
      {winner && runnerUp && (winner.r2Share ?? winner.r1Share) != null && (runnerUp.r2Share ?? runnerUp.r1Share) != null ? (
        <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
          <div style={{ width: `${winner.r2Share ?? winner.r1Share}%`, backgroundColor: pePartyColor(winner.party), marginRight: 1 }} title={`${winner.name}: ${peFmtPct(winner.r2Share ?? winner.r1Share)}`} />
          <div style={{ width: `${runnerUp.r2Share ?? runnerUp.r1Share}%`, backgroundColor: pePartyColor(runnerUp.party) }} title={`${runnerUp.name}: ${peFmtPct(runnerUp.r2Share ?? runnerUp.r1Share)}`} />
        </div>
      ) : null}
    </Link>
  );
}

export default function PeElectionsPage() {
  const { presEras, legEras, presidential, legislative, meta } = getPeElections();
  const records = computePeRecords();
  const modern = presidential;

  const presTurnout: ChartSeries = {
    name: "Presidential turnout",
    color: "#4ECDC4",
    points: modern
      .filter((e) => e.turnout != null && (e.turnout as number) <= 100)
      .map((e) => ({ x: e.year, y: e.turnout as number, label: e.label })),
  };
  const winnerShare: ChartSeries = {
    name: "Winner's decisive-round share",
    color: "#FFB400",
    points: modern
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
        <span>Peru</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="pe" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
        <p className="mt-2 text-xs uppercase tracking-widest text-[var(--text-dim)]">
          Source: Wikipedia election articles · as of {meta.built}
        </p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label={"Chamber seats"} value={"130"} hint={"D'Hondt in 27 districts; a new 60-seat Senate returned in 2026"} />
        <StatTile label={"Contests on file"} value={String(presidential.length + legislative.length)} hint={""} />
        <StatTile label={"June 2026"} value={"50.1%"} hint={"Fujimori's runoff margin over Sánchez, disputed by his campaign"} />
      </div>

      <JumpNav items={[["#presidential", "Presidential elections"], ["#chronology", "Congressional elections"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      {/* ---------- presidential first: the president makes the government ---------- */}
      <section id="presidential" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Presidential elections</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
          Every Peruvian presidential election on record here, from the electoral-college count of 1866 to the fraud-clouded margin of June 2026, newest first.
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
        colorOf={pePartyColor}
        fmtPct={peFmtPct}
        leaderTag="President"
        headline="Congressional elections"
        intro={"Every Peruvian congressional election on record here, newest first, reporting the Chamber of Deputies throughout the bicameral years (1931-1990 and 2026) so the series stays on one chamber even where an article prints the Senate's table first."}
      />

      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The long arc in charts</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          Hover any point for the exact figure.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              From the high eighties and low nineties under the mandatory-voting rules of the 1950s-60s down to 70.1% in 2021, the lowest first-round figure on record, before recovering slightly to 73.8% in 2026.
            </p>
            <LineChart series={[presTurnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The winner's decisive-round share</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Unopposed Aristocratic Republic candidates cleared 100% by definition. Every runoff since 1990 has been far tighter: Fujimori's 1990 landslide aside, no winner has cleared 63%, and three of the last four, 2016, 2021 and 2026, were decided by about a point.
            </p>
            <LineChart series={[winnerShare]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Peruvian elections work"
        cards={[
          ["A president elected in two rounds since 1990",
           "A first-round majority wins outright; short of that, the top two meet in a runoff four to eight weeks later. Every election from 1980 was decided this way in principle, but it took Fujimori's surprise 1990 win over Mario Vargas Llosa to produce the first actual runoff."],
          ["A lower house that keeps outliving the upper one",
           "Congress was bicameral from 1931 to 1992, unicameral from 1995 to 2021, and bicameral again from 2026. This page reports the Chamber of Deputies through every one of those changes, the chamber the 1995-2021 unicameral Congress descends from directly, rather than switching to whichever chamber's table a given article happens to print first."],
          ["The literacy bar and the Aristocratic Republic",
           "Illiterate Peruvians could not vote until the 1979 constitution, and for much of the Civilista-dominated period before 1930 that restricted franchise elected a single unopposed candidate. Universal suffrage and the elections it produced both date from 1980."],
          ["Two annulled elections and two self-coups",
           "Benavides annulled the 1936 result when his chosen successor started losing, and a 1962 military coup annulled Haya de la Torre's presidential plurality outright. Fujimori's 1992 self-coup rewrote the constitution that governs every election since 1995, and Pedro Castillo's own attempted self-coup in December 2022 ended his own presidency between two of the elections on this page."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/peru", "Peru"],
          ["/elections/co", "Colombian Elections"],
          ["/elections/cl", "Chilean Elections"],
          ["/elections/br", "Brazilian Elections"],
        ]}
      />
    </main>
  );
}
