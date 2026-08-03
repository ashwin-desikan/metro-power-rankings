import type { Metadata } from "next";
import Link from "next/link";
import { getNzElections, computeNzRecords, nzPartyColor, nzFmtInt, nzFmtPct } from "@/lib/nzElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/nz";
const TITLE = "New Zealand General Elections";
const DESC =
  "Every New Zealand general election from 1853 to 2023 — the colonial parliaments, the world's first election with women's suffrage in 1893, the first Labour government, four decades of two-party rule, and the coalition politics of the MMP era.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

export default function NzElectionsPage() {
  const { eras, elections, meta } = getNzElections();
  const records = computeNzRecords();
  const last = elections[elections.length - 1];
  const modern = elections.filter((e) => e.year >= 1890);

  const turnout: ChartSeries = {
    name: "Turnout",
    color: "#4ECDC4",
    points: modern
      .filter((e) => e.turnout != null)
      .map((e) => ({ x: e.year, y: e.turnout as number, label: e.label })),
  };
  const labour: ChartSeries = {
    name: "Labour vote share",
    color: nzPartyColor("Labour"),
    points: elections
      .filter((e) => e.year >= 1919)
      .map((e) => {
        const p = e.parties.find((p) => /^Labour/i.test(p.name ?? ""));
        return p && p.share != null ? { x: e.year, y: p.share, label: e.label } : null;
      })
      .filter((p): p is { x: number; y: number; label: string } => p != null),
  };
  const national: ChartSeries = {
    name: "National vote share",
    color: nzPartyColor("National"),
    points: elections
      .filter((e) => e.year >= 1938)
      .map((e) => {
        const p = e.parties.find((p) => /^National/i.test(p.name ?? ""));
        return p && p.share != null ? { x: e.year, y: p.share, label: e.label } : null;
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
        <span>New Zealand</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="nz" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label="General elections" value={String(elections.length)} hint={`${elections[0].year}–${last.year}`} />
        <StatTile label="Latest" value={last.label} hint={`${last.seatLeader ?? ""} · ${last.pmAfter ? last.pmAfter.name : ""}`} />
        <StatTile label="House seats" value={nzFmtInt(last.totalSeats)} hint={last.majoritySeats ? `${last.majoritySeats} for a majority` : undefined} />
        <StatTile label="First with women's votes" value="1893" hint="a world first for a self-governing country" />
      </div>

      <JumpNav items={[["#chronology", "Chronology"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      <Chronology
        eras={eras}
        elections={elections}
        hrefBase={PATH}
        colorOf={nzPartyColor}
        fmtPct={nzFmtPct}
        leaderTag="PM"
        intro="Every general election, newest first, across six eras — from the multi-day polls of the 1850s to MMP's coalition mathematics. Click any election for the full result and the story."
      />

      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The long arc in charts</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          Hover any point for the exact figure.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout since 1890</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              New Zealand&apos;s turnout has been among the democratic world&apos;s highest for over a
              century — peaking at 93.7% in the snap election of 1984 and holding near 80% in the
              MMP era.
            </p>
            <LineChart series={[turnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Labour against National</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              The two-party duel from Labour&apos;s rise to the MMP era, where shares in the 30s and 40s
              decide who assembles a coalition — including Labour&apos;s 50% in 2020, MMP&apos;s only
              single-party majority.
            </p>
            <LineChart series={[labour, national]} yMax={60} yTicks={[15, 30, 45]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How New Zealand elections work"
        cards={[
          ["Two votes under MMP", "Since 1996 each voter casts an electorate vote and a party vote. The party vote sets the House's proportions: 72 electorate seats are topped up from party lists to 120 seats, with a 5% threshold waived for parties that win an electorate."],
          ["The Māori seats", "Māori electorates have existed since 1868 — decades before comparable representation anywhere in the British Empire. Māori voters choose which roll to enrol on, and the number of Māori seats moves with that choice; there are currently seven."],
          ["Three-year terms", "New Zealand's parliamentary term is among the world's shortest. Governments campaign almost permanently, and the country has voted more than fifty times since 1853."],
          ["No upper house, no constitution", "The Legislative Council was abolished in 1951 and there is no single written constitution — Parliament is close to sovereign, which made the referendum-driven switch to MMP in 1993 all the more remarkable."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/new-zealand", "New Zealand"],
          ["/elections/au", "Australian Federal Elections"],
          ["/elections/uk", "UK General Elections"],
          ["/leaders", "World Leaders"],
        ]}
      />
    </main>
  );
}
