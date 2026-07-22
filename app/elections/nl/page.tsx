import type { Metadata } from "next";
import Link from "next/link";
import { getNlElections, computeNlRecords, nlPartyColor, nlFmtInt, nlFmtPct } from "@/lib/nlElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/nl";
const TITLE = "Dutch General Elections";
const DESC =
  "Every Dutch general election from 1886 to 2025 — the census-suffrage school struggle, the great Pacification of 1917, the pillarised decades, purple cabinets and the Fortuyn revolt, and the fragmented coalition politics of the present.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

export default function NlElectionsPage() {
  const { eras, elections, meta } = getNlElections();
  const records = computeNlRecords();
  const last = elections[elections.length - 1];
  const pr = elections.filter((e) => e.year >= 1918);

  const turnout: ChartSeries = {
    name: "Turnout",
    color: "#4ECDC4",
    points: pr
      .filter((e) => e.turnout != null)
      .map((e) => ({ x: e.year, y: e.turnout as number, label: e.label })),
  };
  const largest: ChartSeries = {
    name: "Largest party's vote share",
    color: "#8A7CA8",
    points: pr
      .map((e) => {
        const p = e.parties
          .filter((p) => p.share != null)
          .sort((a, b) => (b.share ?? 0) - (a.share ?? 0))[0];
        return p ? { x: e.year, y: p.share as number, label: `${e.label} — ${p.name}` } : null;
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
        <span>Netherlands</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="nl" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label="General elections" value={String(elections.length)} hint={`${elections[0].year}–${last.year}`} />
        <StatTile label="Latest" value={last.label} hint={`${last.seatLeader ?? ""} largest · ${last.pmAfter ? last.pmAfter.name : "formation under way"}`} />
        <StatTile label="House seats" value={nlFmtInt(last.totalSeats ?? 150)} hint="76 for a majority" />
        <StatTile label="The Pacification" value="1917" hint="PR and universal suffrage in one stroke" />
      </div>

      <JumpNav items={[["#chronology", "Chronology"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      <Chronology
        eras={eras}
        elections={elections}
        hrefBase={PATH}
        colorOf={nlPartyColor}
        fmtPct={nlFmtPct}
        leaderTag="PM"
        intro="Every general election, newest first, across six eras — from two-round district contests on a tax-based franchise to the world's purest proportional system. Click any election for the full result and the story."
      />

      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The long arc in charts</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          The proportional era since 1918. Hover any point for the exact figure.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout since 1918</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Voting was compulsory until 1970 — turnout above 90% for half a century — and even
              without the duty, Dutch turnout stays close to 80%.
            </p>
            <LineChart series={[turnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The shrinking largest party</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              The winning party&apos;s share has fallen from the Catholic 30%-plus of the pillarised
              decades to D66&apos;s 16.9% in 2025 — the lowest ever for a Dutch first-place party, and
              the arithmetic behind four-party cabinets.
            </p>
            <LineChart series={[largest]} yMax={40} yTicks={[10, 20, 30]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Dutch general elections work"
        cards={[
          ["The purest proportionality", "The whole country is effectively one district: 150 seats divided by national vote share, with no threshold beyond the quota for a single seat — about 0.67%. It is among the most proportional systems on earth, and parliament's fragmentation shows it."],
          ["The formation is the real contest", "No Dutch party has ever won a majority, so the months after the vote — the formatie, with its informateurs and coalition agreements — decide who governs. Formations have taken as long as 299 days."],
          ["Pillars, then fragments", "For half a century Catholics, Protestants, socialists and liberals each voted for their own pillar's party. Depillarisation dissolved those loyalties, and the Dutch electorate is now among Europe's most volatile."],
          ["The Prime Minister emerges", "Voters elect only the House. The Prime Minister is whoever the coalition puts forward — usually the largest government party's leader, but 2023 produced an unaffiliated PM heading a cabinet of four parties."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/netherlands", "Netherlands"],
          ["/elections/de", "German Federal Elections"],
          ["/elections/eu", "European Parliament Elections"],
          ["/leaders", "World Leaders"],
        ]}
      />
    </main>
  );
}
