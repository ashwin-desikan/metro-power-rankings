import type { Metadata } from "next";
import Link from "next/link";
import { getJmElections, computeJmRecords, jmPartyColor, jmFmtPct } from "@/lib/jmElections";
import { BASE_URL, SITE_NAME, ogImage } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/jm";
const TITLE = "Jamaican General Elections";
const DESC =
  "Every Jamaican general election from the first held under universal adult suffrage in December 1944 to September 2025. The Jamaica Labour Party and the People's National Party have alternated in office through independence in 1962 and the violent 1980 election, save for 1983, when a PNP boycott of the electoral roll dispute left the JLP to take all 60 seats unopposed. Andrew Holness's JLP won a third consecutive term in 2025.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: ogImage(TITLE, PATH), width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

export default function JmElectionsPage() {
  const { eras, elections, meta } = getJmElections();
  const records = computeJmRecords();
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
        <span>Jamaica</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="jm" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
        <p className="mt-2 text-xs uppercase tracking-widest text-[var(--text-dim)]">
          Source: Wikipedia election articles · as of {meta.built}
        </p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label={"House seats"} value={"63"} hint={"grown from 32 at the first election in 1944"} />
        <StatTile label={"Elections since 1944"} value={String(elections.length)} hint={""} />
        <StatTile label={"2025 turnout"} value={"39.96%"} hint={"Holness's JLP held on for a third term"} />
        <StatTile label="Latest" value={last.label} hint={`${last.seatLeader ?? ""} largest${last.pmAfter ? ` · ${last.pmAfter.name}` : ""}`} />
      </div>

      <JumpNav items={[["#chronology", "Chronology"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      <Chronology
        eras={eras}
        elections={elections}
        hrefBase={PATH}
        colorOf={jmPartyColor}
        fmtPct={jmFmtPct}
        leaderTag="PM"
        intro={"Every Jamaican general election from the first held under universal adult suffrage in 1944 to September 2025, newest first. 1983's caveat is the sharpest in the series: the PNP boycotted, and the JLP took every seat in a House nobody else contested."}
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
              Turnout peaked at 87% in the violent 1980 election and collapsed to about 3% in the boycotted 1983 vote before recovering; it has fallen steadily since 2002, to 39.96% in 2025.
            </p>
            <LineChart series={[turnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The largest party's seat share</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              The JLP's 60 of 60 seats in 1983 is the highest share on record, a result of the PNP's boycott rather than a contested landslide; the PNP's 52 of 60 in 1993 is the largest share won in a fully contested election.
            </p>
            <LineChart series={[largest]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Jamaican elections work"
        cards={[
          ["Two parties since the beginning",
           "Every Jamaican election on record has been decided between the Jamaica Labour Party and the People's National Party, founded within a year of each other by the cousins Alexander Bustamante and Norman Manley out of the 1938 labour disturbances."],
          ["A boycott, not a landslide",
           "1983's all-JLP House did not reflect 60 seats freely won: the PNP boycotted over an outdated electoral roll, and turnout fell to about 3% nationally, the lowest by far in the series."],
          ["Independence changed the title, not the system",
           "Jamaica's head of government held the colonial title of Premier as late as 1962 and Prime Minister after independence that August, but the same first-past-the-post House of Representatives elections have chosen the government throughout."],
          ["A third challenger that never broke through",
           "The National Democratic Movement, formed by JLP defectors in 1995, contested four elections from 1997 to 2011 without winning a seat, and the two founding parties have held the House between them at every election since."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/jamaica", "Jamaica"],
          ["/elections/wi", "West Indies Federation"],
          ["/elections/cu", "Cuban Elections"],
        ]}
      />
    </main>
  );
}
