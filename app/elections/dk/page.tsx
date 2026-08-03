import type { Metadata } from "next";
import Link from "next/link";
import { getDkElections, computeDkRecords, dkPartyColor, dkFmtPct } from "@/lib/dkElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/dk";
const TITLE = 'Danish General Elections';
const DESC =
  "Every Danish election from the June Constitution of 1849 to the snap vote of March 2026 — the constitutional struggle, the change of system, Stauning's long reign, the 1973 earthquake that doubled the party system overnight, and the bloc politics of the present.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

export default function DkElectionsPage() {
  const { eras, elections, meta } = getDkElections();
  const records = computeDkRecords();
  const last = elections[elections.length - 1];
  const modern = elections.filter((e) => e.year >= 1918);

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
        <span>Denmark</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="dk" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label='Elections' value={String(elections.length)} hint={`${elections[0].year}–${last.year}`} />
        <StatTile label="Latest" value={last.label} hint={`${last.seatLeader ?? ""} largest${last.pmAfter ? ` · ${last.pmAfter.name}` : ""}`} />
        <StatTile label='The earthquake' value='1973' hint='five new parties entered the Folketing at once' />
        <StatTile label='Folketing seats' value='179' hint='including two each for Greenland and the Faroes' />
      </div>

      <JumpNav items={[["#chronology", "Chronology"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      <Chronology
        eras={eras}
        elections={elections}
        hrefBase={PATH}
        colorOf={dkPartyColor}
        fmtPct={dkFmtPct}
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
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout since 1918</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Danish turnout has lived between 80 and 90 per cent for a century without compulsion — among the healthiest voluntary participation in the democratic world.
            </p>
            <LineChart series={[turnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The largest party's share</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Stauning's 46% in 1935 remains the ceiling; the floor keeps dropping — the Social Democrats' winning share in March 2026 was their lowest since 1903.
            </p>
            <LineChart series={[largest]} yMax={80} yTicks={[20, 40, 60]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Danish elections work"
        cards={[
          [
                    "Hyper-proportional, hyper-responsive",
                    "175 Danish seats (plus two each for Greenland and the Faroe Islands) are allocated by PR with compensatory seats and a 2% threshold — low enough that new parties enter easily, which Danish voters use freely."
          ],
          [
                    "Minority government as a way of life",
                    "Majority coalitions are rare; most Danish governments rule from a minority, negotiating each bill. The blocs — red and blue — are the real units, and elections are duels between them."
          ],
          [
                    "The king who lost",
                    "Denmark's first half-century of elections changed nothing: the king appointed conservative cabinets against clear Left majorities until the Systemskifte of 1901 conceded parliamentary government. The early entries carry that story."
          ],
          [
                    "Three in one year",
                    "The Easter Crisis of 1920 — a royal dismissal of a government that had parliament's confidence — forced three elections in six months and settled, permanently, that Danish kings reign but do not rule."
          ]
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[["/countries/denmark", "Denmark"], ["/elections/nl", "Dutch General Elections"], ["/elections/de", "German Federal Elections"], ["/elections/uk", "UK General Elections"]]}
      />
    </main>
  );
}
