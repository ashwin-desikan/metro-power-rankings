import type { Metadata } from "next";
import Link from "next/link";
import { getAeElections, computeAeRecords, aePartyColor, aeFmtPct } from "@/lib/aeElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/ae";
const TITLE = "Emirati Federal National Council Elections";
const DESC =
  "Every Federal National Council election from 2006 to 2023: twenty of the council's forty seats elected, the other twenty simply appointed, and every one of the elected seats won by an independent because parties are banned. The number that actually moves is the electoral college handpicked to vote, which grew from 6,595 members to 398,879 in five contests while turnout swung between 27.75% and 74.4%.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

export default function AeElectionsPage() {
  const { eras, elections, meta } = getAeElections();
  const records = computeAeRecords();
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
        <span>United Arab Emirates</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="ae" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
        <p className="mt-2 text-xs uppercase tracking-widest text-[var(--text-dim)]">
          Source: Wikipedia election articles · as of {meta.built}
        </p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label={"FNC seats"} value={"40"} hint={"half elected, half appointed by the rulers"} />
        <StatTile label={"Elections since 2006"} value={String(elections.length)} hint={""} />
        <StatTile label={"2023 college size"} value={"398,879"} hint={"up from 6,595 members in 2006"} />
        <StatTile label="Latest" value={last.label} hint={`${last.seatLeader ?? ""} largest${last.pmAfter ? ` · ${last.pmAfter.name}` : ""}`} />
      </div>

      <JumpNav items={[["#chronology", "Chronology"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      <Chronology
        eras={eras}
        elections={elections}
        hrefBase={PATH}
        colorOf={aePartyColor}
        fmtPct={aeFmtPct}
        leaderTag="Speaker"
        intro={"Every Federal National Council election since 2006, newest first. Parties are banned in the United Arab Emirates, so all twenty elected seats return independents every time; what changes is who gets to vote at all, as the handpicked electoral college grew from 6,595 members to 398,879 across five contests."}
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
              Turnout has swung from 74.4% in the first election of 2006, before the college had grown large, down to 27.75% in 2011 and back up to 44.0% by 2023.
            </p>
            <LineChart series={[turnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The largest party's share</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Empty by construction: parties are banned and every seat goes to an independent, so there is no party vote share to plot. The number that actually tells this story is the electoral college's size, from 6,595 voters in 2006 to 398,879 in 2023.
            </p>
            <LineChart series={[largest]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Emirati elections work"
        cards={[
          ["An electoral college, not a franchise",
           "Only citizens the rulers of each emirate name to the electoral college may vote at all. That college was 6,595 people in 2006 and 398,879 by 2023, still a fraction of the more than 300,000 citizens over 18 the first election's own article counted."],
          ["Half elected, half appointed",
           "The council has 40 seats. Twenty are filled by the electoral college, one non-transferable vote per elector, across seven emirate-based constituencies; the rulers simply appoint the other twenty themselves."],
          ["No parties on the ballot",
           "Political parties are banned in the UAE, so every candidate runs and wins as an independent. The seats table on every one of these five contests reads the same: Independents, twenty seats, no change."],
          ["A gender quota layered on top",
           "Since the 2019 election, half of the council's seats are reserved for women by directive; where an emirate's elected results fall short, its appointed seats are used to make up the balance."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/united-arab-emirates", "United Arab Emirates"],
          ["/elections/eg", "Egyptian Elections"],
          ["/elections/iq", "Iraqi Elections"],
          ["/elections/ir", "Iranian Elections"],
        ]}
      />
    </main>
  );
}
