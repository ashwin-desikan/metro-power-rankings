import type { Metadata } from "next";
import Link from "next/link";
import { getNflSim, getNflPredictions, type NflPredictionEntry, type NflSimRow } from "@/lib/nflSim";
import { getAllFranchises as nflFranchises, logoUrlFor as nflLogo } from "@/lib/nfl";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

// NFL 2026 prediction hub on /predictions - the NFL sibling of
// /predictions/pl. Season odds from nfl-sim.json (real 272-game schedule +
// full playoff bracket), weekly game predictions + graded ledger from
// nfl-predictions.json; both refresh without a build via lib/nflSim's ISR read.

export const revalidate = 21600;

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const CARD = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const PATH = "/predictions/nfl";
const TITLE = "NFL 2026 Predictions";
const DESC =
  "Super Bowl LXI, conference, division and playoff odds for all 32 teams from 20,000 simulations of the real 2026 schedule, plus weekly game predictions tracked against results all season.";

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

/** Sim slug -> /teams/nfl/<slug>, but only when the slug actually names a
 *  franchise page. The sim builds its slug by slugifying ESPN's display name
 *  while the routes come from the workbook, so the two agreeing is a fact to
 *  verify at render, not to assume. An unresolved club renders as plain text
 *  rather than a link to a 404. */
function nflTeamLinks(): { href: (slug: string) => string | null; logo: (slug: string) => string | null } {
  const slugs = new Set(nflFranchises().map((f) => f.slug));
  return {
    href: (s) => (slugs.has(s) ? `/teams/nfl/${s}` : null),
    logo: (s) => (slugs.has(s) ? nflLogo(s) : null),
  };
}

function TeamLabel({ name, href, logo }: { name: string; href: string | null; logo: string | null }) {
  const inner = (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="w-4 h-4 flex-shrink-0 object-contain" loading="lazy" decoding="async" />
      ) : null}
      <span className="truncate">{name}</span>
    </span>
  );
  return href ? (
    <Link href={href} className="font-semibold hover:text-[var(--accent)] transition-colors">{inner}</Link>
  ) : (
    <span className="font-semibold">{inner}</span>
  );
}

function DivisionTable({
  rows, division, href, logo,
}: { rows: NflSimRow[]; division: string; href: (s: string) => string | null; logo: (s: string) => string | null }) {
  const ts = rows.filter((r) => r.division === division).sort((a, b) => b.exp_wins - a.exp_wins);
  return (
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left" style={{ background: "var(--bg-card)" }}>
            <th className="px-3 py-2 font-semibold">{division}</th>
            <th className="px-3 py-2 text-right font-semibold">xW</th>
            <th className="px-3 py-2 text-right font-semibold">Division</th>
            <th className="px-3 py-2 text-right font-semibold">Playoffs</th>
            <th className="px-3 py-2 text-right font-semibold">Conference</th>
            <th className="px-3 py-2 text-right font-semibold">Super Bowl</th>
          </tr>
        </thead>
        <tbody>
          {ts.map((r) => (
            <tr key={r.slug} className="border-t" style={{ borderColor: "var(--border)" }}>
              <td className="px-3 py-2 whitespace-nowrap">
                <TeamLabel name={r.name} href={href(r.slug)} logo={logo(r.slug)} />
              </td>
              <td className="px-3 py-2 text-right" style={MONO}>{r.exp_wins.toFixed(1)}</td>
              <td className="px-3 py-2 text-right" style={MONO}>{pct(r.p_division)}</td>
              <td className="px-3 py-2 text-right" style={MONO}>{pct(r.p_playoffs)}</td>
              <td className="px-3 py-2 text-right" style={MONO}>{pct(r.p_conf)}</td>
              <td className="px-3 py-2 text-right" style={{ ...MONO, color: r.p_sb >= 5 ? "var(--accent)" : "var(--text-muted)" }}>{pct(r.p_sb)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const PICK_LABEL = (e: NflPredictionEntry) => (e.pick === "H" ? e.home : e.away);

export default async function NflPredictionsPage() {
  const [sim, preds] = await Promise.all([getNflSim(), getNflPredictions()]);
  const { href: teamHref, logo: teamLogo } = nflTeamLinks();
  const rows = sim?.table ?? [];
  const meta = sim?.meta ?? null;
  const maxSb = rows.length ? rows[0].p_sb || 1 : 1;
  const ledger = preds?.ledger ?? [];
  const upcoming = ledger.filter((e) => !e.result);
  const graded = ledger.filter((e) => e.result && e.result !== "T").slice(-10).reverse();
  const rec = preds?.record ?? null;
  const anyMarket = upcoming.some((e) => e.market);
  const divisions = ["AFC East", "AFC North", "AFC South", "AFC West", "NFC East", "NFC North", "NFC South", "NFC West"];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <Link href="/predictions" className="hover:underline">Predictions</Link>{" / "}
        <span>NFL</span>
      </nav>

      <header className="mb-8">
        <div className="flex items-center gap-3 flex-wrap mb-2">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            <span aria-hidden>🏈</span> NFL 2026
          </h1>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#10b981" }} aria-hidden />
            <span className="text-[10px]" style={{ ...MONO, color: "#10b981" }}>LIVE</span>
          </span>
        </div>
        <p className="text-[15px] text-[var(--text-muted)] max-w-3xl">
          {meta ? `${meta.sims.toLocaleString()} simulations` : "Thousands of simulations"} of the real
          {meta ? ` ${meta.schedule_games}-game` : ""} 2026 schedule and the full playoff bracket, through to
          Super Bowl LXI - a ratings model built from three seasons of scoring margins, replaying real
          results as they land, and predicting every game with the market alongside.
        </p>
        {meta && (
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mt-3" style={MONO}>
            {meta.model} · {meta.market} · updated {meta.generated_at}
            {meta.games_played > 0 ? ` · after ${meta.games_played} games` : " · preseason"}
          </p>
        )}
      </header>

      {!sim && (
        <section className="rounded-2xl border p-6 mb-8" style={{ borderColor: "var(--border)" }}>
          <p className="text-sm text-[var(--text-muted)]">
            The simulation data has not loaded. It lives at <code>/data/nfl-sim.json</code> and is rebuilt by
            the prediction pipeline; try again shortly.
          </p>
        </section>
      )}

      {rows.length > 0 && (
        <>
          {/* Super Bowl board */}
          <section className="mb-10 rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)" }}>
            <h2 className="text-2xl font-bold mb-1">The race for Super Bowl LXI</h2>
            <p className="text-sm text-[var(--text-muted)] mb-4">
              Share of simulated seasons each team lifts the Lombardi Trophy.
            </p>
            <div className="grid gap-2">
              {rows.filter((r) => r.p_sb >= 1.5).map((r, i) => (
                <div key={r.slug} className="flex items-center gap-3">
                  <span className="w-6 text-right text-[13px]" style={{ ...MONO, color: "var(--text-dim)" }}>{i + 1}</span>
                  <span className="w-44 sm:w-56 text-[14.5px] truncate">
                    <TeamLabel name={r.name} href={teamHref(r.slug)} logo={teamLogo(r.slug)} />
                  </span>
                  <span className="flex-1 h-2 rounded" style={{ background: "var(--bg-card)" }}>
                    <span
                      className="block h-2 rounded"
                      style={{ background: "var(--accent)", opacity: 0.75, width: `${Math.max(1, (r.p_sb / maxSb) * 100)}%` }}
                    />
                  </span>
                  <span className="w-14 text-right text-[13px] font-bold" style={{ ...MONO, color: "var(--accent)" }}>{pct(r.p_sb)}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Next games */}
          {upcoming.length > 0 && (
            <section className="mb-10">
              <h2 className="text-2xl font-bold mb-1">The next games, called</h2>
              <p className="text-sm text-[var(--text-muted)] mb-4">
                Win probability for the home side{anyMarket
                  ? " from the model and the posted line, blended 50/50 into the pick"
                  : "; the market column joins once lines are posted"}. Every prediction is
                frozen when first published and graded against the final score below.
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
                        <td className="px-3 py-2 font-semibold whitespace-nowrap">{e.away} <span style={{ color: "var(--text-dim)" }}>at</span> {e.home}</td>
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
                    <div className="text-xs text-[var(--text-muted)]">game calls correct</div>
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
                            <td className="px-3 py-2 whitespace-nowrap">{e.away} <span style={{ color: "var(--text-dim)" }}>at</span> {e.home}</td>
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
                Every game prediction above is frozen the moment it is published. Once the season kicks off,
                this section keeps the running score: how many picks landed, and the model&apos;s Brier score
                against the betting line&apos;s - in public, win or lose.
              </p>
            )}
          </section>

          {/* Division tables */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold mb-1">Every team, every outcome</h2>
            <p className="text-sm text-[var(--text-muted)] mb-4">
              Expected wins and the odds of each landing spot, division by division.
            </p>
            <div className="grid gap-4 lg:grid-cols-2">
              {divisions.map((d) => (
                <DivisionTable key={d} rows={rows} division={d} href={teamHref} logo={teamLogo} />
              ))}
            </div>
          </section>

          {/* Beat the model */}
          <section className="mb-10 rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)" }}>
            <h2 className="text-2xl font-bold mb-2"><span aria-hidden>&#127919;</span> Beat the Model</h2>
            <p className="text-sm text-[var(--text-muted)] max-w-3xl mb-4">
              Back the calls the simulator is least sure about - your Super Bowl champion, a dark horse into
              the playoffs, and a favourite to fall - and see whether you out-predict it across the season.
            </p>
            <Link
              href="/play/beat-the-model-nfl.html"
              className="inline-flex items-center gap-1.5 rounded-lg font-semibold text-sm px-4 py-2"
              style={{ backgroundColor: "var(--accent)", color: "#08080D" }}
            >
              Play Beat the Model: NFL <span aria-hidden>&rarr;</span>
            </Link>
          </section>

          {/* Method */}
          {meta && (
            <section className="mb-6 rounded-2xl border p-5 sm:p-6" style={CARD}>
              <h2 className="text-lg font-bold mb-2">How the model works</h2>
              <p className="text-[13.5px] text-[var(--text-muted)] leading-relaxed max-w-3xl">
                Each team&apos;s rating starts from its scoring margin per game over the last three regular
                seasons ({meta.strength_seasons.join(", ")}), recency-weighted and shrunk hard toward the
                mean (&times;{meta.regress}) - NFL form carries over far less than fans assume. On top of the
                stats sits the market: Super Bowl futures for all 32 teams, de-vigged and mapped onto the
                points scale through the model&apos;s own rating-to-title-odds curve, blended in at weight
                {" "}{meta.market_weight}. The stats know what teams have done; the futures know what the
                market knows now - quarterback moves, rosters, a champion&apos;s continuity - that margins
                cannot see. This season&apos;s real results fold into the rating as they land. Every remaining
                game on the actual schedule is simulated as a point-spread probability (home advantage
                {" "}{meta.hfa} points, margin sd {meta.sigma_game}), with each simulated season drawing every
                team&apos;s rating from a distribution (&sigma; {meta.sigma_season} points). Division winners,
                the seven seeds and the full bracket play out inside every simulation; division tie-breaks are
                approximated by record then head-to-head. Weekly picks blend the model with the posted line
                50/50 and are graded against final scores above. Where the blend still disagrees with the
                futures alone, that gap is the interesting part.
              </p>
            </section>
          )}
        </>
      )}
    </main>
  );
}
