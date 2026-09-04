import type { Metadata } from "next";
import Link from "next/link";
import {
  getIeElections,
  computeIeRecords,
  iePartyColor,
  ieFmtPct,
  type IePresElection,
} from "@/lib/ieElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/ie";
const TITLE = "Irish Elections";
const DESC =
  "Every Dáil election from 1922 to 2024 and every presidential contest since 1938: the Treaty split that set the party system for ninety years, de Valera's long ascendancy, the 1977 landslide that broke the economy, the crash that broke Fianna Fáil, and the two civil-war parties finally governing together.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

function PresCard({ e }: { e: IePresElection }) {
  const byR2 = e.candidates.filter((c) => c.r2Share != null).sort((a, b) => (b.r2Share ?? 0) - (a.r2Share ?? 0));
  const byR1 = e.candidates.filter((c) => c.r1Share != null).sort((a, b) => (b.r1Share ?? 0) - (a.r1Share ?? 0));
  const winner = byR2[0] ?? byR1[0] ?? null;
  const runnerUp = byR2[1] ?? byR1[1] ?? null;
  return (
    <Link
      href={`/elections/ie/${e.id}`}
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
              <span style={{ color: iePartyColor(winner.party) }}>{winner.name}</span>{" "}
              {ieFmtPct(winner.r2Share ?? winner.r1Share)}
            </span>
          ) : e.presAfter ? (
            <span>{e.presAfter.name}</span>
          ) : null}
          {runnerUp ? <span>def. {runnerUp.name}</span> : null}
          {e.turnout != null ? <span>turnout {ieFmtPct(e.turnout)}</span> : null}
        </div>
      </div>
      {winner && runnerUp && (winner.r2Share ?? winner.r1Share) != null && (runnerUp.r2Share ?? runnerUp.r1Share) != null ? (
        <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
          <div style={{ width: `${winner.r2Share ?? winner.r1Share}%`, backgroundColor: iePartyColor(winner.party), marginRight: 1 }} title={`${winner.name}: ${ieFmtPct(winner.r2Share ?? winner.r1Share)}`} />
          <div style={{ width: `${runnerUp.r2Share ?? runnerUp.r1Share}%`, backgroundColor: iePartyColor(runnerUp.party) }} title={`${runnerUp.name}: ${ieFmtPct(runnerUp.r2Share ?? runnerUp.r1Share)}`} />
        </div>
      ) : null}
    </Link>
  );
}

export default function IeElectionsPage() {
  const { presEras, legEras, presidential, legislative, meta } = getIeElections();
  const records = computeIeRecords();
  const lastPres = presidential[presidential.length - 1];

  const presTurnout: ChartSeries = {
    name: "Presidential turnout",
    color: "#4ECDC4",
    points: presidential
      .filter((e) => e.turnout != null)
      .map((e) => ({ x: e.year, y: e.turnout as number, label: e.label })),
  };
  const runoffWinner: ChartSeries = {
    name: "Winner's decisive-round share",
    color: "#FFB400",
    points: presidential
      .filter((e) => e.year >= 1945)
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
        <span>Ireland</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="ie" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label="Dáil seats" value="174" hint="88 for a majority" />
        <StatTile label="Elections since 1922" value={String(legislative.length + presidential.length)} hint="legislative and presidential" />
        <StatTile label="Uncontested presidencies" value="5" hint="of 13, a single nominee, no vote held" />
      </div>

      <JumpNav items={[["#chronology", "Parliamentary elections"], ["#presidential", "Presidential elections"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      {/* ---------- legislative ---------- */}
      <Chronology
        eras={legEras}
        elections={legislative}
        hrefBase={PATH}
        colorOf={iePartyColor}
        fmtPct={ieFmtPct}
        leaderTag="President"
        headline="Parliamentary elections"
        intro="Every Dáil election since the Free State, newest first. Seats are the count's final figure, not the first-preference standing, which is why the two columns disagree so often."
      />

      {/* ---------- presidential ---------- */}
      <section id="presidential" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Presidential elections</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
          All thirteen presidential elections, newest first. Five were never held: a single nominee was returned unopposed, and those rows carry no result because there was none.
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
          Hover any point for the exact figure.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout since 1922</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Above 70% for most of the century, and below 63% at four of the last five elections. Irish turnout is now among the lower half in western Europe.
            </p>
            <LineChart series={[runoffWinner]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The civil-war parties' combined share</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Fianna Fáil plus Fine Gael took more than 80% of first preferences into the 1980s and around 42% in 2024.
            </p>
            <LineChart series={[presTurnout]} yMax={100} yTicks={[50, 75]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Irelandian elections work"
        cards={[
          [
            "PR-STV, the only one of its kind here",
            "Ireland elects its parliament by single transferable vote in three-, four- and five-seat constituencies. Voters rank candidates, surpluses and eliminations transfer, and the count runs for days. It is the only national PR-STV system in this atlas, and it makes first preferences and seats diverge in ways no other system here does."
          ],
          [
            "Transfers decide it",
            "First-preference votes are not the result. Mary Robinson trailed by five points on first preferences in 1990 and won the presidency on transfers; the seat tables here show where the count ended, not where it started."
          ],
          [
            "A civil war, then ninety years of it",
            "Fianna Fáil and Fine Gael descend from the two sides of the 1922–23 civil war and disagreed about little else for most of a century. That they entered government together in 2020 is the largest fact in modern Irish politics."
          ],
          [
            "Five presidents nobody voted for",
            "In 1952, 1974, 1976, 1983 and 2004 only one candidate was nominated and the election was not held at all. Those rows appear here with no result because there was none."
          ],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/ireland", "Ireland"],
          ["/elections/uk", "UK General Elections"],
          ["/elections/nl", "Dutch General Elections"],
          ["/elections/dk", "Danish General Elections"],
        ]}
      />
    </main>
  );
}
