import type { Metadata } from "next";
import Link from "next/link";
import {
  getPhElections,
  computePhRecords,
  phPartyColor,
  phFmtPct,
  phWinnerOf,
  type PhPresElection,
} from "@/lib/phElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/ph";
const TITLE = "Philippine Presidential Elections";
const DESC =
  "Every Philippine presidential election from the Commonwealth of 1935 to 2022: a competitive two-party republic that repeatedly threw out its incumbents, the martial-law years and the stolen count of 1986, and the single six-year term that has produced winners on 40% of the vote ever since.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

function PresCard({ e }: { e: PhPresElection }) {
  const winner = phWinnerOf(e);
  const others = e.candidates
    .filter((c) => c !== winner && (c.r2Share ?? c.r1Share) != null)
    .sort((a, b) => ((b.r2Share ?? b.r1Share) ?? 0) - ((a.r2Share ?? a.r1Share) ?? 0));
  const runnerUp = others[0] ?? null;
  return (
    <Link
      href={`/elections/ph/${e.id}`}
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
              <span style={{ color: phPartyColor(winner.party) }}>{winner.name}</span>{" "}
              {phFmtPct(winner.r2Share ?? winner.r1Share)}
            </span>
          ) : e.presAfter ? (
            <span>{e.presAfter.name}</span>
          ) : null}
          {runnerUp ? <span>def. {runnerUp.name}</span> : null}
          {e.turnout != null ? <span>turnout {phFmtPct(e.turnout)}</span> : null}
        </div>
      </div>
      {winner && runnerUp && (winner.r2Share ?? winner.r1Share) != null && (runnerUp.r2Share ?? runnerUp.r1Share) != null ? (
        <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
          <div style={{ width: `${winner.r2Share ?? winner.r1Share}%`, backgroundColor: phPartyColor(winner.party), marginRight: 1 }} title={`${winner.name}: ${phFmtPct(winner.r2Share ?? winner.r1Share)}`} />
          <div style={{ width: `${runnerUp.r2Share ?? runnerUp.r1Share}%`, backgroundColor: phPartyColor(runnerUp.party) }} title={`${runnerUp.name}: ${phFmtPct(runnerUp.r2Share ?? runnerUp.r1Share)}`} />
        </div>
      ) : null}
    </Link>
  );
}

export default function PhElectionsPage() {
  const { eras, elections, meta } = getPhElections();
  const records = computePhRecords();
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
        const w = phWinnerOf(e);
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
        <span>Philippines</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="ph" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label="Term" value="6 years" hint="single, no re-election, since 1987" />
        <StatTile label="Elections since 1935" value={String(elections.length)} hint="presidential contests" />
        <StatTile label="Largest majority" value="58.8%" hint="Bongbong Marcos, 2022" />
      </div>

      <JumpNav items={[["#chronology", "Chronology"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      {/* ---------- chronology ---------- */}
      <section id="chronology" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Every presidential election</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
          Every Philippine presidential election since 1935, newest first. The Japanese-occupation vote of 1943 and the boycotted contest of 1981 are labelled as what they were.
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
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout since 1946</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Consistently high by democratic standards, above 75% for most of the post-war period, and rising again since 2010.
            </p>
            <LineChart series={[turnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The winner's share</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Landslides at the start and the end, pluralities in between: Ramos won in 1992 with 23.6%, the lowest winning share on this page.
            </p>
            <LineChart series={[winShare]} yMax={70} yTicks={[25, 50]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Philippine presidential elections work"
        cards={[
          [
            "One round, one term",
            "The president is elected by simple plurality with no runoff, for a single six-year term with no re-election. With four or five serious candidates that has repeatedly produced presidents on less than 40% of the vote."
          ],
          [
            "The vice president runs separately",
            "Voters cast a separate ballot for vice president, so the two offices regularly go to rivals. It is a standing source of instability and has twice put the losing presidential ticket's running mate a heartbeat away."
          ],
          [
            "1986",
            "Marcos called a snap election, the official count gave him the win, and the computer technicians tabulating it walked off the job on live television. The People Power uprising removed him within three weeks."
          ],
          [
            "Names that repeat",
            "Marcos, Aquino, Macapagal, Estrada, Duterte. Philippine presidential politics runs on families, and the ballot here reads like a genealogy."
          ],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/philippines", "Philippines"],
          ["/elections/id", "Indonesian Elections"],
          ["/elections/kr", "South Korean Elections"],
          ["/elections/tw", "Taiwanese Elections"],
        ]}
      />
    </main>
  );
}
