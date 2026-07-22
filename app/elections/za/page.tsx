import type { Metadata } from "next";
import Link from "next/link";
import {
  getZaElections,
  computeZaRecords,
  zaPartyColor,
  zaFmtInt,
  zaFmtPct,
} from "@/lib/zaElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/za";
const TITLE = "South African General Elections";
const DESC =
  "Every South African general election from Union in 1910 to 2024 — the whites-only parliaments of segregation and apartheid, stated plainly as such, and the democratic era from 1994's queues to the 2024 coalition — for novices and experts alike.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

export default function ZaElectionsPage() {
  const { eras, elections, meta } = getZaElections();
  const records = computeZaRecords();
  const last = elections[elections.length - 1];
  const dem = elections.filter((e) => e.year >= 1994);

  const demTurnout: ChartSeries = {
    name: "Turnout (democratic era)",
    color: "#4ECDC4",
    points: dem
      .filter((e) => e.turnout != null)
      .map((e) => ({ x: e.year, y: e.turnout as number, label: e.label })),
  };
  const ancShare: ChartSeries = {
    name: "ANC vote share",
    color: zaPartyColor("ANC"),
    points: dem
      .map((e) => {
        const anc = e.parties.find((p) => /^(ANC|African National Congress)$/.test(p.name ?? ""));
        return anc && anc.share != null ? { x: e.year, y: anc.share, label: e.label } : null;
      })
      .filter((p): p is { x: number; y: number; label: string } => p != null),
  };
  const npShare: ChartSeries = {
    name: "NP share of the whites-only vote",
    color: zaPartyColor("National Party"),
    points: elections
      .filter((e) => e.year >= 1948 && e.year <= 1989)
      .map((e) => {
        const np = e.parties.find((p) => /Nasionale|National/i.test(p.name ?? ""));
        return np && np.share != null ? { x: e.year, y: np.share, label: e.label } : null;
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
        <span>South Africa</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="za" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label="General elections" value={String(elections.length)} hint={`${elections[0].year}–${last.year}; universal franchise only since 1994`} />
        <StatTile label="Latest" value={last.label} hint={`${last.seatLeader ?? ""} · ${last.pmAfter ? last.pmAfter.name : ""}`} />
        <StatTile label="Assembly seats today" value={zaFmtInt(last.totalSeats)} hint={last.majoritySeats ? `${last.majoritySeats} for a majority` : undefined} />
        <StatTile label="First free election" value="1994" hint="the ANC has led every government since" />
      </div>

      <JumpNav items={[["#chronology", "Chronology"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      <Chronology
        eras={eras}
        elections={elections}
        hrefBase={PATH}
        colorOf={zaPartyColor}
        fmtPct={zaFmtPct}
        leaderTag="Leader"
        intro="Every general election, newest first, in three eras. The pre-1994 contests were held on a racially restricted franchise and every page says so — they are part of the historical record, not equivalents of the democratic era."
      />

      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The long arc in charts</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          Hover any point for the exact figure. Pre-1994 percentages describe the restricted rolls of the
          era, not the population.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The democratic era, 1994–2024</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Turnout has slid from the near-total participation of 1994 toward 59% in 2024, while the
              ANC&apos;s share fell from Mandela&apos;s heights to the 40% that ended one-party government.
            </p>
            <LineChart series={[demTurnout, ancShare]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The National Party&apos;s grip, 1948–1989</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Within the whites-only electorate, the NP rose from its narrow 1948 win — a minority of even
              that restricted vote — to two-thirds dominance, before reform politics fractured its base.
            </p>
            <LineChart series={[npShare]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How South African elections work"
        cards={[
          ["Pure proportional representation", "Since 1994 the National Assembly's 400 seats are allocated in proportion to the national vote, with no threshold — a deliberate choice for inclusiveness after apartheid, which lets even small parties win a seat."],
          ["Parliament elects the President", "Voters choose parties; the Assembly then elects the President as both head of state and government. That is why 2024's hung result produced a negotiated government of national unity rather than a runoff."],
          ["The franchise is the history", "From 1910 the vote was overwhelmingly white, and the small Cape non-white franchise was stripped away step by step. Every pre-1994 result on these pages describes an electorate designed to exclude most South Africans."],
          ["Dominance and its limits", "The NP won every whites-only election from 1948; the ANC has won every democratic one. But 2024 showed the system can force sharing: no majority, and a coalition cabinet spanning old rivals."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/south-africa", "South Africa"],
          ["/elections/uk", "UK General Elections"],
          ["/elections/in", "Indian General Elections"],
          ["/leaders", "World Leaders"],
        ]}
      />
    </main>
  );
}
