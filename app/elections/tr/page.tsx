import type { Metadata } from "next";
import Link from "next/link";
import {
  getTrElections,
  computeTrRecords,
  trPartyColor,
  trFmtPct,
  type TrPresElection,
} from "@/lib/trElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/tr";
const TITLE = "Turkish Elections";
const DESC =
  "Turkish elections from the Ottoman parliaments of 1877 to the runoff of 2023 — the single-party era labelled as such, the White Revolution of 1950, three coups and their shadows, and the fiercely contested but tilted elections of the Erdoğan era.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

function PresCard({ e }: { e: TrPresElection }) {
  const byBest = e.candidates
    .filter((c) => (c.r2Share ?? c.r1Share) != null)
    .sort((a, b) => ((b.r2Share ?? b.r1Share) ?? 0) - ((a.r2Share ?? a.r1Share) ?? 0));
  const winner = byBest[0] ?? null;
  const runnerUp = byBest[1] ?? null;
  return (
    <Link
      href={`/elections/tr/${e.id}`}
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
              <span style={{ color: trPartyColor(winner.party) }}>{winner.name}</span>{" "}
              {trFmtPct(winner.r2Share ?? winner.r1Share)}
            </span>
          ) : e.presAfter ? (
            <span>{e.presAfter.name}</span>
          ) : (
            <span>no winner — the coup followed</span>
          )}
          {runnerUp ? <span>def. {runnerUp.name}</span> : null}
          {e.turnout != null ? <span>turnout {trFmtPct(e.turnout)}</span> : null}
        </div>
      </div>
      {winner && runnerUp && (winner.r2Share ?? winner.r1Share) != null && (runnerUp.r2Share ?? runnerUp.r1Share) != null ? (
        <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
          <div style={{ width: `${winner.r2Share ?? winner.r1Share}%`, backgroundColor: trPartyColor(winner.party), marginRight: 1 }} title={`${winner.name}: ${trFmtPct(winner.r2Share ?? winner.r1Share)}`} />
          <div style={{ width: `${runnerUp.r2Share ?? runnerUp.r1Share}%`, backgroundColor: trPartyColor(runnerUp.party) }} title={`${runnerUp.name}: ${trFmtPct(runnerUp.r2Share ?? runnerUp.r1Share)}`} />
        </div>
      ) : null}
    </Link>
  );
}

export default function TrElectionsPage() {
  const { presEras, legEras, presidential, legislative, meta } = getTrElections();
  const records = computeTrRecords();
  const lastPres = presidential[presidential.length - 1];
  const lastLeg = legislative[legislative.length - 1];

  const legTurnout: ChartSeries = {
    name: "General-election turnout",
    color: "#4ECDC4",
    points: legislative
      .filter((e) => e.turnout != null && e.year >= 1950)
      .map((e) => ({ x: e.year, y: e.turnout as number, label: e.label })),
  };
  const akp: ChartSeries = {
    name: "AKP vote share",
    color: trPartyColor("AK Party"),
    points: legislative
      .filter((e) => e.year >= 2002)
      .map((e) => {
        const p = e.parties.find((p) => /Justice and Development|AK Party/i.test(p.name ?? ""));
        return p && p.share != null ? { x: e.year + (e.id === "2015-nov" ? 0.5 : 0), y: p.share, label: e.label } : null;
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
        <span>Turkey</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="tr" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label="Parliamentary elections" value={String(legislative.length)} hint={`1877–${lastLeg.year}, from the Ottoman Chamber to today`} />
        <StatTile label="Presidential elections" value={String(presidential.length)} hint={`${presidential[0].year}–${lastPres.year}, direct since 2014`} />
        <StatTile label="President today" value={lastPres.presAfter?.name ?? "—"} hint={`re-elected ${lastPres.year} in a runoff`} />
        <StatTile label="The White Revolution" value="1950" hint="single-party rule ended in one day" />
      </div>

      <JumpNav items={[["#presidential", "Presidential elections"], ["#chronology", "Parliamentary elections"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      {/* ---------- presidential ---------- */}
      <section id="presidential" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Presidential elections</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
          All {presidential.length} contests for the Turkish presidency, newest first — the
          single-party rituals and the Assembly&apos;s votes labelled as such, the 1980 deadlock that
          ended in a coup, and the direct elections of the Erdoğan era with their tilted playing
          field stated plainly.
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
        colorOf={trPartyColor}
        fmtPct={trFmtPct}
        leaderTag="PM"
        headline="Parliamentary elections"
        intro="Every parliamentary election, newest first — from the Ottoman Chamber of 1877 through the single-party era, the multiparty decades and their coups, to the Grand National Assembly of today."
      />

      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The long arc in charts</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          The multiparty era since 1950. Hover any point for the exact figure.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout since 1950</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Turkish turnout is among the world&apos;s highest without strict enforcement — near 90%
              in the fiercest contests, and above 85% in every vote of the past decade.
            </p>
            <LineChart series={[legTurnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The AKP's two decades</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              From the 2002 threshold earthquake to 2023: the 2011 peak near 50%, the June 2015 loss
              of the majority, and the November 2015 recovery that set the template for the era.
            </p>
            <LineChart series={[akp]} yMax={60} yTicks={[20, 40]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Turkish elections work"
        cards={[
          ["The executive presidency", "Since the 2017 referendum, the directly elected president is head of state and government: a majority in round one or a runoff a fortnight later. Parliament is elected the same day — and the alliances that contest both races are the system's real machinery."],
          ["The threshold's long shadow", "The 1980 junta's 10% national threshold — lowered to 7% in 2022 — was designed to keep small parties out. In 2002 it wiped every governing party from parliament at once; today's alliance rules exist largely to route around it."],
          ["Coups as punctuation", "The army removed elected governments in 1960, 1971, 1980 and 1997. Each coup rewrote the electoral rules; the eras in this hub follow those ruptures, and the constrained votes that followed them carry their labels."],
          ["Competitive, not fair", "Turkey's recent elections are real contests with mass turnout and opposition victories — Istanbul fell to the opposition twice in 2019 — fought on a field tilted by state media, imprisoned politicians and emergency rule. The entries record both halves of that truth."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/turkey", "Turkey"],
          ["/elections/il", "Israeli Elections"],
          ["/elections/ru", "Russian & Soviet Elections"],
          ["/leaders", "World Leaders"],
        ]}
      />
    </main>
  );
}
