import type { Metadata } from "next";
import Link from "next/link";
import { getCzElections, computeCzRecords, czPartyColor, czFmtPct, type CzPresElection } from "@/lib/czElections";
import { BASE_URL, SITE_NAME, ogImage } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/cz";
const TITLE = "Czech and Czechoslovak Elections";
const DESC =
  "Czechoslovakia's legislative and presidential record from the First Republic's founding vote in 1920 through the National Front's one-list rituals and the two federal elections that ended the union, carried here as the Czech Republic's direct predecessor; the Czech Chamber of Deputies continues the series from 1996 and the presidency has been directly elected since 2013. Slovakia's own record, National Council and presidency alike, is on the Slovak hub.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: ogImage(TITLE, PATH), width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

function PresCard({ e }: { e: CzPresElection }) {
  const byR2 = e.candidates.filter((c) => c.r2Share != null).sort((a, b) => (b.r2Share ?? 0) - (a.r2Share ?? 0));
  const byR1 = e.candidates.filter((c) => c.r1Share != null).sort((a, b) => (b.r1Share ?? 0) - (a.r1Share ?? 0));
  const winner = byR2[0] ?? byR1[0] ?? null;
  const runnerUp = byR2[1] ?? byR1[1] ?? null;
  return (
    <Link
      href={`/elections/cz/${e.id}`}
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
              <span style={{ color: czPartyColor(winner.party) }}>{winner.name}</span>{" "}
              {czFmtPct(winner.r2Share ?? winner.r1Share)}
            </span>
          ) : e.presAfter ? (
            <span>{e.presAfter.name}</span>
          ) : null}
          {runnerUp ? <span>def. {runnerUp.name}</span> : null}
          {e.turnout != null ? <span>turnout {czFmtPct(e.turnout)}</span> : null}
        </div>
      </div>
      {winner && runnerUp && (winner.r2Share ?? winner.r1Share) != null && (runnerUp.r2Share ?? runnerUp.r1Share) != null ? (
        <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
          <div style={{ width: `${winner.r2Share ?? winner.r1Share}%`, backgroundColor: czPartyColor(winner.party), marginRight: 1 }} title={`${winner.name}: ${czFmtPct(winner.r2Share ?? winner.r1Share)}`} />
          <div style={{ width: `${runnerUp.r2Share ?? runnerUp.r1Share}%`, backgroundColor: czPartyColor(runnerUp.party) }} title={`${runnerUp.name}: ${czFmtPct(runnerUp.r2Share ?? runnerUp.r1Share)}`} />
        </div>
      ) : null}
    </Link>
  );
}

export default function CzElectionsPage() {
  const { presEras, legEras, presidential, legislative, meta } = getCzElections();
  const records = computeCzRecords();
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
        <span>Czech Republic</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="cz" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
        <p className="mt-2 text-xs uppercase tracking-widest text-[var(--text-dim)]">
          Source: Wikipedia election articles · as of {meta.built}
        </p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label={"Chamber seats"} value={"200"} hint={"101 for a majority; 150 in the 1990-92 federal votes"} />
        <StatTile label={"Elections since 1920"} value={String(presidential.length + legislative.length)} hint={""} />
        <StatTile label={"October 2025"} value={"ANO"} hint={"80 of 200 seats, largest party"} />
      </div>

      <JumpNav items={[["#presidential", "Presidential elections"], ["#chronology", "Legislative elections"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      {/* ---------- presidential first: the president makes the government ---------- */}
      <section id="presidential" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Presidential elections</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
          Every Czechoslovak and Czech presidential vote on record here, newest first: an Assembly-elected presidency under the First Republic and under Communist rule, the Velvet Revolution's Havel, and a directly elected presidency from 2013. The indirect Czech presidential elections parliament held from 1993 to 2008, before the office went direct, are not in the source used for this hub and so are not shown.
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
        colorOf={czPartyColor}
        fmtPct={czFmtPct}
        leaderTag="PM"
        headline="Legislative elections"
        intro={"Every Czechoslovak and Czech legislative election on record here, newest first: the National Assembly of the First Republic and the postwar coalition, the National Front's single list, the two free federal votes that ended the union, and the Chamber of Deputies of the Czech Republic since 1996. The Czech National Council, the republic-level house inside the federation from 1968, became the Chamber of Deputies at independence and is not part of this series; Slovakia's own National Council record is on the Slovak hub."}
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
              Above 90% at every National Front ritual and at the 1946 and 1990 free votes; down to the high fifties and sixties at Czech elections since 2010, a genuinely competitive multiparty system with genuinely lower participation.
            </p>
            <LineChart series={[presTurnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The largest party's seat share</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              A single list took all 200 or so seats under communist rule by definition. Since 1996 the largest Czech party has typically held well under half the Chamber, coalition government rather than majority rule.
            </p>
            <LineChart series={[winnerShare]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Czech elections work"
        cards={[
          ["One legislative line, two states",
           "The National Assembly of the First Republic, the National Front's single list, and the federal parliament that split Czechoslovakia in two all sit in the same series as the Czech Chamber of Deputies, because the Chamber is their direct institutional descendant. The Czech National Council, the separate republic-level house inside the federation from 1968, is not part of it; it was renamed the Chamber of Deputies at independence in 1993, which is where this page's own chamber begins in substance if not in name."],
          ["A presidency that only went direct in 2013",
           "From Masaryk's 1918 acclamation to Havel's second term in 1990, the presidency was chosen by parliament, not by voters, and for most of the Communist decades by a single unopposed nominee. The Czech Republic's own parliament kept choosing the president indirectly until 2012; the source used for this hub only covers the elections held since the office went direct, so 1993 to 2008 are a stated gap, not an oversight."],
          ["The National Front's one list",
           "From 1948 to 1986 every seat went to the National Front, a single slate the Communist Party controlled, put to voters as a single yes-or-no choice with no rival slate on the ballot. Turnout and the approval share were both reported above 90% at every one of these votes, the signature of a ritual rather than a contest."],
          ["1992 split the state, not just the government",
           "The federal election of June 1992 produced no majority for a shared constitution; Havel's own bid for a third term failed in the Assembly the following month for lack of Slovak support, and by the end of the year the federal parliament had voted itself out of existence. The next legislative and presidential elections on this page are Czech ones, run by a state that did not exist when the decade began."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/czech-republic", "Czechia"],
          ["/elections/sk", "Slovak Elections"],
          ["/elections/at", "Austrian Elections"],
          ["/elections/hu", "Hungarian Parliamentary Elections"],
        ]}
      />
    </main>
  );
}
