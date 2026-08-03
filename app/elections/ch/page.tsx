import type { Metadata } from "next";
import Link from "next/link";
import { getChElections, computeChRecords, chPartyColor, chFmtPct } from "@/lib/chElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/ch";
const TITLE = 'Swiss Federal Elections';
const DESC =
  "Every Swiss federal election from the founding vote of 1848 to 2023 — seventy years of Radical rule, the PR revolution of 1919, the magic formula that made elections consequence-free, and the SVP era that broke it. The world's most stable democracy, charted in full.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

export default function ChElectionsPage() {
  const { eras, elections, meta } = getChElections();
  const records = computeChRecords();
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
        <span>Switzerland</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="ch" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label='Federal elections' value={String(elections.length)} hint={`${elections[0].year}–${last.year}`} />
        <StatTile label="Latest" value={last.label} hint={`${last.seatLeader ?? ""} largest${last.pmAfter ? ` · ${last.pmAfter.name}` : ""}`} />
        <StatTile label='The magic formula' value='2:2:2:1' hint='the fixed party split of the Federal Council, 1959–2003' />
        <StatTile label='Referendums per year' value='~4' hint='where Swiss politics actually happens' />
      </div>

      <JumpNav items={[["#chronology", "Chronology"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      <Chronology
        eras={eras}
        elections={elections}
        hrefBase={PATH}
        colorOf={chPartyColor}
        fmtPct={chFmtPct}
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
              The world's gentlest decline: from over 80% between the wars to under 50% today — Swiss voters save their energy for the referendums held four times a year.
            </p>
            <LineChart series={[turnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The SVP's rise</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              The largest party's share tells one story since 1991: the SVP's climb from agrarian also-ran to 62 seats in 2023, the highest tally of any party since proportional representation began.
            </p>
            <LineChart series={[largest]} yMax={80} yTicks={[20, 40, 60]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Swiss elections work"
        cards={[
          [
                    "An election that changes little",
                    "Voters elect the 200-seat National Council by open-list PR, but the seven-member Federal Council is a permanent all-party coalition chosen by parliament. No election has ever removed a government — power shifts by fractions of a Council seat."
          ],
          [
                    "The magic formula",
                    "From 1959 to 2003 the four governing parties split the executive 2:2:2:1 by convention. The SVP's rise broke the arithmetic; today's formula gives it two seats, and disputes about the split are the closest thing Swiss politics has to a crisis."
          ],
          [
                    "Direct democracy does the rest",
                    "Initiatives and referendums decide the questions other countries leave to elections. Swiss voters overrule their parliament several times a year, which is why federal elections stay calm and turnout modest."
          ],
          [
                    "Concordance, not competition",
                    "The system is built to absorb rather than alternate: every major party governs permanently, opposition is a part-time role, and the National Council election is a census of the country's political weather rather than a choice of direction."
          ]
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[["/countries/switzerland", "Switzerland"], ["/elections/de", "German Federal Elections"], ["/elections/fr", "French Elections"], ["/elections/it", "Italian Elections"]]}
      />
    </main>
  );
}
