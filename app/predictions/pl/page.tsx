import type { Metadata } from "next";
import Link from "next/link";
import { getAllClubSlugs } from "@/lib/football";
import {
  getPlSim,
  getPlPredictions,
  getPlSimHistory,
  type PlPredictionEntry,
  type PlSimRow,
} from "@/lib/plSim";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { Disclosure } from "@/app/_shared/Disclosure";
import { SectionHead } from "@/app/_shared/SectionHead";
import { ResponsiveTable } from "@/app/teams/_shared/ResponsiveTable";
import { PredCrumbs, PredHeader, SourcesCard, MONO, CARD, SMCOL } from "../_shared/ui";
import PredictionsNav from "../_shared/PredictionsNav";
import { FixtureRow, TeamOddsRow } from "../_shared/rows";
import { Band } from "../_shared/Band";
import { Delta } from "../_shared/Delta";
import { Sparkline } from "../_shared/Sparkline";
import { deltaSince, series } from "../_shared/deltas";
import { DataBar } from "@/app/_shared/DataBar";

// Premier League 2026-27 prediction hub: the first live league hub on
// /predictions. Season odds from pl-sim.json (site data blended with market
// odds), week-over-week deltas/sparklines from pl-sim-history.json,
// fixture-by-fixture predictions + the season-long graded ledger from
// pl-predictions.json; all three re-run without a build via lib/plSim's ISR
// read. Every points-v3 field (bands, percentile ranges) is optional - the
// page renders identically to the poisson-v2 build when a field is absent.
// PL has no tiers: the market blend is a single number, not a separate run.
// Shell brought into line with app/predictions/nfl/page.tsx 2026-09-03.

export const revalidate = 21600;

const BORD = { borderColor: "var(--border)" } as const;
const GH_BASE =
  "https://raw.githubusercontent.com/ashwin-desikan/metro-power-rankings/main/public/data";

/** Sim slug -> /teams/football/<slug>, only when that club page exists.
 *  pl-sim.json slugs are generated from club names by the model script, while
 *  the routes come from the football workbook; a club that does not resolve
 *  renders as plain text rather than a link to a 404 (a newly promoted side
 *  is the likely case). */
function clubLink(slugs: Set<string>, slug: string): string | null {
  return slugs.has(slug) ? `/teams/football/${slug}` : null;
}

function ClubLabel({ name, href }: { name: string; href: string | null }) {
  return href ? (
    <Link href={href} className="font-semibold hover:text-[var(--accent)] transition-colors">{name}</Link>
  ) : (
    <span className="font-semibold">{name}</span>
  );
}

const PATH = "/predictions/pl";
const TITLE = "Premier League 2026-27 Predictions";
const DESC =
  "Title, top-five and relegation odds for every Premier League club from 20,000 simulated seasons blending this site's own data with market odds, plus fixture-by-fixture predictions tracked against results all season.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { images: [{ url: "/og-default.png", width: 1200, height: 630 }], title: `${TITLE} | ${SITE_NAME}`, description: DESC, url: `${BASE_URL}${PATH}`, type: "website" },
  twitter: { images: ["/og-default.png"], card: "summary_large_image", title: `${TITLE} | ${SITE_NAME}`, description: DESC },
};

function pct(x: number): string {
  if (x >= 99.95) return ">99.9%";
  if (x > 0 && x < 0.05) return "<0.1%";
  return `${Math.round(x * 10) / 10}%`;
}

function ppct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

function fmtDate(iso: string): string {
  try {
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  } catch {
    return iso;
  }
}

const PICK_LABEL: Record<string, (e: PlPredictionEntry) => string> = {
  H: (e) => e.home,
  D: () => "Draw",
  A: (e) => e.away,
};

export default async function PlPredictionsPage() {
  const [sim, preds, history] = await Promise.all([getPlSim(), getPlPredictions(), getPlSimHistory()]);
  const clubSlugs = new Set(getAllClubSlugs());
  const rows = sim?.table ?? [];
  const meta = sim?.meta ?? null;
  const maxTitle = rows.length ? rows[0].p_title || 1 : 1;
  const ledger = preds?.ledger ?? [];
  const upcoming = ledger.filter((e) => !e.result);
  const graded = ledger.filter((e) => e.result).slice(-10).reverse();
  const rec = preds?.record ?? null;
  const anyMarket = upcoming.some((e) => e.market);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PredCrumbs tab="Premier League" />
      <PredHeader
        emoji="⚽"
        title="Premier League 2026-27"
        live
        sub={
          <>
            {meta ? `${meta.sims.toLocaleString()} simulated seasons` : "Thousands of simulated seasons"} from a
            model that blends this site&apos;s own season data with market odds, replays the real results as they
            land, and predicts every fixture - then keeps score on itself all season.
          </>
        }
        stamp={
          meta
            ? `${meta.model} · updated ${meta.generated_at}${meta.matches_played > 0 ? ` · after ${meta.matches_played} matches` : " · preseason"}`
            : null
        }
      />
      <PredictionsNav />

      {!sim && (
        <section className="rounded-2xl border p-6 mb-8" style={BORD}>
          <p className="text-sm text-[var(--text-muted)]">
            The simulation data has not loaded. It lives at <code>/data/pl-sim.json</code> and is rebuilt by
            the prediction pipeline; try again shortly.
          </p>
        </section>
      )}

      {rows.length > 0 && (
        <>
          {/* Title odds board */}
          <section id="title" className="mb-10 rounded-2xl border p-5 sm:p-6" style={BORD}>
            <h2 className="text-2xl font-bold mb-1">The title race</h2>
            <p className="text-sm text-[var(--text-muted)] mb-4">
              Share of simulated seasons each club finishes first.
            </p>
            <div className="grid gap-2">
              {rows.filter((r) => r.p_title >= 0.1).map((r, i) => (
                <div key={r.slug} className="flex items-center gap-3">
                  <span className="w-6 text-right text-[13px]" style={{ ...MONO, color: "var(--text-dim)" }}>{i + 1}</span>
                  <span className="w-44 sm:w-56 text-[14.5px] inline-flex items-center gap-1.5 min-w-0">
                    <span className="truncate"><ClubLabel name={r.name} href={clubLink(clubSlugs, r.slug)} /></span>
                    <span className="hidden sm:inline-block flex-shrink-0" style={{ color: "var(--accent)" }}>
                      <Sparkline points={series(history, r.slug, "title")} />
                    </span>
                  </span>
                  <span className="flex-1 h-2 rounded" style={{ background: "var(--bg-card)" }}>
                    <span
                      className="block h-2 rounded"
                      style={{ background: "var(--accent)", opacity: 0.75, width: `${Math.max(1, (r.p_title / maxTitle) * 100)}%` }}
                    />
                  </span>
                  <span className="w-14 flex flex-col items-end">
                    <span className="text-[13px] font-bold" style={{ ...MONO, color: "var(--accent)" }}>{pct(r.p_title)}</span>
                    <Delta value={deltaSince(history, r.slug, "title", 7)} unit="pp" />
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Relegation odds board */}
          <section id="relegation" className="mb-10 rounded-2xl border p-5 sm:p-6" style={BORD}>
            <h2 className="text-2xl font-bold mb-1">The relegation battle</h2>
            <p className="text-sm text-[var(--text-muted)] mb-4">
              Share of simulated seasons each club finishes in the bottom three.
            </p>
            <div className="grid gap-2">
              {(() => {
                const releg = rows.slice().sort((a, b) => b.p_releg - a.p_releg).filter((r) => r.p_releg >= 1);
                const maxReleg = releg[0]?.p_releg || 1;
                return releg.map((r, i) => (
                  <div key={r.slug} className="flex items-center gap-3">
                    <span className="w-6 text-right text-[13px]" style={{ ...MONO, color: "var(--text-dim)" }}>{i + 1}</span>
                    <span className="w-44 sm:w-56 text-[14.5px] truncate">
                      <ClubLabel name={r.name} href={clubLink(clubSlugs, r.slug)} />
                    </span>
                    <span className="flex-1 h-2 rounded" style={{ background: "var(--bg-card)" }}>
                      <span
                        className="block h-2 rounded"
                        style={{ background: "#E2628B", opacity: 0.75, width: `${Math.max(1, (r.p_releg / maxReleg) * 100)}%` }}
                      />
                    </span>
                    <span className="w-14 flex flex-col items-end">
                      <span className="text-[13px] font-bold" style={{ ...MONO, color: "#E2628B" }}>{pct(r.p_releg)}</span>
                      <Delta value={deltaSince(history, r.slug, "rel", 7)} unit="pp" />
                    </span>
                  </div>
                ));
              })()}
            </div>
          </section>

          {/* Next fixtures */}
          {upcoming.length > 0 && (
            <section id="fixtures" className="mb-10">
              <SectionHead
                id="fixtures-head"
                title="The next fixtures, called"
                sub="Win-draw-win probabilities for the upcoming round."
                more={
                  anyMarket
                    ? "The pick blends the model and the betting market 50/50. Every prediction is frozen when first published and graded against the real result below."
                    : "Market odds join each column once the books post them. Every prediction is frozen when first published and graded against the real result below."
                }
              />
              <ResponsiveTable
                variant="list"
                mobileNoun="fixtures"
                className="rounded-xl border"
                style={BORD}
                mobileRows={upcoming.map((e) => (
                  <FixtureRow
                    key={`${e.date}-${e.home_slug}`}
                    team1={e.home}
                    sep="v"
                    team2={e.away}
                    kickoff={fmtDate(e.date)}
                    modelPct={`Model ${ppct(e.model.pH)}/${ppct(e.model.pD)}/${ppct(e.model.pA)}`}
                    marketPct={anyMarket ? (e.market ? `Market ${ppct(e.market.pH)}/${ppct(e.market.pD)}/${ppct(e.market.pA)}` : "Market —") : undefined}
                    pick={PICK_LABEL[e.pick](e)}
                  />
                ))}
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                      <th className="px-3 py-2 font-semibold">Date</th>
                      <th className="px-3 py-2 font-semibold">Fixture</th>
                      <th className="px-3 py-2 text-right font-semibold">Home</th>
                      <th className="px-3 py-2 text-right font-semibold">Draw</th>
                      <th className="px-3 py-2 text-right font-semibold">Away</th>
                      {anyMarket && <th className="px-3 py-2 text-right font-semibold">Market (H/D/A)</th>}
                      <th className="px-3 py-2 font-semibold">Pick</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcoming.map((e) => (
                      <tr key={`${e.date}-${e.home_slug}`} className="border-t" style={BORD}>
                        <td className="px-3 py-2 whitespace-nowrap" style={{ ...MONO, color: "var(--text-muted)" }}>{fmtDate(e.date)}</td>
                        <td className="px-3 py-2 font-semibold whitespace-nowrap">{e.home} <span style={{ color: "var(--text-dim)" }}>v</span> {e.away}</td>
                        <td className="px-3 py-2 text-right" style={MONO}>{ppct(e.model.pH)}</td>
                        <td className="px-3 py-2 text-right" style={MONO}>{ppct(e.model.pD)}</td>
                        <td className="px-3 py-2 text-right" style={MONO}>{ppct(e.model.pA)}</td>
                        {anyMarket && (
                          <td className="px-3 py-2 text-right whitespace-nowrap" style={{ ...MONO, color: "var(--text-muted)" }}>
                            {e.market ? `${ppct(e.market.pH)} / ${ppct(e.market.pD)} / ${ppct(e.market.pA)}` : "—"}
                          </td>
                        )}
                        <td className="px-3 py-2 font-semibold" style={{ color: "var(--accent)" }}>{PICK_LABEL[e.pick](e)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ResponsiveTable>
            </section>
          )}

          {/* Tracking */}
          <section id="record" className="mb-10 rounded-2xl border p-5 sm:p-6" style={BORD}>
            <h2 className="text-2xl font-bold mb-1">How the model is doing</h2>
            {rec && rec.graded > 0 ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3 my-4">
                  <div className="rounded-xl border p-4" style={CARD}>
                    <div className="text-[11px] uppercase tracking-widest mb-1" style={{ ...MONO, color: "var(--text-muted)" }}>Picks</div>
                    <div className="text-2xl font-bold" style={MONO}>{rec.pick_correct}/{rec.graded}</div>
                    <div className="text-xs text-[var(--text-muted)]">match calls correct</div>
                  </div>
                  <div className="rounded-xl border p-4" style={CARD}>
                    <div className="text-[11px] uppercase tracking-widest mb-1" style={{ ...MONO, color: "var(--text-muted)" }}>Model Brier</div>
                    <div className="text-2xl font-bold" style={MONO}>{rec.model_brier ?? "—"}</div>
                    <div className="text-xs text-[var(--text-muted)]">lower is better; 0.667 = guessing</div>
                  </div>
                  <div className="rounded-xl border p-4" style={CARD}>
                    <div className="text-[11px] uppercase tracking-widest mb-1" style={{ ...MONO, color: "var(--text-muted)" }}>Market Brier</div>
                    <div className="text-2xl font-bold" style={MONO}>{rec.market_brier ?? "—"}</div>
                    <div className="text-xs text-[var(--text-muted)]">the benchmark to beat{rec.market_graded ? ` (${rec.market_graded} priced)` : ""}</div>
                  </div>
                </div>
                {graded.length > 0 && (
                  <ResponsiveTable
                    variant="list"
                    mobileNoun="fixtures"
                    className="rounded-xl border"
                    style={BORD}
                    mobileRows={graded.map((e) => (
                      <FixtureRow
                        key={`${e.date}-${e.home_slug}`}
                        team1={e.home}
                        sep="v"
                        team2={e.away}
                        kickoff={<>Pick: {PICK_LABEL[e.pick](e)} · Brier {e.model_brier?.toFixed(3) ?? "—"}</>}
                        graded
                        score={e.result === "H" ? e.home : e.result === "A" ? e.away : "Draw"}
                        correct={!!e.pick_correct}
                      />
                    ))}
                  >
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                          <th className="px-3 py-2 font-semibold">Date</th>
                          <th className="px-3 py-2 font-semibold">Fixture</th>
                          <th className="px-3 py-2 font-semibold">Our pick</th>
                          <th className="px-3 py-2 font-semibold">Result</th>
                          <th className="px-3 py-2 text-right font-semibold">Brier</th>
                        </tr>
                      </thead>
                      <tbody>
                        {graded.map((e) => (
                          <tr key={`${e.date}-${e.home_slug}`} className="border-t" style={BORD}>
                            <td className="px-3 py-2 whitespace-nowrap" style={{ ...MONO, color: "var(--text-muted)" }}>{fmtDate(e.date)}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{e.home} <span style={{ color: "var(--text-dim)" }}>v</span> {e.away}</td>
                            <td className="px-3 py-2" style={{ color: e.pick_correct ? "var(--accent)" : "#E2628B" }}>
                              {PICK_LABEL[e.pick](e)} {e.pick_correct ? "✓" : "✕"}
                            </td>
                            <td className="px-3 py-2" style={MONO}>{e.result === "H" ? e.home : e.result === "A" ? e.away : "Draw"}</td>
                            <td className="px-3 py-2 text-right" style={MONO}>{e.model_brier?.toFixed(3) ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ResponsiveTable>
                )}
              </>
            ) : (
              <p className="text-sm text-[var(--text-muted)] max-w-3xl">
                Every fixture prediction above is frozen the moment it is published. Once the season kicks
                off, this section keeps the running score: how many picks landed, and the model&apos;s Brier
                score against the betting market&apos;s - in public, win or lose.
              </p>
            )}
          </section>

          {/* Full table */}
          <section id="table" className="mb-10">
            <SectionHead
              id="table-head"
              title="Every club, every outcome"
              sub="Expected points, finishing range and odds for each landing spot."
              more="The title, the top four (automatic Champions League), the top five/seven (Europe) and the bottom three. &ldquo;Finish&rdquo; is the median simulated position with the 5th-95th percentile range."
            />
            <ResponsiveTable
              variant="list"
              mobileNoun="clubs"
              className="rounded-xl border"
              style={BORD}
              mobileRows={rows.map((r) => (
                <TeamOddsRow
                  key={r.slug}
                  name={<ClubLabel name={r.name} href={clubLink(clubSlugs, r.slug)} />}
                  band={r.band ? <Band band={r.band} /> : null}
                  right={r.p_top4 != null ? pct(r.p_top4) : "—"}
                  metricLabel="top 4"
                  rightSub={`xPts ${r.exp_pts.toFixed(1)}${r.pts_p10 != null && r.pts_p90 != null ? ` (${r.pts_p10}-${r.pts_p90})` : ""}`}
                />
              ))}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                    <th className="px-3 py-2 font-semibold">Club</th>
                    <th className="px-3 py-2 text-right font-semibold">xPts</th>
                    <th className="px-3 py-2 text-right font-semibold">Finish</th>
                    <th className="px-3 py-2 text-right font-semibold">Title</th>
                    <th className="px-3 py-2 text-right font-semibold">Top 4</th>
                    <th className={`px-3 py-2 text-right font-semibold ${SMCOL}`}>Top 5</th>
                    <th className={`px-3 py-2 text-right font-semibold ${SMCOL}`}>Top 7</th>
                    <th className="px-3 py-2 text-right font-semibold">Relegated</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: PlSimRow) => (
                    <tr key={r.slug} className="border-t" style={BORD}>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <ClubLabel name={r.name} href={clubLink(clubSlugs, r.slug)} />
                        {r.band && (
                          <span className="hidden xl:block mt-0.5">
                            <Band band={r.band} />
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap" style={MONO}>
                        {r.exp_pts.toFixed(1)}
                        {r.pts_p10 != null && r.pts_p90 != null && (
                          <span className="block text-[10px] leading-tight" style={{ color: "var(--text-dim)" }}>
                            ({r.pts_p10}–{r.pts_p90})
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap" style={MONO}>
                        {r.pos.p50}
                        <span className="block text-[10px] leading-tight" style={{ color: "var(--text-dim)" }}>
                          ({r.pos.p5}-{r.pos.p95})
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap" style={MONO}>
                        <DataBar v={r.p_title} max={maxTitle} dp={1} suffix="%" color="var(--seq-4)" width={90} />
                        <span className="block text-[10px] leading-tight">
                          <Delta value={deltaSince(history, r.slug, "title", 7)} unit="pp" />
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap" style={MONO}>
                        {r.p_top4 != null ? pct(r.p_top4) : "—"}
                        {r.p_top4 != null && (
                          <span className="block text-[10px] leading-tight">
                            <Delta value={deltaSince(history, r.slug, "top4", 7)} unit="pp" />
                          </span>
                        )}
                      </td>
                      <td className={`px-3 py-2 text-right whitespace-nowrap ${SMCOL}`} style={MONO}>{pct(r.p_top5)}</td>
                      <td className={`px-3 py-2 text-right whitespace-nowrap ${SMCOL}`} style={MONO}>{pct(r.p_top7)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap" style={{ ...MONO, color: r.p_releg >= 25 ? "#E2628B" : "var(--text-muted)" }}>
                        {pct(r.p_releg)}
                        <span className="block text-[10px] leading-tight">
                          <Delta value={deltaSince(history, r.slug, "rel", 7)} unit="pp" />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ResponsiveTable>
            <p className="text-[13px] text-[var(--text-muted)] mt-4">
              Get the data:{" "}
              <Link href="/predictions/pl/table.csv" className="hover:underline">season table as CSV</Link>
              {" · "}
              <a href={`${GH_BASE}/pl-sim.json`} className="hover:underline" target="_blank" rel="noreferrer">
                raw JSON on GitHub
              </a>
            </p>
          </section>

          {/* Citizen of Nowhere Picks */}
          <section className="mb-10 rounded-2xl border p-5 sm:p-6" style={BORD}>
            <h2 className="text-2xl font-bold mb-2"><span aria-hidden>&#127919;</span> Citizen of Nowhere Picks</h2>
            <p className="text-sm text-[var(--text-muted)] max-w-3xl mb-4">
              Call every game of the matchweek blind, rank your confidence, and see whether you out-predict
              this model week after week. The model plays its own card, graded by the same rules.
            </p>
            <Link
              href="/play/picks"
              className="inline-flex items-center min-h-11 gap-1.5 rounded-lg font-semibold text-sm px-4 py-2"
              style={{ backgroundColor: "var(--accent)", color: "#08080D" }}
            >
              Play Citizen of Nowhere Picks <span aria-hidden>&rarr;</span>
            </Link>
          </section>

          {/* Sources + method */}
          {meta && (
            <SourcesCard>
              <p>
                Ratings blend this site&apos;s own club data with a market signal, replayed forward{" "}
                {meta.sims.toLocaleString()} times against the real remaining 2026-27 season. Last generated{" "}
                {meta.generated_at}
                {meta.matches_played > 0 ? `, after ${meta.matches_played} matches played` : " (preseason)"}.
                Fixture picks blend the model with the posted line and are graded against results above; the
                Brier scores on this page and on the Ledger use that same graded record.
              </p>
              <Disclosure title="How the model works" desktopOpen bodyClassName="p-4 sm:p-5" className="mt-1">
                <p className="text-[13.5px] text-[var(--text-muted)] leading-relaxed">
                  Each club&apos;s attack and defence are goal rates per game from its last three league seasons
                  ({meta.strength_seasons.join(", ")}), recency-weighted, with the current campaign&apos;s real
                  goals folded in as it plays out. The promoted clubs&apos; Championship rates are translated with
                  factors calibrated on every promoted side in this site&apos;s hub archive
                  ({meta.promoted_calibration.n} club-seasons: attack &times;{meta.promoted_calibration.att},
                  goals conceded &times;{meta.promoted_calibration.def}). On top of the site data sits a market
                  signal: de-vigged match odds ({meta.odds_source}) fitted into team ratings and blended in at
                  weight {meta.blend_market_weight}. Played matches count as real results; every remaining
                  fixture is simulated with Poisson goals (league scoring rate {meta.mu} per team-game, home
                  advantage &times;{meta.home_adv}), each simulated season drawing every club&apos;s strength from
                  a distribution (&sigma; {meta.sigma}) rather than a fixed number. Fixture picks blend model
                  and market {Math.round((preds?.meta.match_blend_weight ?? 0.5) * 100)}/{Math.round((1 - (preds?.meta.match_blend_weight ?? 0.5)) * 100)} and are graded
                  against results above. {meta.notes}
                </p>
                {meta.model.includes("v3") && (
                  <p className="text-[13.5px] text-[var(--text-muted)] leading-relaxed mt-3">
                    Uncertainty shrinks as the season does - the spread of outcomes each simulated season draws
                    from narrows week by week as fewer matches remain, and widens back out for a club the stats
                    and the market disagree about most. Each simulated season also draws one correlated
                    home-advantage error for the whole league and one for each club, rather than treating every
                    match as its own coin flip - real campaigns run hot or cold together, not independently.
                  </p>
                )}
              </Disclosure>
            </SourcesCard>
          )}
        </>
      )}
    </main>
  );
}
