import type { Metadata } from "next";
import Link from "next/link";
import { getFootballClubByName } from "@/lib/football";
import { getUclSim } from "@/lib/uclSim";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

// Champions League 2026-27 prediction hub — built 2026-08-29, the week the
// league-phase draw set the 36-club field. Season odds from ucl-sim.json
// (ucl-poisson-v1: the site's own domestic hub data + UEFA country
// coefficients; no betting-market blend yet), re-run without a build via
// lib/uclSim's ISR read. Fixture calls appear once api-football swaps the
// draw's placeholder kickoffs for the confirmed calendar (meta flag).

export const revalidate = 21600;

function ClubLabel({ name }: { name: string }) {
  const club = getFootballClubByName(name);
  const label = club?.cur_name ?? name;
  return club?.slug ? (
    <Link href={`/teams/football/${club.slug}`} className="font-semibold hover:text-[var(--accent)] transition-colors">{label}</Link>
  ) : (
    <span className="font-semibold">{label}</span>
  );
}

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const PATH = "/predictions/ucl";
const TITLE = "Champions League 2026-27 Predictions";
const DESC =
  "Champion, top-eight and knockout odds for all 36 Champions League clubs from thousands of simulated seasons of the drawn league phase, built on this site's own domestic data and UEFA coefficients.";

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

function fmtKickoff(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })} · ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`;
  } catch {
    return iso;
  }
}

export default async function UclPredictionsPage() {
  const sim = await getUclSim();
  const rows = sim?.table ?? [];
  const meta = sim?.meta ?? null;
  const calls = sim?.fixtures_called ?? [];
  const maxChamp = rows.length ? rows[0].p_champion || 1 : 1;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>{" / "}
        <Link href="/predictions" className="hover:underline">Predictions</Link>{" / "}
        <span>Champions League</span>
      </nav>

      <header className="mb-8">
        <div className="flex items-center gap-3 flex-wrap mb-2">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            <span aria-hidden>🏆</span> Champions League 2026-27
          </h1>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#10b981" }} aria-hidden />
            <span className="text-[10px]" style={{ ...MONO, color: "#10b981" }}>LIVE</span>
          </span>
        </div>
        <p className="text-[15px] text-[var(--text-muted)] max-w-3xl">
          {meta ? `${meta.sims.toLocaleString()} simulated seasons` : "Thousands of simulated seasons"}{" "}
          of the drawn league phase and the seeded knockout that follows it — every club&apos;s road from the
          36-team table to the final, replayed with real results as they land.
        </p>
        {meta && (
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] mt-3" style={MONO}>
            {meta.model} · updated {meta.generated_at}
            {meta.matches_played > 0 ? ` · after ${meta.matches_played} matches` : " · preseason"}
          </p>
        )}
      </header>

      {!sim && (
        <section className="rounded-2xl border p-6 mb-8" style={{ borderColor: "var(--border)" }}>
          <p className="text-sm text-[var(--text-muted)]">
            The simulation data has not loaded. It lives at <code>/data/ucl-sim.json</code> and is rebuilt by
            the prediction pipeline; try again shortly.
          </p>
        </section>
      )}

      {rows.length > 0 && (
        <>
          {/* Champion odds board */}
          <section className="mb-10 rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)" }}>
            <h2 className="text-2xl font-bold mb-1">The champion board</h2>
            <p className="text-sm text-[var(--text-muted)] mb-4">
              Share of simulated seasons each club lifts the trophy at the Metropolitano in Madrid.
            </p>
            <div className="grid gap-2">
              {rows.filter((r) => r.p_champion >= 0.5).map((r, i) => (
                <div key={r.name} className="flex items-center gap-3">
                  <span className="w-6 text-right text-[13px]" style={{ ...MONO, color: "var(--text-dim)" }}>{i + 1}</span>
                  <span className="w-44 sm:w-56 text-[14.5px] truncate">
                    <ClubLabel name={r.name} />
                  </span>
                  <span className="flex-1 h-2 rounded" style={{ background: "var(--bg-card)" }}>
                    <span
                      className="block h-2 rounded"
                      style={{ background: "var(--accent)", opacity: 0.75, width: `${Math.max(1, (r.p_champion / maxChamp) * 100)}%` }}
                    />
                  </span>
                  <span className="w-14 text-right text-[13px] font-bold" style={{ ...MONO, color: "var(--accent)" }}>{pct(r.p_champion)}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Fixture calls */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold mb-1">The next fixtures, called</h2>
            {calls.length > 0 ? (
              <>
                <p className="text-sm text-[var(--text-muted)] mb-4">
                  Win-draw-win probabilities for the upcoming league-phase matches. Model-only for now —
                  no public odds file carries the Champions League, so the market column the Premier League
                  hub enjoys has nothing to join on yet.
                </p>
                <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                        <th className="px-3 py-2 font-semibold">Kickoff</th>
                        <th className="px-3 py-2 font-semibold">Fixture</th>
                        <th className="px-3 py-2 text-right font-semibold">Home</th>
                        <th className="px-3 py-2 text-right font-semibold">Draw</th>
                        <th className="px-3 py-2 text-right font-semibold">Away</th>
                        <th className="px-3 py-2 text-right font-semibold">Pick</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calls.map((c) => (
                        <tr key={`${c.date}-${c.home}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                          <td className="px-3 py-2 whitespace-nowrap text-[var(--text-muted)]">{fmtKickoff(c.date)}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <ClubLabel name={c.home} /> <span className="text-[var(--text-dim)]">v</span> <ClubLabel name={c.away} />
                          </td>
                          <td className="px-3 py-2 text-right" style={MONO}>{ppct(c.model.pH)}</td>
                          <td className="px-3 py-2 text-right" style={MONO}>{ppct(c.model.pD)}</td>
                          <td className="px-3 py-2 text-right" style={MONO}>{ppct(c.model.pA)}</td>
                          <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                            {c.pick === "H" ? c.home : c.pick === "A" ? c.away : "Draw"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="text-sm text-[var(--text-muted)] max-w-3xl">
                {meta?.calendar_placeholder
                  ? "The draw is made and every pairing is set, but the data feed still carries placeholder kickoff times for the league phase. Match-by-match calls appear here the moment the confirmed calendar lands."
                  : "No league-phase fixtures inside the next ten days. Calls for the coming matchday appear here as it approaches."}
              </p>
            )}
          </section>

          {/* Full table */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold mb-1">Every club, every outcome</h2>
            <p className="text-sm text-[var(--text-muted)] mb-4">
              Expected league-phase points, finishing ranges and the odds of each landing spot: the top eight
              (straight to the round of 16), the top 24 (alive in the knockouts), the quarter-finals and the
              trophy. &ldquo;Finish&rdquo; is the median simulated position with the 5th-95th percentile range.
            </p>
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                    <th className="px-3 py-2 font-semibold">Club</th>
                    <th className="px-3 py-2 text-right font-semibold">xPts</th>
                    <th className="px-3 py-2 text-right font-semibold">Finish</th>
                    <th className="px-3 py-2 text-right font-semibold">Top 8</th>
                    <th className="px-3 py-2 text-right font-semibold">Top 24</th>
                    <th className="px-3 py-2 text-right font-semibold">QF</th>
                    <th className="px-3 py-2 text-right font-semibold">Champion</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.name} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <ClubLabel name={r.name} />
                      </td>
                      <td className="px-3 py-2 text-right" style={MONO}>{r.exp_pts.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap" style={MONO}>
                        {r.pos.p50}<span style={{ color: "var(--text-dim)" }}> ({r.pos.p5}-{r.pos.p95})</span>
                      </td>
                      <td className="px-3 py-2 text-right" style={MONO}>{pct(r.p_top8)}</td>
                      <td className="px-3 py-2 text-right" style={{ ...MONO, color: r.p_top24 < 25 ? "#E2628B" : "var(--text-muted)" }}>{pct(r.p_top24)}</td>
                      <td className="px-3 py-2 text-right" style={MONO}>{pct(r.p_qf)}</td>
                      <td className="px-3 py-2 text-right" style={{ ...MONO, color: r.p_champion >= 1 ? "var(--accent)" : "var(--text-muted)" }}>{pct(r.p_champion)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Model notes */}
          <section className="mb-10 rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)" }}>
            <h2 className="text-xl font-bold mb-2">How this model works — and where it is honest about guessing</h2>
            <p className="text-sm text-[var(--text-muted)] max-w-3xl mb-2">
              Every club&apos;s attack and defence come from this site&apos;s own domestic league archive,
              measured relative to their league&apos;s average; leagues are then levelled against each other
              with UEFA&apos;s country coefficients. The 8 drawn league-phase fixtures are simulated with
              Poisson goals (finished matches replay their real result), the top 8 go straight to the round
              of 16, ranks 9-24 fight through the seeded play-off bands, and the bracket runs to a one-off
              final on neutral ground.
            </p>
            <p className="text-sm text-[var(--text-muted)] max-w-3xl">
              Version 1 carries no betting-market blend, folds in no mid-season domestic form, and
              approximates UEFA&apos;s knockout draw options and deep tie-breaks — all listed in the build
              script and revisited as real matchdays calibrate it. Treat the tails as honest speculation.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
