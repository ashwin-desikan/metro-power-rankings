import type { Metadata } from "next";
import Link from "next/link";
import {
  getTwElections,
  computeTwRecords,
  twPartyColor,
  twFmtPct,
  type TwPresElection,
} from "@/lib/twElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/tw";
const TITLE = "Taiwanese Presidential Elections";
const DESC =
  "The Republic of China's presidential elections from Sun Yat-sen's 1911 vote to Taiwan's 2024 contest — the Beiyang parliaments and the bribery election, the 'eternal' National Assembly's rituals stated plainly, and the direct-election democracy born under missile fire in 1996.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

function PresCard({ e }: { e: TwPresElection }) {
  const byBest = e.candidates
    .filter((c) => (c.r2Share ?? c.r1Share) != null)
    .sort((a, b) => ((b.r2Share ?? b.r1Share) ?? 0) - ((a.r2Share ?? a.r1Share) ?? 0));
  const winner = byBest[0] ?? null;
  const runnerUp = byBest[1] ?? null;
  return (
    <Link
      href={`/elections/tw/${e.id}`}
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
          <span className="text-xs text-[var(--text-dim)]">{e.date}</span>
        </div>
        <div className="text-xs text-[var(--text-muted)] tabular-nums flex gap-3">
          {winner ? (
            <span>
              <span style={{ color: twPartyColor(winner.party) }}>{winner.name}</span>{" "}
              {twFmtPct(winner.r2Share ?? winner.r1Share)}
            </span>
          ) : e.presAfter ? (
            <span>{e.presAfter.name}</span>
          ) : null}
          {runnerUp ? <span>def. {runnerUp.name}</span> : null}
          {e.turnout != null ? <span>turnout {twFmtPct(e.turnout)}</span> : null}
        </div>
      </div>
      {winner && runnerUp && (winner.r2Share ?? winner.r1Share) != null && (runnerUp.r2Share ?? runnerUp.r1Share) != null ? (
        <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
          <div style={{ width: `${winner.r2Share ?? winner.r1Share}%`, backgroundColor: twPartyColor(winner.party), marginRight: 1 }} title={`${winner.name}: ${twFmtPct(winner.r2Share ?? winner.r1Share)}`} />
          <div style={{ width: `${runnerUp.r2Share ?? runnerUp.r1Share}%`, backgroundColor: twPartyColor(runnerUp.party) }} title={`${runnerUp.name}: ${twFmtPct(runnerUp.r2Share ?? runnerUp.r1Share)}`} />
        </div>
      ) : null}
    </Link>
  );
}

export default function TwElectionsPage() {
  const { eras, elections, meta } = getTwElections();
  const records = computeTwRecords();
  const last = elections[elections.length - 1];
  const direct = elections.filter((e) => e.year >= 1996);

  const turnout: ChartSeries = {
    name: "Turnout",
    color: "#4ECDC4",
    points: direct
      .filter((e) => e.turnout != null)
      .map((e) => ({ x: e.year, y: e.turnout as number, label: e.label })),
  };
  const dpp: ChartSeries = {
    name: "DPP vote share",
    color: twPartyColor("DPP"),
    points: direct
      .map((e) => {
        const c = e.candidates.find((c) => /Democratic Progressive|DPP/i.test(c.party ?? ""));
        return c && c.r1Share != null ? { x: e.year, y: c.r1Share, label: `${e.label} — ${c.name}` } : null;
      })
      .filter((p): p is { x: number; y: number; label: string } => p != null),
  };
  const kmt: ChartSeries = {
    name: "KMT vote share",
    color: twPartyColor("KMT"),
    points: direct
      .map((e) => {
        const c = e.candidates.find((c) => /Kuomintang|KMT/i.test(c.party ?? ""));
        return c && c.r1Share != null ? { x: e.year, y: c.r1Share, label: `${e.label} — ${c.name}` } : null;
      })
      .filter((p): p is { x: number; y: number; label: string } => p != null),
  };

  const byEra = [...eras]
    .reverse()
    .map((era) => ({ era, list: elections.filter((e) => e.era === era.key).slice().reverse() }))
    .filter(({ list }) => list.length > 0);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/elections" className="hover:underline">Elections</Link>
        {" / "}
        <span>Taiwan</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="tw" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label="Presidential elections" value={String(elections.length)} hint={`${elections[0].year}–${last.year}, across the ROC's whole lineage`} />
        <StatTile label="President today" value={last.presAfter?.name ?? "—"} hint={`elected ${last.year} — a third consecutive DPP term`} />
        <StatTile label="First direct election" value="1996" hint="held under PLA missile tests" />
        <StatTile label="Transfers of power" value="3" hint="2000, 2008 and 2016 — each peaceful" />
      </div>

      <JumpNav items={[["#chronology", "Chronology"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      {/* ---------- chronology ---------- */}
      <section id="chronology" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Every presidential election</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
          All {elections.length} contests, newest first — the direct votes of Taiwan&apos;s democracy,
          then the National Assembly&apos;s uncontested rituals and the early Chinese Republic&apos;s
          indirect elections, each labelled for what it was.
        </p>
        {byEra.map(({ era, list }) => (
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

      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The long arc in charts</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          The direct-election era since 1996. Hover any point for the exact figure.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout since 1996</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Taiwan&apos;s young democracy began above 80% and eased into the 70s — still among Asia&apos;s
              highest, with no compulsory voting and millions returning home to vote in person.
            </p>
            <LineChart series={[turnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Green against blue</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              The DPP–KMT duel: Chen&apos;s three-way win in 2000, Ma&apos;s 58% in 2008, Tsai&apos;s
              landslides, and 2024&apos;s return to a three-way race in which Lai won with 40%.
            </p>
            <LineChart series={[dpp, kmt]} yMax={70} yTicks={[20, 40, 60]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Taiwanese presidential elections work"
        cards={[
          ["One round, plurality", "The president is directly elected every four years in a single round: the highest total wins, however split the field. Chen Shui-bian's 39.3% in 2000 and Lai Ching-te's 40% in 2024 both sufficed."],
          ["A young direct mandate", "Constitutional reform in 1994 replaced the National Assembly's role with direct election. The 1996 vote made Lee Teng-hui the first directly chosen Chinese head of state in history — as the PLA fired missiles into the strait to deter it."],
          ["The lineage question", "Taiwan's government is the Republic of China, founded in 1911 — so this hub carries the whole constitutional line, from Nanjing's provisional vote through the Beiyang parliaments to the frozen Assembly's rituals on Taiwan, each labelled honestly."],
          ["Identity is the axis", "Elections turn less on left and right than on the China question: the DPP's Taiwan-centred identity against the KMT's heritage of cross-strait engagement, with third forces — Soong in 2000, Ko in 2024 — repeatedly scrambling the arithmetic."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/taiwan", "Taiwan"],
          ["/elections/kr", "South Korean Elections"],
          ["/elections/jp", "Japanese General Elections"],
          ["/leaders", "World Leaders"],
        ]}
      />
    </main>
  );
}
