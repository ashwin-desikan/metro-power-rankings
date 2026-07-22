import type { Metadata } from "next";
import Link from "next/link";
import { getIlElections, computeIlRecords, ilPartyColor, ilFmtInt, ilFmtPct } from "@/lib/ilElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/il";
const TITLE = "Israeli Elections";
const DESC =
  "Every Israeli election from the pre-state Assembly of Representatives of 1920 to the Knesset of 2022 — the Mapai decades, the Mahapach, the direct-election experiment and the deadlock cycle — with the next contest due in 2026, for novices and experts alike.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

export default function IlElectionsPage() {
  const { eras, elections, meta } = getIlElections();
  const records = computeIlRecords();
  const knesset = elections.filter((e) => e.year >= 1949 && e.id !== "2001");
  const last = knesset[knesset.length - 1];

  const turnoutSeries: ChartSeries = {
    name: "Turnout",
    color: "#4ECDC4",
    points: knesset
      .filter((e) => e.turnout != null)
      .map((e) => ({ x: e.year, y: e.turnout as number, label: e.label })),
  };
  const largestSeats: ChartSeries = {
    name: "Largest party's seats",
    color: "#8A7CA8",
    points: knesset
      .map((e) => {
        const w = e.parties.find((p) => p.name === e.seatLeader);
        return w && w.seats != null ? { x: e.year, y: w.seats, label: `${e.label}: ${w.name}` } : null;
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
        <span>Israel</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="il" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label="Elections covered" value={String(elections.length)} hint={`${elections[0].year}–${last.year}, including the Yishuv assemblies`} />
        <StatTile label="Latest" value={last.label} hint={`${last.seatLeader ?? ""} · ${last.pmAfter ? last.pmAfter.name : ""} — next due 2026`} />
        <StatTile label="Knesset seats" value={ilFmtInt(last.totalSeats)} hint="61 for a majority — never won by one party" />
        <StatTile label="Elections 2019–2022" value="5" hint="the deadlock cycle: five votes in under four years" />
      </div>

      <JumpNav items={[["#chronology", "Chronology"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      <Chronology
        eras={eras}
        elections={elections}
        hrefBase={PATH}
        colorOf={ilPartyColor}
        fmtPct={ilFmtPct}
        leaderTag="PM"
        intro="Every election, newest first, across five eras — from the voluntary assemblies of the Yishuv through the Knesset's proportional politics, including the unique 2001 vote for prime minister alone."
      />

      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The long arc in charts</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          Knesset elections since 1949. Hover any point for the exact figure.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout, 1949–2022</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              From the 80-plus percent participation of the founding decades to the high 60s of the modern
              era — with the deadlock cycle, remarkably, pushing turnout back up.
            </p>
            <LineChart series={[turnoutSeries]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The largest party&apos;s seats</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              No party has ever reached the 61 seats a majority requires. The Alignment&apos;s 56 in 1969 is
              the all-time peak; the modern winner&apos;s share has drifted toward the low 30s.
            </p>
            <LineChart series={[largestSeats]} yMax={120} yTicks={[30, 61, 90]} unit="" />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Israeli elections work"
        cards={[
          ["One nationwide district", "The whole country elects the Knesset's 120 seats by closed-list proportional representation in a single district — a system inherited from the Yishuv's assemblies and essentially unchanged since 1949."],
          ["The threshold", "A party needs 3.25% of the vote to enter — a bar raised over the years from 1%, and one that regularly decides coalitions by knocking out small allies a few thousand votes short."],
          ["Coalitions, always", "No party has ever won a majority, so every Israeli government is a coalition negotiated after the vote — which is why the president's nomination of a coalition-builder can matter as much as the count itself."],
          ["The direct-election detour", "From 1996 to 2001 Israelis elected the prime minister directly on a separate ballot. It fragmented the Knesset without stabilising the premiership, and was abolished after the 2001 PM-only special election."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/israel", "Israel"],
          ["/elections/it", "Italian General Elections"],
          ["/elections/de", "German Federal Elections"],
          ["/leaders", "World Leaders"],
        ]}
      />
    </main>
  );
}
