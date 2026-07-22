import type { Metadata } from "next";
import Link from "next/link";
import { getSgElections, computeSgRecords, sgPartyColor, sgFmtPct } from "@/lib/sgElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/sg";
const TITLE = 'Singaporean General Elections';
const DESC =
  "Every Singaporean general election from 1948 to 2025 — the colonial Legislative Council, Marshall's upset, the PAP's arrival in 1959 and its unbroken rule since: the walkover years, the GRC era, and the cleanly counted, structurally tilted contests of today, each labelled for what it is.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

export default function SgElectionsPage() {
  const { eras, elections, meta } = getSgElections();
  const records = computeSgRecords();
  const last = elections[elections.length - 1];
  const modern = elections.filter((e) => e.year >= 1959);

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
        return p ? { x: e.year, y: p.share as number, label: `${e.label} — ${p.name}` } : null;
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
        <span>Singapore</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="sg" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label='General elections' value={String(elections.length)} hint={`${elections[0].year}–${last.year}`} />
        <StatTile label="Latest" value={last.label} hint={`${last.seatLeader ?? ""} largest${last.pmAfter ? ` · ${last.pmAfter.name}` : ""}`} />
        <StatTile label='PAP rule since' value='1959' hint='seventeen consecutive victories' />
        <StatTile label='Longest-serving PM produced' value='31 yrs' hint='Lee Kuan Yew, 1959–1990' />
      </div>

      <JumpNav items={[["#chronology", "Chronology"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      <Chronology
        eras={eras}
        elections={elections}
        hrefBase={PATH}
        colorOf={sgPartyColor}
        fmtPct={sgFmtPct}
        leaderTag="PM"
        intro="Every election, newest first, era by era. Click any election for the full result and the story."
      />

      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The long arc in charts</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          Hover any point for the exact figure.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout since 1959</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Voting is compulsory: turnout among registered voters stays above 90%. The dips measure administration, not enthusiasm.
            </p>
            <LineChart series={[turnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The PAP's vote share</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              The governing party's share swings between 60 and 70 per cent — 2011's 60.1% was treated as a crisis, 2015's 69.9% as a restoration — while its seat share barely moves: the signature of a majoritarian map.
            </p>
            <LineChart series={[largest]} yMax={80} yTicks={[20, 40, 60]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Singaporean elections work"
        cards={[
          [
                    "First past the post, super-sized",
                    "Parliament is elected by plurality in single wards and Group Representation Constituencies of four or five seats, winner-take-all. A GRC slate needs one minority candidate — and lets a 60% national vote become a 90% seat share."
          ],
          [
                    "Compulsory, clean, tilted",
                    "Voting is compulsory and the count is scrupulously honest. The tilt operates upstream: boundaries redrawn late, media aligned with the government, defamation suits and estate-upgrading incentives that make opposition wards expensive."
          ],
          [
                    "The opposition's slow advance",
                    "From zero elected opposition MPs between 1968 and 1981 to a Workers' Party GRC breakthrough in 2011 and ten opposition seats today — each step historic by Singaporean standards, marginal by anyone else's."
          ],
          [
                    "Why record it this way",
                    "Singapore's elections are neither shams nor fair fights. This hub records the real numbers with the honest label: a dominant-party system whose dominance is engineered by design, not by fraud."
          ]
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[["/countries/singapore", "Singapore"], ["/elections/my", "Malaysian Elections"], ["/elections/id", "Indonesian Elections"], ["/rankings/singapore", "Singapore in the metro rankings"]]}
      />
    </main>
  );
}
