import type { Metadata } from "next";
import Link from "next/link";
import { getSkElections, computeSkRecords, skPartyColor, skFmtPct, type SkPresElection } from "@/lib/skElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/sk";
const TITLE = "Slovak Elections";
const DESC =
  "Slovakia's own assemblies from the 1928 provincial election to the 2023 National Council, and its presidency from 1993, all one record separate from the federal Czechoslovak elections on the Czech and Czechoslovak hub: the interwar Slovak Province, the wartime single list, the Democratic Party's 1946 win before the Communist coup, four decades of unopposed National Front ballots, the Velvet Revolution, and independence in 1993.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

function PresCard({ e }: { e: SkPresElection }) {
  const byR2 = e.candidates.filter((c) => c.r2Share != null).sort((a, b) => (b.r2Share ?? 0) - (a.r2Share ?? 0));
  const byR1 = e.candidates.filter((c) => c.r1Share != null).sort((a, b) => (b.r1Share ?? 0) - (a.r1Share ?? 0));
  const winner = byR2[0] ?? byR1[0] ?? null;
  const runnerUp = byR2[1] ?? byR1[1] ?? null;
  return (
    <Link
      href={`/elections/sk/${e.id}`}
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
              <span style={{ color: skPartyColor(winner.party) }}>{winner.name}</span>{" "}
              {skFmtPct(winner.r2Share ?? winner.r1Share)}
            </span>
          ) : e.presAfter ? (
            <span>{e.presAfter.name}</span>
          ) : null}
          {runnerUp ? <span>def. {runnerUp.name}</span> : null}
          {e.turnout != null ? <span>turnout {skFmtPct(e.turnout)}</span> : null}
        </div>
      </div>
      {winner && runnerUp && (winner.r2Share ?? winner.r1Share) != null && (runnerUp.r2Share ?? runnerUp.r1Share) != null ? (
        <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
          <div style={{ width: `${winner.r2Share ?? winner.r1Share}%`, backgroundColor: skPartyColor(winner.party), marginRight: 1 }} title={`${winner.name}: ${skFmtPct(winner.r2Share ?? winner.r1Share)}`} />
          <div style={{ width: `${runnerUp.r2Share ?? runnerUp.r1Share}%`, backgroundColor: skPartyColor(runnerUp.party) }} title={`${runnerUp.name}: ${skFmtPct(runnerUp.r2Share ?? runnerUp.r1Share)}`} />
        </div>
      ) : null}
    </Link>
  );
}

export default function SkElectionsPage() {
  const { presEras, legEras, presidential, legislative, meta } = getSkElections();
  const records = computeSkRecords();
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
        <span>Slovakia</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="sk" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
        <p className="mt-2 text-xs uppercase tracking-widest text-[var(--text-dim)]">
          Source: Wikipedia election articles · as of {meta.built}
        </p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label={"National Council seats"} value={"150"} hint={"76 for a majority"} />
        <StatTile label={"Elections since 1928"} value={String(presidential.length + legislative.length)} hint={""} />
        <StatTile label={"Apr 2024"} value={"53.1%"} hint={"Pellegrini's runoff win over Korčok"} />
      </div>

      <JumpNav items={[["#presidential", "Presidential elections"], ["#chronology", "National Council elections"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      {/* ---------- presidential first: the president makes the government ---------- */}
      <section id="presidential" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Presidential elections</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
          Every Slovak presidential contest since 1993, newest first. The first two were decided by parliament, the second of which never elected anyone; every direct election since 1999 has gone to a runoff.
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
        colorOf={skPartyColor}
        fmtPct={skFmtPct}
        leaderTag="PM"
        headline="National Council elections"
        intro={"Every election to Slovakia's own assembly since the 1928 Slovak provincial election, newest first: the interwar Slovak Province, the wartime Slovak State's single list, the Slovak National Council under the National Front, and the National Council of independent Slovakia since 1994."}
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
              Above 95% through the National Front decades, when a ballot was compulsory and unopposed; down to the 60s and 70s since 1994, with the 2006 low of 54.7% the freest election's quietest one.
            </p>
            <LineChart series={[presTurnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The largest party's seat share</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              HZDS's 1994 and 1998 pluralities, Direction-Social Democracy's outright 2012 majority (the only one since 1994), and the fragmentation that has followed it since.
            </p>
            <LineChart series={[winnerShare]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Slovak elections work"
        cards={[
          ["Closed-list PR with a 5% threshold",
           "The 150-seat National Council is elected in a single nationwide constituency by closed-list proportional representation. No election chooses the Prime Minister directly; the president appoints one after coalition talks, which is why the chronology's tags are formed rather than elected."],
          ["A president elected twice over",
           "Slovakia tried indirect election first: a three-fifths vote of the National Council chose Michal Kováč in 1993. When his successor could not be agreed after nine attempts in 1998, the constitution was amended within months to put the choice directly to voters, on two rounds if no one clears a majority in the first."],
          ["Four decades of one list",
           "From 1948 to 1986 the ballot offered a single National Front slate, and it was reported as taking support in the high nineties at every vote. Those rows carry the numbers the source gives and a label saying what they were."],
          ["From province to republic",
           "The body being elected has changed name and power three times since 1928: an appointed-and-elected provincial assembly under interwar Czechoslovakia, a Slovak National Council with real authority only after 1990, and the fully sovereign National Council since 1 January 1993."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/elections/cz", "Czech and Czechoslovak Elections"],
          ["/countries/slovakia", "Slovakia"],
          ["/elections/hu", "Hungarian Parliamentary Elections"],
          ["/elections/at", "Austrian Elections"],
        ]}
      />
    </main>
  );
}
