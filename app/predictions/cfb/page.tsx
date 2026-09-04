import type { Metadata } from "next";
import Link from "next/link";
import {
  getCfbSim,
  getCfbPredictions,
  getCfbSimHistory,
  CFB_DATA_GH_BASE,
  type CfbPredictionEntry,
  type CfbSimRow,
  type CfbSimTierRow,
  type CfbSimHistoryFile,
} from "@/lib/cfbSim";
import { getAllCfbSlugs } from "@/lib/cfb";
import { BASE_URL, SITE_NAME } from "@/lib/seo";
import { Disclosure } from "@/app/_shared/Disclosure";
import HubNav from "@/app/teams/HubNav";
import { ResponsiveTable } from "@/app/teams/_shared/ResponsiveTable";
import { PredCrumbs, PredHeader, SourcesCard, ListLabel, MONO, CARD, SMCOL, plural } from "../_shared/ui";
import PredictionsNav from "../_shared/PredictionsNav";
import { FixtureRow, TeamOddsRow } from "../_shared/rows";
import { Delta } from "@/app/predictions/_shared/Delta";
import { Sparkline } from "@/app/predictions/_shared/Sparkline";
import { Band } from "@/app/predictions/_shared/Band";
import { TierTabs } from "@/app/predictions/_shared/TierTabs";
import { deltaSince, series } from "@/app/predictions/_shared/deltas";
import { DataBar } from "@/app/_shared/DataBar";

// College Football 2026 prediction hub on /predictions - the CFB sibling of
// /predictions/nfl. Season odds from cfb-sim.json (the real FBS schedule, all
// ten conference title games and the 12-team straight-seeded playoff), weekly
// AP Top 25 game predictions + graded ledger from cfb-predictions.json,
// week-over-week deltas/sparklines from cfb-sim-history.json; all three
// refresh without a build via lib/cfbSim's ISR read. Every points-v3 field
// (three tiers, bands, percentile ranges, leverage, bubble odds) is optional
// - the page renders identically to the points-v2 build when a field is
// absent.

export const revalidate = 21600;

const BORD = { borderColor: "var(--border)" } as const;
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

/** Mobile row identity: rank + name, linked when a program page exists. */
function mobileName(r: { name: string; ap_rank?: number | null }, href: string | null) {
  const label = <>{r.ap_rank ? <span style={{ ...MONO, color: "var(--text-dim)" }}>#{r.ap_rank} </span> : null}{r.name}</>;
  return href ? <Link href={href}>{label}</Link> : label;
}

/** Merge a tier's stats-only/market-only numbers onto the base rows for
 *  identity fields (name/slug/conference/power4/ap_rank). Rows a tier has no
 *  entry for (should not happen, but the JSON is data, not a promise) fall
 *  back to the base row unchanged rather than disappearing from the table. */
function tierDisplayRows(base: CfbSimRow[], tier: Record<string, CfbSimTierRow> | undefined): CfbSimRow[] | null {
  if (!tier) return null;
  return base.map((r) => {
    const key = r.slug ?? r.espn_id;
    const t = tier[key];
    if (!t) return r;
    return {
      ...r,
      exp_wins: t.exp_wins,
      p_ccg: t.p_ccg,
      p_conf: t.p_conf,
      p_playoff: t.p_playoff,
      p_bye: t.p_bye,
      p_natty: t.p_natty,
      wins_p10: undefined,
      wins_p90: undefined,
      p_bubble: undefined,
      band: undefined,
    };
  });
}

function ConferenceTable({ rows, conference, href, history, withHistory }: {
  rows: CfbSimRow[]; conference: string; href: (s: string | null) => string | null;
  history: CfbSimHistoryFile | null;
  /** Only the deluxe (production) tier carries week-over-week history. */
  withHistory: boolean;
}) {
  const ts = rows.filter((r) => r.conference === conference)
    .sort((a, b) => b.p_conf - a.p_conf || b.p_playoff - a.p_playoff || b.exp_wins - a.exp_wins);
  const indep = conference === "Independents";
  return (
    <div className="min-w-0">
      <ListLabel>{conference}</ListLabel>
      <ResponsiveTable
        variant="list"
        mobileNoun="teams"
        className="rounded-xl border min-w-0"
        style={BORD}
        mobileRows={ts.map((r) => (
          <TeamOddsRow
            key={r.espn_id}
            name={mobileName(r, href(r.slug))}
            band={r.band ? <Band band={r.band} /> : null}
            right={pct(r.p_playoff)}
            metricLabel="playoff"
            rightSub={`xW ${r.exp_wins.toFixed(1)}${r.wins_p10 != null && r.wins_p90 != null ? ` (${r.wins_p10.toFixed(1)}-${r.wins_p90.toFixed(1)})` : ""}`}
          />
        ))}
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left" style={{ background: "var(--bg-card)" }}>
              <th className="px-2 py-2 font-semibold">{conference}</th>
              <th className="px-2 py-2 text-right font-semibold">xW</th>
              {!indep && <th className={`px-2 py-2 text-right font-semibold ${SMCOL}`}>CCG</th>}
              {!indep && <th className={`px-2 py-2 text-right font-semibold ${SMCOL}`}>Conf</th>}
              <th className="px-2 py-2 text-right font-semibold">Playoff</th>
              <th className="px-2 py-2 text-right font-semibold">Title</th>
            </tr>
          </thead>
          <tbody>
            {ts.map((r) => (
              <tr key={r.espn_id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="px-2 py-2 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    <TeamLabel name={r.name} href={href(r.slug)} rank={r.ap_rank} />
                    {withHistory && r.slug && (
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
                {!indep && <td className={`px-2 py-2 text-right whitespace-nowrap ${SMCOL}`} style={MONO}>{pct(r.p_ccg)}</td>}
                {!indep && <td className={`px-2 py-2 text-right whitespace-nowrap ${SMCOL}`} style={MONO}>{pct(r.p_conf)}</td>}
                <td className="px-2 py-2 text-right whitespace-nowrap" style={MONO}>
                  {pct(r.p_playoff)}
                  {withHistory && r.slug && (
                    <span className="block text-[10px] leading-tight">
                      <Delta value={deltaSince(history, r.slug, "po", 7)} unit="pp" />
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 text-right whitespace-nowrap" style={{ ...MONO, color: r.p_natty >= 3 ? "var(--accent)" : "var(--text-muted)" }}>
                  {pct(r.p_natty)}
                  {withHistory && r.slug && (
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
  );
}

const PICK_LABEL = (e: CfbPredictionEntry) => (e.pick === "H" ? e.home : e.away);

export default async function CfbPredictionsPage() {
  const [sim, preds, history] = await Promise.all([getCfbSim(), getCfbPredictions(), getCfbSimHistory()]);
  const href = cfbHref();
  const rows = sim?.table ?? [];
  const meta = sim?.meta ?? null;
  const maxNatty = rows.length ? rows[0].p_natty || 1 : 1;
  const ledger = preds?.ledger ?? [];
  const upcoming = ledger.filter((e) => !e.result);
  const graded = ledger.filter((e) => e.result && e.result !== "T").slice(-10).reverse();
  const rec = preds?.record ?? null;
  const anyMarket = upcoming.some((e) => e.market);
  // The multi-book consensus, its own column beside the model. College is three
  // books rather than the NFL's four (Polymarket has no college game markets)
  // and usually only two of them post a price, so the count matters and is
  // shown next to the number.
  const anyMeta = upcoming.some((e) => e.meta_market);
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
  const g5PlayoffMax = Math.max(...g5Field.map((r) => r.p_playoff), 0.0001);
  // The likeliest title game per conference: the two highest title-game odds.
  const ccgCards = conferences.filter((c) => c !== "Independents").map((c) => {
    const pair = rows.filter((r) => r.conference === c).sort((a, b) => b.p_ccg - a.p_ccg).slice(0, 2);
    const fav = rows.filter((r) => r.conference === c).sort((a, b) => b.p_conf - a.p_conf)[0];
    return { conference: c, pair, fav };
  });

  const liteRows = tierDisplayRows(rows, sim?.tiers?.lite);
  const classicRows = tierDisplayRows(rows, sim?.tiers?.classic);
  const leverageGames = upcoming
    .filter((e): e is CfbPredictionEntry & { leverage: NonNullable<CfbPredictionEntry["leverage"]> } => !!e.leverage)
    .sort((a, b) => b.leverage.game - a.leverage.game);
  const bubbleRows = rows
    .filter((r): r is CfbSimRow & { p_bubble: number } => r.p_bubble != null)
    .sort((a, b) => b.p_bubble - a.p_bubble)
    .slice(0, 8);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PredCrumbs tab="College Football" />
      <PredHeader
        emoji="🏈"
        title="College Football 2026"
        live
        sub={
          <>
            {meta ? `${meta.sims.toLocaleString()} simulations` : "Thousands of simulations"} of the real
            {meta ? ` ${meta.schedule_games}-game` : ""} FBS schedule, all ten conference title games and the
            twelve-team playoff - a ratings model built from three seasons of opponent-adjusted margins,
            anchored to the AP poll and the title market, predicting every Top 25 game as the season plays out.
          </>
        }
        stamp={
          meta
            ? `${meta.model} · AP ${meta.poll.label ?? "poll"} ${meta.poll.date ?? ""} · updated ${meta.generated_at}${meta.games_played > 0 ? ` · after ${meta.games_played} games` : " · preseason"}`
            : null
        }
      />
      <PredictionsNav />
      <HubNav
        items={[
          { label: "National title race", href: "#natty" },
          { label: "The field", href: "#field" },
          { label: "Title games", href: "#ccg" },
          { label: "Top 25 games", href: "#games" },
          { label: "Games that matter", href: "#leverage" },
          { label: "Bubble watch", href: "#bubble" },
          { label: "Model record", href: "#record" },
          { label: "Every team", href: "#conferences" },
          { label: "Picks", href: "#picks" },
        ]}
      />

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
          <section id="natty" className="mb-10 rounded-2xl border p-5 sm:p-6" style={{ borderColor: "var(--border)" }}>
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
                  <span className="flex-1 h-2 rounded min-w-0" style={{ background: "var(--bg-card)" }}>
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
          <Disclosure id="field" title="The twelve-team field" meta="12 teams" className="mb-10" bodyClassName="p-4 sm:p-5">
            <p className="text-sm text-[var(--text-muted)] mb-1">
              Five conference champions and seven at-large, seeded straight by committee rank, byes to
              the top four seeds.
            </p>
            <details className="mb-4 max-w-3xl">
              <summary className="text-xs text-[var(--text-dim)] cursor-pointer hover:text-[var(--accent)]">How the field fills</summary>
              <div className="mt-2 text-sm text-[var(--text-muted)]">
                Because only four power conferences exist, at least one of the five champion bids always
                goes to a Group of 5 league, so eleven spots are effectively contested by the Power 4 and
                Notre Dame, and the twelfth is reserved for the best Group of 5 champion, with a second
                sneaking in when one earns it.
              </div>
            </details>
            <div className="grid gap-4 lg:grid-cols-2 items-start">
              <div className="min-w-0">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                  The eleven contested spots - Power 4 + Notre Dame
                </h3>
                <ResponsiveTable
                  variant="list"
                  mobileNoun="teams"
                  className="rounded-xl border"
                  style={BORD}
                  mobileRows={p4Field.map((r, i) => (
                    <TeamOddsRow
                      key={r.espn_id}
                      name={mobileName(r, href(r.slug))}
                      band={
                        <span className="inline-flex items-center gap-1.5">
                          {r.band && <Band band={r.band} />}
                          <span className="text-[13px] text-[var(--text-muted)]">
                            {r.conference}{i < 11 ? " · qualifying" : ""}
                          </span>
                        </span>
                      }
                      right={pct(r.p_playoff)}
                      metricLabel="playoff"
                      rightSub={`bye ${pct(r.p_bye)}`}
                    />
                  ))}
                >
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                        <th className="px-3 py-2 font-semibold">Team</th>
                        <th className="px-3 py-2 text-right font-semibold">Playoff</th>
                        <th className="px-3 py-2 text-right font-semibold">Top-4 seed</th>
                        <th className="px-3 py-2 text-right font-semibold">Natl title</th>
                        <th className={`px-3 py-2 font-semibold ${SMCOL}`}>Conference</th>
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
                          <td className="px-3 py-2 text-right font-bold" style={MONO}>
                            <span className="inline-flex items-center justify-end gap-1.5">
                              {pct(r.p_playoff)}
                              {r.band && <Band band={r.band} />}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right" style={MONO}>{pct(r.p_bye)}</td>
                          <td className="px-3 py-2 text-right" style={MONO}>{pct(r.p_natty)}</td>
                          <td className={`px-3 py-2 whitespace-nowrap text-[var(--text-muted)] ${SMCOL}`}>{r.conference}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ResponsiveTable>
                <p className="text-xs text-[var(--text-dim)] mt-2">
                  Green rows mark the eleven most likely qualifiers from this pool; the line under row
                  eleven is the cut.
                </p>
              </div>
              <div className="min-w-0" data-mobile-uncapped="the model's top six Group of 5 contenders">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                  The Group of 5 bid
                </h3>
                <ResponsiveTable
                  variant="list"
                  mobileNoun="teams"
                  mobileInitial={0}
                  className="rounded-xl border"
                  style={BORD}
                  mobileRows={g5Field.map((r, i) => (
                    <TeamOddsRow
                      key={r.espn_id}
                      name={mobileName(r, href(r.slug))}
                      band={
                        <span className="text-[13px] text-[var(--text-muted)]">
                          {r.conference}{i === 0 ? " · favourite" : ""}
                        </span>
                      }
                      right={pct(r.p_playoff)}
                      metricLabel="playoff"
                      rightSub={`title ${pct(r.p_natty)}`}
                    />
                  ))}
                >
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                        <th className="px-3 py-2 font-semibold">Team</th>
                        <th className="px-3 py-2 text-right font-semibold">Playoff</th>
                        <th className="px-3 py-2 text-right font-semibold">Conference title</th>
                        <th className="px-3 py-2 text-right font-semibold">Natl title</th>
                        <th className={`px-3 py-2 font-semibold ${SMCOL}`}>Conference</th>
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
                          <td className="px-3 py-2 text-right font-bold" style={MONO}>
                            <DataBar v={r.p_playoff} max={g5PlayoffMax} dp={1} suffix="%" color="var(--seq-4)" width={100} />
                          </td>
                          <td className="px-3 py-2 text-right" style={MONO}>{pct(r.p_conf)}</td>
                          <td className="px-3 py-2 text-right" style={MONO}>{pct(r.p_natty)}</td>
                          <td className={`px-3 py-2 whitespace-nowrap text-[var(--text-muted)] ${SMCOL}`}>{r.conference}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ResponsiveTable>
                <p className="text-xs text-[var(--text-dim)] mt-2">
                  The guaranteed spot goes to the highest-ranked of these leagues&apos; champions - the
                  green row is the current favourite to claim it.
                </p>
              </div>
            </div>
          </Disclosure>

          {/* Conference title games */}
          <Disclosure id="ccg" title="The conference title games" meta={plural(ccgCards.length, "pairings", "pairing")} className="mb-10" bodyClassName="p-4 sm:p-5">
            <p className="text-sm text-[var(--text-muted)] mb-4">
              The likeliest title-game pairing per league, each team&apos;s odds of reaching it, and the
              favourite to win outright.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-mobile-uncapped="one pairing card per conference, ten total">
              {ccgCards.map(({ conference, pair, fav }) => (
                <div key={conference} className="min-w-0 rounded-xl border p-4" style={CARD}>
                  <div className="text-[11px] uppercase tracking-widest mb-2" style={{ ...MONO, color: "var(--text-muted)" }}>{conference}</div>
                  {pair.map((r) => (
                    <div key={r.espn_id} className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-sm truncate min-w-0"><TeamLabel name={r.name} href={href(r.slug)} rank={r.ap_rank} /></span>
                      <span className="text-[13px] flex-shrink-0" style={MONO}>{pct(r.p_ccg)}</span>
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
          </Disclosure>

          {/* Next games - AP Top 25 only */}
          {upcoming.length > 0 && (
            <Disclosure id="games" title="The week&apos;s Top 25 games, called" meta={plural(upcoming.length, "games", "game")} className="mb-10" bodyClassName="p-4 sm:p-5">
              <p className="text-sm text-[var(--text-muted)] mb-1">
                Every game involving an AP Top 25 team{pollLabel ? ` (${pollLabel} poll)` : ""}, win
                probability for the home side.
              </p>
              <details className="mb-4 max-w-3xl">
                <summary className="text-xs text-[var(--text-dim)] cursor-pointer hover:text-[var(--accent)]">How this is measured</summary>
                <div className="mt-2 text-sm text-[var(--text-muted)]">
                  {anyMarket
                    ? "The pick blends the model and the posted line 50/50."
                    : "The market column joins once lines are posted."}{" "}
                  {anyMeta
                    ? "Books is the consensus of every posted price we can read — DraftKings, FanDuel and Kalshi — de-vigged by the power method and averaged in log-odds. Three books, not the four the NFL board carries: Polymarket lists college futures and awards but no game markets. It is not in the pick: the pick still blends the model with the single posted line, so the record stays comparable with every call made before the consensus existed. A price we had to translate from a spread is carried on the Ledger but never votes here."
                    : ""} Each week&apos;s slate is published
                  after the AP poll drops, frozen on first sight, and graded against the final score below.
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
                    team1={<>{e.ap.away ? <span style={{ ...MONO, color: "var(--text-dim)" }}>#{e.ap.away} </span> : null}{e.away}</>}
                    sep={e.neutral ? "vs" : "at"}
                    team2={<>{e.ap.home ? <span style={{ ...MONO, color: "var(--text-dim)" }}>#{e.ap.home} </span> : null}{e.home}</>}
                    neutral={e.neutral}
                    kickoff={fmtDate(e.date)}
                    modelPct={`Model ${ppct(e.model.pH)}`}
                    marketPct={anyMeta
                      ? (e.meta_market
                          ? `Books ${ppct(e.meta_market.pH)}${e.meta_market.books ? ` (${e.meta_market.books})` : ""}`
                          : "Books —")
                      : anyMarket
                        ? (e.market ? `Market ${ppct(e.market.pH)}` : "Market —")
                        : undefined}
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
                      {anyMeta && <th className="px-3 py-2 text-right font-semibold">Books (home)</th>}
                      <th className="px-3 py-2 font-semibold">Pick</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcoming.map((e) => (
                      <tr key={e.event_id} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="px-3 py-2 whitespace-nowrap" style={{ ...MONO, color: "var(--text-muted)" }}>{fmtDate(e.date)}</td>
                        <td className="px-3 py-2 font-semibold whitespace-nowrap">
                          {e.ap.away ? <span style={{ ...MONO, color: "var(--text-dim)" }}>#{e.ap.away} </span> : null}{e.away}
                          <span style={{ color: "var(--text-dim)" }}> at </span>
                          {e.ap.home ? <span style={{ ...MONO, color: "var(--text-dim)" }}>#{e.ap.home} </span> : null}{e.home}
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
                        {anyMeta && (
                          <td className="px-3 py-2 text-right whitespace-nowrap" style={MONO}>
                            {e.meta_market ? (
                              <>
                                {ppct(e.meta_market.pH)}
                                {e.meta_market.books ? (
                                  <span className="ml-1 text-[11px] text-[var(--text-dim)]">
                                    {e.meta_market.books}
                                    {e.meta_market.derived_only ? "*" : ""}
                                  </span>
                                ) : null}
                              </>
                            ) : (
                              <span style={{ color: "var(--text-dim)" }}>—</span>
                            )}
                          </td>
                        )}
                        <td className="px-3 py-2 font-semibold" style={{ color: "var(--accent)" }}>{PICK_LABEL(e)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ResponsiveTable>
            </Disclosure>
          )}

          {/* Games that matter this week */}
          {leverageGames.length > 0 && (
            <Disclosure id="leverage" title="Games that matter this week" meta={plural(leverageGames.length, "games", "game")} className="mb-10" bodyClassName="p-4 sm:p-5">
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
                    sep={e.neutral ? "vs" : "at"}
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
                      <th className={`px-3 py-2 text-right font-semibold ${SMCOL}`}>Swing (away)</th>
                      <th className="px-3 py-2 font-semibold">Our pick</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leverageGames.map((e) => (
                      <tr key={e.event_id} className="border-t" style={BORD}>
                        <td className="px-3 py-2 whitespace-nowrap" style={{ ...MONO, color: "var(--text-muted)" }}>{fmtDate(e.date)}</td>
                        <td className="px-3 py-2 font-semibold whitespace-nowrap">
                          {e.away} <span style={{ color: "var(--text-dim)" }}>{e.neutral ? "vs" : "at"}</span> {e.home}
                        </td>
                        <td className="px-3 py-2 text-right" style={MONO}>{pct(e.leverage.home)}</td>
                        <td className={`px-3 py-2 text-right ${SMCOL}`} style={MONO}>{pct(e.leverage.away)}</td>
                        <td className="px-3 py-2 font-semibold" style={{ color: "var(--accent)" }}>{PICK_LABEL(e)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ResponsiveTable>
            </Disclosure>
          )}

          {/* Bubble watch */}
          {bubbleRows.length > 0 && (
            <Disclosure id="bubble" title="Bubble watch" meta={plural(bubbleRows.length, "teams", "team")} className="mb-10" bodyClassName="p-4 sm:p-5">
              <p className="text-sm text-[var(--text-muted)] mb-4">
                Teams most often on the last at-large line: the twelfth team in, or the first team out.
              </p>
              <ResponsiveTable
                variant="list"
                mobileNoun="teams"
                className="rounded-xl border"
                style={BORD}
                mobileRows={bubbleRows.map((r) => (
                  <TeamOddsRow
                    key={r.espn_id}
                    name={mobileName(r, href(r.slug))}
                    band={r.band ? <Band band={r.band} /> : null}
                    right={pct(r.p_bubble)}
                    metricLabel="bubble"
                    rightSub={`playoff ${pct(r.p_playoff)}`}
                  />
                ))}
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left" style={{ background: "var(--bg-card)" }}>
                      <th className="px-3 py-2 font-semibold">Team</th>
                      <th className="px-3 py-2 text-right font-semibold">Playoff</th>
                      <th className="px-3 py-2 text-right font-semibold">Bubble</th>
                      <th className="px-3 py-2 font-semibold">Band</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bubbleRows.map((r) => (
                      <tr key={r.espn_id} className="border-t" style={BORD}>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <TeamLabel name={r.name} href={href(r.slug)} rank={r.ap_rank} />
                        </td>
                        <td className="px-3 py-2 text-right" style={MONO}>{pct(r.p_playoff)}</td>
                        <td className="px-3 py-2 text-right" style={MONO}>{pct(r.p_bubble)}</td>
                        <td className="px-3 py-2">{r.band && <Band band={r.band} />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ResponsiveTable>
            </Disclosure>
          )}

          {/* Tracking */}
          <Disclosure id="record" title="How the model is doing" meta={plural(graded.length, "games", "game")} className="mb-10" bodyClassName="p-5 sm:p-6">
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
                  <ResponsiveTable
                    variant="list"
                    mobileNoun="games"
                    className="rounded-xl border"
                    style={BORD}
                    mobileRows={graded.map((e) => (
                      <FixtureRow
                        key={e.event_id}
                        team1={e.away}
                        sep={e.neutral ? "vs" : "at"}
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
                          <th className={`px-3 py-2 text-right font-semibold ${SMCOL}`}>Brier</th>
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
                            <td className={`px-3 py-2 text-right ${SMCOL}`} style={MONO}>{e.model_brier?.toFixed(3) ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ResponsiveTable>
                )}
              </>
            ) : (
              <p className="text-sm text-[var(--text-muted)] max-w-3xl">
                Every prediction above is frozen the moment it is published. Once the season kicks off,
                this section keeps the running score on AP Top 25 games: how many picks landed, and the
                model&apos;s Brier score against the betting line&apos;s - in public, win or lose.
              </p>
            )}
          </Disclosure>

          {/* Conference tables */}
          <Disclosure id="conferences" title="Every team, every outcome" meta={plural(conferences.length, "conferences", "conference")} className="mb-10" bodyClassName="p-4 sm:p-5">
            <p className="text-sm text-[var(--text-muted)] mb-4">
              Expected regular-season wins and the odds of each landing spot, conference by conference.
            </p>
            {/* min-w-0 on each column: a grid child holding a table otherwise
                inflates its track past the viewport (DESIGN-STANDARDS.md). */}
            {liteRows && classicRows ? (
              <TierTabs
                defaultTab="deluxe"
                tabs={[
                  { key: "lite", label: "Lite (stats only)" },
                  { key: "classic", label: "Classic (stats + market)" },
                  { key: "deluxe", label: "Deluxe (+ AP poll)" },
                ]}
              >
                {[
                  <div key="lite" className="grid gap-4 lg:grid-cols-2">
                    {conferences.map((c) => (
                      <div key={c} className="min-w-0">
                        <ConferenceTable rows={liteRows} conference={c} href={href} history={history} withHistory={false} />
                      </div>
                    ))}
                  </div>,
                  <div key="classic" className="grid gap-4 lg:grid-cols-2">
                    {conferences.map((c) => (
                      <div key={c} className="min-w-0">
                        <ConferenceTable rows={classicRows} conference={c} href={href} history={history} withHistory={false} />
                      </div>
                    ))}
                  </div>,
                  <div key="deluxe" className="grid gap-4 lg:grid-cols-2">
                    {conferences.map((c) => (
                      <div key={c} className="min-w-0">
                        <ConferenceTable rows={rows} conference={c} href={href} history={history} withHistory />
                      </div>
                    ))}
                  </div>,
                ]}
              </TierTabs>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {conferences.map((c) => (
                  <div key={c} className="min-w-0">
                    <ConferenceTable rows={rows} conference={c} href={href} history={history} withHistory />
                  </div>
                ))}
              </div>
            )}
            <p className="text-[13px] text-[var(--text-muted)] mt-4">
              Get the data:{" "}
              <Link href="/predictions/cfb/table.csv" className="hover:underline">season table as CSV</Link>
              {" · "}
              <a href={`${CFB_DATA_GH_BASE}/cfb-sim.json`} className="hover:underline" target="_blank" rel="noreferrer">
                raw JSON on GitHub
              </a>
            </p>
          </Disclosure>

          {/* Citizen of Nowhere Picks */}
          <section id="picks" className="mb-10 rounded-2xl border p-5 sm:p-6" style={CARD}>
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <span aria-hidden>&#127919;</span> Citizen of Nowhere Picks
            </h2>
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
                Ratings start from three seasons of opponent-adjusted FBS scoring margin ({meta.strength_seasons.join(", ")}),
                anchored to the national-championship futures market and the AP poll, then replayed forward against
                the real remaining 2026 schedule. Last generated {meta.generated_at}
                {meta.games_played > 0 ? `, after ${meta.games_played} games played` : " (preseason)"}. Weekly
                picks cover AP Top 25 games, blend the model 50/50 with the posted line, and are graded against
                final scores above; the Brier scores on this page use that same graded record.
              </p>
              <Disclosure title="How the model works" desktopOpen bodyClassName="p-4 sm:p-5" className="mt-1">
                <p className="text-[13.5px] text-[var(--text-muted)] leading-relaxed">
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
                {meta.model === "points-v3" && (
                  <p className="text-[13.5px] text-[var(--text-muted)] leading-relaxed mt-3">
                    Three tiers of this model run side by side: a stats-only &quot;lite&quot; rating, a
                    &quot;classic&quot; build that adds the title market, and the full &quot;deluxe&quot; build
                    that also folds in the AP poll - deluxe is the production tier shown by default above.
                    Uncertainty shrinks as the season does - the spread of outcomes each simulated season draws
                    from narrows week by week as fewer games remain, and widens back out for a team the stats
                    and the market disagree about most. Each simulated season also draws one correlated error
                    for the whole sport, one for each conference, and one for each team, rather than treating
                    every game as its own coin flip - real seasons run hot or cold together, not independently.
                    Every tier reuses the same random draws for the same simulated season, so a change from one
                    build to the next reflects an actual change in the inputs rather than noise in which season
                    got drawn.
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
