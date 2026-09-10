import type { Metadata } from "next";
import Link from "next/link";
import {
  getCdElections,
  computeCdRecords,
  cdPartyColor,
  cdFmtPct,
  type CdPresElection,
} from "@/lib/cdElections";
import { BASE_URL, SITE_NAME, ogImage } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/cd";
const TITLE = "DR Congo Elections";
const DESC =
  "Every national election in the Democratic Republic of the Congo from the Belgian Congo's last colonial ballot in 1960 to December 2023: ten weeks of independence before the state broke apart, five assemblies elected on Mobutu's single list, three presidential plebiscites he could not lose, and the fragmented, disputed and genuinely consequential votes of the present republic.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: ogImage(TITLE, PATH), width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

function PresCard({ e }: { e: CdPresElection }) {
  const byR2 = e.candidates.filter((c) => c.r2Share != null).sort((a, b) => (b.r2Share ?? 0) - (a.r2Share ?? 0));
  const byR1 = e.candidates.filter((c) => c.r1Share != null).sort((a, b) => (b.r1Share ?? 0) - (a.r1Share ?? 0));
  const winner = byR2[0] ?? byR1[0] ?? null;
  const runnerUp = byR2[1] ?? byR1[1] ?? null;
  return (
    <Link
      href={`/elections/cd/${e.id}`}
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
              <span style={{ color: cdPartyColor(winner.party) }}>{winner.name}</span>{" "}
              {cdFmtPct(winner.r2Share ?? winner.r1Share)}
            </span>
          ) : e.presAfter ? (
            <span>{e.presAfter.name}</span>
          ) : null}
          {runnerUp ? <span>def. {runnerUp.name}</span> : null}
          {e.turnout != null ? <span>turnout {cdFmtPct(e.turnout)}</span> : null}
        </div>
      </div>
      {winner && runnerUp && (winner.r2Share ?? winner.r1Share) != null && (runnerUp.r2Share ?? runnerUp.r1Share) != null ? (
        <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
          <div style={{ width: `${winner.r2Share ?? winner.r1Share}%`, backgroundColor: cdPartyColor(winner.party), marginRight: 1 }} title={`${winner.name}: ${cdFmtPct(winner.r2Share ?? winner.r1Share)}`} />
          <div style={{ width: `${runnerUp.r2Share ?? runnerUp.r1Share}%`, backgroundColor: cdPartyColor(runnerUp.party) }} title={`${runnerUp.name}: ${cdFmtPct(runnerUp.r2Share ?? runnerUp.r1Share)}`} />
        </div>
      ) : null}
    </Link>
  );
}

export default function CdElectionsPage() {
  const { presEras, legEras, presidential, legislative, meta } = getCdElections();
  const records = computeCdRecords();

  const presTurnout: ChartSeries = {
    name: "Presidential turnout",
    color: "#4ECDC4",
    points: presidential
      .filter((e) => e.turnout != null && (e.turnout as number) <= 100)
      .map((e) => ({ x: e.year, y: e.turnout as number, label: e.label })),
  };
  const winnerShare: ChartSeries = {
    name: "Winner's decisive-round share",
    color: "#FFB400",
    points: presidential
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
        <span>DR Congo</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="cd" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
        <p className="mt-2 text-xs uppercase tracking-widest text-[var(--text-dim)]">
          Source: Wikipedia election articles · as of {meta.built}
        </p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label={"National Assembly seats"} value={"500"} hint={"251 for a majority"} />
        <StatTile label={"Contests on file"} value={String(presidential.length + legislative.length)} hint={""} />
        <StatTile label={"December 2023"} value={"73.5%"} hint={"Tshisekedi's share, on 42.7% turnout"} />
      </div>

      <JumpNav items={[["#presidential", "Presidential elections"], ["#chronology", "National Assembly elections"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      {/* ---------- presidential first: the president makes the government ---------- */}
      <section id="presidential" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Presidential elections</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
          The presidency, newest first. Three of these were single-candidate plebiscites under Mobutu and are marked unfree; the four since 2006 were contested, and three of the four were disputed.
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
        colorOf={cdPartyColor}
        fmtPct={cdFmtPct}
        leaderTag="President"
        headline="National Assembly elections"
        intro={"Every National Assembly election, newest first. The five between 1970 and 1987 returned a single party to every seat."}
      />

      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The long arc in charts</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          Hover any point for the exact figure.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Presidential turnout</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              70.5% at the first multi-party election in 2006, then 59.1%, 47.6% and 42.7%. Participation has fallen at every election since the transition.
            </p>
            <LineChart series={[presTurnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The winner's share</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              100%, 98.1% and 99.2% under Mobutu; 58.1%, 49.0%, 38.6% and 73.5% since. The two halves of this chart are not measuring the same thing.
            </p>
            <LineChart series={[winnerShare]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Congolese elections work"
        cards={[
          ["A president elected in one round",
           "The runoff used in 2006 was removed from the constitution in 2011, so the presidency now goes to whoever comes first however small the plurality. Joseph Kabila won a second term on 49% against a divided opposition under the new rule, and the change is the single most consequential electoral fact of the period."],
          ["An assembly elected in 500 pieces",
           "Members are chosen in constituencies that range from one seat to seventeen, by open list where more than one seat is at stake. With no meaningful threshold and hundreds of parties registered, the largest bloc in 2023 held fewer than one seat in seven and government is assembled afterwards."],
          ["The single list",
           "From 1970 to 1987 the Popular Movement of the Revolution was the only legal party, membership was automatic at birth, and it won every seat at every election. Mobutu was confirmed as president three times as the only candidate on the ballot. Those rows are marked unfree."],
          ["Counting a country the size of western Europe",
           "Results are moved by road, river and aircraft from tens of thousands of polling stations, and the 2018 and 2023 counts were both extended, partially cancelled and publicly contested. The disputes recorded on this page are about the count as much as the campaign."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/congo-dr", "DR Congo"],
          ["/elections/ng", "Nigerian Elections"],
          ["/elections/za", "South African Elections"],
          ["/elections/eg", "Egyptian Elections"],
        ]}
      />
    </main>
  );
}
