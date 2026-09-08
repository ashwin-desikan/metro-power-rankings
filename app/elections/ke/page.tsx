import type { Metadata } from "next";
import Link from "next/link";
import { getKeElections, computeKeRecords, kePartyColor, keFmtPct, type KePresElection } from "@/lib/keElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import { StatTile, JumpNav, Chronology, RecordsGrid, HowItWorks, HubFooter, HubTitle } from "../HubShared";

const PATH = "/elections/ke";
const TITLE = "Kenyan Elections";
const DESC =
  "Kenya's elections from the racially restricted colonial Legislative Council of 1920 to the 2022 general election: the 1963 transfer of power, a one-party state formalised in 1982, the return of multi-party competition in 1992, the disputed 2007 count and the violence that followed it, and the 2010 constitution's devolved, six-office general elections, including the 2017 presidential result the Supreme Court annulled and re-ran.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

function PresCard({ e }: { e: KePresElection }) {
  const byR2 = e.candidates.filter((c) => c.r2Share != null).sort((a, b) => (b.r2Share ?? 0) - (a.r2Share ?? 0));
  const byR1 = e.candidates.filter((c) => c.r1Share != null).sort((a, b) => (b.r1Share ?? 0) - (a.r1Share ?? 0));
  const winner = byR2[0] ?? byR1[0] ?? null;
  const runnerUp = byR2[1] ?? byR1[1] ?? null;
  return (
    <Link
      href={`/elections/ke/${e.id}`}
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
              <span style={{ color: kePartyColor(winner.party) }}>{winner.name}</span>{" "}
              {keFmtPct(winner.r2Share ?? winner.r1Share)}
            </span>
          ) : e.presAfter ? (
            <span>{e.presAfter.name}</span>
          ) : null}
          {runnerUp ? <span>def. {runnerUp.name}</span> : null}
          {e.turnout != null ? <span>turnout {keFmtPct(e.turnout)}</span> : null}
        </div>
      </div>
      {winner && runnerUp && (winner.r2Share ?? winner.r1Share) != null && (runnerUp.r2Share ?? runnerUp.r1Share) != null ? (
        <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
          <div style={{ width: `${winner.r2Share ?? winner.r1Share}%`, backgroundColor: kePartyColor(winner.party), marginRight: 1 }} title={`${winner.name}: ${keFmtPct(winner.r2Share ?? winner.r1Share)}`} />
          <div style={{ width: `${runnerUp.r2Share ?? runnerUp.r1Share}%`, backgroundColor: kePartyColor(runnerUp.party) }} title={`${runnerUp.name}: ${keFmtPct(runnerUp.r2Share ?? runnerUp.r1Share)}`} />
        </div>
      ) : null}
    </Link>
  );
}

export default function KeElectionsPage() {
  const { presEras, legEras, presidential, legislative, meta } = getKeElections();
  const records = computeKeRecords();
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
        <span>Kenya</span>
      </nav>

      <header className="mb-6">
        <HubTitle code="ke" title={TITLE} />
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
        <p className="mt-2 text-xs uppercase tracking-widest text-[var(--text-dim)]">
          Source: Wikipedia election articles · as of {meta.built}
        </p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label={"National Assembly seats"} value={"349"} hint={"290 constituency, 47 women, 12 nominated"} />
        <StatTile label={"Elections since 1920"} value={String(presidential.length + legislative.length)} hint={""} />
        <StatTile label={"Aug 2022"} value={"50.5%"} hint={"Ruto's first-round win over Odinga"} />
      </div>

      <JumpNav items={[["#presidential", "Presidential elections"], ["#chronology", "National Assembly elections"], ["#charts", "The long arc in charts"], ["#records", "Records"], ["#how-it-works", "How it works"]]} />

      {/* ---------- presidential first: the president makes the government ---------- */}
      <section id="presidential" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Presidential elections</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
          Every Kenyan presidential contest on file since 1978, newest first. The one-party years carry no vote at all; October 2017 is the re-run ordered after the Supreme Court annulled the August result.
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
        colorOf={kePartyColor}
        fmtPct={keFmtPct}
        leaderTag="President"
        headline="National Assembly elections"
        intro={"Every National Assembly election since the colonial Legislative Council of 1920, newest first. The colonial elections and the one-party era before 1992 carry a caveat in the article's own terms."}
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
              Above 80% at every direct multi-party presidential election except the boycotted October 2017 re-run, which fell to 39%.
            </p>
            <LineChart series={[presTurnout]} yMax={100} yTicks={[50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The largest party or coalition's National Assembly seat share</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              KANU held the chamber outright through the one-party era; since 2013 the largest bloc has generally needed a coalition partner to govern.
            </p>
            <LineChart series={[winnerShare]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
        </div>
      </section>

      <RecordsGrid records={records} hrefBase={PATH} />

      <HowItWorks
        title="How Kenyan elections work"
        cards={[
          ["President elected outright or by runoff",
           "Since the 2010 constitution the president needs an absolute majority plus 25% of the vote in at least 24 of Kenya's 47 counties, or a runoff between the top two follows. No election has gone to one; the closest, 2022, was decided by 1.6 points in the first round."],
          ["An Assembly elected three ways",
           "290 members are elected by first-past-the-post in single-member constituencies. A further 47 seats, one per county, are reserved for women, and 12 more are nominated by parties in proportion to their strength, for 349 seats in total."],
          ["The one-party interlude",
           "KANU was Kenya's only legal party from 1982 to 1991, and the sole party on the ballot from 1969. The presidency went unopposed at every election in that period; the National Assembly did not, since KANU's own primaries were genuinely contested and turned over many sitting MPs."],
          ["2007 and 2017, twice disputed",
           "Kenya's presidential count has been challenged twice: in 2007, when a disputed Kibaki win was resolved by a power-sharing deal after nationwide violence, and in 2017, when the Supreme Court annulled Kenyatta's re-election outright and ordered a re-run that Odinga then boycotted."],
        ]}
      />

      <HubFooter
        sources={meta.sources}
        links={[
          ["/countries/kenya", "Kenya"],
          ["/elections/et", "Ethiopian Elections"],
          ["/elections/ae", "Emirati Elections"],
          ["/elections/bd", "Bangladeshi Elections"],
        ]}
      />
    </main>
  );
}
