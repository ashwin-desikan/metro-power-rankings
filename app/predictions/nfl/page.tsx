import type { Metadata } from "next";
import Link from "next/link";
import {
  getNflSim,
  getNflPredictions,
  getNflSimHistory,
  NFL_DATA_GH_BASE,
  type NflPredictionEntry,
  type NflSimRow,
  type NflSimTierRow,
  type SimHistoryFile,
} from "@/lib/nflSim";
import { getAllFranchises as nflFranchises, logoUrlFor as nflLogo } from "@/lib/nfl";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { Disclosure } from "@/app/_shared/Disclosure";
import HubNav from "@/app/teams/HubNav";
import { ResponsiveTable } from "@/app/teams/_shared/ResponsiveTable";
import { PredCrumbs, PredHeader, SourcesCard, ListLabel, MONO, CARD } from "../_shared/ui";
import PredictionsNav from "../_shared/PredictionsNav";
import { FixtureRow, TeamOddsRow } from "../_shared/rows";
import { Delta } from "../_shared/Delta";
import { Sparkline } from "../_shared/Sparkline";
import { Band } from "../_shared/Band";
import { TierTabs } from "../_shared/TierTabs";
import { deltaSince, series } from "../_shared/deltas";
import { DataBar } from "@/app/_shared/DataBar";

// NFL 2026 prediction hub on /predictions - the NFL sibling of
// /predictions/pl. Season odds from nfl-sim.json (real 272-game schedule +
// full playoff bracket), weekly game predictions + graded ledger from
// nfl-predictions.json, week-over-week deltas/sparklines from
// nfl-sim-history.json; all three refresh without a build via lib/nflSim's
// ISR read. Every points-v3 field (tiers, bands, percentile ranges,
// leverage, bubble odds) is optional - the page renders identically to the
// points-v2 build when a field is absent.

export const revalidate = 21600;

const BORD = { borderColor: "var(--border)" } as const;
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

function TeamCrest({ logo }: { logo: string | null }) {
  if (!logo) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={logo} alt="" className="w-4 h-4 flex-shrink-0 object-contain" loading="lazy" decoding="async" />;
}

/** Merge a tier's stats-only numbers onto the base rows for identity fields
 *  (name/slug/conf/division/logo). Rows a tier has no entry for (should not
 *  happen, but the JSON is data, not a promise) fall back to the base row
 *  unchanged rather than disappearing from the table. */
function tierDisplayRows(base: NflSimRow[], tier: Record<string, NflSimTierRow> | undefined): NflSimRow[] | null {
  if (!tier) return null;
  return base.map((r) => {
    const t = tier[r.slug];
    if (!t) return r;
    return {
      ...r,
      exp_wins: t.exp_wins,
      p_division: t.p_division,
      p_playoffs: t.p_playoffs,
      p_conf: t.p_conf,
      p_sb: t.p_sb,
      wins_p10: undefined,
      wins_p90: undefined,
      band: undefined,
    };
  });
}

function DivisionTable({
  rows, division, href, logo, history, withHistory,
}: {
  rows: NflSimRow[]; division: string;
  href: (s: string) => string | null; logo: (s: string) => string | null;
  history: SimHistoryFile | null;
  /** Only the classic (production) tier carries week-over-week history. */
  withHistory: boolean;
}) {
  const ts = rows.filter((r) => r.division === division).sort((a, b) => b.exp_wins - a.exp_wins);
  return (
    <div className="min-w-0">
      <div data-mobile-uncapped="four teams per division">
        <ListLabel>{division}</ListLabel>
        <ResponsiveTable
          variant="list"
          mobileNoun="teams"
          mobileInitial={0}
          className="rounded-xl border min-w-0"
          style={BORD}
          mobileRows={ts.map((r) => (
            <TeamOddsRow
              key={r.slug}
              crest={<TeamCrest logo={logo(r.slug)} />}
              name={href(r.slug) ? <Link href={href(r.slug)!}>{r.name}</Link> : r.name}
              band={r.band ? <Band band={r.band} /> : null}
              right={pct(r.p_playoffs)}
              metricLabel="playoffs"
              rightSub={`xW ${r.exp_wins.toFixed(1)}${r.wins_p10 != null && r.wins_p90 != null ? ` (${r.wins_p10.toFixed(1)}-${r.wins_p90.toFixed(1)})` : ""}`}
            />
          ))}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                <th className="px-2 py-2 font-semibold">{division}</th>
                <th className="px-3 py-2 text-right font-semibold">xW</th>
                <th className="px-2 py-2 text-right font-semibold">Div</th>
                <th className="px-2 py-2 text-right font-semibold">Playoffs</th>
                <th className="px-2 py-2 text-right font-semibold">Conf</th>
                <th className="px-2 py-2 text-right font-semibold">SB</th>
              </tr>
            </thead>
            <tbody>
              {ts.map((r) => (
                <tr key={r.slug} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-2 py-2 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <TeamLabel name={r.name} href={href(r.slug)} logo={logo(r.slug)} />
                      {withHistory && (
                        <span className="hidden sm:inline-block" style={{ color: "var(--accent)" }}>
                          <Sparkline points={series(history, r.slug, "title")} />
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap" style={MONO}>
                    {r.exp_wins.toFixed(1)}
                    {r.wins_p10 != null && r.wins_p90 != null && (
                      <span className="block text-[10px] leading-tight" style={{ color: "var(--text-dim)" }}>
                        {r.wins_p10.toFixed(1)}–{r.wins_p90.toFixed(1)}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap" style={MONO}>{pct(r.p_division)}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap" style={MONO}>
                    {pct(r.p_playoffs)}
                    {withHistory && (
                      <span className="block text-[10px] leading-tight">
                        <Delta value={deltaSince(history, r.slug, "po", 7)} unit="pp" />
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap" style={MONO}>{pct(r.p_conf)}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap" style={{ ...MONO, color: r.p_sb >= 5 ? "var(--accent)" : "var(--text-muted)" }}>
                    {pct(r.p_sb)}
                    {withHistory && (
                      <span className="block text-[10px] leading-tight">
                        <Delta value={deltaSince(history, r.slug, "title", 7)} unit="pp" />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResponsiveTable>
      </div>
    </div>
  );
}

const AFC_DIVISIONS = ["AFC East", "AFC North", "AFC South", "AFC West"];
const NFC_DIVISIONS = ["NFC East", "NFC North", "NFC South", "NFC West"];

function DivisionGrid({
  rows, href, logo, history, withHistory,
}: {
  rows: NflSimRow[];
  href: (s: string) => string | null; logo: (s: string) => string | null;
  history: SimHistoryFile | null;
  withHistory: boolean;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {[
        { conference: "AFC", divisions: AFC_DIVISIONS },
        { conference: "NFC", divisions: NFC_DIVISIONS },
      ].map(({ conference, divisions }) => (
        <div key={conference} className="min-w-0 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {conference}
          </h3>
          {divisions.map((d) => (
            <DivisionTable
              key={d} rows={rows} division={d} href={href} logo={logo}
              history={history} withHistory={withHistory}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

const PICK_LABEL = (e: NflPredictionEntry) => (e.pick === "H" ? e.home : e.away);

export default async function NflPredictionsPage() {
  const [sim, preds, history] = await Promise.all([getNflSim(), getNflPredictions(), getNflSimHistory()]);
  const { href: teamHref, logo: teamLogo } = nflTeamLinks();
  const rows = sim?.table ?? [];
  const meta = sim?.meta ?? null;
  const maxSb = rows.length ? rows[0].p_sb || 1 : 1;
  const ledger = preds?.ledger ?? [];
  const upcoming = ledger.filter((e) => !e.result);
  const graded = ledger.filter((e) => e.result && e.result !== "T").slice(-10).reverse();
  const rec = preds?.record ?? null;
  const anyMarket = upcoming.some((e) => e.market);

  const liteRows = tierDisplayRows(rows, sim?.tiers?.lite);
  const leverageGames = upcoming
    .filter((e): e is NflPredictionEntry & { leverage: NonNullable<NflPredictionEntry["leverage"]> } => !!e.leverage)
    .sort((a, b) => b.leverage.game - a.leverage.game);
  const bubbleRows = rows
    .filter((r): r is NflSimRow & { p_bubble: number } => r.p_bubble != null)
    .sort((a, b) => b.p_bubble - a.p_bubble)
    .slice(0, 8);
  const bubblePlayoffMax = Math.max(...bubbleRows.map((r) => r.p_playoffs), 0.0001);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PredCrumbs tab="NFL" />
      <PredHeader
        emoji="🏈"
        title="NFL 2026"
        live
        sub={
          <>
            {meta ? `${meta.sims.toLocaleString()} simulations` : "Thousands of simulations"} of the real
            {meta ? ` ${meta.schedule_games}-game` : ""} 2026 schedule and the full playoff bracket, through to
            Super Bowl LXI - a ratings model built from three seasons of scoring margins, replaying real
            results as they land, and predicting every game with the market alongside.
          </>
        }
        stamp={
          meta
            ? `${meta.model} · ${meta.market} · updated ${meta.generated_at}${meta.games_played > 0 ? ` · after ${meta.games_played} games` : " · preseason"}`
            : null
        }
      />
      <PredictionsNav />
      <HubNav
        items={[
          { label: "Super Bowl race", href: "#sb" },
          { label: "Next games", href: "#games" },
          { label: "Games that matter", href: "#leverage" },
          { label: "Bubble watch", href: "#bubble" },
          { label: "Model record", href: "#record" },
          { label: "Every team", href: "#divisions" },
          { label: "Picks", href: "#picks" },
        ]}
      />

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
          <section id="sb" className="mb-10 rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)" }}>
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
            <section id="games" className="mb-10">
              <h2 className="text-2xl font-bold mb-1">The next games, called</h2>
              <p className="text-sm text-[var(--text-muted)] mb-1">
                Win probability for the home side.
              </p>
              <details className="mb-4 max-w-3xl">
                <summary className="text-xs text-[var(--text-dim)] cursor-pointer hover:text-[var(--accent)]">How this is measured</summary>
                <div className="mt-2 text-sm text-[var(--text-muted)]">
                  {anyMarket
                    ? "The pick blends the model and the posted line 50/50."
                    : "The market column joins once lines are posted."} Every prediction is frozen when
                  first published and graded against the final score below.
                </div>
              </details>
              <ResponsiveTable
                variant="list"
                mobileNoun="games"
                className="rounded-xl border"
                style={BORD}
                mobileRows={upcoming.map((e) => (
                  <FixtureRow
                    key={e.event_id}
                    team1={e.away}
                    team2={e.home}
                    neutral={e.neutral}
                    kickoff={fmtDate(e.date)}
                    modelPct={`Model ${ppct(e.model.pH)}`}
                    marketPct={anyMarket ? (e.market ? `Market ${ppct(e.market.pH)}` : "Market —") : undefined}
                    pick={PICK_LABEL(e)}
                  />
                ))}
              >
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
                          {e.away} <span style={{ color: "var(--text-dim)" }}>at</span> {e.home}
                          {e.neutral && (
                            <span
                              className="ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide align-middle"
                              style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
                            >
                              neutral
                            </span>
                          )}
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
              </ResponsiveTable>
            </section>
          )}

          {/* Games that matter this week */}
          {leverageGames.length > 0 && (
            <section id="leverage" className="mb-10">
              <h2 className="text-2xl font-bold mb-1">Games that matter this week</h2>
              <p className="text-sm text-[var(--text-muted)] mb-4">
                Points of playoff probability each team stands to swing by winning versus losing, most
                consequential first.
              </p>
              <ResponsiveTable
                variant="list"
                mobileNoun="games"
                className="rounded-xl border"
                style={BORD}
                mobileRows={leverageGames.map((e) => (
                  <FixtureRow
                    key={e.event_id}
                    team1={e.away}
                    team2={e.home}
                    kickoff={fmtDate(e.date)}
                    modelPct={`Home swing ${pct(e.leverage.home)}`}
                    marketPct={`Away swing ${pct(e.leverage.away)}`}
                    pick={PICK_LABEL(e)}
                  />
                ))}
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                      <th className="px-3 py-2 font-semibold">Kickoff</th>
                      <th className="px-3 py-2 font-semibold">Matchup</th>
                      <th className="px-3 py-2 text-right font-semibold">Swing (home)</th>
                      <th className="px-3 py-2 text-right font-semibold">Swing (away)</th>
                      <th className="px-3 py-2 font-semibold">Our pick</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leverageGames.map((e) => (
                      <tr key={e.event_id} className="border-t" style={BORD}>
                        <td className="px-3 py-2 whitespace-nowrap" style={{ ...MONO, color: "var(--text-muted)" }}>{fmtDate(e.date)}</td>
                        <td className="px-3 py-2 font-semibold whitespace-nowrap">
                          {e.away} <span style={{ color: "var(--text-dim)" }}>at</span> {e.home}
                        </td>
                        <td className="px-3 py-2 text-right" style={MONO}>{pct(e.leverage.home)}</td>
                        <td className="px-3 py-2 text-right" style={MONO}>{pct(e.leverage.away)}</td>
                        <td className="px-3 py-2 font-semibold" style={{ color: "var(--accent)" }}>{PICK_LABEL(e)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ResponsiveTable>
            </section>
          )}

          {/* Bubble watch */}
          {bubbleRows.length > 0 && (
            <section id="bubble" className="mb-10">
              <h2 className="text-2xl font-bold mb-1">Bubble watch</h2>
              <p className="text-sm text-[var(--text-muted)] mb-4">
                Teams most often sitting on the 7-seed line - in the field or the first team out - across the
                simulation.
              </p>
              <ResponsiveTable
                variant="list"
                mobileNoun="teams"
                className="rounded-xl border"
                style={BORD}
                mobileRows={bubbleRows.map((r) => (
                  <TeamOddsRow
                    key={r.slug}
                    crest={<TeamCrest logo={teamLogo(r.slug)} />}
                    name={teamHref(r.slug) ? <Link href={teamHref(r.slug)!}>{r.name}</Link> : r.name}
                    band={r.band ? <Band band={r.band} /> : null}
                    right={pct(r.p_bubble)}
                    metricLabel="bubble"
                    rightSub={`playoffs ${pct(r.p_playoffs)}`}
                  />
                ))}
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                      <th className="px-3 py-2 font-semibold">Team</th>
                      <th className="px-3 py-2 text-right font-semibold">Playoffs</th>
                      <th className="px-3 py-2 text-right font-semibold">Bubble</th>
                      <th className="px-3 py-2 font-semibold">Band</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bubbleRows.map((r) => (
                      <tr key={r.slug} className="border-t" style={BORD}>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <TeamLabel name={r.name} href={teamHref(r.slug)} logo={teamLogo(r.slug)} />
                        </td>
                        <td className="px-3 py-2 text-right" style={MONO}>
                          <DataBar v={r.p_playoffs} max={bubblePlayoffMax} dp={1} suffix="%" color="var(--seq-4)" width={100} />
                        </td>
                        <td className="px-3 py-2 text-right" style={MONO}>{pct(r.p_bubble)}</td>
                        <td className="px-3 py-2">{r.band && <Band band={r.band} />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ResponsiveTable>
            </section>
          )}

          {/* Tracking */}
          <section id="record" className="mb-10 rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)" }}>
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
                  <ResponsiveTable
                    variant="list"
                    mobileNoun="games"
                    className="rounded-xl border"
                    style={BORD}
                    mobileRows={graded.map((e) => (
                      <FixtureRow
                        key={e.event_id}
                        team1={e.away}
                        team2={e.home}
                        kickoff={<>Pick: {PICK_LABEL(e)} · Brier {e.model_brier?.toFixed(3) ?? "—"}</>}
                        graded
                        score={<>{e.result === "H" ? e.home : e.away}{e.score ? ` ${e.score}` : ""}</>}
                        correct={!!e.pick_correct}
                      />
                    ))}
                  >
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
                  </ResponsiveTable>
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
          <section id="divisions" className="mb-10">
            <h2 className="text-2xl font-bold mb-1">Every team, every outcome</h2>
            <p className="text-sm text-[var(--text-muted)] mb-4">
              Expected wins and the odds of each landing spot, division by division.
            </p>
            {/* min-w-0 on each column: a grid child holding a table otherwise
                inflates its track past the viewport (DESIGN-STANDARDS.md). */}
            {liteRows ? (
              <TierTabs
                tabs={[
                  { key: "classic", label: "Classic (stats + market)" },
                  { key: "lite", label: "Lite (stats only)" },
                ]}
              >
                {[
                  <DivisionGrid key="classic" rows={rows} href={teamHref} logo={teamLogo} history={history} withHistory />,
                  <DivisionGrid key="lite" rows={liteRows} href={teamHref} logo={teamLogo} history={history} withHistory={false} />,
                ]}
              </TierTabs>
            ) : (
              <DivisionGrid rows={rows} href={teamHref} logo={teamLogo} history={history} withHistory />
            )}
            <p className="text-[13px] text-[var(--text-muted)] mt-4">
              Get the data:{" "}
              <Link href="/predictions/nfl/table.csv" className="hover:underline">season table as CSV</Link>
              {" · "}
              <a href={`${NFL_DATA_GH_BASE}/nfl-sim.json`} className="hover:underline" target="_blank" rel="noreferrer">
                raw JSON on GitHub
              </a>
            </p>
          </section>

          {/* Citizen of Nowhere Picks */}
          <section id="picks" className="mb-10 rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)" }}>
            <h2 className="text-2xl font-bold mb-2"><span aria-hidden>&#127919;</span> Citizen of Nowhere Picks</h2>
            <p className="text-sm text-[var(--text-muted)] max-w-3xl mb-4">
              Call every game of the week blind, rank your confidence, and take a side on the Upset Radar -
              the games where this model and the betting market disagree most. The model plays its own card,
              graded by the same rules.
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
                Ratings start from three seasons of NFL scoring margin ({meta.strength_seasons.join(", ")}),
                blended with Super Bowl futures markets, then replayed forward {meta.sims.toLocaleString()}{" "}
                times against the real remaining 2026 schedule. Last generated {meta.generated_at}
                {meta.games_played > 0 ? `, after ${meta.games_played} games played` : " (preseason)"}. Weekly
                picks blend the model 50/50 with the posted line and are graded against final scores above;
                the Brier scores on this page and on the Ledger use that same graded record.
              </p>
              <Disclosure title="How the model works" desktopOpen bodyClassName="p-4 sm:p-5" className="mt-1">
                <p className="text-[13.5px] text-[var(--text-muted)] leading-relaxed">
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
                {meta.model === "points-v3" && (
                  <p className="text-[13.5px] text-[var(--text-muted)] leading-relaxed mt-3">
                    Two tiers of this model run side by side: a stats-only &quot;lite&quot; rating and the full
                    &quot;classic&quot; build that also blends in the market. Uncertainty shrinks as the season
                    does - the spread of outcomes each simulated season draws from narrows week by week as fewer
                    games remain, and widens back out for a team the stats and the market disagree about most.
                    Each simulated season also draws one correlated error for the whole league, one for each
                    division, and one for each team, rather than treating every game as its own coin flip - real
                    seasons run hot or cold together, not independently. Every tier reuses the same random draws
                    for the same simulated season, so a change from one build to the next reflects an actual
                    change in the inputs rather than noise in which season got drawn.
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
