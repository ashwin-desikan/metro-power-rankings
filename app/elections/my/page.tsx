import type { Metadata } from "next";
import Link from "next/link";
import { getMyElections, computeMyRecords, myPartyColor, myFmtPct } from "@/lib/myElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/my";
const TITLE = 'Malaysian General Elections';
const DESC =
  'Every Malayan and Malaysian general election from 1955 to 2022: the Merdeka landslide, the May 13 rupture, six decades of Barisan Nasional supermajorities on a tilted map, and the two-coalition era that finally made power change hands at the ballot box.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

export default function MyElectionsPage() {
  const { eras, elections, meta } = getMyElections();
  const records = computeMyRecords();
  const last = elections[elections.length - 1];
  const modern = elections.filter((e) => e.year >= 1959);

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
        <span>Malaysia</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="my" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label='General elections' value={String(elections.length)} hint={`${elections[0].year}–${last.year}`} />
        <StatTile label="Latest" value={last.label} hint={`${last.seatLeader ?? ""} largest${last.pmAfter ? ` · ${last.pmAfter.name}` : ""}`} />
        <StatTile label='BN supermajorities' value='10' hint='two-thirds of the Dewan Rakyat at every election, 1974–2004' />
        <StatTile label='First turnover' value='2018' hint='after 61 years of continuous Alliance/BN rule' />
      </div>

      <JumpNav items={[["#chronology", "Chronology"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      <Chronology
        eras={eras}
        elections={elections}
        hrefBase={PATH}
        colorOf={myPartyColor}
        fmtPct={myFmtPct}
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
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout since 1959</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Malaysian turnout runs high and peaks when change feels possible: 84.6% in 2013 and 82.3% in 2018, the two elections that broke the old system.
            </p>
            <LineChart series={[turnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The leading force's vote share</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              The infobox convention attributes each coalition's vote to its leading party: the arc runs from Alliance dominance through BN's manufactured majorities to the sub-40% pluralities of the two-coalition era.
            </p>
            <LineChart series={[largest]} yMax={80} yTicks={[20, 40, 60]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Malaysian elections work"
        cards={[
          [
                    "Westminster with a tilted map",
                    "222 members of the Dewan Rakyat are elected first past the post. Rural Malay-majority seats hold a fraction of the voters of urban ones: malapportionment severe enough that in 2013 the government won a majority while losing the popular vote."
          ],
          [
                    "The coalition is the unit",
                    "Malaysian politics runs on permanent coalitions: Alliance, then Barisan Nasional, now BN, Pakatan Harapan, Perikatan Nasional and the Borneo blocs. Elections are fought, and governments formed, coalition by coalition."
          ],
          [
                    "The Borneo kingmakers",
                    "Sabah and Sarawak's 57 seats sit outside the peninsula's party system, and since 2008 their regional coalitions have decided who governs, including the unity government of 2022."
          ],
          [
                    "From ritual to real",
                    "The BN decades were tilted but never fake: the opposition always sat in parliament, and when the wave finally came in 2018 the system let it through. The label on each entry says which kind of contest it was."
          ]
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[["/countries/malaysia", "Malaysia"], ["/elections/sg", "Singaporean Elections"], ["/elections/id", "Indonesian Elections"], ["/elections/in", "Indian Elections"]]}
      />
    </main>
  );
}
