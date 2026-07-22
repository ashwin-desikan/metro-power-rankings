import type { Metadata } from "next";
import Link from "next/link";
import {
  getDeElections,
  computeDeRecords,
  dePartyColor,
  DE_BIG_TWO,
  deFmtInt,
  deFmtPct,
  type DeElection,
} from "@/lib/deElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/de";
const TITLE = "German Federal Elections";
const DESC =
  "Every German national election from the Frankfurt Parliament of 1848 to the Bundestag of 2025 — Empire, Weimar, dictatorship, Bonn and Berlin republics — with the results, the chancellors and the story of each, for novices and experts alike.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

export default function DeElectionsPage() {
  const { eras, elections, meta } = getDeElections();
  const records = computeDeRecords();
  const last = elections[elections.length - 1];
  const free = elections.filter((e) => !e.unfree);

  const turnoutSeries: ChartSeries = {
    name: "Turnout",
    color: "#4ECDC4",
    points: free
      .filter((e) => e.turnout != null)
      .map((e) => ({ x: e.year, y: e.turnout as number, label: e.label })),
  };
  const bigTwo = (e: DeElection): number | null => {
    const s = e.parties.filter((p) => p.name != null && DE_BIG_TWO.has(p.name)).reduce((acc, p) => acc + (p.share ?? 0), 0);
    return s > 0 ? s : null;
  };
  const bigTwoSeries: ChartSeries = {
    name: "CDU/CSU + SPD vote",
    color: "#8A7CA8",
    points: elections
      .filter((e) => e.year >= 1949)
      .map((e) => ({ x: e.year, y: bigTwo(e), label: e.label }))
      .filter((p): p is { x: number; y: number; label: string } => p.y != null),
  };
  const spdSeries: ChartSeries = {
    name: "SPD vote",
    color: dePartyColor("SPD"),
    points: elections
      .map((e) => {
        const spd = e.parties.find((p) => p.name === "SPD" || /Social Democratic/i.test(p.name ?? ""));
        return spd && spd.share != null ? { x: e.year, y: spd.share, label: e.label } : null;
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
        <span>Germany</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="de" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label="National elections" value={String(elections.length)} hint={`${elections[0].year}–${last.year}, across five constitutional orders`} />
        <StatTile label="Latest" value={last.label} hint={`${last.seatLeader ?? ""} · ${last.pmAfter ? last.pmAfter.name : ""}`} />
        <StatTile label="Bundestag seats today" value={deFmtInt(last.totalSeats)} hint={last.majoritySeats ? `${last.majoritySeats} for a majority` : undefined} />
        <StatTile label="Universal male suffrage" value="1871" hint="women vote from 1919 — earlier than Britain, France or the US" />
      </div>

      <JumpNav items={[["#chronology", "Chronology"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      <Chronology
        eras={eras}
        elections={elections}
        hrefBase={PATH}
        colorOf={dePartyColor}
        fmtPct={deFmtPct}
        leaderTag="Chancellor"
        intro="Every national election, newest first, grouped into six eras — including, clearly labelled, the unfree votes of the Nazi years. Click any election for the full result and the story."
      />

      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The long arc in charts</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          Hover any point for the exact figure. The dictatorship&apos;s sham votes are excluded.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout in free elections, 1848–2025</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              From roughly half the electorate in Bismarck&apos;s first Reichstag to the Bonn Republic&apos;s
              91% peak in 1972, and a modern floor of 70.8% in 2009.
            </p>
            <LineChart series={[turnoutSeries]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The Volksparteien and the SPD&apos;s long century</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              CDU/CSU and SPD together took nine votes in ten at their 1972–76 peak and barely one in two by
              2025. The SPD line runs all the way back to the Kaiserreich, where it was the largest party by
              1912.
            </p>
            <LineChart series={[bigTwoSeries, spdSeries]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How German federal elections work"
        cards={[
          ["Two votes", "Since 1949 each voter casts a first vote for a constituency candidate and a second vote for a party list. The second vote sets the party balance — proportionality is the system's spine, a deliberate answer to Weimar and to first-past-the-post alike."],
          ["The 5% hurdle", "A party needs 5% of the national second vote (or three constituency wins) to enter the Bundestag. Adopted against Weimar-style fragmentation, it has kept the chamber to a handful of parties — and made every decimal around 5% an election-night drama."],
          ["Chancellor, not president", "Voters elect a parliament, and the Bundestag elects the chancellor. No German chancellor has ever governed alone: every government since 1949 has been a coalition, negotiated for weeks after the vote."],
          ["Constructive no-confidence", "The Bundestag can only remove a chancellor by electing a successor in the same motion — used successfully once, when Helmut Kohl replaced Helmut Schmidt in 1982. Another Weimar lesson built into the machinery."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/germany", "Germany"],
          ["/elections/eu", "European Parliament Elections"],
          ["/elections/fr", "French Elections"],
          ["/leaders", "World Leaders"],
        ]}
      />
    </main>
  );
}
