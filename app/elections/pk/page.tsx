import type { Metadata } from "next";
import Link from "next/link";
import { getPkElections, computePkRecords, pkPartyColor, pkFmtPct } from "@/lib/pkElections";
import { BASE_URL, SITE_NAME, ogImage } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/pk";
const TITLE = "Pakistani General Elections";
const DESC =
  "Every Pakistani general election from Ayub Khan's electoral college of 1962 to February 2024: the assembly eighty thousand Basic Democrats chose, the one-person-one-vote election of 1970 whose result was never honoured, the party-less ballot under Zia, four dismissed governments in nine years, and three consecutive handovers contested by whoever lost them.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: ogImage(TITLE, PATH), width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

export default function PkElectionsPage() {
  const { eras, elections, meta } = getPkElections();
  const records = computePkRecords();
  const last = elections[elections.length - 1];
  const modern = elections.filter((e) => e.year >= 1970);

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
        <span>Pakistan</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="pk" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
        <p className="mt-2 text-xs uppercase tracking-widest text-[var(--text-dim)]">
          Source: Wikipedia election articles · as of {meta.built}
        </p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label={"National Assembly seats"} value={"336"} hint={"266 elected directly, 70 reserved"} />
        <StatTile label={"Elections since 1962"} value={String(elections.length)} hint={""} />
        <StatTile label={"February 2024"} value={"93"} hint={"seats won by PTI-backed independents after the symbol ruling"} />
        <StatTile label="Latest" value={last.label} hint={`${last.seatLeader ?? ""} largest${last.pmAfter ? ` · ${last.pmAfter.name}` : ""}`} />
      </div>

      <JumpNav items={[["#chronology", "Chronology"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      <Chronology
        eras={eras}
        elections={elections}
        hrefBase={PATH}
        colorOf={pkPartyColor}
        fmtPct={pkFmtPct}
        leaderTag="PM"
        intro={"Every Pakistani general election since 1962, newest first. The first two were decided by an electoral college rather than by voters, and are labelled as such."}
      />

      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The long arc in charts</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          Hover any point for the exact figure.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout since 1970</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              From 58% at the first universal-suffrage election to 35.8% in 1997, the lowest on this page, and back to the high forties and low fifties since 2008.
            </p>
            <LineChart series={[turnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The largest party's share</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              No party has taken 45% of the vote since 1977. Pakistani majorities are built out of pluralities in the thirties plus the reserved seats that follow them.
            </p>
            <LineChart series={[largest]} yMax={80} yTicks={[20, 40, 60]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Pakistani elections work"
        cards={[
          ["Single-member seats decided by plurality",
           "266 members are elected one per constituency by simple plurality, with no second round. A further 60 seats are reserved for women and 10 for non-Muslims and are shared out among the parties in proportion to the general seats they won, so the reserved bench amplifies whoever came first."],
          ["A five-year term the assemblies rarely finished",
           "The National Assembly sits for five years from its first meeting. Between 1988 and 1999 not one assembly reached the end of one, because the president held the power to dismiss the government; since 2008 three have, which is the single most important change on this page."],
          ["An electoral college of eighty thousand",
           "Under the 1962 constitution voters elected Basic Democrats in the union councils, and the Basic Democrats elected the National Assembly and the president. The 1962 and 1965 rows are that system, and they are marked as the indirect contests they were."],
          ["The symbol on the ballot",
           "With a large share of the electorate unable to read, parties campaign on an allotted symbol rather than a name. When the Supreme Court stripped Pakistan Tehreek-e-Insaf of its symbol before the 2024 election, its candidates had to stand as independents with a different symbol each, which is why the largest bloc in that row is not a party."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/pakistan", "Pakistan"],
          ["/elections/in", "Indian General Elections"],
          ["/elections/my", "Malaysian General Elections"],
          ["/elections/ir", "Iranian Elections"],
        ]}
      />
    </main>
  );
}
