import type { Metadata } from "next";
import Link from "next/link";
import {
  getArElections,
  computeArRecords,
  arPartyColor,
  arFmtPct,
  arWinnerOf,
  type ArPresElection,
} from "@/lib/arElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/ar";
const TITLE = "Argentine Presidential Elections";
const DESC =
  "Every Argentine presidential election from 1826 to Milei's runoff of 2023 — the electoral college of the oligarchic republic, the secret-ballot revolution of 1916, Perón's rise, the proscription years stated plainly, and the unbroken democracy since 1983.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

function PresCard({ e }: { e: ArPresElection }) {
  const winner = arWinnerOf(e);
  const others = e.candidates
    .filter((c) => c !== winner && (c.r2Share ?? c.r1Share) != null)
    .sort((a, b) => ((b.r2Share ?? b.r1Share) ?? 0) - ((a.r2Share ?? a.r1Share) ?? 0));
  const runnerUp = others[0] ?? null;
  return (
    <Link
      href={`/elections/ar/${e.id}`}
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
              <span style={{ color: arPartyColor(winner.party) }}>{winner.name}</span>{" "}
              {arFmtPct(winner.r2Share ?? winner.r1Share)}
            </span>
          ) : e.presAfter ? (
            <span>{e.presAfter.name}</span>
          ) : null}
          {runnerUp ? <span>def. {runnerUp.name}</span> : null}
          {e.turnout != null ? <span>turnout {arFmtPct(e.turnout)}</span> : null}
        </div>
      </div>
      {winner && runnerUp && (winner.r2Share ?? winner.r1Share) != null && (runnerUp.r2Share ?? runnerUp.r1Share) != null ? (
        <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
          <div style={{ width: `${winner.r2Share ?? winner.r1Share}%`, backgroundColor: arPartyColor(winner.party), marginRight: 1 }} title={`${winner.name}: ${arFmtPct(winner.r2Share ?? winner.r1Share)}`} />
          <div style={{ width: `${runnerUp.r2Share ?? runnerUp.r1Share}%`, backgroundColor: arPartyColor(runnerUp.party) }} title={`${runnerUp.name}: ${arFmtPct(runnerUp.r2Share ?? runnerUp.r1Share)}`} />
        </div>
      ) : null}
    </Link>
  );
}

export default function ArElectionsPage() {
  const { eras, elections, meta } = getArElections();
  const records = computeArRecords();
  const last = elections[elections.length - 1];

  const turnout: ChartSeries = {
    name: "Turnout",
    color: "#4ECDC4",
    points: elections
      .filter((e) => e.turnout != null && e.year >= 1916)
      .map((e) => ({ x: e.year, y: e.turnout as number, label: e.label })),
  };
  const winShare: ChartSeries = {
    name: "Winner's decisive-round share",
    color: "#8A7CA8",
    points: elections
      .filter((e) => e.year >= 1983)
      .map((e) => {
        const w = arWinnerOf(e);
        const s = w ? (w.r2Share ?? w.r1Share) : null;
        return w && s != null ? { x: e.year, y: s, label: `${e.label} — ${w.name}` } : null;
      })
      .filter((p): p is { x: number; y: number; label: string } => p != null),
  };

  const byEra = [...eras]
    .reverse()
    .map((era) => ({ era, list: elections.filter((e) => e.era === era.key).slice().reverse() }))
    .filter(({ list }) => list.length > 0);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/elections" className="hover:underline">Elections</Link>
        {" / "}
        <span>Argentina</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="ar" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label="Presidential elections" value={String(elections.length)} hint={`${elections[0].year}–${last.year}, including both votes of 1973`} />
        <StatTile label="President today" value={last.presAfter?.name ?? "—"} hint={`elected ${last.year} with the era's widest runoff margin`} />
        <StatTile label="First secret ballot" value="1916" hint="the Sáenz Peña Law's revolution" />
        <StatTile label="Democracy unbroken since" value="1983" hint={`${elections.filter((e) => e.year >= 1983).length} elections without interruption`} />
      </div>

      <JumpNav items={[["#chronology", "Chronology"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      {/* ---------- chronology ---------- */}
      <section id="chronology" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Every presidential election</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
          All {elections.length} contests, newest first — with the arranged successions of the
          oligarchic republic, the fraud of the Infamous Decade and the proscription-era votes
          labelled for what they were.
        </p>
        {byEra.map(({ era, list }) => (
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
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout since the secret ballot</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Compulsory voting has kept Argentine turnout high since 1912 — above 80% for most of
              the democratic era, easing only in recent contests.
            </p>
            <LineChart series={[turnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">What it takes to win</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              The winner&apos;s decisive share since 1983: Alfonsín and Menem&apos;s majorities, Kirchner&apos;s
              22% walkover after Menem withdrew, and the runoff era&apos;s duels — capped by Milei&apos;s
              55.7% in 2023.
            </p>
            <LineChart series={[winShare]} yMax={70} yTicks={[25, 50]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Argentine presidential elections work"
        cards={[
          ["The ballotage rules", "Since 1994 a candidate wins outright with 45%, or with 40% and a ten-point lead; otherwise the top two meet in a runoff. The thresholds are why 2003's runoff evaporated when Menem withdrew, and why 2015 and 2023 went the distance."],
          ["Compulsory, and primary-tested", "Voting is compulsory from 16 to 70, and since 2011 every party's candidates first face the open PASO primaries — a nationwide dress rehearsal that has repeatedly upended the race before it formally began."],
          ["From electors to voters", "Until 1912 presidents were chosen by an electoral college elected on a public ballot the ruling machine controlled. The Sáenz Peña Law's secret, universal, compulsory male vote turned Argentine elections into real contests overnight."],
          ["The Peronist constant", "Since 1946 Argentine politics has been organised for or against Peronism — banned from the ballot for eighteen years, and the winner of ten of the fourteen free presidential elections it has contested."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/argentina", "Argentina"],
          ["/elections/br", "Brazilian Elections"],
          ["/elections/mx", "Mexican Elections"],
          ["/leaders", "World Leaders"],
        ]}
      />
    </main>
  );
}
