import type { Metadata } from "next";
import Link from "next/link";
import { getVeElections, computeVeRecords, vePartyColor, veFmtPct, type VePresElection } from "@/lib/veElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/ve";
const TITLE = "Venezuelan Elections";
const DESC =
  "Venezuela's presidential record from Congress's indirect 1936 vote to the disputed count of July 2024, and its legislative record from 1947: the trienio and the coup that ended it, the Punto Fijo pact of Democratic Action and Copei, the two-party system Hugo Chavez broke in 1998, and a Maduro era in which the main opposition has boycotted three of the last four legislative elections.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

function PresCard({ e }: { e: VePresElection }) {
  const byR2 = e.candidates.filter((c) => c.r2Share != null).sort((a, b) => (b.r2Share ?? 0) - (a.r2Share ?? 0));
  const byR1 = e.candidates.filter((c) => c.r1Share != null).sort((a, b) => (b.r1Share ?? 0) - (a.r1Share ?? 0));
  const winner = byR2[0] ?? byR1[0] ?? null;
  const runnerUp = byR2[1] ?? byR1[1] ?? null;
  return (
    <Link
      href={`/elections/ve/${e.id}`}
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
              <span style={{ color: vePartyColor(winner.party) }}>{winner.name}</span>{" "}
              {veFmtPct(winner.r2Share ?? winner.r1Share)}
            </span>
          ) : e.presAfter ? (
            <span>{e.presAfter.name}</span>
          ) : null}
          {runnerUp ? <span>def. {runnerUp.name}</span> : null}
          {e.turnout != null ? <span>turnout {veFmtPct(e.turnout)}</span> : null}
        </div>
      </div>
      {winner && runnerUp && (winner.r2Share ?? winner.r1Share) != null && (runnerUp.r2Share ?? runnerUp.r1Share) != null ? (
        <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
          <div style={{ width: `${winner.r2Share ?? winner.r1Share}%`, backgroundColor: vePartyColor(winner.party), marginRight: 1 }} title={`${winner.name}: ${veFmtPct(winner.r2Share ?? winner.r1Share)}`} />
          <div style={{ width: `${runnerUp.r2Share ?? runnerUp.r1Share}%`, backgroundColor: vePartyColor(runnerUp.party) }} title={`${runnerUp.name}: ${veFmtPct(runnerUp.r2Share ?? runnerUp.r1Share)}`} />
        </div>
      ) : null}
    </Link>
  );
}

export default function VeElectionsPage() {
  const { presEras, legEras, presidential, legislative, meta } = getVeElections();
  const records = computeVeRecords();
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
        <span>Venezuela</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="ve" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
        <p className="mt-2 text-xs uppercase tracking-widest text-[var(--text-dim)]">
          Source: Wikipedia election articles · as of {meta.built}
        </p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label={"National Assembly"} value={"285"} hint={"143 seats needed for a majority"} />
        <StatTile label={"Contests on file"} value={String(presidential.length + legislative.length)} hint={""} />
        <StatTile label={"July 2024"} value={"Disputed"} hint={"CNE declared Maduro the winner with no precinct tallies published"} />
      </div>

      <JumpNav items={[["#presidential", "Presidential elections"], ["#chronology", "Legislative elections"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      {/* ---------- presidential first: the president makes the government ---------- */}
      <section id="presidential" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Presidential elections</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
          Every Venezuelan presidential contest on record here, from Congress's indirect vote of 1936 to the disputed count of July 2024, newest first. Perez Jimenez's 1952 plebiscite is not in the source used here, so 1958 follows 1947 directly.
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
        colorOf={vePartyColor}
        fmtPct={veFmtPct}
        leaderTag="President"
        headline="Legislative elections"
        intro={"Every Venezuelan legislative election on record here, newest first, reporting the Chamber of Deputies to 1998 and the National Assembly from 2000."}
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
              Turnout ran above 80% at nearly every Punto Fijo and early Chavez election. It fell to 45.7% for Maduro's boycotted 2018 re-election and to 30.5% for the boycotted 2020 legislative vote, before recovering somewhat once the opposition began contesting again.
            </p>
            <LineChart series={[presTurnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The largest party's presidential share</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Democratic Action and Copei traded wins in the 40 to 57% range for most of Punto Fijo. Chavez cleared 55% at every election he won; Maduro's declared shares since 2013 have run from just over 50% to a disputed 68% in 2018.
            </p>
            <LineChart series={[winnerShare]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Venezuelan elections work"
        cards={[
          ["A president elected in one round",
           "The presidency has always gone to whoever wins a plurality, with no runoff at any point in this record. Term length has varied, from five years under most of the twentieth century's constitutions to six years since 1999."],
          ["A chamber that changed shape twice",
           "Congress was bicameral, a Chamber of Deputies and a Senate, from 1947 to 1998. The 1999 constitution replaced it with a single National Assembly, currently 285 seats chosen by a mix of party lists and single-member districts."],
          ["A vote Congress cast, not the public",
           "Venezuela's president was chosen indirectly, by Congress rather than by popular ballot, in 1936 and 1941 following Juan Vicente Gomez's twenty-seven years in power. Perez Jimenez's own 1952 plebiscite is not in the source used here, so this page's presidential series jumps from the 1948 coup straight to the restored democracy of 1958."],
          ["Boycotts as the opposition's tool",
           "Facing a field it judged rigged against it, the opposition withdrew from the 2005, 2020 and 2025 legislative elections and the 2018 presidential one rather than contest them, leaving the governing coalition close to every seat on offer."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/venezuela", "Venezuela"],
          ["/elections/co", "Colombian Elections"],
          ["/elections/br", "Brazilian Elections"],
        ]}
      />
    </main>
  );
}
