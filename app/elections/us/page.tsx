import type { Metadata } from "next";
import Link from "next/link";
import {
  getUsElections,
  getUsElectionTrends,
  getUsCongress,
  computeUsRecords,
  usPartyColor,
  usFmtInt,
  usFmtPct,
  type UsElection,
} from "@/lib/usElections";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import SortableTable from "../SortableTable";

const PATH = "/elections/us";
const TITLE = "US Presidential Elections";
const DESC =
  "Every United States presidential election from 1788 to 2024: the candidates, the popular and electoral votes, the turnout, the Congresses each contest produced, and the story of each — from Washington's unanimous elections to the polarized present.";

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

function EvStrip({ e }: { e: UsElection }) {
  const withEv = e.candidates.filter((c) => c.ev != null && c.ev > 0);
  const known = withEv.reduce((s, c) => s + (c.ev ?? 0), 0);
  const rest = Math.max(0, e.evTotal - known);
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
      {withEv.map((c, i) => (
        <div
          key={`${c.name}-${i}`}
          style={{
            width: `${((c.ev ?? 0) / e.evTotal) * 100}%`,
            backgroundColor: usPartyColor(c.party),
            marginRight: i < withEv.length - 1 || rest > 0 ? 1 : 0,
          }}
          title={`${c.name}: ${c.ev} electoral votes`}
        />
      ))}
      {rest > 0 ? <div style={{ width: `${(rest / e.evTotal) * 100}%`, backgroundColor: "#3a3a4a" }} title={`Not cast / scattered: ${rest}`} /> : null}
    </div>
  );
}

export default function UsElectionsPage() {
  const { eras, elections, meta } = getUsElections();
  const trends = getUsElectionTrends();
  const congress = getUsCongress();
  const records = computeUsRecords();
  const last = elections[elections.length - 1];
  const current = congress.congresses[congress.congresses.length - 1];
  // Newest era first, and newest election first within each era.
  const byEra = [...eras]
    .reverse()
    .map((era) => ({ era, list: elections.filter((e) => e.era === era.key).slice().reverse() }));

  const turnoutSeries: ChartSeries = {
    name: "Turnout",
    color: "#4ECDC4",
    points: trends.turnout.map((t) => ({ x: Number(t.id), y: t.turnout, label: t.id })),
  };
  const twoPartySeries: ChartSeries = {
    name: "Dem + Rep",
    color: "#8A7CA8",
    points: trends.twoParty.map((t) => ({ x: Number(t.id), y: t.share, label: t.id })),
  };
  const thirdSeries: ChartSeries = {
    name: "Best third party",
    color: "#FF6347",
    points: trends.thirdParty.map((t) => ({ x: Number(t.id), y: t.share, label: t.id })),
  };
  const evPctSeries: ChartSeries = {
    name: "Electoral vote %",
    color: "#4ECDC4",
    points: trends.evAmplifier.filter((t) => Number(t.id) >= 1824).map((t) => ({ x: Number(t.id), y: t.evPct, label: t.id })),
  };
  const pvPctSeries: ChartSeries = {
    name: "Popular vote %",
    color: "#8A7CA8",
    points: trends.evAmplifier.filter((t) => Number(t.id) >= 1824).map((t) => ({ x: Number(t.id), y: t.pvPct, label: t.id })),
  };
  // House seats by party since the Democratic/Republican era began (35th Congress, 1857)
  const modern = congress.congresses.filter((c) => c.partyA === "Democratic" && c.partyB === "Republican");
  const houseDem: ChartSeries = {
    name: "Dem",
    color: usPartyColor("Democratic"),
    points: modern.map((c) => ({ x: Number(c.years.slice(0, 4)), y: c.house.a, label: `${c.n}th Congress` })),
  };
  const houseRep: ChartSeries = {
    name: "Rep",
    color: usPartyColor("Republican"),
    points: modern.map((c) => ({ x: Number(c.years.slice(0, 4)), y: c.house.b, label: `${c.n}th Congress` })),
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/elections" className="hover:underline">Elections</Link>
        {" / "}
        <span>United States</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl font-bold mb-2 text-[var(--text)]">{TITLE}</h1>
        <p className="text-[var(--text-muted)] max-w-3xl">{DESC}</p>
      </header>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
        <StatTile label="Presidential elections" value={String(elections.length)} hint={`${elections[0].label}–${last.label}`} />
        <StatTile label="Latest" value={last.label} hint={`${last.winner.name} · ${last.winner.party ?? ""}`} />
        <StatTile label="Electoral votes today" value={String(last.evTotal)} hint={`${last.majorityEv} to win`} />
        <StatTile label="Turnout in 2024" value={usFmtPct(last.turnout)} hint={last.ballots ? `${(last.ballots / 1e6).toFixed(0)}m ballots` : undefined} />
      </div>

      <div className="flex flex-wrap gap-2 mb-10 text-xs">
        {[
          ["#chronology", "Chronology"],
          ["#charts", "The long arcs"],
          ["#records", "Records"],
          ["#congress", "Congress"],
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
          All sixty presidential elections, newest first, grouped into ten eras. Click any election for the full ticket
          table, the electoral count and the story.
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
                const w = e.candidates.find((c) => c.name === e.winner.name) ?? e.candidates[0];
                return (
                  <Link
                    key={e.id}
                    href={`/elections/us/${e.id}`}
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
                        {e.inversion ? (
                          <span className="text-[10px] uppercase tracking-wider rounded-full border px-2 py-0.5 text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
                            Lost popular vote
                          </span>
                        ) : null}
                        {e.houseDecided ? (
                          <span className="text-[10px] uppercase tracking-wider rounded-full border px-2 py-0.5 text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
                            Decided in the House
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-[var(--text-muted)] tabular-nums flex gap-3">
                        <span>
                          <span style={{ color: usPartyColor(w.party) }}>{e.winner.name}</span>
                          {w.ev != null ? <> {w.ev}/{e.evTotal} EV</> : null}
                        </span>
                        {w.share != null ? <span>{usFmtPct(w.share)} PV</span> : null}
                        {e.turnout != null ? <span>turnout {usFmtPct(e.turnout)}</span> : null}
                      </div>
                    </div>
                    <EvStrip e={e} />
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {/* ---------- charts ---------- */}
      <section id="charts" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">The long arcs</h2>
        <p className="text-sm text-[var(--text-muted)] mb-5 max-w-3xl">
          Two hundred and thirty-six years in four charts. Hover any point for the exact figure.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">Turnout, 1789–2024</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Share of eligible voters. The tiny elite franchise of the founding era, the 80%+ peaks of
              mass party politics after 1828, the post-1900 slide, and the modern recovery to 66% in 2020.
            </p>
            <LineChart series={[turnoutSeries]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The two-party grip since 1856</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Democratic + Republican share of the popular vote, against the best single third-party or
              independent run. The duopoly bends — 1912, 1968, 1992 — but never breaks.
            </p>
            <LineChart series={[twoPartySeries, thirdSeries]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The Electoral College amplifier</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              The winner&apos;s share of electoral votes against their share of the popular vote since 1824.
              The gap between the lines is the College&apos;s exaggeration of victory — and when the lower
              line dips under 50% with the upper line still high, a president is being elected without a
              popular majority.
            </p>
            <LineChart series={[evPctSeries, pvPctSeries]} yMax={100} yTicks={[25, 50, 75]} />
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-1">The House of Representatives since 1857</h3>
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Seats by party at the start of each Congress. The New Deal supermajorities, the 40-year
              Democratic House of 1955–1995, and the narrow majorities of the polarized era.
            </p>
            <LineChart series={[houseDem, houseRep]} yMax={350} yTicks={[100, 200, 300]} unit="" />
          </div>
        </div>
      </section>

      {/* ---------- records ---------- */}
      <section id="records" className="mb-12">
        <h2 className="text-2xl font-bold mb-4 text-[var(--text)]">Records &amp; superlatives</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {records.map((r) => (
            <Link
              key={r.label}
              href={`/elections/us/${r.electionId}`}
              className="block rounded-xl border p-4 transition-colors hover:border-[var(--accent)]"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}
            >
              <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">{r.label}</p>
              <p className="text-xl font-bold text-[var(--text)] tabular-nums">{r.value}</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">{r.detail}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* ---------- congress ---------- */}
      <section id="congress" className="mb-12">
        <h2 className="text-2xl font-bold mb-1 text-[var(--text)]">Congress</h2>
        <p className="text-sm text-[var(--text-muted)] mb-4 max-w-3xl">
          Presidents govern with or against Capitol Hill. {congress.note}
        </p>
        <div className="grid gap-3 sm:grid-cols-3 mb-4">
          <StatTile
            label={`Current: ${current.n}th Congress`}
            value={current.trifecta === "Yes" ? "Unified" : "Divided"}
            hint={`${current.years} · President ${current.president ?? ""}`}
          />
          <StatTile
            label="Senate"
            value={`${current.senate.b}–${current.senate.a}`}
            hint={`${current.partyB} majority (${current.senate.others} others)`}
          />
          <StatTile
            label="House"
            value={`${current.house.b}–${current.house.a}`}
            hint={`${current.partyB} majority`}
          />
        </div>
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
          <SortableTable
            tableClassName="w-full text-xs"
            headClassName="text-left text-[10px] uppercase tracking-wider text-[var(--text-dim)]"
            cols={[
              { key: "n", label: "Congress", className: "px-3 py-2" },
              { key: "years", label: "Years", className: "px-3 py-2" },
              { key: "senate", label: "Senate", className: "px-3 py-2 text-right" },
              { key: "house", label: "House", className: "px-3 py-2 text-right" },
              { key: "president", label: "President", className: "px-3 py-2" },
              { key: "trifecta", label: "Trifecta", className: "px-3 py-2" },
            ]}
            rows={congress.congresses.slice().reverse().slice(0, 20).map((c) => ({
              key: String(c.n),
              sort: { n: c.n, years: c.years, senate: c.senate.b - c.senate.a, house: c.house.b - c.house.a, president: c.president, trifecta: c.trifecta?.startsWith("Yes") ? "Yes" : "No" },
              cells: (
                <>
                  <td className="px-3 py-1.5 font-semibold text-[var(--text)] tabular-nums">{c.n}th</td>
                  <td className="px-3 py-1.5 text-[var(--text-muted)] tabular-nums">{c.years}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text-muted)]">
                    <span style={{ color: usPartyColor(c.partyA) }}>{c.senate.a}</span>
                    {" – "}
                    <span style={{ color: usPartyColor(c.partyB) }}>{c.senate.b}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text-muted)]">
                    <span style={{ color: usPartyColor(c.partyA) }}>{c.house.a}</span>
                    {" – "}
                    <span style={{ color: usPartyColor(c.partyB) }}>{c.house.b}</span>
                  </td>
                  <td className="px-3 py-1.5 text-[var(--text-muted)]">{c.president}</td>
                  <td className="px-3 py-1.5 text-[var(--text-muted)]">{c.trifecta?.startsWith("Yes") ? "Yes" : "No"}</td>
                </>
              ),
            }))}
          />
        </div>
        <p className="text-xs text-[var(--text-dim)] mt-2">
          Latest twenty Congresses shown; each election page links the Congress it seated. Dem–Rep columns
          read Democratic first.
        </p>

        <h3 className="text-lg font-bold mt-6 mb-1 text-[var(--text)]">The midterm penalty</h3>
        <p className="text-sm text-[var(--text-muted)] mb-3 max-w-3xl">
          Since 1858 the president&apos;s party has lost House seats in{" "}
          {congress.midterms.list.filter((m) => m.houseChange < 0).length} of{" "}
          {congress.midterms.list.length} midterms. {congress.midterms.note}
        </p>
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
          <SortableTable
            tableClassName="w-full text-xs"
            headClassName="text-left text-[10px] uppercase tracking-wider text-[var(--text-dim)]"
            cols={[
              { key: "year", label: "Midterm", className: "px-3 py-2" },
              { key: "president", label: "President", className: "px-3 py-2" },
              { key: "house", label: "House seats +/−", className: "px-3 py-2 text-right" },
              { key: "senate", label: "Senate seats +/−", className: "px-3 py-2 text-right" },
              { key: "flip", label: "Chamber flipped", className: "px-3 py-2" },
            ]}
            rows={congress.midterms.list.slice().reverse().slice(0, 14).map((m) => ({
              key: String(m.year),
              sort: { year: m.year, president: m.president, house: m.houseChange, senate: m.senateChange, flip: m.houseFlip && m.senateFlip ? "Both" : m.houseFlip ? "House" : m.senateFlip ? "Senate" : null },
              cells: (
                <>
                  <td className="px-3 py-1.5 font-semibold text-[var(--text)] tabular-nums">{m.year}</td>
                  <td className="px-3 py-1.5 text-[var(--text-muted)]">
                    {m.president} <span style={{ color: usPartyColor(m.presParty) }}>({m.presParty.slice(0, 1)})</span>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: m.houseChange < 0 ? "#e06c75" : "#10b981" }}>
                    {m.houseChange > 0 ? "+" : ""}{m.houseChange}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: m.senateChange < 0 ? "#e06c75" : "#10b981" }}>
                    {m.senateChange > 0 ? "+" : ""}{m.senateChange}
                  </td>
                  <td className="px-3 py-1.5 text-[var(--text-muted)]">
                    {m.houseFlip && m.senateFlip ? "Both" : m.houseFlip ? "House" : m.senateFlip ? "Senate" : "—"}
                  </td>
                </>
              ),
            }))}
          />
        </div>
      </section>

      {/* ---------- how it works ---------- */}
      <section id="how-it-works" className="mb-10">
        <h2 className="text-2xl font-bold mb-4 text-[var(--text)]">How presidential elections work</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          {[
            ["The Electoral College", "Voters choose 538 electors, allocated to states by population; 270 elect the president. Every state but Maine and Nebraska awards its electors winner-take-all, which is why campaigns live in a handful of swing states."],
            ["Popular vote ≠ president", "Five men have reached the White House while losing the popular count: Adams in 1824, Hayes, Harrison, Bush in 2000, and Trump in 2016. The College amplifies wins and occasionally reverses them."],
            ["If nobody gets 270", "The House elects the president, one vote per state delegation. It has happened twice, in 1800 and 1824, and shaped constitutional politics both times."],
            ["The rhythm", "Presidential elections every four years since 1788, the whole House and a third of the Senate every two. Midterms almost always punish the president's party, which is why trifectas rarely survive them."],
          ].map(([h, b]) => (
            <div key={h} className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
              <p className="font-bold text-[var(--text)] mb-1">{h}</p>
              <p className="text-xs text-[var(--text-muted)]">{b}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="text-xs text-[var(--text-dim)] border-t pt-4" style={{ borderColor: "var(--border)" }}>
        <p>Sources: {meta.sources.join("; ")}.</p>
        <p className="mt-1">
          See also{" "}
          <Link href="/elections/forecast" className="text-[var(--accent)] hover:underline">Forecast: the next election</Link>
          {" · "}
          <Link href="/us-political-leadership" className="text-[var(--accent)] hover:underline">US Political Leadership</Link>
          {" · "}
          <Link href="/elections/uk" className="text-[var(--accent)] hover:underline">UK General Elections</Link>
          {" · "}
          <Link href="/countries/united-states" className="text-[var(--accent)] hover:underline">United States</Link>
        </p>
      </footer>
    </main>
  );
}
