import type { Metadata } from "next";
import Link from "next/link";
import { getFiElections, computeFiRecords, fiPartyColor, fiFmtPct, type FiPresElection } from "@/lib/fiElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/fi";
const TITLE = "Finnish Elections";
const DESC =
  "Finland's Eduskunta elections from 1907, the first in Europe held under universal suffrage and the first anywhere to seat women, through the 2023 election that brought the nationalist Finns Party into government for the first time. The presidency has been directly elected since 1994, most recently in January and February 2024, but no presidential election article is in this dump yet, so the presidential series here is empty.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

function PresCard({ e }: { e: FiPresElection }) {
  const byR2 = e.candidates.filter((c) => c.r2Share != null).sort((a, b) => (b.r2Share ?? 0) - (a.r2Share ?? 0));
  const byR1 = e.candidates.filter((c) => c.r1Share != null).sort((a, b) => (b.r1Share ?? 0) - (a.r1Share ?? 0));
  const winner = byR2[0] ?? byR1[0] ?? null;
  const runnerUp = byR2[1] ?? byR1[1] ?? null;
  return (
    <Link
      href={`/elections/fi/${e.id}`}
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
              <span style={{ color: fiPartyColor(winner.party) }}>{winner.name}</span>{" "}
              {fiFmtPct(winner.r2Share ?? winner.r1Share)}
            </span>
          ) : e.presAfter ? (
            <span>{e.presAfter.name}</span>
          ) : null}
          {runnerUp ? <span>def. {runnerUp.name}</span> : null}
          {e.turnout != null ? <span>turnout {fiFmtPct(e.turnout)}</span> : null}
        </div>
      </div>
      {winner && runnerUp && (winner.r2Share ?? winner.r1Share) != null && (runnerUp.r2Share ?? runnerUp.r1Share) != null ? (
        <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
          <div style={{ width: `${winner.r2Share ?? winner.r1Share}%`, backgroundColor: fiPartyColor(winner.party), marginRight: 1 }} title={`${winner.name}: ${fiFmtPct(winner.r2Share ?? winner.r1Share)}`} />
          <div style={{ width: `${runnerUp.r2Share ?? runnerUp.r1Share}%`, backgroundColor: fiPartyColor(runnerUp.party) }} title={`${runnerUp.name}: ${fiFmtPct(runnerUp.r2Share ?? runnerUp.r1Share)}`} />
        </div>
      ) : null}
    </Link>
  );
}

export default function FiElectionsPage() {
  const { presEras, legEras, presidential, legislative, meta } = getFiElections();
  const records = computeFiRecords();
  // The presidential series holds one contest (2024) until the earlier
  // articles arrive, so both charts read the Eduskunta chronology instead of
  // the usual presidential turnout / winner's share.
  const modern = legislative;

  const presTurnout: ChartSeries = {
    name: "Turnout",
    color: "#4ECDC4",
    points: modern
      .filter((e) => e.turnout != null && (e.turnout as number) <= 100)
      .map((e) => ({ x: e.year, y: e.turnout as number, label: e.label })),
  };
  const winnerShare: ChartSeries = {
    name: "Largest party's seat share",
    color: "#FFB400",
    points: modern
      .map((e) => {
        const p = e.parties
          .filter((p) => p.seats != null && e.totalSeats)
          .sort((a, b) => (b.seats ?? 0) - (a.seats ?? 0))[0];
        return p && e.totalSeats ? { x: e.year, y: (100 * (p.seats as number)) / e.totalSeats, label: `${e.label}: ${p.name}` } : null;
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
        <span>Finland</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="fi" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
        <p className="mt-2 text-xs uppercase tracking-widest text-[var(--text-dim)]">
          Source: Wikipedia election articles · as of {meta.built}
        </p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label={"Eduskunta seats"} value={"200"} hint={"one chamber, proportional by district"} />
        <StatTile label={"Elections since 1907"} value={String(presidential.length + legislative.length)} hint={""} />
        <StatTile label={"Apr 2023"} value={"48 seats"} hint={"National Coalition Party finished first"} />
      </div>

      <JumpNav items={[["#presidential", "Presidential elections"], ["#chronology", "Eduskunta elections"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      {/* ---------- presidential first: the president makes the government ---------- */}
      <section id="presidential" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Presidential elections</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
          Finland's direct presidential elections, newest first. Only 2024 is on file so far; the six direct elections from 1994 to 2018 and the electoral-college era before them join when their articles are added.
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
        colorOf={fiPartyColor}
        fmtPct={fiFmtPct}
        leaderTag="PM"
        headline="Eduskunta elections"
        intro={"Every Eduskunta election since Finland's first, under universal suffrage in 1907, newest first. The Grand Duchy years carry a caveat for the parliament's repeated dissolution by the Russian Emperor."}
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
              Turnout ran above 70% at almost every Eduskunta election on file.
            </p>
            <LineChart series={[presTurnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The largest party's seat share</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              No party has approached a majority since the Social Democrats' 103 of 200 seats in 1916; the largest party's share has mostly sat in the 20 to 25 percent range since the 1990s.
            </p>
            <LineChart series={[winnerShare]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Finnish elections work"
        cards={[
          ["A single 200-seat chamber",
           "The unicameral Eduskunta has held 200 seats since the first election in 1907, filled by proportional representation across multi-member districts with no legal threshold, which is why joint lists and small parties have always won a share of seats."],
          ["The president elected directly since 1994",
           "Finland's president was chosen by an electoral college until a 1991 constitutional change; every election since 1994 has been a direct popular vote, with a runoff between the top two if nobody passes 50% in the first round. No presidential election article has made it into this dump yet, direct or electoral-college, so none appear below."],
          ["Coalitions, not majorities",
           "No party has won an outright Eduskunta majority since the Social Democrats' single-party government of 1917, so every government here is a multi-party coalition, and several have fallen apart mid-term over budget or foreign-policy disputes."],
          ["From the Tsar's Diet to NATO",
           "The Eduskunta replaced Finland's four-estate Diet in 1907 while the country was still a Grand Duchy of the Russian Empire; independence followed a decade later. The 2023 election was fought as Finland completed its accession to NATO, ending the military neutrality it had kept since the Second World War."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/finland", "Finland"],
          ["/elections/se", "Swedish Elections"],
          ["/elections/no", "Norwegian Elections"],
        ]}
      />
    </main>
  );
}
