import type { Metadata } from "next";
import Link from "next/link";
import { getSeElections, computeSeRecords, sePartyColor, seFmtPct } from "@/lib/seElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/se";
const TITLE = "Swedish General Elections";
const DESC =
  "Every Swedish general election from the first Second Chamber of 1866 to September 2022: forty years of a franchise that reached one adult man in five, the proportional breakthrough of 1911, the Social Democratic century, the four per cent threshold that has shaped every result since 1970, and the arrival of a party the others spent a decade refusing to talk to.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

export default function SeElectionsPage() {
  const { eras, elections, meta } = getSeElections();
  const records = computeSeRecords();
  const last = elections[elections.length - 1];
  const modern = elections.filter((e) => e.year >= 1911);

  const turnout: ChartSeries = {
    name: "Turnout",
    color: "#4ECDC4",
    points: modern
      .filter((e) => e.turnout != null && (e.turnout as number) <= 100)
      .map((e) => ({ x: e.year, y: e.turnout as number, label: e.label })),
  };
  const largest: ChartSeries = {
    name: "Largest party's vote share",
    color: "#8A7CA8",
    points: modern
      .map((e) => {
        const p = e.parties
          .filter((p) => p.share != null && (p.share as number) <= 100)
          .sort((a, b) => (b.share ?? 0) - (a.share ?? 0))[0];
        return p ? { x: e.year, y: p.share as number, label: `${e.label}, ${p.name}` } : null;
      })
      .filter((p): p is { x: number; y: number; label: string } => p != null),
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/elections" className="hover:underline">Elections</Link>
        {" / "}
        <span>Sweden</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="se" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
        <p className="mt-2 text-xs uppercase tracking-widest text-[var(--text-dim)]">
          Source: Wikipedia election articles · as of {meta.built}
        </p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label={"Riksdag seats"} value={"349"} hint={"175 for a majority"} />
        <StatTile label={"Elections since 1866"} value={String(elections.length)} hint={""} />
        <StatTile label={"Peak turnout"} value={"91.8%"} hint={"1976, the year the Social Democrats finally lost"} />
        <StatTile label="Latest" value={last.label} hint={`${last.seatLeader ?? ""} largest${last.pmAfter ? ` · ${last.pmAfter.name}` : ""}`} />
      </div>

      <JumpNav items={[["#chronology", "Chronology"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      <Chronology
        eras={eras}
        elections={elections}
        hrefBase={PATH}
        colorOf={sePartyColor}
        fmtPct={seFmtPct}
        leaderTag="PM"
        intro={"Every Swedish general election since the Second Chamber was created in 1866, newest first. The rows before 1970 are that chamber alone, elected on a franchise that only became universal in stages."}
      />

      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The long arc in charts</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          Hover any point for the exact figure.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout since 1911</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              From 57% at the first proportional election to 91.8% in 1976, then a slow decline to the mid eighties, which is still among the highest voluntary turnouts in the world.
            </p>
            <LineChart series={[turnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The Social Democratic share</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Above 40% at every election from 1932 to 1994 and never below 28% since. The line falls, but it has never stopped being the largest.
            </p>
            <LineChart series={[largest]} yMax={80} yTicks={[20, 40, 60]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Swedish elections work"
        cards={[
          ["Proportional representation with a four per cent threshold",
           "310 constituency seats and 39 adjustment seats are allocated by the modified Sainte-Lague method, so the national result is close to the national vote. A party needs 4% nationally, or 12% in a single constituency, to take part at all."],
          ["A fixed date, and an early election that does not reset it",
           "Sweden votes on the second Sunday of September every fourth year. A government may call an extra election, but the Riksdag it produces serves only the remainder of the term, which is why Sweden has had so few."],
          ["The bicameral era",
           "Until 1970 the Riksdag had two chambers and only the second was elected directly, in staggered rotation, on an income and property franchise until 1911. The rows before 1970 are that chamber, and the turnout figures beneath them belong to a much smaller electorate."],
          ["Blocs, not coalitions",
           "Swedish governments are usually minorities that legislate deal by deal. What decides an election is which side can assemble a Riksdag majority against the other, which is why the arithmetic on this page matters more than the winner."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/sweden", "Sweden"],
          ["/elections/no", "Norwegian Parliamentary Elections"],
          ["/elections/dk", "Danish General Elections"],
          ["/elections/de", "German Federal Elections"],
        ]}
      />
    </main>
  );
}
