import type { Metadata } from "next";
import Link from "next/link";
import { getHuElections, computeHuRecords, huPartyColor, huFmtPct } from "@/lib/huElections";
import { BASE_URL, SITE_NAME, ogImage } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/hu";
const TITLE = "Hungarian Parliamentary Elections";
const DESC =
  "Every Hungarian parliamentary election from the Reform Diet of 1825 to April 2026: the county assemblies that argued serfdom away, fifty years of Dualism on a six per cent franchise, the Horthy decades, nine single-list ballots under the People's Front, and the electoral law that produced three two-thirds majorities and then handed 141 seats to somebody else.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: ogImage(TITLE, PATH), width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

export default function HuElectionsPage() {
  const { eras, elections, meta } = getHuElections();
  const records = computeHuRecords();
  const last = elections[elections.length - 1];
  const modern = elections.filter((e) => e.year >= 1920);

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
        <span>Hungary</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="hu" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
        <p className="mt-2 text-xs uppercase tracking-widest text-[var(--text-dim)]">
          Source: Wikipedia election articles · as of {meta.built}
        </p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label={"National Assembly seats"} value={"199"} hint={"100 for a majority, 133 for two thirds"} />
        <StatTile label={"Elections since 1825"} value={String(elections.length)} hint={""} />
        <StatTile label={"April 2026"} value={"141"} hint={"Tisza seats on 53.2% of the list vote"} />
        <StatTile label="Latest" value={last.label} hint={`${last.seatLeader ?? ""} largest${last.pmAfter ? ` · ${last.pmAfter.name}` : ""}`} />
      </div>

      <JumpNav items={[["#chronology", "Chronology"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      <Chronology
        eras={eras}
        elections={elections}
        hrefBase={PATH}
        colorOf={huPartyColor}
        fmtPct={huFmtPct}
        leaderTag="PM"
        intro={"Every Hungarian parliamentary election, newest first, era by era. The nine ballots between 1949 and 1985 offered one list and are labelled as what they were."}
      />

      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The long arc in charts</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          Hover any point for the exact figure.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout since 1920</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Above 90% at every election of the one-party decades, which says more about how the state counted than about how Hungarians felt. Free-election turnout has run between 56% and 79%, and 2026 was the highest of them.
            </p>
            <LineChart series={[turnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The largest party's share</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              The winning list share has sat between 40% and 55% at every free election since 1990, and the seat share it buys has ranged from a bare majority to two thirds.
            </p>
            <LineChart series={[largest]} yMax={80} yTicks={[20, 40, 60]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Hungarian elections work"
        cards={[
          ["One round, two tiers, one winner's bonus",
           "106 constituencies are decided by simple plurality in a single round, and 93 list seats are shared out nationally. The surplus votes of a candidate who wins a constituency are added to that party's list total, so coming first is rewarded twice. It is the reason a party can hold two thirds of the seats on half the vote."],
          ["The law that changed in 2011",
           "The chamber was cut from 386 seats to 199, the second round was abolished, and constituency boundaries were redrawn. Every election since has run under it. Read the pre-2014 rows knowing the system beneath them is a different one."],
          ["The People's Front ballot",
           "From 1949 to 1985 there was one list, presented by the People's Front, and voting meant approving it. Approval ran between 96 and 99%. Those rows are marked unfree, because the result of each was known before the polls opened."],
          ["Open voting outside the towns",
           "Until 1938 the secret ballot applied only in the larger cities. In the counties voters declared their choice aloud in front of officials, which is the single most important fact about every Hungarian election result before the Second World War."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/hungary", "Hungary"],
          ["/elections/at", "Austrian Elections"],
          ["/elections/pl", "Polish Elections"],
          ["/elections/de", "German Federal Elections"],
        ]}
      />
    </main>
  );
}
