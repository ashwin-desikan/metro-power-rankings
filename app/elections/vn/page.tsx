import type { Metadata } from "next";
import Link from "next/link";
import { getVnElections, computeVnRecords, vnPartyColor, vnFmtPct } from "@/lib/vnElections";
import { BASE_URL, SITE_NAME, ogImage } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/vn";
const TITLE = "Vietnamese National Assembly Elections";
const DESC =
  "Vietnam's National Assembly has held sixteen elections since the first, contested by five parties, met in Hanoi in January 1946. Every one after 1960 ran under the sole umbrella of the Vietnamese Fatherland Front, and for nearly three decades that meant one list taking every seat. Since 1992 non-party and independent candidates have been allowed to stand, and since 2011 to nominate themselves, though the Fatherland Front still vets who actually reaches the ballot and the Communist Party has never won less than 96% of the seats.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: ogImage(TITLE, PATH), width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

export default function VnElectionsPage() {
  const { eras, elections, meta } = getVnElections();
  const records = computeVnRecords();
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
        <span>Vietnam</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="vn" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
        <p className="mt-2 text-xs uppercase tracking-widest text-[var(--text-dim)]">
          Source: Wikipedia election articles · as of {meta.built}
        </p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label={"Seats"} value={"500"} hint={"how many the Assembly now holds"} />
        <StatTile label={"Elections since 1946"} value={String(elections.length)} hint={""} />
        <StatTile label={"2026 turnout"} value={"99.7%"} hint={"last election, 15 March 2026"} />
        <StatTile label="Latest" value={last.label} hint={`${last.seatLeader ?? ""} largest${last.pmAfter ? ` · ${last.pmAfter.name}` : ""}`} />
      </div>

      <JumpNav items={[["#chronology", "Chronology"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      <Chronology
        eras={eras}
        elections={elections}
        hrefBase={PATH}
        colorOf={vnPartyColor}
        fmtPct={vnFmtPct}
        leaderTag="PM"
        intro={"Every Vietnamese and North Vietnamese National Assembly election from the founding vote of 1946 to the 15 March 2026 election, newest first. From 1960 to 1987 the Vietnamese Fatherland Front was the only body allowed to nominate candidates and took every seat; since 1992 non-party and, from 2011, self-nominated candidates have been allowed to stand on a field the Fatherland Front still vets."}
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
              Turnout has stayed inside a three-point band since 1960, dipping only to 97.96% in 1981.
            </p>
            <LineChart series={[turnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The ruling party's seat share</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              The Communist Party and its Fatherland Front predecessors have taken every seat, or all but a handful of them, at every election since 1960.
            </p>
            <LineChart series={[largest]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Vietnamese elections work"
        cards={[
          ["One party, one front",
           "The Communist Party of Vietnam is the only party the constitution recognises. Every candidate, whatever their party status, is nominated through the Vietnamese Fatherland Front before appearing on a ballot."],
          ["Independents on a narrow field",
           "Non-party and independent candidates have been allowed to stand since 1992. They have won a few dozen seats a cycle at most, out of several hundred."],
          ["Self-nomination, then a filter",
           "Since 2011 a would-be candidate can put themselves forward rather than be nominated by an organisation, but the Fatherland Front's vetting rounds cut the field hard before it reaches the ballot: 82 applied in 2011 and 15 were allowed to run."],
          ["The Assembly elects the leadership, not the ballot",
           "The National Assembly elects the state president and prime minister after each election. The Communist Party's general secretary, chosen separately by the party congress, holds the actual power regardless of who sits in those seats."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/vietnam", "Vietnam"],
          ["/elections/vd", "South Vietnamese Elections"],
        ]}
      />
    </main>
  );
}
