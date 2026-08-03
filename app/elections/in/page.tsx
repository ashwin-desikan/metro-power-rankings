import type { Metadata } from "next";
import Link from "next/link";
import {
  getInElections,
  computeInRecords,
  inPartyColor,
  inIsCongressFamily,
  inIsBjpFamily,
  inFmtInt,
  inFmtPct,
} from "@/lib/inElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/in";
const TITLE = "Indian General Elections";
const DESC =
  "Every Indian general election from the Central Legislative Assembly votes of the Raj to the Lok Sabha of 2024 — the world's largest democratic exercise, with the results, the Prime Ministers and the story of each, for novices and experts alike.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

export default function InElectionsPage() {
  const { eras, elections, meta } = getInElections();
  const records = computeInRecords();
  const last = elections[elections.length - 1];
  const republic = elections.filter((e) => e.year >= 1951);

  const turnoutSeries: ChartSeries = {
    name: "Turnout",
    color: "#4ECDC4",
    points: republic
      .filter((e) => e.turnout != null)
      .map((e) => ({ x: e.year, y: e.turnout as number, label: e.label })),
  };
  const congressSeats: ChartSeries = {
    name: "Congress seats",
    color: inPartyColor("INC"),
    points: republic
      .map((e) => {
        const seats = e.parties.filter((p) => inIsCongressFamily(p.name)).reduce((s, p) => s + (p.seats ?? 0), 0);
        return { x: e.year, y: seats, label: e.label };
      }),
  };
  const bjpSeats: ChartSeries = {
    name: "BJP / Jana Sangh seats",
    color: inPartyColor("BJP"),
    points: republic
      .map((e) => {
        const seats = e.parties.filter((p) => inIsBjpFamily(p.name)).reduce((s, p) => s + (p.seats ?? 0), 0);
        return { x: e.year, y: seats, label: e.label };
      }),
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/elections" className="hover:underline">Elections</Link>
        {" / "}
        <span>India</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="in" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label="Elections covered" value={String(elections.length)} hint={`${elections[0].year}–${last.year}, including the Raj-era assemblies`} />
        <StatTile label="Latest" value={last.label} hint={`${last.seatLeader ?? ""} · ${last.pmAfter ? last.pmAfter.name : ""}`} />
        <StatTile label="Lok Sabha seats" value={inFmtInt(last.totalSeats)} hint={last.majoritySeats ? `${last.majoritySeats} for a majority` : undefined} />
        <StatTile label="2024 electorate" value="~970m" hint="the largest election ever held, anywhere" />
      </div>

      <JumpNav items={[["#chronology", "Chronology"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      <Chronology
        eras={eras}
        elections={elections}
        hrefBase={PATH}
        colorOf={inPartyColor}
        fmtPct={inFmtPct}
        leaderTag="PM"
        intro="Every general election, newest first, grouped into six eras — from the limited-franchise assemblies of British India to the largest democratic exercise on earth. Click any election for the full result and the story."
      />

      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The long arc in charts</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          The republic&apos;s elections since 1951–52. Hover any point for the exact figure.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout, 1951–2024</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              The opposite arc to the West: participation has risen across seven decades, from about 45% in
              the first general election to a record 67.4% in 2019.
            </p>
            <LineChart series={[turnoutSeries]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Congress and the BJP</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Lok Sabha seats for the Congress family against the Jana Sangh and its successor the BJP: one
              dominance ends in 1989, the other begins in 2014 — with 2024 the first dent in it.
            </p>
            <LineChart series={[congressSeats, bjpSeats]} yMax={450} yTicks={[100, 272, 400]} unit="" />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Indian general elections work"
        cards={[
          ["First past the post", "One MP per constituency, most votes wins — inherited from Westminster and kept through every delimitation. It gave Congress decades of huge majorities on minority vote shares, and does the same for the BJP today."],
          ["An election in phases", "Polling runs in stages over several weeks — seven phases in 2024 — so security forces and a million-plus polling stations can be redeployed. Counting, by contrast, happens in a single day."],
          ["The Election Commission", "A constitutionally independent commission runs the whole exercise, from the model code of conduct to the electronic voting machines used nationwide since 2004 — the machinery that makes a 970-million-voter election possible."],
          ["Alliances decide", "Since 1989 the real contest has usually been between pre-poll alliances — the BJP-led NDA against the Congress-led UPA and its successor INDIA bloc — with regional parties supplying the margins of power."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/india", "India"],
          ["/elections/uk", "UK General Elections"],
          ["/elections/au", "Australian Federal Elections"],
          ["/leaders", "World Leaders"],
        ]}
      />
    </main>
  );
}
