import type { Metadata } from "next";
import Link from "next/link";
import { getFootballClubByName } from "@/lib/football";
import { getUclSim } from "@/lib/uclSim";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { Disclosure } from "@/app/_shared/Disclosure";
import { SectionHead } from "@/app/_shared/SectionHead";
import { ResponsiveTable } from "@/app/teams/_shared/ResponsiveTable";
import { PredCrumbs, PredHeader, SourcesCard, MONO, SMCOL, plural } from "../_shared/ui";
import PredictionsNav from "../_shared/PredictionsNav";
import { FixtureRow, TeamOddsRow } from "../_shared/rows";

// Champions League 2026-27 prediction hub — built 2026-08-29, rebuilt as v2
// on 2026-08-30 after the strength formula was re-derived from research
// rather than asserted (scripts/predictions/research/: 28k European matches
// 1955-2026, era-cross-validated fit, championship backtest). Season odds
// from ucl-sim.json, re-run without a build via lib/uclSim's ISR read.
// Fixture calls appear once api-football swaps the draw's placeholder
// kickoffs for the confirmed calendar (meta flag). Shell brought into line
// with app/predictions/nfl/page.tsx 2026-09-03.

export const revalidate = 21600;

const BORD = { borderColor: "var(--border)" } as const;

function ClubLabel({ name }: { name: string }) {
  const club = getFootballClubByName(name);
  const label = club?.cur_name ?? name;
  return club?.slug ? (
    <Link href={`/teams/football/${club.slug}`} className="font-semibold hover:text-[var(--accent)] transition-colors">{label}</Link>
  ) : (
    <span className="font-semibold">{label}</span>
  );
}

const PATH = "/predictions/ucl";
const TITLE = "Champions League 2026-27 Predictions";
const DESC =
  "Champion, top-eight and knockout odds for all 36 Champions League clubs from thousands of simulated seasons of the drawn league phase, powered by a strength model fitted on three decades of European match data and backtested against every real champion since 2004.";

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
      <PredCrumbs tab="UCL" />
      <PredHeader
        emoji="🏆"
        title="Champions League 2026-27"
        live
        sub={
          <>
            {meta ? `${meta.sims.toLocaleString()} simulated seasons` : "Thousands of simulated seasons"}{" "}
            of the drawn league phase and the seeded knockout that follows it: every club&apos;s road from the
            36-team table to the final, replayed with real results as they land.
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
            The simulation data has not loaded. It lives at <code>/data/ucl-sim.json</code> and is rebuilt by
            the prediction pipeline; try again shortly.
          </p>
        </section>
      )}

      {rows.length > 0 && (
        <>
          {/* Champion odds board */}
          <section id="champion" className="mb-10 rounded-2xl border p-5 sm:p-6" style={BORD}>
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
          <Disclosure id="fixtures" title="The next fixtures, called" meta={plural(calls.length, "fixtures", "fixture")} className="mb-10" bodyClassName="p-4 sm:p-5">
            <SectionHead
              id="fixtures-head"
              title="The next fixtures, called"
              sub={calls.length > 0 ? "Win-draw-win probabilities for the upcoming league-phase matches, model-only for now." : "No fixtures called for the coming window yet."}
              more={calls.length > 0 ? "No public odds file carries the Champions League yet, so the market column the Premier League hub enjoys has nothing to join on." : undefined}
              moreLabel="Why no market column"
            />
            {calls.length > 0 ? (
              <ResponsiveTable
                variant="list"
                mobileNoun="fixtures"
                className="rounded-xl border"
                style={BORD}
                mobileRows={calls.map((c) => (
                  <FixtureRow
                    key={`${c.date}-${c.home}`}
                    team1={c.home}
                    sep="v"
                    team2={c.away}
                    kickoff={fmtKickoff(c.date)}
                    modelPct={`Model ${ppct(c.model.pH)}/${ppct(c.model.pD)}/${ppct(c.model.pA)}`}
                    pick={c.pick === "H" ? c.home : c.pick === "A" ? c.away : "Draw"}
                  />
                ))}
              >
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
                      <tr key={`${c.date}-${c.home}`} className="border-t" style={BORD}>
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
              </ResponsiveTable>
            ) : (
              <p className="text-sm text-[var(--text-muted)] max-w-3xl">
                {meta?.calendar_placeholder
                  ? "The draw is made and every pairing is set, but the data feed still carries placeholder kickoff times for the league phase. Match-by-match calls appear here the moment the confirmed calendar lands."
                  : "No league-phase fixtures inside the next ten days. Calls for the coming matchday appear here as it approaches."}
              </p>
            )}
          </Disclosure>

          {/* Full table */}
          <Disclosure id="table" title="Every club, every outcome" meta={plural(rows.length, "clubs", "club")} className="mb-10" bodyClassName="p-4 sm:p-5">
            <SectionHead
              id="table-head"
              title="Every club, every outcome"
              sub="Expected league-phase points, finishing range and odds for each landing spot."
              more="The top eight (straight to the round of 16), the top 24 (alive in the knockouts), the quarter-finals and the trophy. &ldquo;Finish&rdquo; is the median simulated position with the 5th-95th percentile range."
            />
            <ResponsiveTable
              variant="list"
              mobileNoun="clubs"
              className="rounded-xl border"
              style={BORD}
              mobileRows={rows.map((r) => (
                <TeamOddsRow
                  key={r.name}
                  name={<ClubLabel name={r.name} />}
                  right={pct(r.p_top24)}
                  metricLabel="advance"
                  rightSub={`xPts ${r.exp_pts.toFixed(1)} · Finish ${r.pos.p50} (${r.pos.p5}-${r.pos.p95})`}
                />
              ))}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                    <th className="px-3 py-2 font-semibold">Club</th>
                    <th className="px-3 py-2 text-right font-semibold">xPts</th>
                    <th className={`px-3 py-2 text-right font-semibold ${SMCOL}`}>Finish</th>
                    <th className={`px-3 py-2 text-right font-semibold ${SMCOL}`}>Top 8</th>
                    <th className="px-3 py-2 text-right font-semibold">Advance</th>
                    <th className={`px-3 py-2 text-right font-semibold ${SMCOL}`}>QF</th>
                    <th className="px-3 py-2 text-right font-semibold">Champion</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.name} className="border-t" style={BORD}>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <ClubLabel name={r.name} />
                      </td>
                      <td className="px-3 py-2 text-right" style={MONO}>{r.exp_pts.toFixed(1)}</td>
                      <td className={`px-3 py-2 text-right whitespace-nowrap ${SMCOL}`} style={MONO}>
                        {r.pos.p50}<span style={{ color: "var(--text-dim)" }}> ({r.pos.p5}-{r.pos.p95})</span>
                      </td>
                      <td className={`px-3 py-2 text-right ${SMCOL}`} style={MONO}>{pct(r.p_top8)}</td>
                      <td className="px-3 py-2 text-right" style={{ ...MONO, color: r.p_top24 < 25 ? "#E2628B" : "var(--text-muted)" }}>{pct(r.p_top24)}</td>
                      <td className={`px-3 py-2 text-right ${SMCOL}`} style={MONO}>{pct(r.p_qf)}</td>
                      <td className="px-3 py-2 text-right" style={{ ...MONO, color: r.p_champion >= 1 ? "var(--accent)" : "var(--text-muted)" }}>{pct(r.p_champion)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ResponsiveTable>
          </Disclosure>

          {/* Sources + method */}
          <SourcesCard>
            <p>
              Each club&apos;s strength blends two signals that a study of every European tie since 1955
              (28,000 matches, era-cross-validated) found to carry all the usable preseason information:
              this site&apos;s own club rating from the season just finished, and the strength of the
              club&apos;s league. Held out from training entirely, the two completed league-phase seasons:
              70.6% of decisive matches called, against 62.9% for the formula it replaced. No betting-market
              blend yet, no mid-season form fold, and UEFA&apos;s knockout draw options are approximated.
            </p>
            <Disclosure title="How the model works" desktopOpen bodyClassName="p-4 sm:p-5" className="mt-1">
              <p className="text-[13.5px] text-[var(--text-muted)] leading-relaxed">
                Each club&apos;s strength blends two signals that a study of every European tie since 1955
                (28,000 matches, era-cross-validated) found to carry all the usable preseason information:
                this site&apos;s own club rating from the season just finished, and the strength of the
                club&apos;s league. Five-year club coefficients turned out to add nothing once those are in
                the model, and raw domestic goal ratios predict close to nothing across leagues. Dominating
                a mid-tier league is not evidence of European strength. The blend&apos;s weights come from a
                Poisson fit on three decades of group-stage goals; its overall spread is calibrated so that
                replaying 2004-2024 with each season&apos;s real groups makes the actual champions as likely
                as possible.
              </p>
              <p className="text-[13.5px] text-[var(--text-muted)] leading-relaxed mt-3">
                The 8 drawn fixtures per club are simulated with Poisson goals (finished matches replay their
                real result), the top 8 go straight to the round of 16, ranks 9-24 fight through the seeded
                play-off bands, and the bracket runs to a one-off final on neutral ground. Still absent, and
                said plainly: no betting-market blend, no mid-season form fold yet, and UEFA&apos;s knockout
                draw options are approximated. The full study and backtest live in the site&apos;s repository.
              </p>
            </Disclosure>
          </SourcesCard>
        </>
      )}
    </main>
  );
}
