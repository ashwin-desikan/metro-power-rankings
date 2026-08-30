import type { Metadata } from "next";
import Link from "next/link";
import {
  getAtElections,
  computeAtRecords,
  atPartyColor,
  atFmtPct,
  type AtPresElection,
} from "@/lib/atElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/at";
const TITLE = "Austrian Elections";
const DESC =
  "Every Austrian national election from the Imperial Council of 1897 to the Nationalrat of 2024, and every direct presidential election since 1951: the multinational Reichsrat and its eleven languages, the three camps of the First Republic, the dictatorship that ended them, the Proporz decades when two parties took nine votes in ten, Haider, Ibiza, and the first FPÖ first place.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

function PresCard({ e }: { e: AtPresElection }) {
  const byR2 = e.candidates.filter((c) => c.r2Share != null).sort((a, b) => (b.r2Share ?? 0) - (a.r2Share ?? 0));
  const byR1 = e.candidates.filter((c) => c.r1Share != null).sort((a, b) => (b.r1Share ?? 0) - (a.r1Share ?? 0));
  const winner = byR2[0] ?? byR1[0] ?? null;
  const runnerUp = byR2[1] ?? byR1[1] ?? null;
  return (
    <Link
      href={`/elections/at/${e.id}`}
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
              <span style={{ color: atPartyColor(winner.party) }}>{winner.name}</span>{" "}
              {atFmtPct(winner.r2Share ?? winner.r1Share)}
            </span>
          ) : e.presAfter ? (
            <span>{e.presAfter.name}</span>
          ) : null}
          {runnerUp ? <span>def. {runnerUp.name}</span> : null}
          {e.turnout != null ? <span>turnout {atFmtPct(e.turnout)}</span> : null}
        </div>
      </div>
      {winner && runnerUp && (winner.r2Share ?? winner.r1Share) != null && (runnerUp.r2Share ?? runnerUp.r1Share) != null ? (
        <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
          <div style={{ width: `${winner.r2Share ?? winner.r1Share}%`, backgroundColor: atPartyColor(winner.party), marginRight: 1 }} title={`${winner.name}: ${atFmtPct(winner.r2Share ?? winner.r1Share)}`} />
          <div style={{ width: `${runnerUp.r2Share ?? runnerUp.r1Share}%`, backgroundColor: atPartyColor(runnerUp.party) }} title={`${runnerUp.name}: ${atFmtPct(runnerUp.r2Share ?? runnerUp.r1Share)}`} />
        </div>
      ) : null}
    </Link>
  );
}

export default function AtElectionsPage() {
  const { presEras, legEras, presidential, legislative, meta } = getAtElections();
  const records = computeAtRecords();
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
        <span>Austria</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="at" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label="Nationalrat seats" value="183" hint="92 for a majority" />
        <StatTile label="Elections since 1897" value={String(legislative.length + presidential.length)} hint="legislative and presidential" />
        <StatTile label="The two-party peak" value="94%" hint="ÖVP and SPÖ combined, 1975" />
      </div>

      <JumpNav items={[["#chronology", "Parliamentary elections"], ["#presidential", "Presidential elections"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      {/* ---------- legislative ---------- */}
      <Chronology
        eras={legEras}
        elections={legislative}
        hrefBase={PATH}
        colorOf={atPartyColor}
        fmtPct={atFmtPct}
        leaderTag="President"
        headline="Parliamentary elections"
        intro="Every Nationalrat election since the republic's first, newest first. The gap from 1930 to 1945 is Austrofascism and the Anschluss, and it is left visible."
      />

      {/* ---------- presidential ---------- */}
      <section id="presidential" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Presidential elections</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
          All fourteen direct presidential elections since 1951, newest first. Austria has elected its head of state by popular vote for longer than most republics in this atlas, and the office carries powers it has never used.
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
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout since 1945</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Above 90% into the 1980s, when voting felt like a duty and the two camps mobilised everyone they had. The decline tracks the decline of the camps themselves.
            </p>
            <LineChart series={[runoffWinner]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The two-party share</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              ÖVP plus SPÖ, from 94% in 1975 to under 55% today. This one line is the story of Austrian politics.
            </p>
            <LineChart series={[presTurnout]} yMax={100} yTicks={[50, 75]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Austriaian elections work"
        cards={[
          [
            "The chamber before the republic",
            "Austria's parliament did not begin in 1920. The House of Deputies of the Cisleithanian Imperial Council is its direct ancestor, and the four elections here from 1897 to 1911 are listed for the same reason the German hub opens with the Frankfurt Parliament. Deputies sat by club rather than by party, and the clubs were national first: a Poland Club, a Bohemian Club, a Ruthenian Association."
          ],
          [
            "Proportional representation, three tiers",
            "Seats are allocated in 39 regional districts, then nine states, then nationally, so the final result is close to the national vote. A party needs 4% nationally or one regional seat to take part at all."
          ],
          [
            "The Proporz",
            "For decades the two big parties divided not just the cabinet but the state banks, the broadcaster and the schools inspectorate between them, in proportion to their votes. It produced extraordinary stability and the resentment the Freedom Party later ran on."
          ],
          [
            "A president with real powers",
            "The Austrian president can dismiss the chancellor and dissolve the National Council, powers modelled on Weimar and deliberately left in place. They have never been used against a sitting government, which is the point Austrians make about them."
          ],
          [
            "The election that was annulled",
            "The 2016 presidential runoff was voided by the Constitutional Court over irregularities in how postal votes were counted, then rerun in December. Van der Bellen won both times, by more the second time."
          ],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/austria", "Austria"],
          ["/elections/de", "German Federal Elections"],
          ["/elections/ch", "Swiss Federal Elections"],
          ["/elections/it", "Italian General Elections"],
        ]}
      />
    </main>
  );
}
