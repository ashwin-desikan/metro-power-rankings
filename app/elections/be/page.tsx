import type { Metadata } from "next";
import Link from "next/link";
import { getBeElections, computeBeRecords, bePartyColor, beFmtPct } from "@/lib/beElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/be";
const TITLE = 'Belgian Federal Elections';
const DESC =
  "Every Belgian general and federal election from 1831 to 2024: the censitaire kingdom's Catholic–Liberal duels, plural voting, the arrival of one man one vote, the linguistic fracture that split every party in two, and the record-breaking coalition deadlocks of the federal era.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

export default function BeElectionsPage() {
  const { eras, elections, meta } = getBeElections();
  const records = computeBeRecords();
  const last = elections[elections.length - 1];
  const modern = elections.filter((e) => e.year >= 1919);

  const turnout: ChartSeries = {
    name: "Turnout",
    color: "#4ECDC4",
    points: modern
      .filter((e) => e.turnout != null)
      .map((e) => ({ x: e.year, y: e.turnout as number, label: e.label })),
  };
  const largest: ChartSeries = {
    name: "Largest party's vote share",
    color: "#8A7CA8",
    points: modern
      .map((e) => {
        const p = e.parties
          .filter((p) => p.share != null)
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
        <span>Belgium</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="be" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label='Elections' value={String(elections.length)} hint={`${elections[0].year}–${last.year}`} />
        <StatTile label="Latest" value={last.label} hint={`${last.seatLeader ?? ""} largest${last.pmAfter ? ` · ${last.pmAfter.name}` : ""}`} />
        <StatTile label='Formation record' value='541 days' hint='the post-2010 deadlock, a world record' />
        <StatTile label='Party systems' value='2' hint='one Dutch-speaking, one French-speaking, since 1968–78' />
      </div>

      <JumpNav items={[["#chronology", "Chronology"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      <Chronology
        eras={eras}
        elections={elections}
        hrefBase={PATH}
        colorOf={bePartyColor}
        fmtPct={beFmtPct}
        leaderTag="PM"
        intro="Every election, newest first, era by era. Click any election for the full result and the story."
      />

      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The long arc in charts</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          Hover any point for the exact figure.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout since 1919</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Voting has been compulsory since 1893, so Belgian turnout lives between 85 and 95 per cent, among the highest sustained participation ever recorded.
            </p>
            <LineChart series={[turnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The largest party's shrinking share</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              From the Catholic Party's absolute majorities to the N-VA's 16.7% in 2024: the fragmentation curve of a country whose party system split in two along the language border.
            </p>
            <LineChart series={[largest]} yMax={80} yTicks={[20, 40, 60]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Belgian elections work"
        cards={[
          [
                    "Compulsory voting, PR chambers",
                    "The 150-seat Chamber is elected by proportional representation in eleven constituencies, with a 5% provincial threshold. Voting has been compulsory for men since 1893 and for everyone since 1949: turnout is a constant, not a variable."
          ],
          [
                    "Two electorates, one country",
                    "Since the parties split along the language border there has been no Belgian party system: Flemings choose among Flemish parties, francophones among francophone ones, and only in bilingual Brussels do the two menus meet."
          ],
          [
                    "The formation is the ordeal",
                    "No party approaches a majority, so governments need six or seven partners across the language line. The negotiations have twice passed a year: 541 days after 2010, 494 after 2019, while caretaker cabinets minded the shop."
          ],
          [
                    "From census to universal",
                    "The kingdom's first sixty years of elections belonged to the one per cent who paid the cens; plural voting then weighted the new mass franchise until 1919. The labels on the early entries say plainly how narrow those electorates were."
          ]
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[["/countries/belgium", "Belgium"], ["/elections/nl", "Dutch General Elections"], ["/elections/fr", "French Elections"], ["/elections/eu", "European Parliament Elections"]]}
      />
    </main>
  );
}
