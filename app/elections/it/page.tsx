import type { Metadata } from "next";
import Link from "next/link";
import { getItElections, computeItRecords, itPartyColor, itFmtInt, itFmtPct } from "@/lib/itElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/it";
const TITLE = "Italian General Elections";
const DESC =
  "Every Italian general election from unification in 1861 to 2022 — the Liberal monarchy, the Fascist seizure and its plebiscites labelled as such, the First Republic's Christian Democratic decades and the Second Republic's upheavals — for novices and experts alike.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

export default function ItElectionsPage() {
  const { eras, elections, meta } = getItElections();
  const records = computeItRecords();
  const last = elections[elections.length - 1];
  const republic = elections.filter((e) => e.year >= 1946);

  const turnoutSeries: ChartSeries = {
    name: "Turnout",
    color: "#4ECDC4",
    points: elections
      .filter((e) => e.turnout != null && !e.unfree)
      .map((e) => ({ x: e.year, y: e.turnout as number, label: e.label })),
  };
  const dcShare: ChartSeries = {
    name: "DC vote share",
    color: itPartyColor("Christian Democracy"),
    points: republic
      .map((e) => {
        const dc = e.parties.find((p) => /Christian Democracy/i.test(p.name ?? ""));
        return dc && dc.share != null ? { x: e.year, y: dc.share, label: e.label } : null;
      })
      .filter((p): p is { x: number; y: number; label: string } => p != null),
  };
  const pciShare: ChartSeries = {
    name: "PCI vote share",
    color: itPartyColor("Italian Communist Party"),
    points: republic
      .map((e) => {
        const pci = e.parties.find((p) => /Communist Party|PCI/i.test(p.name ?? ""));
        return pci && pci.share != null ? { x: e.year, y: pci.share, label: e.label } : null;
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
        <span>Italy</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="it" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label="General elections" value={String(elections.length)} hint={`${elections[0].year}–${last.year}`} />
        <StatTile label="Latest" value={last.label} hint={`${last.seatLeader ?? ""} · ${last.pmAfter ? last.pmAfter.name : ""}`} />
        <StatTile label="Chamber seats today" value={itFmtInt(last.totalSeats)} hint={last.majoritySeats ? `${last.majoritySeats} for a majority` : undefined} />
        <StatTile label="Republican turnout peak" value="93.8%" hint="the Cold War contests drew near-total participation" />
      </div>

      <JumpNav items={[["#chronology", "Chronology"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      <Chronology
        eras={eras}
        elections={elections}
        hrefBase={PATH}
        colorOf={itPartyColor}
        fmtPct={itFmtPct}
        leaderTag="PM"
        intro="Every general election, newest first, across six eras — including, clearly labelled, the Fascist plebiscites of 1929 and 1934. Click any election for the full result and the story."
      />

      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The long arc in charts</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          Hover any point for the exact figure. The plebiscites are excluded.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout, 1861–2022</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              A two-percent franchise in 1861, mass suffrage from 1913, then the First Republic&apos;s
              extraordinary 90-plus percent — and the modern slide to 63.9% in 2022, the lowest ever.
            </p>
            <LineChart series={[turnoutSeries]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The DC and the PCI, 1946–1992</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              The First Republic in two lines: Christian Democracy never out of power, the West&apos;s
              largest Communist party never in it — closest in 1976, both destroyed by 1994.
            </p>
            <LineChart series={[dcShare, pciShare]} yMax={60} yTicks={[15, 30, 45]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Italian general elections work"
        cards={[
          ["A land of electoral laws", "Italy rewrites its electoral system more than any comparable democracy — pure PR until 1993, then mixed systems nicknamed Mattarellum, Porcellum and Rosatellum. Each rewrite reshapes coalitions before a single vote is cast."],
          ["Two chambers, equal power", "The Chamber and Senate have identical powers and both invest the government — so a majority in one and not the other, as in 2013, means paralysis. Reforms in 2020 cut the chambers to 400 and 200 seats."],
          ["Coalitions before the vote", "Since 1994 parties have run in pre-electoral coalitions of left and right, so election night usually crowns an alliance rather than a party — though the governments that follow often outlive neither."],
          ["Governments between elections", "Italy has had nearly seventy governments since 1946 but only nineteen elections: most cabinets change between votes, through party splits and palace crises — the elections set the board, not the game."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/italy", "Italy"],
          ["/elections/de", "German Federal Elections"],
          ["/elections/fr", "French Elections"],
          ["/leaders", "World Leaders"],
        ]}
      />
    </main>
  );
}
