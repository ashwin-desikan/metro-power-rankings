import type { Metadata } from "next";
import Link from "next/link";
import { getNoElections, computeNoRecords, noPartyColor, noFmtPct } from "@/lib/noElections";
import { BASE_URL, SITE_NAME, ogImage } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/no";
const TITLE = "Norwegian Parliamentary Elections";
const DESC =
  "Every Storting election from 1815 to September 2025: sixty years of indirect voting by landowners and officials with no parties at all, the impeachment that created parliamentary government, the dissolution of the union with Sweden, Labour's twenty years of single-party majorities, and the eight-party chamber of today.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: ogImage(TITLE, PATH), width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

export default function NoElectionsPage() {
  const { eras, elections, meta } = getNoElections();
  const records = computeNoRecords();
  const last = elections[elections.length - 1];
  const modern = elections.filter((e) => e.year >= 1882);

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
        <span>Norway</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="no" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
        <p className="mt-2 text-xs uppercase tracking-widest text-[var(--text-dim)]">
          Source: Wikipedia election articles · as of {meta.built}
        </p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label={"Storting seats"} value={"169"} hint={"85 for a majority"} />
        <StatTile label={"Elections since 1815"} value={String(elections.length)} hint={""} />
        <StatTile label={"September 2025"} value={"53"} hint={"Labour seats, with the Progress Party second on 47"} />
        <StatTile label="Latest" value={last.label} hint={`${last.seatLeader ?? ""} largest${last.pmAfter ? ` · ${last.pmAfter.name}` : ""}`} />
      </div>

      <JumpNav items={[["#chronology", "Chronology"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      <Chronology
        eras={eras}
        elections={elections}
        hrefBase={PATH}
        colorOf={noPartyColor}
        fmtPct={noFmtPct}
        leaderTag="PM"
        intro={"Every Storting election since 1815, newest first. The first two dozen have no parties in them because none existed yet, and every member is listed as an independent."}
      />

      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The long arc in charts</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          Hover any point for the exact figure.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout since 1882</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Norwegian turnout crossed 80% when universal male suffrage arrived in 1898 and has stayed near it ever since, without compulsion and without the postal machinery other countries rely on.
            </p>
            <LineChart series={[turnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Labour's share</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              From nothing in 1900 to 48% in 1957 to the high twenties today. No other line explains as much of the Norwegian century.
            </p>
            <LineChart series={[largest]} yMax={80} yTicks={[20, 40, 60]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Norwegian elections work"
        cards={[
          ["Proportional representation with levelling seats",
           "150 district seats are allocated by a modified Sainte-Lague method across 19 constituencies, then 19 levelling seats correct the national result for parties that clear 4%. A party below the threshold can still win a district seat, which is how small regional lists reach the chamber."],
          ["A fixed four-year term with no early election",
           "The Storting cannot be dissolved. A Norwegian government that loses its majority resigns or carries on as a minority, and the country still votes on the second Monday of September in the fourth year. Minority government is therefore normal rather than a crisis."],
          ["Rural seats weigh more",
           "Seats are apportioned on a formula that counts area as well as population, so a vote in Finnmark carries more weight than a vote in Oslo. The effect is smaller than it was but has never been removed."],
          ["Sixty years without parties",
           "Before 1884 there were no organised parties, so the early rows list every member as an independent. That is the record, not a gap in it: voters chose electors, electors chose officials and farmers, and the divisions were personal and regional."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/norway", "Norway"],
          ["/elections/dk", "Danish General Elections"],
          ["/elections/se", "Swedish General Elections"],
          ["/elections/nl", "Dutch General Elections"],
        ]}
      />
    </main>
  );
}
