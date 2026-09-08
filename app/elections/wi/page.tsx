import type { Metadata } from "next";
import Link from "next/link";
import { getWiElections, computeWiRecords, wiPartyColor, wiFmtPct } from "@/lib/wiElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/wi";
const TITLE = "West Indies Federal Elections";
const DESC =
  "The West Indies Federation held one election, on 25 March 1958, across ten British Caribbean territories from Jamaica to Trinidad and Tobago. The West Indies Federal Labour Party won 25 of 45 seats against the Democratic Labour Party's 19, and Grantley Adams of Barbados became the Federation's only Prime Minister. The Federation dissolved on 31 May 1962, four years and two months later, without holding a second.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

export default function WiElectionsPage() {
  const { eras, elections, meta } = getWiElections();
  const records = computeWiRecords();
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
        <span>West Indies Federation</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="wi" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
        <p className="mt-2 text-xs uppercase tracking-widest text-[var(--text-dim)]">
          Source: Wikipedia election articles · as of {meta.built}
        </p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label={"House seats"} value={"45"} hint={"across ten territories, Jamaica to Trinidad"} />
        <StatTile label={"Elections held"} value={"1"} hint={"25 March 1958, the Federation's only one"} />
        <StatTile label="Latest" value={last.label} hint={`${last.seatLeader ?? ""} largest${last.pmAfter ? ` · ${last.pmAfter.name}` : ""}`} />
      </div>

      <JumpNav items={[["#chronology", "Chronology"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      <Chronology
        eras={eras}
        elections={elections}
        hrefBase={PATH}
        colorOf={wiPartyColor}
        fmtPct={wiFmtPct}
        leaderTag="PM"
        intro={"The one election the West Indies Federation ever held, 25 March 1958. The Federation dissolved a little over four years later, before a second could be called."}
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
              No turnout figure is recorded for the Federation's only election; the source gives seats won, not votes or turnout.
            </p>
            <LineChart series={[turnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The largest party's vote share</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              No vote share is recorded either: the source's results table gives each party's seats only, so this line has no points to plot.
            </p>
            <LineChart series={[largest]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How West Indian elections work"
        cards={[
          ["Ten territories, one House",
           "Every unit territory of the Federation, from Antigua to Trinidad and Tobago, elected members to a single 45-seat House of Representatives; Jamaica alone returned 17 of them, elected across its parishes and three counties."],
          ["Two Federation-wide parties, built from island parties",
           "The West Indies Federal Labour Party and the Democratic Labour Party were both organised by Jamaican politicians, Norman Manley and Alexander Bustamante, as confederations of each territory's existing local party."],
          ["A Prime Minister who was not the obvious choice",
           "Grantley Adams of Barbados became Prime Minister on a 23-21 vote in the House rather than Norman Manley or Eric Williams, the premiers of Jamaica and Trinidad and Tobago, because neither had contested a federal seat and both were staying in control of their own island governments instead."],
          ["A federation that did not survive to a second election",
           "The Federation dissolved on 31 May 1962, four years and two months after its only election, as Jamaica and Trinidad and Tobago moved toward independence on their own."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/elections/jm", "Jamaican General Elections"],
          ["/elections/cu", "Cuban Elections"],
        ]}
      />
    </main>
  );
}
