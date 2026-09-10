import type { Metadata } from "next";
import Link from "next/link";
import { getDdElections, computeDdRecords, ddPartyColor, ddFmtPct } from "@/lib/ddElections";
import { BASE_URL, SITE_NAME, ogImage } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/dd";
const TITLE = "East German Volkskammer Elections";
const DESC =
  "Eleven Volkskammer elections span the German Democratic Republic's entire life, from the 1949 vote that installed the Congress that proclaimed the republic to the 18 March 1990 election that voted it out of existence. Between them lie nine National Front rituals, 1950 to 1986, in which one preapproved list took over 99% of the vote every time and each bloc party's seats were fixed before a ballot was cast. Only the last vote, held after the Peaceful Revolution, was a real contest, and the republic dissolved that October.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: ogImage(TITLE, PATH), width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

export default function DdElectionsPage() {
  const { eras, elections, meta } = getDdElections();
  const records = computeDdRecords();
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
        <span>East Germany</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="dd" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
        <p className="mt-2 text-xs uppercase tracking-widest text-[var(--text-dim)]">
          Source: Wikipedia election articles · as of {meta.built}
        </p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label={"Volkskammer seats"} value={"400"} hint={"the house's final size, fixed in 1990"} />
        <StatTile label={"Elections since 1949"} value={String(elections.length)} hint={""} />
        <StatTile label={"Free elections"} value={"1"} hint={"18 March 1990, in 41 years of one-party rule"} />
        <StatTile label="Latest" value={last.label} hint={`${last.seatLeader ?? ""} largest${last.pmAfter ? ` · ${last.pmAfter.name}` : ""}`} />
      </div>

      <JumpNav items={[["#chronology", "Chronology"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      <Chronology
        eras={eras}
        elections={elections}
        hrefBase={PATH}
        colorOf={ddPartyColor}
        fmtPct={ddFmtPct}
        leaderTag="Premier"
        intro={"Every Volkskammer election East Germany ever held, from the 1949 vote that founded the republic to the free election of 18 March 1990 that seven months later dissolved it, newest first. Nine of these eleven were National Front rituals whose result was fixed before polling day; only the last one was a real contest."}
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
              Turnout sat above 93% at all eleven of these elections, National Front rituals and the one free vote alike, so this line barely moves and reads more as a floor than as a measure of enthusiasm.
            </p>
            <LineChart series={[turnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The largest party's share</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Flat near 99 to 100% at every National Front election with a reported vote share, from 1950 to 1986 (1967 and 1971 print no share at all and are missing from this line), well above the 1949 founding vote's 66.07%, then a single real data point: the Alliance for Germany's 40.82% in the free election of 18 March 1990, the only figure this line shows that an actual vote decided.
            </p>
            <LineChart series={[largest]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How East German elections work"
        cards={[
          ["A single National Front list, not a choice",
           "For nine elections from 1950 to 1986, and in its own way in 1949 too, voters were handed one preapproved list rather than a contest between parties. Each bloc party's seats were fixed by quota before a single vote was cast, and the list was reported passing with well over 99% approval in every one of the nine National Front elections."],
          ["Approve or reject, in public",
           "Voters could only accept or reject the whole list. After 1950 the ballot's separate Yes and No boxes were removed, so casting a No meant visibly using a screened booth to cross out every name while Stasi informants watched the polling site, and abstention itself was treated as an oppositional act."],
          ["A house that barely moved",
           "Bloc-party seat totals stayed close to fixed across four decades: the SED held between 110 and 127 seats and the smaller parties around 50 or 52 apiece at nearly every election from 1950 to 1986, whatever the vote actually said."],
          ["One free vote, then dissolution",
           "The Peaceful Revolution forced a genuinely competitive election on 18 March 1990, the only one this hub marks as free. The coalition it produced spent four and a half months dismantling the East German state before the Volkskammer voted itself out of existence on 3 October 1990."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/germany", "Germany"],
          ["/elections/de", "German Federal Elections"],
        ]}
      />
    </main>
  );
}
