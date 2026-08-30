import type { Metadata } from "next";
import Link from "next/link";
import { getForecast, FORECAST_COLORS, FORECAST_NAMES, NZ_COLORS, NZ_NAMES, type SeatRange, type Matchup } from "@/lib/forecast";
import { flagUrlByCode, flagSrcSetByCode } from "@/lib/flags";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import LineChart, { type ChartSeries } from "../LineChart";
import SortableTable from "../SortableTable";
import { BackButton, HowItWorks } from "../HubShared";

export const revalidate = 21600; // pick up the weekly data refresh without a build

const PATH = "/elections/forecast";
const TITLE = "Election Forecasts";
const DESC =
  "The road to the next elections, forecast honestly: weighted polling averages, seat ranges from thousands of simulations, and uncertainty stated as plainly as the numbers. Covering the 2026 US midterms — House, Senate and governors — the next UK general election, and the 2026 votes in Brazil, Israel and New Zealand — plus an early read on France 2027. Ranges first, probabilities second, humility throughout.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
};

const pcol = (k: string) => (FORECAST_COLORS[k] === "#FDF38E" ? "#D9C838" : FORECAST_COLORS[k] ?? "#9ca3af");

function RangeBar({ label, color, range, max, extra }: { label: string; color: string; range: SeatRange; max: number; extra?: string }) {
  const pct = (n: number) => `${(n / max) * 100}%`;
  return (
    <div className="mb-2">
      <div className="flex items-baseline justify-between text-xs mb-0.5">
        <span className="font-semibold text-[var(--text)]">
          <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle" style={{ backgroundColor: color }} />
          {label}
        </span>
        <span className="tabular-nums text-[var(--text-muted)]">
          {range.median} <span className="text-[var(--text-dim)]">({range.lo}–{range.hi})</span>
          {extra ? <span className="ml-2 text-[var(--text-dim)]">{extra}</span> : null}
        </span>
      </div>
      <div className="relative h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--border)" }}>
        <div className="absolute h-full rounded-full opacity-40" style={{ left: pct(range.lo), width: `calc(${pct(range.hi)} - ${pct(range.lo)})`, backgroundColor: color }} />
        <div className="absolute h-full w-1" style={{ left: `calc(${pct(range.median)} - 2px)`, backgroundColor: color }} />
      </div>
    </div>
  );
}

const PALETTE = [
  "#1E5EBE", "#0FA88F", "#7C3AED", "#E11D48", "#0284C7", "#CA8A04", "#334155",
  "#059669", "#9333EA", "#DC2626", "#2563EB", "#64748B", "#D97706", "#4B5563",
];
const CAND_COLORS: Record<string, string> = {
  // Brazil
  "Lula": "#C4122D", "F. Bolsonaro": "#1B4F9C", "Caiado": "#0B7A75",
  "Santos": "#6D28D9", "Zema": "#EA8C00", "Cury": "#64748B",
  // France
  "Marine Le Pen": "#0D378A", "Édouard Philippe": "#0EA5E9", "Jean-Luc Mélenchon": "#C9462C",
  "Raphaël Glucksmann": "#E75480", "Gabriel Attal": "#B8860B", "Bruno Retailleau": "#3E67B1",
  "Marine Tondelier": "#02A95B", "Éric Zemmour": "#7A1F1F", "Fabien Roussel": "#B91C1C",
  "Dominique de Villepin": "#708090", "Nicolas Dupont-Aignan": "#155E75", "Nathalie Arthaud": "#8B0000",
};
const candColor = (name: string, i: number) => CAND_COLORS[name] ?? PALETTE[i % PALETTE.length];

function ShareRow({ label, color, value, max, extra }: { label: string; color: string; value: number; max: number; extra?: string }) {
  return (
    <div className="mb-1.5">
      <div className="flex items-baseline justify-between text-xs mb-0.5">
        <span className="font-semibold text-[var(--text)]">
          <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle" style={{ backgroundColor: color }} />
          {label}
        </span>
        <span className="tabular-nums text-[var(--text-muted)]">
          {value.toFixed(1)}{extra ? <span className="ml-2 text-[var(--text-dim)]">{extra}</span> : null}
        </span>
      </div>
      <div className="relative h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--border)" }}>
        <div className="absolute h-full rounded-full" style={{ width: `${Math.min(100, (value / max) * 100)}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function MatchupRow({ m }: { m: Matchup }) {
  const ca = candColor(m.a, 0);
  const cb = candColor(m.b, 1);
  const total = m.avgA + m.avgB;
  return (
    <div className="mb-2.5">
      <div className="flex items-baseline justify-between text-xs mb-0.5">
        <span className="font-semibold text-[var(--text)]">{m.a} <span className="font-normal text-[var(--text-dim)]">vs</span> {m.b}</span>
        <span className="tabular-nums text-[var(--text-muted)]">
          {m.avgA.toFixed(0)}–{m.avgB.toFixed(0)}
          <span className="ml-2" style={{ color: m.pA >= 50 ? ca : cb }}>
            {m.pA >= 50 ? `${m.a} ${m.pA.toFixed(0)}%` : `${m.b} ${(100 - m.pA).toFixed(0)}%`}
          </span>
        </span>
      </div>
      <div className="relative h-2 rounded-full overflow-hidden flex" style={{ backgroundColor: "var(--border)" }}>
        <div className="h-full" style={{ width: `${(m.avgA / total) * 100}%`, backgroundColor: ca }} />
        <div className="h-full" style={{ width: `${(m.avgB / total) * 100}%`, backgroundColor: cb }} />
      </div>
    </div>
  );
}

function CountryHeader({ flag, title, sub }: { flag: string; title: string; sub: string }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-3 mb-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={flagUrlByCode(flag)}
          srcSet={flagSrcSetByCode(flag)}
          alt=""
          width={34}
          height={25}
          className="rounded-sm border shrink-0"
          style={{ borderColor: "var(--border)" }}
        />
        <h2 className="text-2xl font-bold text-[var(--text)]">{title}</h2>
      </div>
      <p className="text-sm text-[var(--text-muted)] max-w-3xl">{sub}</p>
    </div>
  );
}

export default async function ForecastPage() {
  const f = await getForecast();
  if (!f) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <p className="text-[var(--text-muted)]">The forecast dataset has not been generated yet.</p>
      </main>
    );
  }
  const { uk, us } = f;
  const sen = us?.senate ?? null;
  const gov = us?.governors ?? null;
  const nz = f.nz ?? null;
  const il = f.il ?? null;
  const br = f.br ?? null;
  const fr = f.fr ?? null;
  // FR scenario tables tag candidates with their party ("Le Pen RN") — strip for display
  const frName = (s: string) => s.replace(/\s+[A-ZÉÈÀ]{2,}$/u, "");

  const yearFrac = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    return y + (m - 1) / 12 + day / 365;
  };
  const ukSeries: ChartSeries[] = (["ref", "lab", "con", "grn", "ld", "snp"] as const).map((k) => ({
    name: FORECAST_NAMES[k],
    color: pcol(k),
    points: uk.trend
      .filter((t) => t[k] != null)
      .map((t) => ({ x: yearFrac(t.date), y: t[k] as number, label: `${t.date} (${t.n} polls)` })),
  }));

  const ukOrder = Object.entries(uk.sim.seats)
    .filter(([k, v]) => v.hi > 0 && k !== "oth")
    .sort((a, b) => b[1].median - a[1].median);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/elections" className="hover:underline">Elections</Link>
        {" / "}
        <span>Forecasts</span>
      </nav>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <BackButton href="/elections" label="All election hubs" />
        <BackButton href="/elections/us" label="US elections" />
        <BackButton href="/elections/uk" label="UK elections" />
      </div>

      <header className="mb-6">
        <h1 className="text-3xl font-bold mb-2 text-[var(--text)]">{TITLE}</h1>
        <p className="text-[var(--text-muted)] max-w-3xl">
          Weighted polling averages, seat ranges from thousands of simulations, uncertainty stated plainly.
        </p>
        {/* One chip per live forecast, derived from the data itself — races join
            this row as their votes approach and drop off once counted; the US
            and UK are permanent (Ashwin 2026-08-02). */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {[
            { id: "us", flag: "us", label: "United States", when: "midterms · 3 Nov 2026", show: true },
            { id: "uk", flag: "gb", label: "United Kingdom", when: "next general election", show: true },
            { id: "br", flag: "br", label: "Brazil", when: "4 Oct 2026", show: !!br },
            { id: "il", flag: "il", label: "Israel", when: "2026", show: !!il },
            { id: "nz", flag: "nz", label: "New Zealand", when: "2026", show: !!nz },
            { id: "fr", flag: "fr", label: "France", when: "2027 · early read", show: !!fr },
          ].filter((c) => c.show).map((c) => (
            <a
              key={c.id}
              href={`#${c.id}`}
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={flagUrlByCode(c.flag)} srcSet={flagSrcSetByCode(c.flag)} alt="" width={18} height={13} className="rounded-[2px]" />
              <span className="font-semibold">{c.label}</span>
              <span className="text-[var(--text-dim)]">{c.when}</span>
            </a>
          ))}
        </div>
        <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mt-3">
          US &amp; UK always on · other races join as votes near, retire once counted · updated {f.built} · refreshes weekly
        </p>
      </header>

      <div className="rounded-xl border p-4 mb-8 max-w-3xl text-sm" style={{ borderColor: "#B4540A", backgroundColor: "rgba(217,119,6,0.06)" }}>
        <p className="text-[var(--text-muted)]">
          <span className="font-bold" style={{ color: "#D97706" }}>A forecast is labelled speculation.</span>{" "}
          Everything else in this atlas records what happened; this page estimates what might. The
          ranges are wide because they should be — polls taken months or years before an election
          have missed by six points and more, and every number below carries that history. When the
          ranges look absurdly wide, they are working correctly.
        </p>
      </div>

      {/* ================= UNITED STATES ================= */}
      <section id="us" className="mb-6 rounded-2xl border p-5 sm:p-6 scroll-mt-20" style={{ borderColor: "var(--border)" }}>
        <CountryHeader
          flag="us"
          title="United States — the 2026 midterms"
          sub={`3 November 2026, ${us?.monthsOut ?? "?"} months away. Democrats lead the generic congressional ballot by ${us && us.margin > 0 ? `+${us.margin.toFixed(1)}` : us?.margin.toFixed(1)} across the major aggregators — and the president's party has lost House seats in almost every midterm since the Civil War.`}
        />

        {us ? (
          <>
            <h3 className="font-bold text-[var(--text)] mb-2">The House <span className="font-normal text-xs text-[var(--text-dim)]">435 seats · 218 to control</span></h3>
            <div className="grid gap-4 lg:grid-cols-2 mb-6">
              <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
                <RangeBar label="Democrats" color={FORECAST_COLORS.dem} range={us.demSeats} max={435} extra={`House ${us.pDemHouse}%`} />
                <RangeBar
                  label="Republicans"
                  color={FORECAST_COLORS.rep}
                  range={{ median: 435 - us.demSeats.median, lo: 435 - us.demSeats.hi, hi: 435 - us.demSeats.lo }}
                  max={435}
                  extra={`House ${(100 - us.pDemHouse).toFixed(1)}%`}
                />
                <p className="text-xs text-[var(--text-dim)] mt-3">
                  Median and 90% range of {us.sims.toLocaleString("en-US")} simulations. Democrats
                  take the House in {us.pDemHouse}% of them — a lead, not a lock: the generic ballot
                  at this range still misses by ±{us.sigma} points.
                </p>
              </div>
              <div className="min-w-0 rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
                <h4 className="font-semibold text-sm text-[var(--text)] mb-2">The aggregators</h4>
                <div className="overflow-x-auto">
                  <SortableTable
                    tableClassName="w-full text-xs"
                    headClassName="text-left text-[10px] uppercase tracking-wider text-[var(--text-dim)]"
                    cols={[
                      { key: "src", label: "Aggregator", className: "px-2 py-1.5" },
                      { key: "dem", label: "Dem", className: "px-2 py-1.5 text-right" },
                      { key: "rep", label: "Rep", className: "px-2 py-1.5 text-right" },
                      { key: "margin", label: "Margin", className: "px-2 py-1.5 text-right" },
                    ]}
                    rows={us.aggregators.map((a) => ({
                      key: a.source,
                      sort: { src: a.source, dem: a.dem, rep: a.rep, margin: a.dem != null && a.rep != null ? a.dem - a.rep : null },
                      cells: (
                        <>
                          <td className="px-2 py-1.5 text-[var(--text)]">{a.source}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: FORECAST_COLORS.dem }}>{a.dem?.toFixed(1) ?? "—"}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: FORECAST_COLORS.rep }}>{a.rep?.toFixed(1) ?? "—"}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-[var(--text-muted)]">
                            {a.dem != null && a.rep != null ? `D${a.dem - a.rep > 0 ? "+" : ""}${(a.dem - a.rep).toFixed(1)}` : "—"}
                          </td>
                        </>
                      ),
                    }))}
                  />
                </div>
                <p className="text-xs text-[var(--text-dim)] mt-2">
                  Individual-poll feeds thinned after FiveThirtyEight closed in 2025; the aggregators
                  above are averaged as the national input.
                </p>
              </div>
            </div>

            {sen ? (
              <>
                <h3 className="font-bold text-[var(--text)] mb-2">The Senate <span className="font-normal text-xs text-[var(--text-dim)]">{sen.races} seats up · Democrats need 51, Republicans 50 with the Vice President</span></h3>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
                    <RangeBar label="Democratic caucus" color={FORECAST_COLORS.dem} range={sen.demSeats} max={100} extra={`control ${sen.pDemControl}%`} />
                    <RangeBar
                      label="Republicans"
                      color={FORECAST_COLORS.rep}
                      range={{ median: 100 - sen.demSeats.median, lo: 100 - sen.demSeats.hi, hi: 100 - sen.demSeats.lo }}
                      max={100}
                      extra={`control ${(100 - sen.pDemControl).toFixed(1)}%`}
                    />
                    <p className="text-xs text-[var(--text-dim)] mt-3">
                      From today&apos;s {sen.senateNow.R}–{sen.senateNow.D}: {sen.seatsUp.R} Republican
                      and {sen.seatsUp.D} Democratic seats are on the ballot. The map, not the
                      national mood, is the obstacle — Democrats can win the night and still miss
                      the majority.
                    </p>
                  </div>
                  <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
                    <h4 className="font-semibold text-sm text-[var(--text)] mb-2">The races that decide it</h4>
                    <div className="grid gap-1.5 text-xs">
                      {sen.competitive.map((r) => (
                        <div key={r.state} className="flex items-baseline justify-between gap-3">
                          <span className="text-[var(--text)] font-semibold">
                            {r.state}
                            <span className="font-normal text-[var(--text-dim)]"> · {r.held === "D" ? "Dem-held" : "Rep-held"}{r.retiring ? ", open" : ""}</span>
                          </span>
                          <span className="tabular-nums" style={{ color: r.pDem >= 50 ? FORECAST_COLORS.dem : FORECAST_COLORS.rep }}>
                            {r.pDem >= 50 ? `D ${r.pDem}%` : `R ${100 - r.pDem}%`}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-[var(--text-dim)] mt-3">
                      Consensus of the eight ratings agencies (Cook, Inside Elections, Sabato and
                      peers), converted to probabilities and simulated with a shared national swing.
                    </p>
                  </div>
                </div>
              </>
            ) : null}

            {gov ? (
              <>
                <h3 className="font-bold text-[var(--text)] mb-2 mt-6">The Governors <span className="font-normal text-xs text-[var(--text-dim)]">{gov.races} of 50 mansions on the ballot · 26 for a majority</span></h3>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
                    <RangeBar label="Democratic governors" color={FORECAST_COLORS.dem} range={gov.demSeats} max={50} extra={`majority ${gov.pDemMajority}%`} />
                    <RangeBar
                      label="Republican governors"
                      color={FORECAST_COLORS.rep}
                      range={{ median: 50 - gov.demSeats.median, lo: 50 - gov.demSeats.hi, hi: 50 - gov.demSeats.lo }}
                      max={50}
                      extra={`majority ${gov.pRepMajority}%`}
                    />
                    <p className="text-xs text-[var(--text-dim)] mt-3">
                      From today&apos;s {gov.governorsNow.R}–{gov.governorsNow.D}: {gov.seatsUp.R} Republican and{" "}
                      {gov.seatsUp.D} Democratic mansions are on the ballot; the other {gov.carryover.R + gov.carryover.D} carry
                      over. Governorships are independent state offices, so &quot;majority&quot; means most of the fifty, not
                      control of anything — and the two figures fall short of 100% by the odds of an exact 25–25 split.
                    </p>
                  </div>
                  <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
                    <h4 className="font-semibold text-sm text-[var(--text)] mb-2">The races that decide it</h4>
                    <div className="grid gap-1.5 text-xs">
                      {gov.competitive.map((r) => (
                        <div key={r.state} className="flex items-baseline justify-between gap-3">
                          <span className="text-[var(--text)] font-semibold">
                            {r.state}
                            <span className="font-normal text-[var(--text-dim)]"> · {r.held === "D" ? "Dem-held" : "Rep-held"}{r.retiring ? ", open" : ""}</span>
                          </span>
                          <span className="tabular-nums" style={{ color: r.pDem >= 50 ? FORECAST_COLORS.dem : FORECAST_COLORS.rep }}>
                            {r.pDem >= 50 ? `D ${r.pDem}%` : `R ${100 - r.pDem}%`}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-[var(--text-dim)] mt-3">
                      Consensus of the ratings agencies (Cook, Inside Elections, Sabato, Race to the WH,
                      RCP, Fox and VoteHub), converted to probabilities and simulated with a shared
                      national swing.
                    </p>
                  </div>
                </div>
              </>
            ) : null}
          </>
        ) : null}
      </section>

      {/* ================= UNITED KINGDOM ================= */}
      <section id="uk" className="mb-10 rounded-2xl border p-5 sm:p-6 scroll-mt-20" style={{ borderColor: "var(--border)" }}>
        <CountryHeader
          flag="gb"
          title="United Kingdom — the next general election"
          sub={`Due by August 2029 (modelled as ${uk.electionAssumed.slice(0, 7)}), ${uk.sim.monthsOut} months away. Average of the latest poll from each of ${uk.pollsters} pollsters, recency-weighted; latest poll ${uk.latestPollDate}.`}
        />

        <div className="grid gap-4 lg:grid-cols-2 mb-6">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-2">The polling average today</h3>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm tabular-nums">
              {Object.entries(uk.average).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <span key={k}>
                  <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle" style={{ backgroundColor: pcol(k) }} />
                  <span className="text-[var(--text)] font-semibold">{FORECAST_NAMES[k]}</span>{" "}
                  <span className="text-[var(--text-muted)]">{v.toFixed(1)}%</span>
                </span>
              ))}
            </div>
            <p className="text-xs text-[var(--text-dim)] mt-3">
              Five parties within thirteen points of the lead — the most fragmented polling picture
              in modern British history, in a system built for two parties.
            </p>
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <h3 className="font-bold text-[var(--text)] mb-2">What the simulations say</h3>
            <p className="text-sm text-[var(--text-muted)]">
              Across {uk.sim.sims.toLocaleString("en-US")} simulated elections:{" "}
              <span className="font-semibold text-[var(--text)]">a hung parliament {uk.sim.pHung}%</span> of the time
              {Object.entries(uk.sim.pLargest).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => (
                <span key={k}>{" · "}{FORECAST_NAMES[k]} largest {v}%</span>
              ))}
              {Object.entries(uk.sim.pMajority).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => (
                <span key={k}>{" · "}{FORECAST_NAMES[k]} majority {v}%</span>
              ))}
              .
            </p>
            <p className="text-xs text-[var(--text-dim)] mt-3">
              {uk.sim.majorityNeeds} seats for a majority. Northern Ireland&apos;s {uk.sim.niSeats} seats
              are held at their 2024 outcome.
            </p>
          </div>
        </div>

        <h3 className="font-bold text-[var(--text)] mb-2">Seat ranges <span className="font-normal text-xs text-[var(--text-dim)]">median and 90% range of the simulations · 650 seats</span></h3>
        <div className="rounded-xl border p-4 mb-6" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
          {ukOrder.map(([k, r]) => (
            <RangeBar
              key={k}
              label={FORECAST_NAMES[k] ?? k}
              color={pcol(k)}
              range={r}
              max={420}
              extra={uk.sim.pMajority[k] != null ? `maj ${uk.sim.pMajority[k]}%` : undefined}
            />
          ))}
          <p className="text-xs text-[var(--text-dim)] mt-3">
            Proportional swing from the 2024 result in each of Great Britain&apos;s 632 constituencies,
            with national and per-seat error drawn from the historical record. First past the post
            makes seat counts hypersensitive: a two-point national move can swing a hundred seats,
            which is why the bars overlap so heavily.
          </p>
        </div>

        <h3 className="font-bold text-[var(--text)] mb-2">The tracker <span className="font-normal text-xs text-[var(--text-dim)]">fortnightly averages since the 2024 election</span></h3>
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
          <LineChart series={ukSeries} yMax={40} yTicks={[10, 20, 30]} />
        </div>
      </section>

      {/* ================= BRAZIL ================= */}
      {br ? (
        <section id="br" className="mb-6 rounded-2xl border p-5 sm:p-6 scroll-mt-20" style={{ borderColor: "var(--border)" }}>
          <CountryHeader
            flag="br"
            title="Brazil — the 2026 presidential election"
            sub={`First round 4 October 2026, ${br.monthsOut} months away. Recency-weighted average of ${br.firstRound.polls} first-round polls from the last 45 days; latest ${br.firstRound.latest}.`}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
              <h3 className="font-bold text-[var(--text)] mb-2">First round <span className="font-normal text-xs text-[var(--text-dim)]">vote share, %</span></h3>
              {Object.entries(br.firstRound.shares).map(([name, v], i) => (
                <ShareRow key={name} label={name} color={candColor(name, i)} value={v} max={50} />
              ))}
              <p className="text-xs text-[var(--text-dim)] mt-3">
                Nobody near the 50% needed to win outright, so the numbers point firmly to a runoff.
              </p>
            </div>
            <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
              <h3 className="font-bold text-[var(--text)] mb-2">The runoff <span className="font-normal text-xs text-[var(--text-dim)]">25 October 2026</span></h3>
              {br.runoffs.length ? br.runoffs.map((m) => <MatchupRow key={`${m.a}-${m.b}`} m={m} />) : (
                <p className="text-sm text-[var(--text-muted)]">No head-to-head polling captured yet.</p>
              )}
              <p className="text-xs text-[var(--text-dim)] mt-3">
                Head-to-head averages simulated with the historical error of Brazilian polls at this
                horizon — an 8-point first-round lead is far from safe once the field consolidates.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {/* ================= ISRAEL ================= */}
      {il ? (
        <section id="il" className="mb-6 rounded-2xl border p-5 sm:p-6 scroll-mt-20" style={{ borderColor: "var(--border)" }}>
          <CountryHeader
            flag="il"
            title="Israel — the 2026 Knesset election"
            sub={`Modelled for ${il.electionAssumed.slice(0, 7)} on the regular four-year schedule. Israeli pollsters publish seat projections directly; this is the recency-weighted average of ${il.polls} published seat polls (a thin base — the cycle's polling has only just begun), renormalised to the Knesset's 120 seats.`}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
              <h3 className="font-bold text-[var(--text)] mb-2">Seat averages <span className="font-normal text-xs text-[var(--text-dim)]">120 seats · 61 for a majority</span></h3>
              {il.parties.filter((p) => p.seats >= 0.5).map((p, i) => (
                <ShareRow key={p.name} label={p.name} color={candColor(p.name, i)} value={p.seats} max={30} />
              ))}
              <p className="text-xs text-[var(--text-dim)] mt-3">
                Parties polling under the 3.25% threshold (about four seats) are shown at zero, as
                the pollsters publish them.
              </p>
            </div>
            <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
              <h3 className="font-bold text-[var(--text)] mb-2">The coalition question</h3>
              {il.gov.avg != null ? (
                <>
                  <p className="text-sm text-[var(--text-muted)]">
                    The polls&apos; own tally of the current government bloc averages{" "}
                    <span className="font-semibold text-[var(--text)]">{il.gov.avg} of 120 seats</span>
                    {il.gov.pMajority != null ? (
                      <> — reaching 61 in <span className="font-semibold text-[var(--text)]">{il.gov.pMajority}%</span> of simulations at today&apos;s numbers</>
                    ) : null}
                    .
                  </p>
                  <p className="text-xs text-[var(--text-dim)] mt-3">
                    Israeli coalition arithmetic is notoriously fluid: new parties, mergers and
                    surplus-vote agreements routinely move the bloc totals by more than the polling
                    error. The bloc figure is the pollsters&apos; own classification, not ours.
                  </p>
                </>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">No bloc tally published yet.</p>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {/* ================= NEW ZEALAND ================= */}
      {nz ? (
        <section id="nz" className="mb-6 rounded-2xl border p-5 sm:p-6 scroll-mt-20" style={{ borderColor: "var(--border)" }}>
          <CountryHeader
            flag="nz"
            title="New Zealand — the 2026 general election"
            sub={`Due late 2026 (modelled as ${nz.electionAssumed.slice(0, 7)}), ${nz.monthsOut} months away. Latest poll from each of ${nz.pollsters} pollsters, recency-weighted; latest ${nz.latestPollDate}. Seats via Sainte-Laguë with the 5% threshold (electorate-seat waiver assumed for ACT and Te Pāti Māori).`}
          />
          <div className="grid gap-4 lg:grid-cols-2 mb-4">
            <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
              <h3 className="font-bold text-[var(--text)] mb-2">The polling average today</h3>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm tabular-nums">
                {Object.entries(nz.average).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                  <span key={k}>
                    <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle" style={{ backgroundColor: NZ_COLORS[k] ?? "#9ca3af" }} />
                    <span className="text-[var(--text)] font-semibold">{NZ_NAMES[k] ?? k}</span>{" "}
                    <span className="text-[var(--text-muted)]">{v.toFixed(1)}%</span>
                  </span>
                ))}
              </div>
              <p className="text-xs text-[var(--text-dim)] mt-3">
                MMP makes the blocs the real contest: National + ACT + NZ First against
                Labour + Greens + Te Pāti Māori, with TOP hovering at the threshold.
              </p>
            </div>
            <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
              <h3 className="font-bold text-[var(--text)] mb-2">What the simulations say</h3>
              <p className="text-sm text-[var(--text-muted)]">
                Across {nz.sims.toLocaleString("en-US")} simulated elections:{" "}
                <span className="font-semibold text-[var(--text)]">the governing right bloc holds its majority {nz.pRightBloc}%</span> of the time
                {" · "}the left bloc takes one {nz.pLeftBloc}%
                {" · "}neither reaches 61 in {nz.pNeither}% — a genuine three-way coin flip.
              </p>
              <p className="text-xs text-[var(--text-dim)] mt-3">
                120 seats, 61 for a majority. Overhang seats and electorate-level upsets are not
                modelled — they have decided NZ coalitions before.
              </p>
            </div>
          </div>
          <h3 className="font-bold text-[var(--text)] mb-2">Seat ranges <span className="font-normal text-xs text-[var(--text-dim)]">median and 90% range · 120 seats</span></h3>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            {Object.entries(nz.seats).sort((a, b) => b[1].median - a[1].median).map(([k, r]) => (
              <RangeBar key={k} label={NZ_NAMES[k] ?? k} color={NZ_COLORS[k] ?? "#9ca3af"} range={r} max={70} />
            ))}
          </div>
        </section>
      ) : null}

      {/* ================= FRANCE ================= */}
      {fr ? (
        <section id="fr" className="mb-10 rounded-2xl border p-5 sm:p-6 scroll-mt-20" style={{ borderColor: "var(--border)" }}>
          <CountryHeader
            flag="fr"
            title="France — the 2027 presidential election"
            sub={`Due spring 2027 (modelled as ${fr.electionAssumed.slice(0, 7)}), ${fr.monthsOut} months away. The heaviest caveat on this page: no candidate has been formally nominated, so pollsters test hypothetical fields. These are scenario averages, not a forecast of a settled race.`}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
              <h3 className="font-bold text-[var(--text)] mb-2">First round <span className="font-normal text-xs text-[var(--text-dim)]">scenario average, %</span></h3>
              {Object.entries(fr.firstRound.shares).slice(0, 9).map(([name, v], i) => (
                <ShareRow key={name} label={frName(name)} color={candColor(name, i)} value={v} max={40} />
              ))}
              <p className="text-xs text-[var(--text-dim)] mt-3">
                {fr.firstRound.polls} scenario polls; latest {fr.firstRound.latest}. The top two
                advance to the runoff — and second place is wide open.
              </p>
            </div>
            <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
              <h3 className="font-bold text-[var(--text)] mb-2">Tested runoffs <span className="font-normal text-xs text-[var(--text-dim)]">head-to-head averages</span></h3>
              {fr.runoffs.slice(0, 6).map((m) => (
                <MatchupRow key={`${m.a}-${m.b}`} m={{ ...m, a: frName(m.a), b: frName(m.b) }} />
              ))}
              <p className="text-xs text-[var(--text-dim)] mt-3">
                Nine months out in 2016, the eventual runoff pairing wasn&apos;t being polled at all.
                Treat these as today&apos;s temperature, nothing more.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <HowItWorks
        title="How these forecasts work"
        cards={[
          ["The averages", "Each pollster's latest poll within 45 days, weighted by recency (14-day half-life) and sample size. A simple transparent average — validated on 22 past elections across four countries, where it called 87% of winners within 1.3 points."],
          ["Seats from votes", "US House: the generic-ballot margin mapped through the 2012–2024 seats-votes relationship. US Senate and governors: the ratings agencies' consensus per race, converted to win probabilities and simulated with a shared national swing — the governors aggregated to mansions held out of 50, starting from today's 26–24 Republican edge. UK: each party's national movement applied proportionally to its 2024 result in all 632 GB constituencies (Commons Library data). New Zealand: Sainte-Laguë over the simulated party vote. Israel: the pollsters' own seat projections, averaged. Brazil and France: round-by-round candidate averages."],
          ["Why the ranges are wide", "Polls this far from polling day are weather, not prophecy: three years out, national surveys have missed final results by six points and more (FiveThirtyEight's raw-polls archive; Jennings & Wlezien). The error scales into every simulation, which is why the honest answer is a range."],
          ["Sources and refresh", "Polling and ratings tables from Wikipedia (CC BY-SA 4.0); GE2024 constituency results from the House of Commons Library (Open Parliament Licence); historical calibration from FiveThirtyEight's open archive (CC BY 4.0). A scheduled job (Mon/Wed/Fri) re-scrapes, re-simulates and republishes."],
        ]}
      />

      <footer className="mt-6 pt-6 border-t text-xs text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }}>
        Related:{" "}
        <Link href="/elections/us" className="hover:text-[var(--accent)]">US Presidential Elections</Link>
        {" · "}
        <Link href="/elections/uk" className="hover:text-[var(--accent)]">UK General Elections</Link>
        {" · "}
        <Link href="/elections/under-fire" className="hover:text-[var(--accent)]">Elections Under Fire</Link>
        {" · "}
        <Link href="/elections/referendums" className="hover:text-[var(--accent)]">Landmark Referendums</Link>
      </footer>
    </main>
  );
}
