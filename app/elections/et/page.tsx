import type { Metadata } from "next";
import Link from "next/link";
import { getEtElections, computeEtRecords, etPartyColor, etFmtPct } from "@/lib/etElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/et";
const TITLE = "Ethiopian General Elections";
const DESC =
  "Every election to Ethiopia's lower house since 1957: an imperial Chamber of Deputies with no parties at all, the Derg's single-party Shengo of 1987, the multiparty transition of 1994-95, four elections of EPRDF hegemony that grew less contested every cycle, and two Prosperity Party elections voted on alongside civil war. The 2026 vote handed the Prosperity Party 438 of 547 seats on 95.7% turnout, with 61 seats left vacant where fighting kept the country from voting at all.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

export default function EtElectionsPage() {
  const { eras, elections, meta } = getEtElections();
  const records = computeEtRecords();
  const last = elections[elections.length - 1];
  const modern = elections.filter((e) => e.year >= 1987);

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
        <span>Ethiopia</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="et" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
        <p className="mt-2 text-xs uppercase tracking-widest text-[var(--text-dim)]">
          Source: Wikipedia election articles · as of {meta.built}
        </p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label={"Seats"} value={"547"} hint={"House of Peoples' Representatives"} />
        <StatTile label={"Elections since 1957"} value={String(elections.length)} hint={""} />
        <StatTile label={"June 2026"} value={"438"} hint={"Prosperity Party seats, 95.7% turnout"} />
        <StatTile label="Latest" value={last.label} hint={`${last.seatLeader ?? ""} largest${last.pmAfter ? ` · ${last.pmAfter.name}` : ""}`} />
      </div>

      <JumpNav items={[["#chronology", "Chronology"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      <Chronology
        eras={eras}
        elections={elections}
        hrefBase={PATH}
        colorOf={etPartyColor}
        fmtPct={etFmtPct}
        leaderTag="PM"
        intro={"Every election to the imperial Chamber of Deputies, the Derg's National Shengo, the Constituent Assembly and the House of Peoples' Representatives since 1957, newest first. Parties were banned until 1994; every contest from 1995 on carries a boycott, a dispute or a war that kept part of the country from voting."}
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
              Turnout has run above 80% in every multiparty election on record, from 87.5% in 1994 to a reported 95.7% in 2026, whatever else was contested about the count.
            </p>
            <LineChart series={[turnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The largest party's share</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Most of these tables report seats and a seat change but no vote share, so the line only has three points to plot: the Workers' Party's 99.2% in 1987, OPDO's 82.9% within the EPRDF coalition in 1995, and the Prosperity Party's 89.2% in 2021.
            </p>
            <LineChart series={[largest]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Ethiopian elections work"
        cards={[
          ["From no parties to one party to many",
           "Parties were banned outright until 1994, restricted to one legal party under the Derg, and multiparty ever since, though every multiparty vote so far has been dominated by a single ruling coalition or its successor."],
          ["An ethnic-federalist coalition, not one party",
           "The EPRDF that ran Ethiopia from 1991 to 2019 was itself a coalition of ethnic-based parties, the OPDO, ANDM, TPLF and EPRDF proper chief among them, plus a shifting bench of smaller regional allies who together held almost every seat outside the opposition's best years."],
          ["Boycotts and disputes, not silence",
           "Every multiparty election from 1995 on carries a boycott, a disputed count, or a war that kept part of the country from voting, right through to the 61 seats left vacant in 2026."],
          ["A single dominant party, three names",
           "The Ethiopian People's Revolutionary Democratic Front governed from 1991, dissolved into the Prosperity Party in 2019 under Abiy Ahmed, and has yet to lose a national election under either name."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/ethiopia", "Ethiopia"],
          ["/elections/ke", "Kenyan Elections"],
          ["/elections/eg", "Egyptian Elections"],
        ]}
      />
    </main>
  );
}
