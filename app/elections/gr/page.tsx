import type { Metadata } from "next";
import Link from "next/link";
import { getGrElections, computeGrRecords, grPartyColor, grFmtPct } from "@/lib/grElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/gr";
const TITLE = "Greek Parliamentary Elections";
const DESC =
  "Every Greek parliamentary election from 1862 to June 2023: the constitutional kingdom and its parties named after men, the National Schism, the civil war and the colonels, the two-party metapolitefsi, the crisis that destroyed it in three years, and the fifty-seat bonus that decides who governs.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

export default function GrElectionsPage() {
  const { eras, elections, meta } = getGrElections();
  const records = computeGrRecords();
  const last = elections[elections.length - 1];
  const modern = elections.filter((e) => e.year >= 1918);

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
        <span>Greece</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="gr" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label="The bonus" value="50" hint="seats handed to the largest party under the 2023 rules" />
        <StatTile label="Elections since 1862" value={String(elections.length)} hint="on file" />
        <StatTile label="Two in one year" value="1989, 2012, 2015, 2023" hint="four times a single election failed to produce a government" />
      </div>

      <JumpNav items={[["#chronology", "Chronology"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      <Chronology
        eras={eras}
        elections={elections}
        hrefBase={PATH}
        colorOf={grPartyColor}
        fmtPct={grFmtPct}
        leaderTag="PM"
        intro="Every Greek parliamentary election, newest first, era by era. The colonels' seven years and the Metaxas dictatorship appear as the gaps they were."
      />

      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The long arc in charts</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          Hover any point for the exact figure.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout since 1926</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Voting was compulsory in Greece from 1926 and enforcement was real: turnout sat above 75% for sixty years. It has fallen by more than twenty points since the crisis, and the fine has not been levied in decades.
            </p>
            <LineChart series={[turnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The largest party's share</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Two-party Greece peaked at PASOK's 48% in 1981. Nothing since 2012 has come close, which is precisely why the seat bonus was invented and then repeatedly rewritten.
            </p>
            <LineChart series={[largest]} yMax={80} yTicks={[20, 40, 60]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Greek elections work"
        cards={[
          [
            "Reinforced proportional representation",
            "Greece has spent most of its democratic history topping up the largest party's seats. The bonus has been as large as fifty seats, was abolished for the May 2023 election and restored for the June one, which is why two votes six weeks apart produced completely different parliaments from almost identical results."
          ],
          [
            "A 3% threshold with teeth",
            "Parties below 3% take nothing, and in a fragmented field that has repeatedly wasted a tenth of the vote. The threshold is also why the Greek left keeps merging and splitting: below it, votes vanish."
          ],
          [
            "Parties named after men",
            "For the first fifty years on this page the parties are the Supporters of Trikoupis, of Deligiannis, of Theotokis. They were personal followings rather than programmes, which is why the chamber could turn over completely from one election to the next."
          ],
          [
            "Elections that were not held",
            "The gap between 1964 and 1974 is the colonels. The gap between 1936 and 1946 is the Metaxas dictatorship, the occupation and the start of the civil war. Both are marked rather than skipped."
          ],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/greece", "Greece"],
          ["/elections/it", "Italian General Elections"],
          ["/elections/es", "Spanish General Elections"],
          ["/elections/tr", "Turkish Elections"],
        ]}
      />
    </main>
  );
}
