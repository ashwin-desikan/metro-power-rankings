import type { Metadata } from "next";
import Link from "next/link";
import {
  getEuElections,
  euGroupColor,
  EU_GRAND_COALITION,
  fmtPct,
  type EuElection,
} from "@/lib/euElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";

const PATH = "/elections/eu";
const TITLE = "European Parliament Elections";
const DESC =
  "Every European Parliament election from the first direct vote in 1979 to 2024: the political groups, the seats, the turnout, the presidents each Parliament made, and the story of the world's only transnational election.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
      <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">{label}</p>
      <p className="text-2xl font-bold text-[var(--text)] tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-[var(--text-muted)] mt-0.5">{hint}</p> : null}
    </div>
  );
}

function SeatStrip({ e, h = "h-2" }: { e: EuElection; h?: string }) {
  return (
    <div className={`flex ${h} w-full overflow-hidden rounded-full`} style={{ backgroundColor: "var(--border)" }}>
      {e.groups.map((g, i) => (
        <div
          key={`${g.abbr}-${i}`}
          style={{
            width: `${(g.seats / e.totalSeats) * 100}%`,
            backgroundColor: euGroupColor(g.abbr),
            marginRight: i < e.groups.length - 1 ? 1 : 0,
          }}
          title={`${g.abbr}: ${g.seats} seats`}
        />
      ))}
    </div>
  );
}

export default function EuElectionsPage() {
  const { eras, elections, meta } = getEuElections();
  const last = elections[elections.length - 1];

  // Newest era first, and newest election first within each era.
  const byEra = [...eras]
    .reverse()
    .map((era) => ({ era, list: elections.filter((e) => e.era === era.key).slice().reverse() }));

  const turnoutSeries: ChartSeries = {
    name: "Turnout",
    color: "#4ECDC4",
    points: elections
      .filter((e) => e.turnout != null)
      .map((e) => ({ x: e.year, y: e.turnout as number, label: e.label })),
  };
  const grandCoalition: ChartSeries = {
    name: "EPP + Socialists, % of seats",
    color: "#8A7CA8",
    points: elections.map((e) => {
      const s = e.groups.filter((g) => EU_GRAND_COALITION.has(g.abbr)).reduce((a, g) => a + g.seats, 0);
      return { x: e.year, y: (s / e.totalSeats) * 100, label: e.label };
    }),
  };
  const chamberSize: ChartSeries = {
    name: "Seats in the chamber",
    color: "#FFB86B",
    points: elections.map((e) => ({ x: e.year, y: e.totalSeats, label: `${e.label} (${e.memberStates} states)` })),
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/elections" className="hover:underline">Elections</Link>
        {" / "}
        <span>European Parliament</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl font-bold mb-2 text-[var(--text)]">{TITLE}</h1>
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label="Elections" value={String(elections.length)} hint={`${elections[0].year}–${last.year}, every five years`} />
        <StatTile label="Latest" value={last.label} hint={`${last.seatLeader} largest · ${last.after ? last.after.name : ""}`} />
        <StatTile label="MEPs today" value={String(last.totalSeats)} hint={`${last.majoritySeats} for a majority · ${last.memberStates} member states`} />
        <StatTile label="Chamber growth" value={`${elections[0].totalSeats} → ${last.totalSeats}`} hint={`${elections[0].memberStates} states in 1979 to ${last.memberStates} today`} />
      </div>

      {/* jump nav */}
      <div className="flex flex-wrap gap-2 mb-10 text-xs">
        {[
          ["#chronology", "Chronology"],
          ["#charts", "Five decades in charts"],
          ["#how-it-works", "How it works"],
        ].map(([href, label]) => (
          <a key={href} href={href} className="rounded-full border px-3 py-1 text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors" style={{ borderColor: "var(--border)" }}>
            {label}
          </a>
        ))}
      </div>

      {/* ---------- chronology ---------- */}
      <section id="chronology" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The chronology</h2>
        <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
          All ten elections, newest first, in three eras. Click any election for the full group
          composition and the story.
        </p>
        {byEra.map(({ era, list }) => (
          <div key={era.key} id={`era-${era.key}`} className="mb-8">
            <div className="mb-3">
              <h3 className="text-lg font-bold text-[var(--text)]">
                {era.label} <span className="text-sm font-normal text-[var(--text-dim)]">· {era.span}</span>
              </h3>
              <p className="text-sm text-[var(--text-muted)] max-w-3xl">{era.blurb}</p>
            </div>
            <div className="grid gap-2">
              {list.map((e) => {
                const winner = e.groups.find((g) => g.abbr === e.seatLeader);
                return (
                  <Link
                    key={e.id}
                    href={`/elections/eu/${e.id}`}
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
                            <span style={{ color: euGroupColor(winner.abbr) }}>{winner.abbr}</span>{" "}
                            {winner.seats}/{e.totalSeats}
                          </span>
                        ) : null}
                        {e.turnout != null ? <span>turnout {fmtPct(e.turnout)}</span> : null}
                        <span>{e.memberStates} states</span>
                      </div>
                    </div>
                    <SeatStrip e={e} />
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Five decades in charts</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          The three long stories of the European election: voters drifting away and coming back, the
          duopoly eroding, and the chamber growing with the Union. Hover any point for the exact figure.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout, 1979–2024</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Eight consecutive declines from 62% to 42.5% — then a reversal in 2019, the first rise in the
              Parliament&apos;s history, sustained in 2024.
            </p>
            <LineChart series={[turnoutSeries]} yMax={80} yTicks={[40, 60]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The grand coalition&apos;s erosion</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              The EPP and Socialist families together held two-thirds of the chamber into the 2000s; since
              2019 they no longer command a majority between them, forcing three-way deals with the liberals.
            </p>
            <LineChart series={[grandCoalition]} yMax={80} yTicks={[40, 50, 60, 70]} />
          </div>
          <div className="rounded-xl border p-4 lg:col-span-2" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The chamber grows with the Union</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              From 410 seats for nine states in 1979 to a peak of 751 for twenty-eight — then the first
              shrinkage in 2024&apos;s post-Brexit Parliament of 720. Hover for the member-state count at
              each election.
            </p>
            <LineChart series={[chamberSize]} yMax={800} yTicks={[200, 400, 600]} unit="" />
          </div>
        </div>
      </section>

      {/* ---------- how it works ---------- */}
      <section id="how-it-works" className="mb-10">
        <h2 className="text-2xl font-bold mb-4 text-[var(--text)]">How European Parliament elections work</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          {[
            ["27 national elections at once", "There is no single European ballot: each member state elects its MEPs under its own rules over a four-day window, using some form of proportional representation — a requirement since 1999, which is why Britain's 1989 Greens won 15% and zero seats."],
            ["Degressive proportionality", "Seats are allocated to states by population, but smaller states get more MEPs per citizen: Malta's six seats represent about 90,000 people each, Germany's 96 nearly 900,000."],
            ["National parties, European groups", "Voters choose among national parties, which then sit in transnational groups — a group needs 23 MEPs from at least a quarter of member states. Groups control speaking time, committee chairs and the money."],
            ["The Parliament's power", "Once a talking shop, now co-legislator on most EU law: it amends and can veto legislation and budgets, confirms and can dismiss the European Commission, and since 2014 has fought the Council over who picks the Commission president."],
          ].map(([h, b]) => (
            <div key={h} className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
              <p className="font-bold text-[var(--text)] mb-1">{h}</p>
              <p className="text-xs text-[var(--text-muted)]">{b}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="text-xs text-[var(--text-dim)] border-t pt-4" style={{ borderColor: "var(--border)" }}>
        <p>Sources: {meta.sources.join("; ")}. {meta.note}</p>
        <p className="mt-1">
          See also{" "}
          <Link href="/elections/uk" className="text-[var(--accent)] hover:underline">UK General Elections</Link>
          {" · "}
          <Link href="/elections/us" className="text-[var(--accent)] hover:underline">US Presidential Elections</Link>
          {" · "}
          <Link href="/elections/ca" className="text-[var(--accent)] hover:underline">Canadian Federal Elections</Link>
          {" · "}
          <Link href="/leaders" className="text-[var(--accent)] hover:underline">World Leaders</Link>
          {" \u00b7 "}
          <Link href="/orgs" className="text-[var(--accent)] hover:underline">International Organisations</Link>
        </p>
      </footer>
    </main>
  );
}
