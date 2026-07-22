import type { Metadata } from "next";
import Link from "next/link";
import {
  getAuElections,
  computeAuRecords,
  auPartyColor,
  auIsCoalitionFamily,
  AU_LABOR,
  auFmtInt,
  auFmtPct,
  type AuElection,
} from "@/lib/auElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/au";
const TITLE = "Australian Federal Elections";
const DESC =
  "Every Australian federal election from Federation in 1901 to 2025: the results, the leaders, the preferences and the turnout — from Barton's first parliament to the 2025 landslide, for novices who want the story and experts who want the numbers.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

export default function AuElectionsPage() {
  const { eras, elections, meta } = getAuElections();
  const records = computeAuRecords();
  const last = elections[elections.length - 1];

  const turnoutSeries: ChartSeries = {
    name: "Turnout",
    color: "#4ECDC4",
    points: elections
      .filter((e) => e.turnout != null)
      .map((e) => ({ x: e.year, y: e.turnout as number, label: e.label })),
  };
  const majorShare = (e: AuElection): number | null => {
    const labor = e.parties.filter((p) => p.name != null && AU_LABOR.has(p.name));
    const coal = e.parties.filter((p) => auIsCoalitionFamily(p.name));
    const known = [...labor, ...coal].filter((p) => p.share != null);
    return known.length >= 2 ? known.reduce((s, p) => s + (p.share ?? 0), 0) : null;
  };
  const majorVotes: ChartSeries = {
    name: "Labor + Coalition-family vote",
    color: "#8A7CA8",
    points: elections
      .map((e) => ({ x: e.year, y: majorShare(e), label: e.label }))
      .filter((p): p is { x: number; y: number; label: string } => p.y != null),
  };
  const laborSeats: ChartSeries = {
    name: "Labor seat share",
    color: auPartyColor("Labor"),
    points: elections
      .map((e) => {
        const seats = e.parties.filter((p) => p.name != null && AU_LABOR.has(p.name)).reduce((s, p) => s + (p.seats ?? 0), 0);
        return e.totalSeats ? { x: e.year, y: (seats / e.totalSeats) * 100, label: e.label } : null;
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
        <span>Australia</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="au" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label="Federal elections" value={String(elections.length)} hint={`${elections[0].year}–${last.year}`} />
        <StatTile label="Latest" value={last.label} hint={`${last.seatLeader ?? ""} · ${last.pmAfter ? last.pmAfter.name : ""}`} />
        <StatTile label="House seats today" value={auFmtInt(last.totalSeats)} hint={last.majoritySeats ? `${last.majoritySeats} for a majority` : undefined} />
        <StatTile label="Turnout since 1925" value="~95%" hint="compulsory voting since 1924 — the world's steadiest electorate" />
      </div>

      <JumpNav items={[["#chronology", "Chronology"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      <Chronology
        eras={eras}
        elections={elections}
        hrefBase={PATH}
        colorOf={auPartyColor}
        fmtPct={auFmtPct}
        leaderTag="PM"
        intro="Every federal election, newest first, grouped into nine eras. Click any election for the full result, the party table and the story."
      />

      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The long arc in charts</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          A century and a quarter of results. Hover any point for the exact figure.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout, 1901–2025</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Voluntary voting produced turnouts as low as 39% in 1903; compulsory voting from 1924 snapped
              it above 90% and it has never left.
            </p>
            <LineChart series={[turnoutSeries]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The major-party grip</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Combined first-preference vote of Labor and the Coalition family against Labor&apos;s share of
              House seats. The primary-vote grip has slid for decades — yet preferences still deliver
              majority governments.
            </p>
            <LineChart series={[majorVotes, laborSeats]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Australian federal elections work"
        cards={[
          ["Preferential voting", "Voters number every candidate. If nobody has a majority of first preferences, the last-placed candidate is excluded and their ballots flow on — which is why a party can trail on primaries and still win the seat, and why the two-party-preferred count decides elections."],
          ["Compulsory voting", "Enrolment and turning out have been compulsory since 1924. Turnout jumped from 59% to 91% at the first compulsory election and has stayed above 90% ever since — the steadiest participation of any major democracy."],
          ["The Coalition", "The Liberal Party and the Nationals (once the Country Party) have contested elections as a standing coalition for a century, functioning as one side of a two-party system against Labor while remaining separate parties."],
          ["Three-year terms", "The House serves a maximum of three years — among the shortest terms anywhere — and a government can call a double dissolution of both chambers to break Senate deadlocks, as in 1914, 1951, 1974, 1975 and 2016."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/australia", "Australia"],
          ["/elections/uk", "UK General Elections"],
          ["/elections/ca", "Canadian Federal Elections"],
          ["/leaders", "World Leaders"],
        ]}
      />
    </main>
  );
}
