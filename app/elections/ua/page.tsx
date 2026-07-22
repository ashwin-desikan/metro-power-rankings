import type { Metadata } from "next";
import Link from "next/link";
import {
  getUaElections,
  computeUaRecords,
  uaPartyColor,
  uaFmtPct,
  type UaPresElection,
} from "@/lib/uaElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/ua";
const TITLE = "Ukrainian Elections";
const DESC =
  "Every Ukrainian national election since independence: seven presidential races and eight Rada contests — the independence-day vote of 1991, the falsified runoff that sparked the Orange Revolution, the wartime ballots of 2014 and 2019, and the Zelenskyy landslide. Elections are suspended under martial law until the war ends.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

function PresCard({ e }: { e: UaPresElection }) {
  const byBest = e.candidates
    .filter((c) => (c.r2Share ?? c.r1Share) != null)
    .sort((a, b) => ((b.r2Share ?? b.r1Share) ?? 0) - ((a.r2Share ?? a.r1Share) ?? 0));
  const winner = byBest[0] ?? null;
  const runnerUp = byBest[1] ?? null;
  return (
    <Link
      href={`/elections/ua/${e.id}`}
      className="block rounded-lg border p-3 transition-colors hover:border-[var(--accent)]"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1.5">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-bold text-[var(--text)]">{e.label}</span>
          {e.knownAs ? (
            <span className="text-[10px] uppercase tracking-wider rounded-full border px-2 py-0.5 text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
              {e.knownAs}
            </span>
          ) : null}
          {e.caveat ? (
            <span className="text-[10px] uppercase tracking-wider rounded-full border px-2 py-0.5 font-semibold" style={{ borderColor: "#B4540A", color: "#D97706" }}>
              caveats apply
            </span>
          ) : null}
          <span className="text-xs text-[var(--text-dim)]">{e.date}</span>
        </div>
        <div className="text-xs text-[var(--text-muted)] tabular-nums flex gap-3">
          {winner ? (
            <span>
              <span style={{ color: uaPartyColor(winner.party) }}>{winner.name}</span>{" "}
              {uaFmtPct(winner.r2Share ?? winner.r1Share)}
            </span>
          ) : e.presAfter ? (
            <span>{e.presAfter.name}</span>
          ) : null}
          {runnerUp ? <span>def. {runnerUp.name}</span> : null}
          {e.turnout != null ? <span>turnout {uaFmtPct(e.turnout)}</span> : null}
        </div>
      </div>
      {winner && runnerUp && (winner.r2Share ?? winner.r1Share) != null && (runnerUp.r2Share ?? runnerUp.r1Share) != null ? (
        <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
          <div style={{ width: `${winner.r2Share ?? winner.r1Share}%`, backgroundColor: uaPartyColor(winner.party), marginRight: 1 }} title={`${winner.name}: ${uaFmtPct(winner.r2Share ?? winner.r1Share)}`} />
          <div style={{ width: `${runnerUp.r2Share ?? runnerUp.r1Share}%`, backgroundColor: uaPartyColor(runnerUp.party) }} title={`${runnerUp.name}: ${uaFmtPct(runnerUp.r2Share ?? runnerUp.r1Share)}`} />
        </div>
      ) : null}
    </Link>
  );
}

export default function UaElectionsPage() {
  const { presEras, legEras, presidential, legislative, meta } = getUaElections();
  const records = computeUaRecords();

  const turnoutSeries: ChartSeries = {
    name: "Turnout",
    color: "#0057B7",
    points: [...presidential, ...legislative]
      .filter((e) => e.turnout != null)
      .sort((a, b) => a.year - b.year)
      .map((e) => ({ x: e.year, y: e.turnout as number, label: `${e.label} ${e.kind === "presidential" ? "presidential" : "Rada"}` })),
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
        <span>Ukraine</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="ua" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div
        className="rounded-xl border p-4 mb-8 max-w-3xl text-sm"
        style={{ borderColor: "#B4540A", backgroundColor: "rgba(217,119,6,0.06)" }}
      >
        <p className="text-[var(--text-muted)]">
          <span className="font-bold" style={{ color: "#D97706" }}>Elections suspended.</span>{" "}
          Ukraine has held no national election since 2019: the constitution bars elections under
          martial law, in force since Russia&apos;s full-scale invasion of February 2022. This is a
          democracy&apos;s wartime pause, not a closure — every completed election here was
          competitive, and three sitting presidents have lost at the ballot box, a post-Soviet
          record. The next vote awaits the end of martial law.
        </p>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label="Presidential elections" value={String(presidential.length)} hint="1991–2019, every one competitive" />
        <StatTile label="Rada elections" value={String(legislative.length)} hint="1994–2019, majoritarian to full party-list and back to mixed" />
        <StatTile label="Incumbents defeated" value="3" hint="Kravchuk, Yushchenko, Poroshenko — only Kuchma won re-election" />
        <StatTile label="Revolutions forced by fraud" value="1" hint="the Orange Revolution of 2004 — a falsified runoff, annulled and re-run" />
      </div>

      <JumpNav items={[["#presidential", "Presidential races"], ["#chronology", "Rada elections"], ["#charts", "The long arc in charts"], ["#records", "The numbers to know"], ["#how-it-works", "How it works"]]} />

      {/* ---------- presidential ---------- */}
      <section id="presidential" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Presidential races</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
          All {presidential.length} contests, newest first — every one of them a real race, and
          most of them decided in a runoff between east and west.
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
        colorOf={uaPartyColor}
        fmtPct={uaFmtPct}
        leaderTag="PM"
        headline="Rada elections"
        intro="Every Verkhovna Rada election, newest first — from the fragmented majoritarian chambers of the 1990s through the Orange-era party-list duels to the wartime Rada of 2019, elected without Crimea and the occupied Donbas."
      />

      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The long arc in charts</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          Hover any point for the exact figure.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout, 1991–2019</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              From 84% on independence day to 49% in the 2019 Rada election — a familiar
              democratic slide, steepened after 2014 by the loss of voters in Crimea and the
              occupied Donbas.
            </p>
            <LineChart series={[turnoutSeries]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The east–west map that decided everything</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              For two decades every close race split along the same line: the west and centre
              against the south and east. The runoffs of 1994, 2004 and 2010 were all decided by
              a few points across that divide. 2019 broke the pattern — Zelenskyy carried every
              region but one, the first truly national mandate in Ukraine&apos;s history.
            </p>
            <div className="text-xs text-[var(--text-dim)] mt-6">
              Open any race above for the full candidate table — every table sorts.
            </div>
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} headline="The numbers to know" />

      <HowItWorks
        title="How Ukrainian elections work"
        cards={[
          ["The presidency", "Directly elected for five years in a two-round system: an absolute majority in the first round or a runoff between the top two. Since 1991 only the 1991 and 2014 races have been settled in one round."],
          ["The Verkhovna Rada", "450 seats, one chamber. The rules have swung between pure majoritarian (1994), mixed (1998–2002, 2012–2019) and full party-list PR (2006–2007), with a 5% threshold — and 26 seats representing occupied territory have sat empty since 2014."],
          ["Martial law and the pause", "The constitution forbids national elections under martial law, continuously in force since 24 February 2022. Zelenskyy's five-year term has been extended by that provision, a suspension accepted by parliament and opposition alike; a post-war election will follow the lifting of martial law."],
          ["Why the record matters", "Ukraine is the post-Soviet state where elections stayed real: incumbents lose, courts have annulled a stolen runoff, and power has changed hands peacefully in every decade — the habit Russia's invasion was in part meant to extinguish."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/ukraine", "Ukraine"],
          ["/elections/ru", "Russian & Soviet Elections"],
          ["/elections/pl", "Polish Elections"],
          ["/elections/under-fire", "Elections Under Fire"],
        ]}
      />
    </main>
  );
}
