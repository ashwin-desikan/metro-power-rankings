import type { Metadata } from "next";
import Link from "next/link";
import { getMlbSim, type MlbSimRow } from "@/lib/mlbSim";
import { getAllFranchises, logoUrlFor } from "@/lib/mlb";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

// MLB 2026 prediction hub - the baseball sibling of /predictions/nfl and
// /predictions/pl. Season odds from mlb-sim.json (the real remaining schedule
// plus the full 12-team bracket), refreshing without a build via lib/mlbSim's
// ISR read.
//
// DELIBERATELY NOT A COPY OF THE NFL HUB. That page's centrepiece after the
// title board is a per-game ledger, because the NFL plays sixteen games a
// week and each one is an event. Baseball plays fifteen games a DAY and no
// single one matters; what matters in August is which races are actually
// live. So the ledger's slot here is taken by "The races still open" - every
// club the model puts between 15% and 85% to reach October. Same intent (show
// the reader where the model is UNSURE, not only where it is confident),
// different shape, because the sport is different.

export const revalidate = 21600;

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const CARD = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const PATH = "/predictions/mlb";
const TITLE = "MLB 2026 Predictions";
const DESC =
  "World Series, pennant, division and playoff odds for all 30 clubs from 20,000 simulations of the real remaining schedule and the full 12-team bracket, updated daily through the season.";

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

const AL_DIVISIONS = ["AL East", "AL Central", "AL West"];
const NL_DIVISIONS = ["NL East", "NL Central", "NL West"];

// A race is "open" when the model is genuinely unsure. The band is wide on
// purpose: 85% is not a lock in a sport where a bad fortnight costs five games
// in the standings, and 15% is a real September story, not a rounding error.
const OPEN_LO = 15;
const OPEN_HI = 85;

/** canonical -> /teams/mlb/<slug>, resolved through the franchise workbook.
 *  Never derive this by slugifying the ESPN name: the sim keys on the team
 *  mark and the site's routes key on the workbook slug, and those agree today
 *  only because we check. A club we cannot resolve renders as plain text
 *  rather than a 404. */
function teamHrefs(): { href: (c: string) => string | null; logo: (c: string) => string | null } {
  const fr = new Map(getAllFranchises().map((f) => [f.canonical, f]));
  return {
    href: (c) => (fr.has(c) ? `/teams/mlb/${fr.get(c)!.slug}` : null),
    logo: (c) => (fr.has(c) ? logoUrlFor(fr.get(c)!.slug) : null),
  };
}

function TeamName({
  r, href, logo, bold = true,
}: { r: MlbSimRow; href: string | null; logo: string | null; bold?: boolean }) {
  const inner = (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="w-4 h-4 flex-shrink-0 object-contain" loading="lazy" decoding="async" />
      ) : null}
      <span className="truncate">{r.name}</span>
    </span>
  );
  return href ? (
    <Link href={href} className={`${bold ? "font-semibold" : ""} hover:text-[var(--accent)] transition-colors`}>
      {inner}
    </Link>
  ) : (
    <span className={bold ? "font-semibold" : ""}>{inner}</span>
  );
}

function DivisionTable({
  rows, division, href, logo,
}: { rows: MlbSimRow[]; division: string; href: (c: string) => string | null; logo: (c: string) => string | null }) {
  const ts = rows.filter((r) => r.division === division).sort((a, b) => b.exp_wins - a.exp_wins);
  return (
    <div className="overflow-x-auto rounded-xl border min-w-0" style={{ borderColor: "var(--border)" }}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left" style={{ background: "var(--bg-card)" }}>
            <th className="px-3 py-2 font-semibold">{division}</th>
            <th className="px-3 py-2 text-right font-semibold">Now</th>
            <th className="px-3 py-2 text-right font-semibold">xW</th>
            <th className="px-3 py-2 text-right font-semibold">Playoffs</th>
            <th className="px-3 py-2 text-right font-semibold hidden sm:table-cell">Division</th>
            <th className="px-3 py-2 text-right font-semibold hidden sm:table-cell">Pennant</th>
            <th className="px-3 py-2 text-right font-semibold">Series</th>
          </tr>
        </thead>
        <tbody>
          {ts.map((r) => (
            <tr key={r.canonical} className="border-t" style={{ borderColor: "var(--border)" }}>
              <td className="px-3 py-2 whitespace-nowrap">
                <TeamName r={r} href={href(r.canonical)} logo={logo(r.canonical)} />
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap" style={{ ...MONO, color: "var(--text-muted)" }}>
                {r.wins}-{r.losses}
              </td>
              <td className="px-3 py-2 text-right" style={MONO}>{r.exp_wins.toFixed(1)}</td>
              <td className="px-3 py-2 text-right" style={MONO}>{pct(r.p_playoffs)}</td>
              <td className="px-3 py-2 text-right hidden sm:table-cell" style={MONO}>{pct(r.p_division)}</td>
              <td className="px-3 py-2 text-right hidden sm:table-cell" style={MONO}>{pct(r.p_pennant)}</td>
              <td className="px-3 py-2 text-right" style={{ ...MONO, color: r.p_ws >= 5 ? "var(--accent)" : "var(--text-muted)" }}>
                {pct(r.p_ws)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function MlbPredictionsPage() {
  const sim = await getMlbSim();
  const rows = sim?.table ?? [];
  const meta = sim?.meta ?? null;
  const { href, logo } = teamHrefs();
  const maxWs = rows.length ? rows[0].p_ws || 1 : 1;

  // The live races, ordered by how close they are to a coin flip. This is the
  // page's editorial centre: it answers "what is still being decided", which
  // a board sorted by title odds cannot.
  const open = rows
    .filter((r) => r.p_playoffs > OPEN_LO && r.p_playoffs < OPEN_HI)
    .sort((a, b) => Math.abs(50 - a.p_playoffs) - Math.abs(50 - b.p_playoffs));

  const fieldFor = (lg: "AL" | "NL") =>
    rows.filter((r) => r.league === lg).sort((a, b) => b.p_playoffs - a.p_playoffs).slice(0, 6);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <Link href="/predictions" className="hover:underline">Predictions</Link>{" / "}
        <span>MLB</span>
      </nav>

      <header className="mb-8">
        <div className="flex items-center gap-3 flex-wrap mb-2">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            <span aria-hidden>⚾</span> MLB 2026
          </h1>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#10b981" }} aria-hidden />
            <span className="text-[10px]" style={{ ...MONO, color: "#10b981" }}>LIVE</span>
          </span>
        </div>
        <p className="text-[15px] text-[var(--text-muted)] max-w-3xl">
          {meta ? `${meta.sims.toLocaleString()} simulations` : "Thousands of simulations"} of every
          {meta ? ` one of the ${meta.games_remaining.toLocaleString()}` : " remaining"} games left on the
          real schedule, then the full twelve-team bracket played out to the World Series - a ratings
          model built from run differential, folding in results as they land.
        </p>
        {meta && (
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mt-3" style={MONO}>
            {meta.model} · {meta.market} · updated {meta.generated_at}
            {meta.games_played > 0 ? ` · after ${meta.games_played.toLocaleString()} games` : " · preseason"}
            {" · "}{meta.wins_check}
          </p>
        )}
      </header>

      {!sim && (
        <section className="rounded-2xl border p-6 mb-8" style={{ borderColor: "var(--border)" }}>
          <p className="text-sm text-[var(--text-muted)]">
            The simulation data has not loaded. It lives at <code>/data/mlb-sim.json</code> and is rebuilt
            daily by the prediction pipeline; try again shortly.
          </p>
        </section>
      )}

      {rows.length > 0 && (
        <>
          {/* World Series board */}
          <section className="mb-10 rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)" }}>
            <h2 className="text-2xl font-bold mb-1">The race for the World Series</h2>
            <p className="text-sm text-[var(--text-muted)] mb-4">
              Share of simulated seasons each club wins the whole thing. Every club under 1.5% is left off;
              they are in the division tables below.
            </p>
            <div className="grid gap-2">
              {rows.filter((r) => r.p_ws >= 1.5).map((r, i) => (
                <div key={r.canonical} className="flex items-center gap-3">
                  <span className="w-6 text-right text-[13px]" style={{ ...MONO, color: "var(--text-dim)" }}>{i + 1}</span>
                  <span className="w-40 sm:w-56 text-[14.5px] truncate">
                    <TeamName r={r} href={href(r.canonical)} logo={logo(r.canonical)} />
                  </span>
                  <span className="flex-1 h-2 rounded min-w-0" style={{ background: "var(--bg-card)" }}>
                    <span
                      className="block h-2 rounded"
                      style={{ background: "var(--accent)", opacity: 0.75, width: `${Math.max(1, (r.p_ws / maxWs) * 100)}%` }}
                    />
                  </span>
                  <span className="w-14 text-right text-[13px] font-bold" style={{ ...MONO, color: "var(--accent)" }}>{pct(r.p_ws)}</span>
                </div>
              ))}
            </div>
          </section>

          {/* The races still open - this page's answer to the NFL hub's ledger */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold mb-1">The races still open</h2>
            <p className="text-sm text-[var(--text-muted)] mb-4 max-w-3xl">
              Every club the model puts between {OPEN_LO}% and {OPEN_HI}% to reach October, closest to a
              coin flip first. This is where the season is actually being decided, and where the model is
              most likely to be wrong.
            </p>
            {open.length > 0 ? (
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
                {open.map((r) => (
                  <div key={r.canonical} className="rounded-xl border p-4 min-w-0" style={CARD}>
                    <div className="flex items-baseline justify-between gap-2 mb-2">
                      <span className="text-[15px] min-w-0">
                        <TeamName r={r} href={href(r.canonical)} logo={logo(r.canonical)} />
                      </span>
                      <span className="text-[11px] whitespace-nowrap" style={{ ...MONO, color: "var(--text-dim)" }}>
                        {r.wins}-{r.losses}
                      </span>
                    </div>
                    <div className="flex items-end gap-2 mb-1">
                      <span className="text-3xl font-bold leading-none" style={{ ...MONO, color: "var(--accent)" }}>
                        {Math.round(r.p_playoffs)}%
                      </span>
                      <span className="text-xs text-[var(--text-muted)] pb-0.5">to reach October</span>
                    </div>
                    <div className="h-1.5 rounded mb-2" style={{ background: "var(--bg)" }}>
                      <span className="block h-1.5 rounded" style={{ background: "var(--accent)", opacity: 0.75, width: `${r.p_playoffs}%` }} />
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {r.division} · {pct(r.p_division)} to win it · {r.exp_wins.toFixed(1)} projected wins
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border p-4" style={CARD}>
                <p className="text-sm text-[var(--text-muted)] max-w-3xl">
                  Nothing sits between {OPEN_LO}% and {OPEN_HI}% right now. Either the season has not
                  produced enough separation for anyone to be on the bubble, or every place is effectively
                  settled. The division tables below have the full picture.
                </p>
              </div>
            )}
          </section>

          {/* The field as it stands */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold mb-1">The field as it stands</h2>
            <p className="text-sm text-[var(--text-muted)] mb-4 max-w-3xl">
              The six clubs from each league the model has reaching the postseason most often. The top two
              seeds skip the Wild Card round entirely, which is worth roughly a round of survival, so the
              bye column matters more than its size suggests.
            </p>
            <div className="grid gap-4 lg:grid-cols-2">
              {(["AL", "NL"] as const).map((lg) => (
                <div key={lg} className="overflow-x-auto rounded-xl border min-w-0" style={{ borderColor: "var(--border)" }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                        <th className="px-3 py-2 font-semibold">{lg === "AL" ? "American League" : "National League"}</th>
                        <th className="px-3 py-2 text-right font-semibold">Playoffs</th>
                        <th className="px-3 py-2 text-right font-semibold">Bye</th>
                        <th className="px-3 py-2 text-right font-semibold">Pennant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fieldFor(lg).map((r) => (
                        <tr key={r.canonical} className="border-t" style={{ borderColor: "var(--border)" }}>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <TeamName r={r} href={href(r.canonical)} logo={logo(r.canonical)} />
                          </td>
                          <td className="px-3 py-2 text-right" style={MONO}>{pct(r.p_playoffs)}</td>
                          <td className="px-3 py-2 text-right" style={{ ...MONO, color: "var(--text-muted)" }}>{pct(r.p_bye)}</td>
                          <td className="px-3 py-2 text-right" style={{ ...MONO, color: r.p_pennant >= 15 ? "var(--accent)" : "var(--text-muted)" }}>
                            {pct(r.p_pennant)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </section>

          {/* Division tables */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold mb-1">Every club, every outcome</h2>
            <p className="text-sm text-[var(--text-muted)] mb-4">
              Current record, projected final wins, and the odds of each landing spot, division by division.
            </p>
            <div className="grid gap-4 lg:grid-cols-2">
              {[...AL_DIVISIONS, ...NL_DIVISIONS].map((d) => (
                <DivisionTable key={d} rows={rows} division={d} href={href} logo={logo} />
              ))}
            </div>
          </section>

          {/* Method */}
          {meta && (
            <section className="mb-6 rounded-2xl border p-5 sm:p-6" style={CARD}>
              <h2 className="text-lg font-bold mb-2">How the model works</h2>
              <p className="text-[13.5px] text-[var(--text-muted)] leading-relaxed max-w-3xl mb-3">
                Each club&apos;s rating starts from its run differential per game across the last two
                seasons ({meta.strength_seasons.join(" and ")}), shrunk toward the league average
                (&times;{meta.regress}) because rosters turn over. This season&apos;s real run differential
                folds in at a weight that climbs with games played and dominates by midsummer - baseball
                gives you 162 games of evidence, and by August the standings have earned the right to
                outvote history. Run differential becomes a true-talent win percentage through the classic
                ten-runs-per-win rule, so a club outscoring opponents by a run a game reads as a .600 team.
                Those percentages are held as log-odds, which makes every head-to-head exactly the log5
                formula plus a home-field term ({(meta.hfa_wpct * 100).toFixed(1)}%, the long-run MLB home
                win rate).
              </p>
              <p className="text-[13.5px] text-[var(--text-muted)] leading-relaxed max-w-3xl mb-3">
                Every one of the {meta.games_remaining.toLocaleString()} games left on the actual schedule is
                then simulated {meta.sims.toLocaleString()} times, with each simulated season drawing every
                club&apos;s rating afresh from a distribution (&sigma; {meta.sigma_season} in log-odds) so
                the output carries the model&apos;s own uncertainty rather than pretending to none. The
                bracket is the real one: byes for the top two seeds, a best-of-three Wild Card round played
                entirely at the higher seed, a 2-2-1 Division Series and 2-3-2 Championship Series and World
                Series, with home games where they actually fall rather than a coin flip. Division ties are
                broken on record then head-to-head, an approximation of the full ladder.
                {meta.market_weight > 0.01
                  ? ` The market gets a say too: the World Series futures ESPN carries are de-vigged, mapped onto the rating scale through the model's own rating-to-title-odds curve, and blended in at weight ${meta.market_weight} - a weight that scales with how much season is left, so the market speaks loudest in March and is nearly silent by September.`
                  : " The market is not blended in at this point of the season: with this much of the schedule already played, the standings carry more information than the futures do."}
              </p>
              <p className="text-[13.5px] text-[var(--text-muted)] leading-relaxed max-w-3xl">
                <strong className="text-[var(--text)]">What this hub does not have, yet.</strong> There are no
                game-by-game picks and no graded ledger here, unlike the{" "}
                <Link href="/predictions/nfl" className="underline hover:text-[var(--accent)]">NFL hub</Link>.
                That is a deliberate gap rather than an oversight: the NFL plays sixteen games a week and each
                one is an event worth calling in advance, while baseball plays fifteen a day and almost none of
                them decide anything. The honest unit of prediction in this sport is the season, so that is
                what is published. Every number above is checked against the real standings before it ships -
                the build refuses to publish if the win-loss records it derives disagree with the league&apos;s
                own.
              </p>
            </section>
          )}
        </>
      )}
    </main>
  );
}
