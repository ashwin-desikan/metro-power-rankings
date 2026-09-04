import type { Metadata } from "next";
import Link from "next/link";
import {
  getJpElections,
  computeJpRecords,
  jpPartyColor,
  jpFmtInt,
  jpFmtPct,
} from "@/lib/jpElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/jp";
const TITLE = "Japanese General Elections";
const DESC =
  "Every Japanese general election from 1890, Asia's first national parliament, to the snap election of 2026: the party governments of Taishō, the 1955 system, the reform era and the LDP's long dominance, for novices and experts alike.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

export default function JpElectionsPage() {
  const { eras, elections, meta } = getJpElections();
  const records = computeJpRecords();
  const last = elections[elections.length - 1];

  const turnoutSeries: ChartSeries = {
    name: "Turnout",
    color: "#4ECDC4",
    points: elections
      .filter((e) => e.turnout != null && !e.caveat)
      .map((e) => ({ x: e.year, y: e.turnout as number, label: e.label })),
  };
  const ldpSeats: ChartSeries = {
    name: "LDP seat share",
    color: jpPartyColor("LDP"),
    points: elections
      .filter((e) => e.year >= 1955)
      .map((e) => {
        const ldp = e.parties.find((p) => /^(LDP|Liberal Democratic)/.test(p.name ?? ""));
        return ldp && ldp.seats != null && e.totalSeats
          ? { x: e.year, y: (ldp.seats / e.totalSeats) * 100, label: e.label }
          : null;
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
        <span>Japan</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="jp" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label="General elections" value={String(elections.length)} hint={`${elections[0].year}–${last.year}`} />
        <StatTile label="Latest" value={last.label} hint={`${last.seatLeader ?? ""} · ${last.pmAfter ? last.pmAfter.name : ""}`} />
        <StatTile label="House seats today" value={jpFmtInt(last.totalSeats)} hint={last.majoritySeats ? `${last.majoritySeats} for a majority` : undefined} />
        <StatTile label="Asia's first parliament" value="1890" hint="universal male suffrage 1928, women vote from 1946" />
      </div>

      <JumpNav items={[["#chronology", "Chronology"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      <Chronology
        eras={eras}
        elections={elections}
        hrefBase={PATH}
        colorOf={jpPartyColor}
        fmtPct={jpFmtPct}
        leaderTag="PM"
        intro="Every general election for the House of Representatives, newest first, across seven eras, including, clearly labelled, the managed wartime vote of 1942. Click any election for the full result and the story."
      />

      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The long arc in charts</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          Hover any point for the exact figure.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout, 1890–2026</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              The postwar decades routinely cleared 70%; the modern era has settled in the 50s: 2024&apos;s
              53.8% was among the lowest ever recorded.
            </p>
            <LineChart series={[turnoutSeries]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The LDP&apos;s share of the House, 1955–2026</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Seven decades as the largest party in all but two elections: the 1993 fall, the 2009 landslide
              defeat, the Abe restoration, and the swings of the 2020s on either side of it.
            </p>
            <LineChart series={[ldpSeats]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Japanese general elections work"
        cards={[
          ["Districts plus blocks", "Since 1996 voters cast two ballots: one for a single-member district, one for a party in a regional proportional block. The mix replaced the old multi-member districts that had fuelled intra-party factionalism and money politics."],
          ["The Diet chooses the PM", "The House of Representatives elects the Prime Minister, and its majority rules: governments in Japan have more often changed between elections, through party splits and coalition shuffles, than at them."],
          ["The 1955 system's long shadow", "The LDP's merger in 1955 created a dominant party that has governed for all but roughly four of the past seventy years, usually with a coalition partner since 1999, a dominance no other G7 democracy matches."],
          ["Snap elections", "The PM can dissolve the House at any time, and almost every election since the war has been a snap election, called at the government's moment of choosing, which is a large part of how the LDP's record was built."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/japan", "Japan"],
          ["/elections/au", "Australian Federal Elections"],
          ["/elections/in", "Indian General Elections"],
          ["/leaders", "World Leaders"],
        ]}
      />
    </main>
  );
}
