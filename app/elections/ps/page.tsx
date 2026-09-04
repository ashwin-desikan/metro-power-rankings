import type { Metadata } from "next";
import Link from "next/link";
import {
  getPsElections,
  computePsRecords,
  psPartyColor,
  psFmtPct,
  type PsPresElection,
} from "@/lib/psElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/ps";
const TITLE = "Palestinian Elections";
const DESC =
  "The shortest election history in the atlas, and one of the most consequential: the annulled Mandate election of 1923, the Authority's founding votes of 1996, the 2005 presidency Mahmoud Abbas still holds, and the free and fair 2006 election whose result froze Palestinian democracy for two decades. The next vote is scheduled for 28 November 2026.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

function PresCard({ e }: { e: PsPresElection }) {
  const byBest = e.candidates
    .filter((c) => (c.r2Share ?? c.r1Share) != null)
    .sort((a, b) => ((b.r2Share ?? b.r1Share) ?? 0) - ((a.r2Share ?? a.r1Share) ?? 0));
  const winner = byBest[0] ?? null;
  const runnerUp = byBest[1] ?? null;
  return (
    <Link
      href={`/elections/ps/${e.id}`}
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
          {e.caveat ? (
            <span className="text-[10px] uppercase tracking-wider rounded-full border px-2 py-0.5 font-semibold" style={{ borderColor: "#B4540A", color: "#D97706" }}>
              caveats apply
            </span>
          ) : null}
          <span className="text-xs text-[var(--text-dim)]">{e.date}</span>
        </div>
        <div className="text-xs text-[var(--text-muted)] tabular-nums flex gap-3">
          {winner ? (
            <span>
              <span style={{ color: psPartyColor(winner.party) }}>{winner.name}</span>{" "}
              {psFmtPct(winner.r2Share ?? winner.r1Share)}
            </span>
          ) : e.presAfter ? (
            <span>{e.presAfter.name}</span>
          ) : null}
          {runnerUp ? <span>def. {runnerUp.name}</span> : null}
          {e.turnout != null ? <span>turnout {psFmtPct(e.turnout)}</span> : null}
        </div>
      </div>
      {winner && runnerUp && (winner.r2Share ?? winner.r1Share) != null && (runnerUp.r2Share ?? runnerUp.r1Share) != null ? (
        <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
          <div style={{ width: `${winner.r2Share ?? winner.r1Share}%`, backgroundColor: psPartyColor(winner.party), marginRight: 1 }} title={`${winner.name}: ${psFmtPct(winner.r2Share ?? winner.r1Share)}`} />
          <div style={{ width: `${runnerUp.r2Share ?? runnerUp.r1Share}%`, backgroundColor: psPartyColor(runnerUp.party) }} title={`${runnerUp.name}: ${psFmtPct(runnerUp.r2Share ?? runnerUp.r1Share)}`} />
        </div>
      ) : null}
    </Link>
  );
}

export default function PsElectionsPage() {
  const { presEras, legEras, presidential, legislative, meta } = getPsElections();
  const records = computePsRecords();

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
        <span>Palestine</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="ps" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div
        className="rounded-xl border p-4 mb-8 max-w-3xl text-sm"
        style={{ borderColor: "#B4540A", backgroundColor: "rgba(217,119,6,0.06)" }}
      >
        <p className="text-[var(--text-muted)]">
          <span className="font-bold" style={{ color: "#D97706" }}>A democracy frozen mid-step.</span>{" "}
          Palestinians have voted in exactly one round of genuinely contested national elections,
          2005–2006, and its outcome ended the experiment: Hamas won a free and fair vote, the
          world boycotted the result, Fatah and Hamas split the territories between them in 2007,
          and every scheduled election since was postponed. The Legislative Council elected in 2006
          was dissolved in 2018 without a successor, and Mahmoud Abbas has governed on a four-year
          mandate for over twenty years. A new PLC election is scheduled for 28 November 2026:
          the entries below are the entire national record it would extend.
        </p>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label="Legislative elections" value={String(legislative.length)} hint="1923 (annulled), 1996 and 2006, the entire record" />
        <StatTile label="Presidential elections" value={String(presidential.length)} hint="Arafat 1996, Abbas 2005, none since" />
        <StatTile label="Years without a vote" value="20" hint="no national election since 25 January 2006" />
        <StatTile label="Next scheduled" value="2026" hint="PLC election, 28 November 2026, 200 seats" />
      </div>

      <JumpNav items={[["#presidential", "Presidential elections"], ["#chronology", "Legislative elections"], ["#records", "The numbers to know"], ["#how-it-works", "How it works"]]} />

      {/* ---------- presidential ---------- */}
      <section id="presidential" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Presidential elections</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
          Both of them, newest first, and both won by Fatah&apos;s founding generation with the
          Islamist factions boycotting.
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
        colorOf={psPartyColor}
        fmtPct={psFmtPct}
        leaderTag="PM"
        headline="Legislative elections"
        intro="All three, newest first: the Hamas landslide of 2006, the Authority's founding vote of 1996, and the Mandate's annulled attempt of 1923."
      />

      <RecordsGrid records={records} hrefBase={PATH} headline="The numbers to know" />

      <HowItWorks
        title="How Palestinian elections work"
        cards={[
          ["The system on paper", "A directly elected president and a 132-seat Legislative Council (200 seats under the 2021 law), elected by proportional representation. The 2026 election is called for a 200-seat PLC on full national lists."],
          ["Who votes, and where", "Palestinians of the West Bank, Gaza and East Jerusalem, the last a perennial flashpoint, since Israel has restricted Jerusalem voting and the 2021 election was postponed over it. The diaspora does not vote."],
          ["Why 2006 froze everything", "Hamas won 74 of 132 seats on 44% of the vote against a divided Fatah. The Quartet demanded conditions Hamas rejected, funding was cut, and within eighteen months Hamas held Gaza and Fatah the West Bank, each side ruling without the legislature."],
          ["What an election needs now", "Fatah–Hamas agreement on holding it, Israeli acquiescence in Jerusalem and the occupied West Bank, and a Gaza in a condition to vote. The 28 November 2026 date, announced for the post-war transition, is the first scheduled national vote in two decades."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/palestine", "Palestine"],
          ["/elections/il", "Israeli Elections"],
          ["/elections/iq", "Iraqi Elections"],
          ["/conflicts", "Wars since 1500"],
        ]}
      />
    </main>
  );
}
