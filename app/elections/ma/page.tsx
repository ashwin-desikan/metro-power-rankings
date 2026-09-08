import type { Metadata } from "next";
import Link from "next/link";
import { getMaElections, computeMaRecords, maPartyColor, maFmtPct } from "@/lib/maElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/ma";
const TITLE = "Moroccan General Elections";
const DESC =
  "Every House of Representatives election in Morocco from 1963 to 2021, newest first. A minority of seats went to communal councillors and professional colleges rather than direct vote through 1993; the king has appointed his prime minister from the party that won the most votes since the 2011 constitution, most recently Aziz Akhannouch's National Rally of Independents in 2021. The 2026 general election is set for 23 September 2026.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

export default function MaElectionsPage() {
  const { eras, elections, meta } = getMaElections();
  const records = computeMaRecords();
  const last = elections[elections.length - 1];
  const modern = elections;

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
        <span>Morocco</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="ma" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
        <p className="mt-2 text-xs uppercase tracking-widest text-[var(--text-dim)]">
          Source: Wikipedia election articles · as of {meta.built}
        </p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label={"House seats"} value={"395"} hint={"305 local, 90 on regional lists since 2021"} />
        <StatTile label={"Elections since 1963"} value={String(elections.length)} hint={""} />
        <StatTile label={"2021 turnout"} value={"50.35%"} hint={"RNI's Aziz Akhannouch took the premiership"} />
        <StatTile label="Latest" value={last.label} hint={`${last.seatLeader ?? ""} largest${last.pmAfter ? ` · ${last.pmAfter.name}` : ""}`} />
      </div>

      <JumpNav items={[["#chronology", "Chronology"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      <Chronology
        eras={eras}
        elections={elections}
        hrefBase={PATH}
        colorOf={maPartyColor}
        fmtPct={maFmtPct}
        leaderTag="PM"
        intro={"Every House of Representatives election since Morocco's first in 1963, newest first. The 1970-1993 rows carry a caveat for the seats chosen by communal councillors and professional colleges rather than direct vote; 1970 and 1977 give no vote count at all, only seats, because the source states none."}
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
              From a high of 82.36% in 1977 to a low of 37.00% in 2007, before recovering to 50.35% in the most recent, 2021 election.
            </p>
            <LineChart series={[turnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The largest party's vote share</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              PJD's 27.14% in 2016 is the highest on record where a vote share was recorded at all; 1970 and 1977 print no vote share for any party, only seats.
            </p>
            <LineChart series={[largest]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Moroccan elections work"
        cards={[
          ["A house shared with the colleges, 1970-1993",
           "For six elections a majority of seats went to direct vote and the rest to communal councillors and professional colleges representing agriculture, commerce, artisans and trade unions, an arrangement dropped for the fully direct 1997 election."],
          ["A national list alongside the local vote",
           "Since 2002 a proportional national list has topped up the larger, directly elected local tier; by 2011 two thirds of its 90 seats were reserved for women and the rest for men under 40. A 2021 law replaced the national list with twelve regional lists and removed the vote-share threshold that had stood at 6% locally and 3% nationally."],
          ["The king appoints from the largest party",
           "The 2011 constitution, adopted after Arab Spring protests, requires the king to name his prime minister from the party that won the most votes, ending the palace's freer hand in choosing governments before then."],
          ["A landslide reversal in 2021",
           "PJD's seat count fell from 125 to 13 between 2016 and 2021 as RNI, PAM and Istiqlal took the top three places, the sharpest single swing in the series."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/morocco", "Morocco"],
          ["/elections/eg", "Egyptian Elections"],
          ["/elections/et", "Ethiopian Elections"],
        ]}
      />
    </main>
  );
}
