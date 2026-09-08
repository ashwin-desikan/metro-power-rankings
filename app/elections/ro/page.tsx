import type { Metadata } from "next";
import Link from "next/link";
import { getRoElections, computeRoRecords, roPartyColor, roFmtPct, type RoPresElection } from "@/lib/roElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/ro";
const TITLE = "Romanian Elections";
const DESC =
  "Romania's legislative record from the censitary kingdom's 1901 vote to the December 2024 Chamber election, and its presidential record from the two-round republic's founding vote in 1990: three electoral colleges and a tiny franchise, an electoral-bonus law that broke in 1937, a royal dictatorship's single list, a falsified 1946 count, four decades of unopposed communist ritual, and a presidential election annulled by the courts and re-run within a year.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

function PresCard({ e }: { e: RoPresElection }) {
  const byR2 = e.candidates.filter((c) => c.r2Share != null).sort((a, b) => (b.r2Share ?? 0) - (a.r2Share ?? 0));
  const byR1 = e.candidates.filter((c) => c.r1Share != null).sort((a, b) => (b.r1Share ?? 0) - (a.r1Share ?? 0));
  const winner = byR2[0] ?? byR1[0] ?? null;
  const runnerUp = byR2[1] ?? byR1[1] ?? null;
  return (
    <Link
      href={`/elections/ro/${e.id}`}
      className="block rounded-lg border p-3 transition-colors hover:border-[var(--accent)]"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1.5">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-bold text-[var(--text)]">{e.label}</span>
          {e.unfree ? (
            <span className="text-[10px] uppercase tracking-wider rounded-full border px-2 py-0.5 text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
              {e.unfree === "unfree" ? "Not a free vote" : "Restricted"}
            </span>
          ) : null}
          <span className="text-xs text-[var(--text-dim)]">{e.date}</span>
        </div>
        <div className="text-xs text-[var(--text-muted)] tabular-nums flex gap-3 flex-wrap">
          {winner ? (
            <span>
              <span style={{ color: roPartyColor(winner.party) }}>{winner.name}</span>{" "}
              {roFmtPct(winner.r2Share ?? winner.r1Share)}
            </span>
          ) : e.presAfter ? (
            <span>{e.presAfter.name}</span>
          ) : null}
          {runnerUp ? <span>def. {runnerUp.name}</span> : null}
          {e.turnout != null ? <span>turnout {roFmtPct(e.turnout)}</span> : null}
        </div>
      </div>
      {winner && runnerUp && (winner.r2Share ?? winner.r1Share) != null && (runnerUp.r2Share ?? runnerUp.r1Share) != null ? (
        <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
          <div style={{ width: `${winner.r2Share ?? winner.r1Share}%`, backgroundColor: roPartyColor(winner.party), marginRight: 1 }} title={`${winner.name}: ${roFmtPct(winner.r2Share ?? winner.r1Share)}`} />
          <div style={{ width: `${runnerUp.r2Share ?? runnerUp.r1Share}%`, backgroundColor: roPartyColor(runnerUp.party) }} title={`${runnerUp.name}: ${roFmtPct(runnerUp.r2Share ?? runnerUp.r1Share)}`} />
        </div>
      ) : null}
    </Link>
  );
}

export default function RoElectionsPage() {
  const { presEras, legEras, presidential, legislative, meta } = getRoElections();
  const records = computeRoRecords();
  const modern = presidential;

  const presTurnout: ChartSeries = {
    name: "Presidential turnout",
    color: "#4ECDC4",
    points: modern
      .filter((e) => e.turnout != null && (e.turnout as number) <= 100)
      .map((e) => ({ x: e.year, y: e.turnout as number, label: e.label })),
  };
  const winnerShare: ChartSeries = {
    name: "Winner's decisive-round share",
    color: "#FFB400",
    points: modern
      .map((e) => {
        const w = e.candidates
          .filter((c) => (c.r2Share ?? c.r1Share) != null)
          .sort((a, b) => ((b.r2Share ?? b.r1Share) ?? 0) - ((a.r2Share ?? a.r1Share) ?? 0))[0];
        return w ? { x: e.year, y: (w.r2Share ?? w.r1Share) as number, label: `${e.label}: ${w.name}` } : null;
      })
      .filter((p): p is { x: number; y: number; label: string } => p != null),
  };

  const presByEra = [...presEras]
    .reverse()
    .map((era) => ({ era, list: presidential.filter((e) => e.era === era.key).slice().reverse() }))
    .filter(({ list }) => list.length > 0);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/elections" className="hover:underline">Elections</Link>
        {" / "}
        <span>Romania</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="ro" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
        <p className="mt-2 text-xs uppercase tracking-widest text-[var(--text-dim)]">
          Source: Wikipedia election articles · as of {meta.built}
        </p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label={"Chamber seats"} value={"331"} hint={"elected by party-list PR since 1990"} />
        <StatTile label={"Elections since 1901"} value={String(presidential.length + legislative.length)} hint={""} />
        <StatTile label={"May 2025"} value={"Nicușor Dan"} hint={"won the runoff re-run after 2024's annulment"} />
      </div>

      <JumpNav items={[["#presidential", "Presidential elections"], ["#chronology", "Legislative elections"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      {/* ---------- presidential first: the president makes the government ---------- */}
      <section id="presidential" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Presidential elections</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
          Every direct Romanian presidential election on record here, newest first, from Ion Iliescu's one-round win in 1990 to the annulled and re-run contest of 2024-2025. 1990 to 2004 are drawn from the general-election articles that carried the presidential vote in the same infobox as Parliament; every contest from 2009 has its own dedicated article.
        </p>
        {presByEra.map(({ era, list }) => (
          <div key={era.key} id={`pres-era-${era.key}`} className="mb-8">
            <div className="mb-3">
              <h3 className="text-lg font-bold text-[var(--text)]">
                {era.label} <span className="text-sm font-normal text-[var(--text-dim)]">· {era.span}</span>
              </h3>
              <p className="text-sm text-[var(--text-muted)] max-w-3xl">{era.blurb}</p>
            </div>
            <div className="grid gap-2">
              {list.map((e) => <PresCard key={e.id} e={e} />)}
            </div>
          </div>
        ))}
      </section>

      {/* ---------- legislative ---------- */}
      <Chronology
        eras={legEras}
        elections={legislative}
        hrefBase={PATH}
        colorOf={roPartyColor}
        fmtPct={roFmtPct}
        leaderTag="PM"
        headline="Legislative elections"
        intro={"Every Romanian legislative election on record here, newest first: the narrow-franchise electoral colleges of the constitutional kingdom, Greater Romania's electoral-bonus-law democracy, the royal dictatorship's single list, the falsified 1946 vote, communist Romania's unopposed National Front, and the two-round multiparty republic since 1990. This page reports the Chamber of Deputies throughout; several articles print the Senate's table first, and this series does not follow them there."}
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
              Above 90% at every communist-era ritual and near-universal in 1990, falling to the low fifties by the 2020s as Romanian politics settled into an ordinary competitive multiparty pattern.
            </p>
            <LineChart series={[presTurnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The largest party's seat share</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              A single list took every seat by definition under the royal dictatorship and communist rule. The electoral bonus law produced supermajorities for the governing party through most of Greater Romania; no party has cleared even a third of the Chamber since 1990.
            </p>
            <LineChart series={[winnerShare]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Romanian elections work"
        cards={[
          ["Three franchises, one series",
           "The censitary kingdom's three wealth-based colleges gave way to universal male suffrage in 1919, a single list under the royal dictatorship and communist rule from 1938 to 1989, and a genuinely competitive multiparty vote since 1990. Turnout and the freedom of the contest move together across the eras more than any single number in the tables does."],
          ["The 40% bonus that broke in 1937",
           "Greater Romania's electoral law handed any party clearing 40% of the vote an automatic parliamentary majority, which is most of why interwar governments routinely won landslides they had organised themselves. In 1937 nobody reached the threshold, no coalition would form, and King Carol II gave the government to a fourth-placed, avowedly antisemitic party instead, a preview of the dictatorship that followed a year later."],
          ["A presidency chosen twice in one year",
           "Călin Georgescu topped the first round of the November 2024 presidential election before the Constitutional Court annulled it over alleged Russian-linked social media interference; barred from the re-run, he was replaced on the ballot by George Simion, who led the new first round in May 2025 but lost the runoff to Nicușor Dan."],
          ["The Chamber, not the Senate",
           "Several of the source articles from 1992 on print the Senate's results table before the Chamber of Deputies', the smaller of Parliament's two houses. This page reports the Chamber throughout, so its seat totals will not match a reader's memory of the Senate figures the same article leads with."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/romania", "Romania"],
          ["/elections/hu", "Hungarian Elections"],
          ["/elections/pl", "Polish Elections"],
        ]}
      />
    </main>
  );
}
