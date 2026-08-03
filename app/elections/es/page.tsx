import type { Metadata } from "next";
import Link from "next/link";
import { getEsElections, computeEsRecords, esPartyColor, esFmtInt, esFmtPct } from "@/lib/esElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/es";
const TITLE = "Spanish General Elections";
const DESC =
  "Every Spanish general election from 1867 to 2023 — the revolutionary Sexenio, the turno pacífico's arranged results stated plainly, the Second Republic's three violent swings, the Francoist rituals, and the democratic era from the transition to today's coalitions.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

export default function EsElectionsPage() {
  const { eras, elections, meta } = getEsElections();
  const records = computeEsRecords();
  const last = elections[elections.length - 1];
  const dem = elections.filter((e) => e.year >= 1977);

  const demTurnout: ChartSeries = {
    name: "Turnout",
    color: "#4ECDC4",
    points: dem
      .filter((e) => e.turnout != null)
      .map((e) => ({ x: e.year, y: e.turnout as number, label: e.label })),
  };
  const psoe: ChartSeries = {
    name: "PSOE vote share",
    color: esPartyColor("PSOE"),
    points: dem
      .map((e) => {
        const p = e.parties.find((p) => /PSOE|Socialist Workers/i.test(p.name ?? ""));
        return p && p.share != null ? { x: e.year, y: p.share, label: e.label } : null;
      })
      .filter((p): p is { x: number; y: number; label: string } => p != null),
  };
  const pp: ChartSeries = {
    name: "PP / AP vote share",
    color: esPartyColor("PP"),
    points: dem
      .map((e) => {
        const p = e.parties.find((p) => /^(PP|People's Party|Popular Alliance|AP)$/i.test(p.name ?? ""));
        return p && p.share != null ? { x: e.year, y: p.share, label: e.label } : null;
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
        <span>Spain</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="es" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label="General elections" value={String(elections.length)} hint={`${elections[0].year}–${last.year}`} />
        <StatTile label="Latest" value={last.label} hint={`${last.seatLeader ?? ""} · ${last.pmAfter ? last.pmAfter.name : ""}`} />
        <StatTile label="Congress seats" value={esFmtInt(last.totalSeats)} hint={last.majoritySeats ? `${last.majoritySeats} for a majority` : undefined} />
        <StatTile label="First free vote in 41 years" value="1977" hint="the transition's founding election" />
      </div>

      <JumpNav items={[["#chronology", "Chronology"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      <Chronology
        eras={eras}
        elections={elections}
        hrefBase={PATH}
        colorOf={esPartyColor}
        fmtPct={esFmtPct}
        leaderTag="PM"
        intro="Every general election, newest first, across five eras — with the turno pacífico's arranged majorities and the Francoist rituals labelled for what they were. Click any election for the full result and the story."
      />

      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The long arc in charts</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          The democratic era since 1977. Hover any point for the exact figure.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout, 1977–2023</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Spain's democratic turnout peaked at the polarised 1982 and 1996 contests and has ranged
              through the 60s and 70s since — 2023&apos;s July election held it above 66% in high summer.
            </p>
            <LineChart series={[demTurnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The two-party duel and its erosion</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              PSOE against the AP/PP line: González&apos;s 48% in 1982, the alternations of the 1990s and
              2000s, and the post-2015 fragmentation that ended majority governments.
            </p>
            <LineChart series={[psoe, pp]} yMax={60} yTicks={[15, 30, 45]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Spanish general elections work"
        cards={[
          ["Provincial proportionality", "The Congress's 350 seats are elected by closed-list PR in 52 provincial districts. Small provinces elect so few deputies that the system quietly favours the big two parties and territorially concentrated regionalists."],
          ["The investiture", "Winning the election is only step one: the Congress must invest a Prime Minister by majority. Since 2015's fragmentation, investitures have taken months, produced repeat elections, and made regionalist parties kingmakers."],
          ["A young democracy's old habit", "From 1876 to 1923 the two dynastic parties simply alternated by arrangement, with results fixed in advance. The memory of managed elections is why the 1977 transition built such deliberately proportional institutions."],
          ["The autonomies matter", "Basque, Catalan, Galician and Canarian parties have held the balance of power repeatedly — Spanish governments are made in Madrid but sustained, or toppled, by the periphery."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/spain", "Spain"],
          ["/elections/fr", "French Elections"],
          ["/elections/it", "Italian General Elections"],
          ["/leaders", "World Leaders"],
        ]}
      />
    </main>
  );
}
