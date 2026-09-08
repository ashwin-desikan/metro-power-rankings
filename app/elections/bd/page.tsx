import type { Metadata } from "next";
import Link from "next/link";
import { getBdElections, computeBdRecords, bdPartyColor, bdFmtPct } from "@/lib/bdElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/bd";
const TITLE = "Bangladeshi General Elections";
const DESC =
  "Every Jatiya Sangsad general election from independence in 1973 to the first vote after the July 2024 uprising: the rigged founding landslide, Ershad's martial-law ballots, the caretaker-government era that gave Bangladesh five credible elections in a row, and the decade after the caretaker system was abolished in which three straight elections were boycotted, uncontested, or both.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

export default function BdElectionsPage() {
  const { eras, elections, meta } = getBdElections();
  const records = computeBdRecords();
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
        <span>Bangladesh</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="bd" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
        <p className="mt-2 text-xs uppercase tracking-widest text-[var(--text-dim)]">
          Source: Wikipedia election articles · as of {meta.built}
        </p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label={"Jatiya Sangsad seats"} value={"350"} hint={"300 directly elected, 50 reserved for women"} />
        <StatTile label={"Elections since 1973"} value={String(elections.length)} hint={""} />
        <StatTile label={"Feb 1996 turnout"} value={"20.97%"} hint={"the lowest on record, in a boycotted vote"} />
        <StatTile label="Latest" value={last.label} hint={`${last.seatLeader ?? ""} largest${last.pmAfter ? ` · ${last.pmAfter.name}` : ""}`} />
      </div>

      <JumpNav items={[["#chronology", "Chronology"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      <Chronology
        eras={eras}
        elections={elections}
        hrefBase={PATH}
        colorOf={bdPartyColor}
        fmtPct={bdFmtPct}
        leaderTag="PM"
        intro={"Every Jatiya Sangsad general election since independence, newest first, era by era. Two of them, boycotted, land 300 seats a landslide on their own; 1988, 2014, 2018 and 2024 carry a caveat saying so in the article's own terms."}
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
              From 87.13% in 2008, the highest on record, down to 20.97% in the boycotted February 1996 vote, the lowest. The 2014 and 2024 rows sit near the bottom for the same reason: an opposition boycott, not apathy.
            </p>
            <LineChart series={[turnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The largest party's share</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Reads as two different countries: a governing party topping 68% to 75% of the vote whenever the main opposition sat out (1988, 2014, 2018, 2024), against contests in the thirties and forties whenever both sides actually competed.
            </p>
            <LineChart series={[largest]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Bangladeshi elections work"
        cards={[
          ["300 seats by plurality, one round",
           "Members are elected one per constituency by first-past-the-post voting, no runoff. A further block, 15 seats at independence and 50 today, is reserved for women and shared out among the parties in proportion to the general seats they won, so the reserved bench amplifies whoever came first."],
          ["The caretaker interlude, 1996 to 2011",
           "After the boycotted February 1996 vote, parliament amended the constitution to hand power to a neutral caretaker government for ninety days around every election. It produced five elections in a row that observers called credible before being abolished in 2011, which is the single biggest break on this page."],
          ["The boycott cycle since 2014",
           "Without a caretaker government to hand power to, the party in office has organised its own re-election three times running, and the opposition has answered twice by sitting the vote out entirely: 153 of 300 seats went uncontested in 2014, and the BNP boycotted again in 2024."],
          ["A field still resetting in 2026",
           "The July 2024 uprising forced Sheikh Hasina from power and the Awami League was barred from the 2026 election that followed, so the party that had won every election since 2008 is not on this page's most recent row at all."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/bangladesh", "Bangladesh"],
          ["/elections/pk", "Pakistani Elections"],
          ["/elections/in", "Indian General Elections"],
          ["/elections/id", "Indonesian Elections"],
        ]}
      />
    </main>
  );
}
