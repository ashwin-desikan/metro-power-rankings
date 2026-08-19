import type { Metadata } from "next";
import Link from "next/link";
import { getCfbSim, getCfbPredictions, type CfbPredictionEntry, type CfbSimRow } from "@/lib/cfbSim";
import { getAllCfbSlugs } from "@/lib/cfb";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

// College Football 2026 prediction hub on /predictions - the CFB sibling of
// /predictions/nfl. Season odds from cfb-sim.json (the real FBS schedule, all
// ten conference title games and the 12-team straight-seeded playoff), weekly
// AP Top 25 game predictions + graded ledger from cfb-predictions.json; both
// refresh without a build via lib/cfbSim's ISR read.

export const revalidate = 21600;

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const CARD = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const PATH = "/predictions/cfb";
const TITLE = "College Football 2026 Predictions";
const DESC =
  "Playoff, conference title and national championship odds for all 138 FBS teams from simulations of the real 2026 schedule, plus weekly AP Top 25 game predictions.";

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
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

// Power 4 first (their title games decide four of the five auto-bids most
// seasons), then the Group of 5 A-Z, Independents last.
const CONF_ORDER = ["SEC", "Big Ten", "Big 12", "ACC"];
function confSort(a: string, b: string): number {
  const ia = CONF_ORDER.indexOf(a), ib = CONF_ORDER.indexOf(b);
  if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  if (a === "Independents" || b === "Independents") return a === "Independents" ? 1 : -1;
  return a.localeCompare(b);
}

/** Sim slug -> /teams/cfb/<slug>, but only when the slug actually names a
 *  tracked program page - a fact verified at render, never assumed. An
 *  unresolved school renders as plain text rather than a link to a 404. */
function cfbHref(): (slug: string | null) => string | null {
  const slugs = new Set(getAllCfbSlugs());
  return (s) => (s && slugs.has(s) ? `/teams/cfb/${s}` : null);
}

function TeamLabel({ name, href, rank }: { name: string; href: string | null; rank?: number | null }) {
  const inner = (
    <span className="inline-flex items-baseline gap-1.5 min-w-0">
      {rank ? <span className="text-[11px]" style={{ ...MONO, color: "var(--text-dim)" }}>#{rank}</span> : null}
      <span className="truncate">{name}</span>
    </span>
  );
  return href ? (
    <Link href={href} className="font-semibold hover:text-[var(--accent)] transition-colors">{inner}</Link>
  ) : (
    <span className="font-semibold">{inner}</span>
  );
}

function ConferenceTable({ rows, conference, href }: {
  rows: CfbSimRow[]; conference: string; href: (s: string | null) => string | null;
}) {
  const ts = rows.filter((r) => r.conference === conference)
    .sort((a, b) => b.p_conf - a.p_conf || b.p_playoff - a.p_playoff || b.exp_wins - a.exp_wins);
  const indep = conference === "Independents";
  return (
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left" style={{ background: "var(--bg-card)" }}>
            <th className="px-3 py-2 font-semibold">{conference}</th>
            <th className="px-3 py-2 text-right font-semibold">xW</th>
            {!indep && <th className="px-3 py-2 text-right font-semibold">Title game</th>}
            {!indep && <th className="px-3 py-2 text-right font-semibold">Conference</th>}
            <th className="px-3 py-2 text-right font-semibold">Playoff</th>
            <th className="px-3 py-2 text-right font-semibold">Natl title</th>
          </tr>
        </thead>
        <tbody>
          {ts.map((r) => (
            <tr key={r.espn_id} className="border-t" style={{ borderColor: "var(--border)" }}>
              <td className="px-3 py-2 whitespace-nowrap">
                <TeamLabel name={r.name} href={href(r.slug)} rank={r.ap_rank} />
              </td>
              <td className="px-3 py-2 text-right" style={MONO}>{r.exp_wins.toFixed(1)}</td>
              {!indep && <td className="px-3 py-2 text-right" style={MONO}>{pct(r.p_ccg)}</td>}
              {!indep && <td className="px-3 py-2 text-right" style={MONO}>{pct(r.p_conf)}</td>}
              <td className="px-3 py-2 text-right" style={MONO}>{pct(r.p_playoff)}</td>
              <td className="px-3 py-2 text-right" style={{ ...MONO, color: r.p_natty >= 3 ? "var(--accent)" : "var(--text-muted)" }}>{pct(r.p_natty)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const PICK_LABEL = (e: CfbPredictionEntry) => (e.pick === "H" ? e.home : e.away);

export default async function CfbPredictionsPage() {
  const [sim, preds] = await Promise.all([getCfbSim(), getCfbPredictions()]);
  const href = cfbHref();
  const rows = sim?.table ?? [];
  const meta = sim?.meta ?? null;
  const maxNatty = rows.length ? rows[0].p_natty || 1 : 1;
  const ledger = preds?.ledger ?? [];
  const upcoming = ledger.filter((e) => !e.result);
  const graded = ledger.filter((e) => e.result && e.result !== "T").slice(-10).reverse();
  const rec = preds?.record ?? null;
  const anyMarket = upcoming.some((e) => e.market);
  const pollLabel = preds?.meta.poll.label ?? meta?.poll.label ?? null;
  const conferences = (meta?.conferences ?? []).slice().sort(confSort);
  if (rows.some((r) => r.conference === "Independents") && !conferences.includes("Independents"))
    conferences.push("Independents");
  const byPlayoff = rows.slice().sort((a, b) => b.p_playoff - a.p_playoff);
  // The five-champion rule reserves at least one of the twelve places for a
  // Group of 5 champion (only four power conferences exist), so the race is
  // really eleven spots for the Power 4 + Notre Dame, one for the G5.
  const p4Field = byPlayoff.filter((r) => r.power4).slice(0, 14);
  const g5Field = byPlayoff.filter((r) => !r.power4).slice(0, 6);
  // The likeliest title game per conference: the two highest title-game odds.
  const ccgCards = conferences.filter((c) => c !== "Independents").map((c) => {
    const pair = rows.filter((r) => r.conference === c).sort((a, b) => b.p_ccg - a.p_ccg).slice(0, 2);
    const fav = rows.filter((r) => r.conference === c).sort((a, b) => b.p_conf - a.p_conf)[0];
    return { conference: c, pair, fav };
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <Link href="/predictions" className="hover:underline">Predictions</Link>{" / "}
        <span>College Football</span>
      </nav>

      <header className="mb-8">
        <div className="flex items-center gap-3 flex-wrap mb-2">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            <span aria-hidden>🏈</span> College Football 2026
          </h1>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#10b981" }} aria-hidden />
            <span className="text-[10px]" style={{ ...MONO, color: "#10b981" }}>LIVE</span>
          </span>
        </div>
        <p className="text-[15px] text-[var(--text-muted)] max-w-3xl">
          {meta ? `${meta.sims.toLocaleString()} simulations` : "Thousands of simulations"} of the real
          {meta ? ` ${meta.schedule_games}-game` : ""} FBS schedule, all ten conference title games and the
          twelve-team playoff - a ratings model built from three seasons of opponent-adjusted margins,
          anchored to the AP poll and the title market, predicting every Top 25 game as the season plays out.
        </p>
        {meta && (
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mt-3" style={MONO}>
            {meta.model} · AP {meta.poll.label ?? "poll"} {meta.poll.date ?? ""} · updated {meta.generated_at}
            {meta.games_played > 0 ? ` · after ${meta.games_played} games` : " · preseason"}
          </p>
        )}
      </header>

      {!sim && (
        <section className="rounded-2xl border p-6 mb-8" style={{ borderColor: "var(--border)" }}>
          <p className="text-sm text-[var(--text-muted)]">
            The simulation data has not loaded. It lives at <code>/data/cfb-sim.json</code> and is rebuilt by
            the prediction pipeline; try again shortly.
          </p>
        </section>
      )}

      {rows.length > 0 && (
        <>
          {/* National title board */}
          <section className="mb-10 rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)" }}>
            <h2 className="text-2xl font-bold mb-1">The race for the national title</h2>
            <p className="text-sm text-[var(--text-muted)] mb-4">
              Share of simulated seasons each program wins the CFP National Championship.
            </p>
            <div className="grid gap-2">
              {rows.filter((r) => r.p_natty >= 1.5).map((r, i) => (
                <div key={r.espn_id} className="flex items-center gap-3">
                  <span className="w-6 text-right text-[13px]" style={{ ...MONO, color: "var(--text-dim)" }}>{i + 1}</span>
                  <span className="w-44 sm:w-56 text-[14.5px] truncate">
                    <TeamLabel name={r.name} href={href(r.slug)} rank={r.ap_rank} />
                  </span>
                  <span className="flex-1 h-2 rounded" style={{ background: "var(--bg-card)" }}>
                    <span
                      className="block h-2 rounded"
                      style={{ background: "var(--accent)", opacity: 0.75, width: `${Math.max(1, (r.p_natty / maxNatty) * 100)}%` }}
                    />
                  </span>
                  <span className="w-14 text-right text-[13px] font-bold" style={{ ...MONO, color: "var(--accent)" }}>{pct(r.p_natty)}</span>
                </div>
              ))}
            </div>
          </section>

          {/* The twelve-team field */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold mb-1">The twelve-team field</h2>
            <p className="text-sm text-[var(--text-muted)] mb-4">
              Five conference champions and seven at-large, seeded straight by committee rank, byes to
              the top four seeds. Because only four power conferences exist, at least one of the five
              champion bids always goes to a Group of 5 league - so eleven spots are effectively
              contested by the Power 4 and Notre Dame, and the twelfth is reserved for the best Group
              of 5 champion, with a second sneaking in when one earns it.
            </p>
            <div className="grid gap-4 lg:grid-cols-2 items-start">
              <div className="min-w-0">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                  The eleven contested spots - Power 4 + Notre Dame
                </h3>
                <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                        <th className="px-3 py-2 font-semibold">Team</th>
                        <th className="px-3 py-2 text-right font-semibold">Playoff</th>
                        <th className="px-3 py-2 text-right font-semibold">Top-4 seed</th>
                        <th className="px-3 py-2 text-right font-semibold">Natl title</th>
                        <th className="px-3 py-2 font-semibold">Conference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p4Field.map((r, i) => (
                        <tr key={r.espn_id} className="border-t" style={{
                          borderColor: "var(--border)",
                          boxShadow: i === 10 ? "inset 0 -2px 0 rgba(226,98,139,0.45)" : undefined,
                          background: i < 11 ? "rgba(34,197,94,0.06)" : undefined,
                        }}>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <TeamLabel name={r.name} href={href(r.slug)} rank={r.ap_rank} />
                          </td>
                          <td className="px-3 py-2 text-right font-bold" style={MONO}>{pct(r.p_playoff)}</td>
                          <td className="px-3 py-2 text-right" style={MONO}>{pct(r.p_bye)}</td>
                          <td className="px-3 py-2 text-right" style={MONO}>{pct(r.p_natty)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-[var(--text-muted)]">{r.conference}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-[var(--text-dim)] mt-2">
                  Green rows mark the eleven most likely qualifiers from this pool; the line under row
                  eleven is the cut.
                </p>
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                  The Group of 5 bid
                </h3>
                <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                        <th className="px-3 py-2 font-semibold">Team</th>
                        <th className="px-3 py-2 text-right font-semibold">Playoff</th>
                        <th className="px-3 py-2 text-right font-semibold">Conference title</th>
                        <th className="px-3 py-2 text-right font-semibold">Natl title</th>
                        <th className="px-3 py-2 font-semibold">Conference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g5Field.map((r, i) => (
                        <tr key={r.espn_id} className="border-t" style={{
                          borderColor: "var(--border)",
                          background: i < 1 ? "rgba(34,197,94,0.06)" : undefined,
                        }}>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <TeamLabel name={r.name} href={href(r.slug)} rank={r.ap_rank} />
                          </td>
                          <td className="px-3 py-2 text-right font-bold" style={MONO}>{pct(r.p_playoff)}</td>
                          <td className="px-3 py-2 text-right" style={MONO}>{pct(r.p_conf)}</td>
                          <td className="px-3 py-2 text-right" style={MONO}>{pct(r.p_natty)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-[var(--text-muted)]">{r.conference}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-[var(--text-dim)] mt-2">
                  The guaranteed spot goes to the highest-ranked of these leagues&apos; champions - the
                  green row is the current favourite to claim it.
                </p>
              </div>
            </div>
          </section>

          {/* Conference title games */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold mb-1">The conference title games</h2>
            <p className="text-sm text-[var(--text-muted)] mb-4">
              The likeliest championship-game pairing in each league, with every team&apos;s odds of
              reaching it, and the favourite to win the conference outright.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ccgCards.map(({ conference, pair, fav }) => (
                <div key={conference} className="min-w-0 rounded-xl border p-4" style={CARD}>
                  <div className="text-[11px] uppercase tracking-widest mb-2" style={{ ...MONO, color: "var(--text-muted)" }}>{conference}</div>
                  {pair.map((r) => (
                    <div key={r.espn_id} className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-sm truncate"><TeamLabel name={r.name} href={href(r.slug)} rank={r.ap_rank} /></span>
                      <span className="text-[13px]" style={MONO}>{pct(r.p_ccg)}</span>
                    </div>
                  ))}
                  {fav && (
                    <div className="mt-2 pt-2 border-t text-xs text-[var(--text-muted)]" style={{ borderColor: "var(--border)" }}>
                      Favourite: <span className="font-semibold text-[var(--text)]">{fav.name}</span>{" "}
                      <span style={MONO}>{pct(fav.p_conf)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Next games - AP Top 25 only */}
          {upcoming.length > 0 && (
            <section className="mb-10">
              <h2 className="text-2xl font-bold mb-1">The week&apos;s Top 25 games, called</h2>
              <p className="text-sm text-[var(--text-muted)] mb-4">
                Every game involving an AP Top 25 team{pollLabel ? ` (${pollLabel} poll)` : ""}, win
                probability for the home side{anyMarket
                  ? " from the model and the posted line, blended 50/50 into the pick"
                  : "; the market column joins once lines are posted"}. Each week&apos;s slate is published
                after the AP poll drops, frozen on first sight, and graded against the final score below.
              </p>
              <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                      <th className="px-3 py-2 font-semibold">Date</th>
                      <th className="px-3 py-2 font-semibold">Game</th>
                      <th className="px-3 py-2 text-right font-semibold">Model (home)</th>
                      {anyMarket && <th className="px-3 py-2 text-right font-semibold">Market (home)</th>}
                      <th className="px-3 py-2 font-semibold">Pick</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcoming.map((e) => (
                      <tr key={e.event_id} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="px-3 py-2 whitespace-nowrap" style={{ ...MONO, color: "var(--text-muted)" }}>{fmtDate(e.date)}</td>
                        <td className="px-3 py-2 font-semibold whitespace-nowrap">
                          {e.ap.away ? <span style={{ ...MONO, color: "var(--text-dim)" }}>#{e.ap.away} </span> : null}{e.away}
                          <span style={{ color: "var(--text-dim)" }}>{e.neutral ? " vs " : " at "}</span>
                          {e.ap.home ? <span style={{ ...MONO, color: "var(--text-dim)" }}>#{e.ap.home} </span> : null}{e.home}
                        </td>
                        <td className="px-3 py-2 text-right" style={MONO}>{ppct(e.model.pH)}</td>
                        {anyMarket && (
                          <td className="px-3 py-2 text-right" style={{ ...MONO, color: "var(--text-muted)" }}>
                            {e.market ? ppct(e.market.pH) : "—"}
                          </td>
                        )}
                        <td className="px-3 py-2 font-semibold" style={{ color: "var(--accent)" }}>{PICK_LABEL(e)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Tracking */}
          <section className="mb-10 rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)" }}>
            <h2 className="text-2xl font-bold mb-1">How the model is doing</h2>
            {rec && rec.graded > 0 ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3 my-4">
                  <div className="rounded-xl border p-4" style={CARD}>
                    <div className="text-[11px] uppercase tracking-widest mb-1" style={{ ...MONO, color: "var(--text-muted)" }}>Picks</div>
                    <div className="text-2xl font-bold" style={MONO}>{rec.pick_correct}/{rec.graded}</div>
                    <div className="text-xs text-[var(--text-muted)]">Top 25 game calls correct</div>
                  </div>
                  <div className="rounded-xl border p-4" style={CARD}>
                    <div className="text-[11px] uppercase tracking-widest mb-1" style={{ ...MONO, color: "var(--text-muted)" }}>Model Brier</div>
                    <div className="text-2xl font-bold" style={MONO}>{rec.model_brier ?? "—"}</div>
                    <div className="text-xs text-[var(--text-muted)]">lower is better; 0.5 = coin flip</div>
                  </div>
                  <div className="rounded-xl border p-4" style={CARD}>
                    <div className="text-[11px] uppercase tracking-widest mb-1" style={{ ...MONO, color: "var(--text-muted)" }}>Market Brier</div>
                    <div className="text-2xl font-bold" style={MONO}>{rec.market_brier ?? "—"}</div>
                    <div className="text-xs text-[var(--text-muted)]">the benchmark to beat{rec.market_graded ? ` (${rec.market_graded} priced)` : ""}</div>
                  </div>
                </div>
                {graded.length > 0 && (
                  <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                          <th className="px-3 py-2 font-semibold">Date</th>
                          <th className="px-3 py-2 font-semibold">Game</th>
                          <th className="px-3 py-2 font-semibold">Our pick</th>
                          <th className="px-3 py-2 font-semibold">Result</th>
                          <th className="px-3 py-2 text-right font-semibold">Brier</th>
                        </tr>
                      </thead>
                      <tbody>
                        {graded.map((e) => (
                          <tr key={e.event_id} className="border-t" style={{ borderColor: "var(--border)" }}>
                            <td className="px-3 py-2 whitespace-nowrap" style={{ ...MONO, color: "var(--text-muted)" }}>{fmtDate(e.date)}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{e.away} <span style={{ color: "var(--text-dim)" }}>{e.neutral ? "vs" : "at"}</span> {e.home}</td>
                            <td className="px-3 py-2" style={{ color: e.pick_correct ? "var(--accent)" : "#E2628B" }}>
                              {PICK_LABEL(e)} {e.pick_correct ? "✓" : "✕"}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap" style={MONO}>
                              {e.result === "H" ? e.home : e.away}{e.score ? ` ${e.score}` : ""}
                            </td>
                            <td className="px-3 py-2 text-right" style={MONO}>{e.model_brier?.toFixed(3) ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-[var(--text-muted)] max-w-3xl">
                Every prediction above is frozen the moment it is published. Once the season kicks off,
                this section keeps the running score on AP Top 25 games: how many picks landed, and the
                model&apos;s Brier score against the betting line&apos;s - in public, win or lose.
              </p>
            )}
          </section>

          {/* Conference tables */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold mb-1">Every team, every outcome</h2>
            <p className="text-sm text-[var(--text-muted)] mb-4">
              Expected regular-season wins and the odds of each landing spot, conference by conference.
            </p>
            {/* min-w-0 on each column: a grid child holding a table otherwise
                inflates its track past the viewport (DESIGN-STANDARDS.md). */}
            <div className="grid gap-4 lg:grid-cols-2">
              {conferences.map((c) => (
                <div key={c} className="min-w-0">
                  <ConferenceTable rows={rows} conference={c} href={href} />
                </div>
              ))}
            </div>
          </section>

          {/* Method */}
          {meta && (
            <section className="mb-6 rounded-2xl border p-5 sm:p-6" style={CARD}>
              <h2 className="text-lg font-bold mb-2">How the model works</h2>
              <p className="text-[13.5px] text-[var(--text-muted)] leading-relaxed max-w-3xl">
                Each team&apos;s rating starts from its opponent-adjusted scoring margin over the last three
                seasons ({meta.strength_seasons.join(", ")}), margins capped, home advantage removed and FCS
                opponents pooled, then regressed toward the mean (&times;{meta.regress}). On top of the stats
                sit two anchors, each mapped onto the points scale through the model&apos;s own
                rating-to-title-odds curve: the national-championship futures market (weight
                {" "}{meta.market_weight}) and the AP poll&apos;s vote shares (weight {meta.poll_weight}) -
                college rosters churn through the portal, so the poll and the market carry roster news that
                three seasons of margins cannot see. Both anchors fade as real 2026 results fold in. Every
                remaining game on the actual schedule is simulated as a point-spread probability (home
                advantage {meta.hfa} points, margin sd {meta.sigma_game}), each simulated season drawing every
                team&apos;s rating from a distribution (&sigma; {meta.sigma_season} points). Conference
                standings, all ten title games and the twelve-team playoff play out inside every simulation
                under the 2026 format: five highest-ranked champions in, seven at-large, straight seeding,
                byes to the top four. Two stated approximations: conference tie-breaks are record then
                head-to-head, not each league&apos;s full ladder; and the selection committee is modeled as
                rating plus record - a proxy, because the committee is not a formula. Weekly picks cover AP
                Top 25 games only, blend the model with the posted line 50/50, and are graded above.
              </p>
            </section>
          )}
        </>
      )}
    </main>
  );
}
