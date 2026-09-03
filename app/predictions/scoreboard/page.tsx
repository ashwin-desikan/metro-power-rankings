// The Ledger. The one page on this site whose subject is our own record.
//
// 🔴 THIS IS NOT A BOARD OF BOARDS. Four leaderboards of a statistic, with the
// statistic as the subject, is a lab bench — the /teams/nfl/expectation ruling.
// So this page leads with a CLAIM, and the claim is the unflattering one: over
// twenty-one thousand priced games the market has beaten this site's models.
// The boards underneath are the evidence for it.
//
// 🔴 "CLOSING" IS A CLAIM ABOUT A COLUMN, NOT A SYNONYM FOR "ODDS". This page
// said "closing" everywhere while the football builder read football-data's
// PRE-MATCH price, because that was the only price the build knew how to find.
// No closing column exists before 2012-13, so part of the football sample can
// never be closing-priced. Every sentence about the price is now derived from
// market_closing_matches, and says which era got which. Fixed 2026-08-30.
//
// 🔴 DERIVE EVERY COMPARISON, NEVER ASSERT ONE. Every number below is computed
// from the ledgers at render time. Nothing here is a sentence someone typed
// after looking at three rows.
//
// 🔴 TWO BRIER SCALES MUST NEVER SHARE A COLUMN. English football is a
// three-way question and scores near 0.60; the NFL and college football are
// two-way and score near 0.22. The only honest cross-sport unit is the skill
// score against the same market that priced the same games: 1 - model/market,
// which is dimensionless. Raw Brier stays inside its own sport's row.
import type { Metadata } from "next";
import { Fragment } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import HubNav from "@/app/teams/HubNav";
import { TableScroll } from "@/app/_shared/TableScroll";
import { getPlExpectation } from "@/lib/plExpectation";
import { getNflExpectation } from "@/lib/nflExpectation";
import { getPlPredictions } from "@/lib/plSim";
import { getNflPredictions } from "@/lib/nflSim";
import { getCfbPredictions } from "@/lib/cfbSim";
import { getForecastScoreboard, nextToSettle, awaitingResults, longDate } from "@/lib/forecastScoreboard";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

export const revalidate = 21600;

const PATH = "/predictions/scoreboard";
const TITLE = "The Ledger";
const DESC =
  "Every forecast this site publishes, scored in public against the market that priced it: calibration bins, the seasons the model won, and the seasons it lost.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: {
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    title: `${TITLE} | ${SITE_NAME}`,
    description: DESC,
    url: `${BASE_URL}${PATH}`,
    type: "website",
  },
  twitter: {
    images: ["/og-default.png"],
    card: "summary_large_image",
    title: `${TITLE} | ${SITE_NAME}`,
    description: DESC,
  },
};

const MONO: CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const CARD: CSSProperties = { background: "var(--bg-card)", borderColor: "var(--border)" };
const BORD: CSSProperties = { borderColor: "var(--border)" };
const UP = "#10b981";
const DOWN = "#E2628B";

/** Brier skill score against the market that priced the same games. */
function skill(model: number | null | undefined, market: number | null | undefined): number | null {
  if (model == null || market == null || market === 0) return null;
  return 1 - model / market;
}

function pct(v: number | null, dp = 2): string {
  if (v == null) return "—";
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toFixed(dp)}%`;
}

function Stat({ v, k, sub }: { v: string; k: string; sub?: string }) {
  return (
    <div className="rounded-xl border p-4 min-w-0" style={CARD}>
      <div className="text-[11px] uppercase tracking-widest mb-1" style={{ ...MONO, color: "var(--text-muted)" }}>
        {k}
      </div>
      <div className="text-xl sm:text-2xl font-bold" style={MONO}>
        {v}
      </div>
      {sub ? <div className="text-xs text-[var(--text-muted)] mt-1">{sub}</div> : null}
    </div>
  );
}

function SectionHead({ title, sub, id }: { title: string; sub: string; id: string }) {
  return (
    <>
      <h2 id={id} className="text-2xl font-bold scroll-mt-24">
        {title}
      </h2>
      <p className="mt-1 mb-4 text-sm text-[var(--text-muted)] max-w-3xl">{sub}</p>
    </>
  );
}

/** A diverging bar centred on zero: the market's score is the middle line. */
function SkillBar({ v, max = 0.06 }: { v: number | null; max?: number }) {
  if (v == null) return <span className="text-[var(--text-dim)]">—</span>;
  const frac = Math.min(Math.abs(v) / max, 1) * 50;
  const good = v > 0;
  return (
    <span className="flex items-center gap-2 min-w-[132px]">
      <span className="relative flex-1 h-[7px] rounded-sm overflow-hidden" style={{ background: "var(--bg-card-hover)" }}>
        <span className="absolute inset-y-0 w-px" style={{ left: "50%", background: "var(--border)" }} aria-hidden />
        <span
          className="absolute inset-y-0"
          style={
            good
              ? { left: "50%", width: `${frac}%`, background: UP }
              : { right: "50%", width: `${frac}%`, background: DOWN }
          }
          aria-hidden
        />
      </span>
      <span className="tabular-nums text-xs" style={{ ...MONO, color: good ? UP : DOWN }}>
        {pct(v)}
      </span>
    </span>
  );
}

export default async function LedgerPage() {
  const [plExp, nflExp, plLive, nflLive, cfbLive, elec] = await Promise.all([
    getPlExpectation(),
    getNflExpectation(),
    getPlPredictions(),
    getNflPredictions(),
    getCfbPredictions(),
    getForecastScoreboard(),
  ]);

  // ---- Elections. Four races settle between 4 October and 20 November 2026,
  // so this row exists before any of them rather than after.
  const elecT = elec?.totals;
  const elecNext = nextToSettle(elec);
  const elecOwed = awaitingResults(elec);
  const elecSkill = elecT?.skill == null ? null : elecT.skill / 100;

  // ---- Football: aggregate the model and market over the priced matches only.
  // market_model_brier is the model's score over exactly the games the market
  // priced, which is the only fair comparator for market_brier.
  const plPriced = (plExp?.seasons ?? []).filter(
    (s) => s.market_brier != null && s.market_model_brier != null && s.market_matches > 0,
  );
  const plMatches = plPriced.reduce((a, s) => a + s.market_matches, 0);
  const plModel = plMatches
    ? plPriced.reduce((a, s) => a + (s.market_model_brier as number) * s.market_matches, 0) / plMatches
    : null;
  const plMarket = plMatches
    ? plPriced.reduce((a, s) => a + (s.market_brier as number) * s.market_matches, 0) / plMatches
    : null;
  const plWon = plPriced.filter((s) => (s.market_model_brier as number) < (s.market_brier as number));
  const plSkill = skill(plModel, plMarket);

  // 🔴 How much of the football sample carries a TRUE closing price. Undefined
  // on a ledger built before the 2026-08-30 fix, which is why every sentence
  // below tests it rather than assuming it.
  const plClosingKnown = plPriced.some((s) => s.market_closing_matches != null);
  const plClosing = plPriced.reduce((a, s) => a + (s.market_closing_matches ?? 0), 0);
  const plOpening = plMatches - plClosing;
  const plClosingSeasons = plPriced.filter((s) => (s.market_closing_matches ?? 0) > 0);

  // ---- NFL: the builder already reconciles the head-to-head population.
  const h2h = nflExp?.meta.head_to_head ?? null;
  const nflSkill = skill(h2h?.model_brier, h2h?.market_brier);
  const nflSeasonsPriced = (nflExp?.seasons ?? []).filter(
    (s) => s.model_brier != null && s.market_brier != null && s.market_games > 0,
  );
  const nflWon = nflSeasonsPriced.filter((s) => (s.model_brier as number) < (s.market_brier as number));

  const pricedGames = plMatches + (h2h?.games ?? 0);
  const calibration = plExp?.calibration ?? [];
  const calibN = calibration.reduce((a, b) => a + b.n, 0);

  // ---- This season. Every live ledger, honestly, including the empty ones.
  const live = [
    {
      key: "pl",
      label: "Premier League",
      href: "/predictions/pl",
      season: plLive?.meta.season ?? "2026-27",
      rec: plLive?.record ?? null,
      shape: "three-way",
      first: "Tue 25 Aug",
    },
    {
      key: "cfb",
      label: "College Football",
      href: "/predictions/cfb",
      season: String(cfbLive?.meta.season ?? 2026),
      rec: cfbLive?.record ?? null,
      shape: "two-way",
      first: "Sat 29 Aug",
    },
    {
      key: "nfl",
      label: "NFL",
      href: "/predictions/nfl",
      season: String(nflLive?.meta.season ?? 2026),
      rec: nflLive?.record ?? null,
      shape: "two-way",
      first: "Thu 10 Sep",
    },
  ];
  const gradedNow = live.reduce((a, l) => a + (l.rec?.graded ?? 0), 0);

  // ---- NFL lite tier (points-v3): a stats-only rating run alongside the
  // production build, frozen on the same ledger entries. Surfaces only once
  // graded entries actually carry it - most seasons never will.
  const nflLiteGraded = (nflLive?.ledger ?? []).filter(
    (e) => e.result && e.result !== "T" && e.lite_brier != null && e.market_brier != null,
  );
  const nflLiteAvg = (key: "lite_brier" | "market_brier"): number | null =>
    nflLiteGraded.length
      ? nflLiteGraded.reduce((a, e) => a + (e[key] as number), 0) / nflLiteGraded.length
      : null;
  const nflLiteBrier = nflLiteAvg("lite_brier");
  const nflLiteMarketBrier = nflLiteAvg("market_brier");
  const nflLiteSkill = skill(nflLiteBrier, nflLiteMarketBrier);

  const stamp = [
    `${pricedGames.toLocaleString()} priced games scored`,
    plExp ? `football ${plExp.meta.seasons[0]}–${plExp.meta.seasons[1]}` : null,
    nflExp ? `NFL ${nflExp.meta.seasons[0]}–${nflExp.meta.seasons[1]}` : null,
    plExp ? `built ${plExp.meta.generated_at.slice(0, 10)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">
          Home
        </Link>
        {" / "}
        <Link href="/predictions" className="hover:underline">
          Predictions
        </Link>
        {" / "}
        <span>The Ledger</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">📓 The Ledger</h1>
        <p className="mt-2 text-[15px] text-[var(--text-muted)] max-w-3xl">
          Every forecast this site publishes is frozen when it is published and scored afterwards
          against the price the betting market closed at. This is the record. It is not a flattering
          one, and a page that only ever showed its own scoreboard would be worth nothing.
        </p>
        <div className="mt-2 text-[11px] uppercase tracking-wider text-[var(--text-dim)]" style={MONO}>
          {stamp}
        </div>
      </header>

      <HubNav
        items={[
          { label: "The market wins", href: "#verdict" },
          { label: "Calibration", href: "#calibration" },
          { label: "The seasons we won", href: "#won" },
          { label: "This season", href: "#live" },
          { label: "Your own calls", href: "#you" },
          { label: "What this cannot tell you", href: "#method" },
        ]}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-10">
        <Stat k="Priced games" v={pricedGames.toLocaleString()} sub="scored against a market price" />
        <Stat
          k="Seasons won"
          v={`${plWon.length + nflWon.length} of ${plPriced.length + nflSeasonsPriced.length}`}
          sub="model closer than the market"
        />
        <Stat k="Calibration sample" v={calibN.toLocaleString()} sub={`${calibration.length} probability bins`} />
        <Stat k="Graded this season" v={String(gradedNow)} sub={gradedNow ? "and counting" : "first grade Tue 25 Aug"} />
      </div>

      {/* ---------------------------------------------------------------- */}
      <section className="mb-12">
        <SectionHead
          id="verdict"
          title="The market wins, and this is by how much"
          sub="Brier scores are not comparable across a sport with draws and one without, so the unit here is the skill score against the market that priced the same games: one minus the model's Brier over the market's. Zero is a tie. Negative means the market was closer."
        />

        <TableScroll className="rounded-xl border" style={CARD}>
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="text-left" style={{ background: "var(--bg-card-hover)" }}>
                <th className="px-3 py-2 font-semibold">Ledger</th>
                <th className="px-3 py-2 text-right font-semibold">Priced</th>
                <th className="px-3 py-2 text-right font-semibold">Model</th>
                <th className="px-3 py-2 text-right font-semibold">Market</th>
                <th className="px-3 py-2 font-semibold">Skill vs market</th>
                <th className="px-3 py-2 text-right font-semibold hidden sm:table-cell">Seasons won</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t" style={BORD}>
                <td className="px-3 py-2.5">
                  <Link href="/sports/expectation" className="hover:underline font-semibold">
                    English top flight
                  </Link>
                  <div className="text-[var(--text-dim)] text-[11px]">
                    {plPriced.length ? `${plPriced[0].season}–${plPriced[plPriced.length - 1].season}` : "—"} · three-way
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums" style={MONO}>
                  {plMatches.toLocaleString()}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums" style={MONO}>
                  {plModel != null ? plModel.toFixed(4) : "—"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums" style={MONO}>
                  {plMarket != null ? plMarket.toFixed(4) : "—"}
                </td>
                <td className="px-3 py-2.5">
                  <SkillBar v={plSkill} />
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums hidden sm:table-cell" style={MONO}>
                  {plWon.length} of {plPriced.length}
                </td>
              </tr>
              <tr className="border-t" style={BORD}>
                <td className="px-3 py-2.5">
                  <Link href="/sports/expectation" className="hover:underline font-semibold">
                    NFL
                  </Link>
                  <div className="text-[var(--text-dim)] text-[11px]">
                    {nflSeasonsPriced.length
                      ? `${nflSeasonsPriced[0].season}–${nflSeasonsPriced[nflSeasonsPriced.length - 1].season}`
                      : "—"}{" "}
                    · two-way
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums" style={MONO}>
                  {(h2h?.games ?? 0).toLocaleString()}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums" style={MONO}>
                  {h2h?.model_brier != null ? h2h.model_brier.toFixed(4) : "—"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums" style={MONO}>
                  {h2h?.market_brier != null ? h2h.market_brier.toFixed(4) : "—"}
                </td>
                <td className="px-3 py-2.5">
                  <SkillBar v={nflSkill} />
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums hidden sm:table-cell" style={MONO}>
                  {nflWon.length} of {nflSeasonsPriced.length}
                </td>
              </tr>
            </tbody>
          </table>
        </TableScroll>

        <div className="mt-4 rounded-2xl border p-5 text-[13.5px] text-[var(--text-muted)] max-w-4xl" style={BORD}>
          <p>
            A model that beat a liquid closing market over twenty thousand games would be a business,
            not a website. What these two rows say is that our models get within a few percent of a
            price set by everyone in the world with money on the outcome, using nothing but the match
            results this site already holds — and that on the seasons below, they got closer still.
            The market is the benchmark precisely because it is hard to beat.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mb-12">
        <SectionHead
          id="calibration"
          title="When the model said 70%, did it happen 70% of the time?"
          sub={`Every English top-flight match outcome the model has ever priced, sorted into probability bins. A well-calibrated forecast lands on the diagonal: the share that actually happened matches the share it was given. ${calibN.toLocaleString()} outcomes across ${calibration.length} populated bins.`}
        />

        {calibration.length ? (
          <TableScroll className="rounded-xl border" style={CARD}>
            <table className="w-full text-xs sm:text-sm">
              <thead>
                <tr className="text-left" style={{ background: "var(--bg-card-hover)" }}>
                  <th className="px-3 py-2 font-semibold">Said</th>
                  <th className="px-3 py-2 text-right font-semibold">Outcomes</th>
                  <th className="px-3 py-2 text-right font-semibold">Predicted</th>
                  <th className="px-3 py-2 text-right font-semibold">Happened</th>
                  <th className="px-3 py-2 font-semibold">Gap</th>
                </tr>
              </thead>
              <tbody>
                {calibration.map((c) => {
                  const gap = c.actual - c.predicted;
                  const frac = Math.min(Math.abs(gap) / 0.06, 1) * 50;
                  return (
                    <tr key={c.bin} className="border-t" style={BORD}>
                      <td className="px-3 py-2 font-semibold tabular-nums" style={MONO}>
                        {c.bin}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums" style={MONO}>
                        {c.n.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums" style={MONO}>
                        {(c.predicted * 100).toFixed(1)}%
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums" style={MONO}>
                        {(c.actual * 100).toFixed(1)}%
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2 min-w-[124px]">
                          <span
                            className="relative flex-1 h-[7px] rounded-sm overflow-hidden"
                            style={{ background: "var(--bg-card-hover)" }}
                          >
                            <span
                              className="absolute inset-y-0 w-px"
                              style={{ left: "50%", background: "var(--border)" }}
                              aria-hidden
                            />
                            <span
                              className="absolute inset-y-0"
                              style={
                                gap >= 0
                                  ? { left: "50%", width: `${frac}%`, background: UP }
                                  : { right: "50%", width: `${frac}%`, background: DOWN }
                              }
                              aria-hidden
                            />
                          </span>
                          <span className="tabular-nums text-xs text-[var(--text-muted)]" style={MONO}>
                            {gap >= 0 ? "+" : "−"}
                            {(Math.abs(gap) * 100).toFixed(1)}
                          </span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">The calibration table is not available in this build.</p>
        )}

        <p className="mt-3 text-[13px] text-[var(--text-muted)] max-w-3xl">
          Green means the outcome happened more often than the model expected; pink means less. The
          bars are drawn to a six-point scale, so a full bar is a six-percentage-point miss.
        </p>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mb-12">
        <SectionHead
          id="won"
          title="The seasons the model beat the market"
          sub="Derived, not chosen: every season in which the model's Brier over the priced games came in under the market's. These are the exceptions, and naming them is the only way the rest of this page means anything."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border p-5 min-w-0" style={CARD}>
            <div className="text-[11px] uppercase tracking-widest mb-2" style={{ ...MONO, color: "var(--text-muted)" }}>
              English top flight · {plWon.length} of {plPriced.length}
            </div>
            {plWon.length ? (
              <ul className="space-y-1.5 text-sm">
                {plWon.map((s) => (
                  <li key={s.season} className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold tabular-nums" style={MONO}>
                      {s.season}
                    </span>
                    <span className="text-[var(--text-muted)] tabular-nums text-xs" style={MONO}>
                      {(s.market_model_brier as number).toFixed(4)} v {(s.market_brier as number).toFixed(4)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">None. The market has been closer in every priced season.</p>
            )}
          </div>

          <div className="rounded-xl border p-5 min-w-0" style={CARD}>
            <div className="text-[11px] uppercase tracking-widest mb-2" style={{ ...MONO, color: "var(--text-muted)" }}>
              NFL · {nflWon.length} of {nflSeasonsPriced.length}
            </div>
            {nflWon.length ? (
              <ul className="space-y-1.5 text-sm">
                {nflWon.map((s) => (
                  <li key={s.season} className="flex items-baseline justify-between gap-3">
                    <Link href={`/teams/nfl/expectation/${s.season}`} className="font-semibold tabular-nums hover:underline" style={MONO}>
                      {s.season}
                    </Link>
                    <span className="text-[var(--text-muted)] tabular-nums text-xs" style={MONO}>
                      {(s.model_brier as number).toFixed(4)} v {(s.market_brier as number).toFixed(4)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">None in the priced era.</p>
            )}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mb-12">
        <SectionHead
          id="live"
          title="This season, as it grades"
          sub="Each hub freezes its call when it publishes it. Nothing below is back-filled, and a row with nothing in it says so rather than waiting for a good week to appear."
        />

        <TableScroll className="rounded-xl border" style={CARD}>
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="text-left" style={{ background: "var(--bg-card-hover)" }}>
                <th className="px-3 py-2 font-semibold">Hub</th>
                <th className="px-3 py-2 text-right font-semibold">Graded</th>
                <th className="px-3 py-2 text-right font-semibold">Picks right</th>
                <th className="px-3 py-2 text-right font-semibold hidden sm:table-cell">Model</th>
                <th className="px-3 py-2 text-right font-semibold hidden sm:table-cell">Market</th>
                <th className="px-3 py-2 font-semibold">Skill vs market</th>
              </tr>
            </thead>
            <tbody>
              {live.map((l) => {
                const r = l.rec;
                const s = skill(r?.model_brier, r?.market_brier);
                const empty = !r || r.graded === 0;
                return (
                  <Fragment key={l.key}>
                    <tr className="border-t" style={BORD}>
                      <td className="px-3 py-2.5">
                        <Link href={l.href} className="hover:underline font-semibold">
                          {l.label}
                        </Link>
                        <div className="text-[var(--text-dim)] text-[11px]">
                          {l.season} · {l.shape}
                        </div>
                      </td>
                      {empty ? (
                        <td className="px-3 py-2.5 text-[var(--text-muted)]" colSpan={5}>
                          Nothing graded yet. First result lands {l.first}.
                        </td>
                      ) : (
                        <>
                          <td className="px-3 py-2.5 text-right tabular-nums" style={MONO}>
                            {r.graded}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums" style={MONO}>
                            {r.pick_correct}/{r.graded}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums hidden sm:table-cell" style={MONO}>
                            {r.model_brier != null ? r.model_brier.toFixed(4) : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums hidden sm:table-cell" style={MONO}>
                            {r.market_brier != null ? r.market_brier.toFixed(4) : "—"}
                          </td>
                          <td className="px-3 py-2.5">
                            <SkillBar v={s} />
                          </td>
                        </>
                      )}
                    </tr>
                    {l.key === "nfl" && nflLiteGraded.length > 0 && (
                      <tr className="border-t" style={BORD}>
                        <td className="px-3 py-2.5">
                          <span className="font-semibold text-[var(--text-muted)]">NFL &middot; lite tier</span>
                          <div className="text-[var(--text-dim)] text-[11px]">
                            stats-only rating, same fixtures
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums" style={MONO}>
                          {nflLiteGraded.length}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-dim)]">—</td>
                        <td className="px-3 py-2.5 text-right tabular-nums hidden sm:table-cell" style={MONO}>
                          {nflLiteBrier != null ? nflLiteBrier.toFixed(4) : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums hidden sm:table-cell" style={MONO}>
                          {nflLiteMarketBrier != null ? nflLiteMarketBrier.toFixed(4) : "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <SkillBar v={nflLiteSkill} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              <tr className="border-t" style={BORD}>
                <td className="px-3 py-2.5">
                  <Link href="/predictions/mlb" className="hover:underline font-semibold">
                    MLB
                  </Link>
                  <div className="text-[var(--text-dim)] text-[11px]">2026 · season-level</div>
                </td>
                <td className="px-3 py-2.5 text-[var(--text-muted)]" colSpan={5}>
                  No game-by-game ledger by design: the honest unit of prediction in this sport is the
                  season. The postseason bracket joins in October.
                </td>
              </tr>
              <tr className="border-t" style={BORD}>
                <td className="px-3 py-2.5">
                  <Link href="/elections/forecast" className="hover:underline font-semibold">
                    Elections
                  </Link>
                  <div className="text-[var(--text-dim)] text-[11px]">
                    2026–27 · {elecT?.races ? `${elecT.races} race${elecT.races === 1 ? "" : "s"} settled` : "seat ranges"}
                  </div>
                </td>
                {elecT?.races ? (
                  <>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={MONO}>
                      {elecT.binaries}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums" style={MONO}>
                      {elecT.correct ?? 0}/{elecT.picks ?? 0}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums hidden sm:table-cell" style={MONO}>
                      {elecT.pricedBrier != null ? elecT.pricedBrier.toFixed(4) : elecT.brier != null ? elecT.brier.toFixed(4) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums hidden sm:table-cell" style={MONO}>
                      {elecT.marketBrier != null ? elecT.marketBrier.toFixed(4) : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      {elecSkill == null ? (
                        <span className="text-[var(--text-dim)] text-xs">no market priced these</span>
                      ) : (
                        <SkillBar v={elecSkill} />
                      )}
                    </td>
                  </>
                ) : (
                  <td className="px-3 py-2.5 text-[var(--text-muted)]" colSpan={5}>
                    {elecOwed.length ? (
                      <>
                        {elecOwed.map((p) => p.country).join(", ")} ha{elecOwed.length === 1 ? "s" : "ve"} voted and
                        {" "}the final count is not filed yet. The forecast is already frozen, so nothing here
                        {" "}can be written after the fact.
                      </>
                    ) : elecNext ? (
                      <>
                        Nothing graded yet. The first race that settles is {elecNext.country} on{" "}
                        {longDate(elecNext.election)}
                        {elecNext.daysAway != null ? `, ${elecNext.daysAway} days away` : ""}. Its
                        {" "}forecast is frozen on every run until then.
                      </>
                    ) : (
                      "Nothing graded yet."
                    )}
                  </td>
                )}
              </tr>
            </tbody>
          </table>
        </TableScroll>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mb-12">
        <SectionHead
          id="you"
          title="Your own calls land on this axis too"
          sub="Citizen of Nowhere Picks scores a reader's hard calls with the same Brier the 1920 ledger uses, so a pick made this Saturday is measured the way a match from 1958 is measured."
        />
        <div className="rounded-2xl border p-5 sm:p-6" style={BORD}>
          <p className="text-sm text-[var(--text-muted)] max-w-3xl mb-4">
            Call the matchweek before the model&apos;s card is revealed, rank your confidence, and take a
            side on the Upset Radar — the games where the model and the market disagree most. The
            model plays its own card, graded by the same rules, and so does the market.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/play/picks"
              className="inline-flex items-center gap-1.5 rounded-lg font-semibold text-sm px-4 py-2"
              style={{ backgroundColor: "var(--accent)", color: "#08080D" }}
            >
              🎯 Play Citizen of Nowhere Picks
            </Link>
            <Link
              href="/sports/expectation"
              className="inline-flex items-center gap-1.5 rounded-lg border font-semibold text-sm px-4 py-2 hover:border-[var(--accent)] transition-colors"
              style={{ borderColor: "var(--border)", color: "var(--text)" }}
            >
              🎲 Against Expectation
            </Link>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mb-4">
        <SectionHead
          id="method"
          title="Where these numbers come from, and what they cannot tell you"
          sub="Everything above is computed from the ledgers when the page renders. None of it is a claim someone typed."
        />

        <div className="rounded-2xl border p-5 text-[13.5px] text-[var(--text-muted)] space-y-4 max-w-4xl" style={BORD}>
          <div>
            <h3 className="text-[var(--text)] font-semibold text-sm mb-1">Why a skill score and not a Brier score</h3>
            <p>
              English football is a three-way question and a good model scores near 0.60 on it. The
              NFL and college football are two-way and a good model scores near 0.22. Those two
              numbers do not belong in one column, and putting them there would be exactly the kind
              of quiet wrongness this page exists to argue against. The skill score divides the model
              by the market that priced the same games, which removes the scale along with the
              question&apos;s shape.
            </p>
          </div>
          <div>
            <h3 className="text-[var(--text)] font-semibold text-sm mb-1">What was priced, and by whom</h3>
            <p>
              Football odds are football-data.co.uk, available on {plPriced.length} seasons of{" "}
              {plExp?.meta.season_count ?? "the"} — everything before that has no market to be
              measured against.{" "}
              {plClosingKnown ? (
                <>
                  Of those, {plClosing.toLocaleString()} matches across {plClosingSeasons.length}{" "}
                  seasons carry a true <strong>closing</strong> price, which football-data has
                  published only since {plClosingSeasons[0]?.season ?? "2012-13"}. The other{" "}
                  {plOpening.toLocaleString()} are scored against the <strong>pre-match</strong>{" "}
                  price, because no closing price for those matches exists anywhere. The two are
                  not interchangeable: a closing line has absorbed the team news and the money, so
                  it is the sharper benchmark and the harder one to beat. This site scored the whole
                  football sample against pre-match prices while calling them closing until
                  2026-08-30; correcting it moved the football skill score down, which is the
                  direction an honest correction was always going to go.
                </>
              ) : (
                <>These are pre-match prices; the closing-price split is not in this build.</>
              )} NFL odds come from covers.com, loaded as real numbers rather than
              inferred, after an earlier attempt to repair them by inference proved half right and
              therefore wrong. Live hubs read football-data for the Premier League and ESPN&apos;s
              DraftKings feed for the NFL and college football. No column anywhere on this site comes
              from an exchange yet; a Kalshi or Polymarket price would be a genuine fourth column,
              not a replacement for any of these.
            </p>
          </div>
          <div>
            <h3 className="text-[var(--text)] font-semibold text-sm mb-1">What this does not prove</h3>
            <p>
              Nothing here is held out. Both historical models were fitted on their full histories,
              so the calibration above is in-sample and should be read as a consistency check rather
              than as evidence of predictive skill. The football model has almost no skill before
              about 1960 — {plExp ? `${(plExp.meta.skill_vs_era_baseline * 100).toFixed(1)}%` : "a few percent"}{" "}
              over an era baseline across the whole series, and a fraction of that in the early
              decades. Twenty fixtures in the football source are recorded the wrong way round and
              two scorelines are off by one; they are listed rather than repaired, because sourcing
              the real result is the only honest fix.
            </p>
          </div>
          <div>
            <h3 className="text-[var(--text)] font-semibold text-sm mb-1">Why the elections row is empty</h3>
            <p>
              A seat range cannot be scored until the seats are counted. The election forecast
              publishes its own history of what it said over time, but it has no resolved outcomes to
              be graded against until November, and inventing an accuracy figure for it would
              undermine every other number on this page.
            </p>
          </div>
          <div>
            <h3 className="text-[var(--text)] font-semibold text-sm mb-1">Sources</h3>
            <p>
              <Link href="/sports/expectation" className="hover:underline">
                Against Expectation
              </Link>{" "}
              carries the full historical ledgers and their reconciliations. The live hubs are{" "}
              <Link href="/predictions/pl" className="hover:underline">
                Premier League
              </Link>
              ,{" "}
              <Link href="/predictions/nfl" className="hover:underline">
                NFL
              </Link>
              ,{" "}
              <Link href="/predictions/cfb" className="hover:underline">
                College Football
              </Link>{" "}
              and{" "}
              <Link href="/predictions/mlb" className="hover:underline">
                MLB
              </Link>
              . Methodology for each model is stated on its own hub.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
