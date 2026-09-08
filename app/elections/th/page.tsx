import type { Metadata } from "next";
import Link from "next/link";
import { getThElections, computeThRecords, thPartyColor, thFmtPct } from "@/lib/thElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/th";
const TITLE = "Thai General Elections";
const DESC =
  "Every House of Representatives election in Siam and Thailand from 1933 to 2026, newest first. The earliest elections split seats between voters and government appointees; six military coups since 1947 have each interrupted the count, and the courts annulled the results outright in 2006 and 2014. A junta-appointed Senate helped choose the prime minister in 2019 and 2023 regardless of who won the House, a rule that expired only for the 2026 election.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

export default function ThElectionsPage() {
  const { eras, elections, meta } = getThElections();
  const records = computeThRecords();
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
        <span>Thailand</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="th" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
        <p className="mt-2 text-xs uppercase tracking-widest text-[var(--text-dim)]">
          Source: Wikipedia election articles · as of {meta.built}
        </p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label={"House seats"} value={"500"} hint={"400 by constituency, 100 by party list"} />
        <StatTile label={"Elections since 1933"} value={String(elections.length)} hint={""} />
        <StatTile label={"2026 turnout"} value={"71.42%"} hint={"the first result to settle government on its own"} />
        <StatTile label="Latest" value={last.label} hint={`${last.seatLeader ?? ""} largest${last.pmAfter ? ` · ${last.pmAfter.name}` : ""}`} />
      </div>

      <JumpNav items={[["#chronology", "Chronology"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      <Chronology
        eras={eras}
        elections={elections}
        hrefBase={PATH}
        colorOf={thPartyColor}
        fmtPct={thFmtPct}
        leaderTag="PM"
        intro={"Every Siamese and Thai House of Representatives election since 1933, newest first, era by era. Six coups and two court-annulled results interrupt the count; the 1933-1957 rows carry a caveat where half or more of the House was appointed rather than elected."}
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
              From lows near 30% in the appointed-seat era of the 1940s to a record 75.64% in 2023, turnout has climbed almost every decade Thailand has voted.
            </p>
            <LineChart series={[turnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The largest party's vote share</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Thai Rak Thai's 60% in 2005 sits well above every other contested field on record; Democrat's 17% in the crowded 1975 vote, the lowest, still needed a dozen coalition partners to govern. Several early and post-coup years printed no vote-share column at all, so those rows are missing from the line, not zero.
            </p>
            <LineChart series={[largest]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Thai elections work"
        cards={[
          ["Appointed seats, 1933 to 1957",
           "The first four elections split the House exactly in half between elected members and government appointees. The post-1947 constitutions kept a shrinking appointed bloc through the 1957 elections, after which every seat has been elected."],
          ["Two ballots, one house",
           "Since the 1997 constitution the House has mixed single-member constituency seats with a nationwide party-list tier, voted on two separate ballots in most years. 2019 was the exception: a single ballot decided both tiers at once, a system dropped again by 2023."],
          ["A junta-appointed Senate chose the prime minister",
           "Under the 2017 constitution's transitional rules, the prime minister was chosen by the full National Assembly, House and Senate together, and every one of the Senate's 250 members had been appointed by the military government. That provision expired before the 2026 election."],
          ["Six coups in a century",
           "The military has removed an elected or newly elected government in 1947, 1957, 1976, 1991, 2006 and 2014, and rewrote the constitution before most of the elections that followed."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/thailand", "Thailand"],
          ["/elections/my", "Malaysian General Elections"],
          ["/elections/id", "Indonesian Elections"],
        ]}
      />
    </main>
  );
}
