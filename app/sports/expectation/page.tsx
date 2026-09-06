import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import HubNav from "@/app/teams/HubNav";
import { TableScroll } from "@/app/_shared/TableScroll";
import HomeAdvantageChart from "@/app/teams/_shared/HomeAdvantageChart";
import { getHomeAdvantage, seriesShape } from "@/lib/expectation";
import { getPlExpectation } from "@/lib/plExpectation";
import { getNflExpectation } from "@/lib/nflExpectation";
import { getIntlExpectation } from "@/lib/intlExpectation";
import { BASE_URL, SITE_NAME } from "@/lib/seo";

import { SectionHead } from "@/app/_shared/SectionHead";
import { DataBar } from "@/app/_shared/DataBar";
// The one place the expectation ledgers answer for themselves.
//
// 🔴 THIS IS NOT A BOARD OF BOARDS. Ashwin, on the NFL-only page this one
// replaces: "I don't know what to do with this page. What is it supposed to
// show? Even someone as nerdy about stats just doesn't see a use for this."
// He was right. Four leaderboards of a statistic, with the statistic as the
// subject, is a lab bench. So this page leads with a CLAIM, keeps the boards
// underneath it as evidence, and closes by saying exactly where the numbers
// came from and what is still wrong with them. The club and metro pages carry
// the same measure one sentence at a time and link here for the method.

const PAGE_PATH = "/sports/expectation";
const PAGE_TITLE = "Against Expectation";
const PAGE_DESCRIPTION =
  "Six European top flights since 1888 and every NFL game since 1920, scored against the chance each result was given before kick-off, on one model. Home advantage has collapsed in both sports, and the Eredivisie turns out to be the most predictable of the six.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: {
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
    url: `${BASE_URL}${PAGE_PATH}`,
    type: "website",
  },
  twitter: {
    images: ["/og-default.png"],
    card: "summary_large_image",
    title: `${PAGE_TITLE} | ${SITE_NAME}`,
    description: PAGE_DESCRIPTION,
  },
};

export const revalidate = 86400;

const MONO: CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const CARD: CSSProperties = { background: "var(--bg-card)", borderColor: "var(--border)" };
const BORD: CSSProperties = { borderColor: "var(--border)" };
// Validated diverging tokens; see globals.css. Never a raw hex.
const UP = "var(--div-pos)";
const DOWN = "var(--div-neg)";

function signed(v: number, dp = 1) {
  return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(dp)}`;
}

function Stat({ v, k, sub }: { v: string; k: string; sub?: string }) {
  return (
    <div className="rounded-xl border p-4 min-w-0" style={CARD}>
      <div className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">{k}</div>
      <div className="text-2xl font-bold mt-1 tabular-nums" style={MONO}>{v}</div>
      {sub ? <div className="text-xs text-[var(--text-muted)] mt-1">{sub}</div> : null}
    </div>
  );
}


function Delta({ v, dp = 1 }: { v: number; dp?: number }) {
  return (
    <span className="tabular-nums font-semibold" style={{ ...MONO, color: v >= 0 ? UP : DOWN }}>
      {signed(v, dp)}
    </span>
  );
}

export default async function ExpectationPage() {
  const [ha, pl, nfl, intl] = await Promise.all([
    getHomeAdvantage().catch(() => null),
    getPlExpectation().catch(() => null),
    getNflExpectation().catch(() => null),
    // Spain, Italy, Germany, France, the Netherlands. Same model as the
    // English ledger, imported rather than copied, and with NO market layer.
    getIntlExpectation().catch(() => null),
  ]);

  const fb = ha?.series.find((s) => s.key === "football") ?? null;
  const nf = ha?.series.find((s) => s.key === "nfl") ?? null;
  const fbShape = fb ? seriesShape(fb) : null;
  const nfShape = nf ? seriesShape(nf) : null;

  // 🔴 DERIVE THE MARKET COMPARISON, NEVER ASSERT IT. This copy first read
  // "the market was closer in every one of them", written from the three
  // seasons that happened to be in front of me. Over the 24 priced seasons the
  // model actually wins one. On a page whose whole argument is that you can
  // check it, a claim nobody computed is the one unforgivable thing.
  const plPriced = (pl?.seasons ?? []).filter(
    (s) => s.market_matches > 0 && s.market_brier != null && s.market_model_brier != null,
  );
  const plMarket = plPriced.length
    ? (() => {
        const n = plPriced.reduce((a, s) => a + s.market_matches, 0);
        const w = (pick: (s: (typeof plPriced)[number]) => number) =>
          plPriced.reduce((a, s) => a + pick(s) * s.market_matches, 0) / n;
        const better = plPriced.filter((s) => (s.market_model_brier ?? 1) < (s.market_brier ?? 0));
        return {
          seasons: plPriced.length,
          matches: n,
          // Of those matches, how many carry a true closing price. Undefined on
          // a ledger built before 2026-08-30, hence the null, not a zero.
          closing: plPriced.some((s) => s.market_closing_matches != null)
            ? plPriced.reduce((a, s) => a + (s.market_closing_matches ?? 0), 0)
            : null,
          model: w((s) => s.market_model_brier ?? 0),
          market: w((s) => s.market_brier ?? 0),
          modelBetter: better.length,
          bestSeason: better.length === 1 ? better[0].season : null,
        };
      })()
    : null;

  const plBest = pl?.best_seasons?.[0];

  // The six football leagues on one axis: skill against each league's OWN era
  // baseline, so a century of Serie A and sixty years of the Bundesliga can
  // sit in one column. England joins from its own ledger, same quantity.
  const leagues = intl
    ? [
        ...(pl
          ? [{
              key: "England",
              competition: "English top flight",
              seasons: pl.meta.seasons,
              season_count: pl.meta.season_count,
              matches: pl.meta.matches,
              skill: pl.meta.skill_vs_era_baseline,
            }]
          : []),
        ...intl.metas.map((m) => ({
          key: m.country,
          competition: m.competition,
          seasons: m.seasons,
          season_count: m.season_count,
          matches: m.matches,
          skill: m.skill_vs_era_baseline,
        })),
      ].sort((a, b) => b.skill - a.skill)
    : [];
  const mostPredictable = leagues[0] ?? null;
  const leastPredictable = leagues.length > 1 ? leagues[leagues.length - 1] : null;

  // Five best and five worst continental seasons, ranked on MATCH points. The
  // three-point switch landed in 1994-95 in France and Italy and 1995-96 in
  // Spain, Germany and the Netherlands, so league points cannot rank across
  // these five leagues and match points can.
  const intlSeasons = [
    ...(intl?.best_seasons ?? []).slice(0, 5),
    ...(intl?.worst_seasons ?? []).slice(0, 5),
  ];

  // Every season in these five payloads whose table is not final, named where
  // its numbers appear rather than in a footnote nobody opens.
  // Depth and dominance are different quantities, and the metro layer is the
  // only place the difference can be said. Both rows are LOOKED UP, never
  // quoted from a scoping note: the note this was built from had the
  // most-clubs metro's surplus and club count both wrong.
  const intlTopMetro = intl?.metros?.[0] ?? null;
  const intlDeepestMetro = (intl?.metros ?? []).reduce<typeof intlTopMetro>(
    (a, b) => (a && a.clubs >= b.clubs ? a : b),
    null,
  );

  const intlCaveats = (intl?.metas ?? []).flatMap((m) => [
    ...m.partial_seasons.map((x) => ({ country: m.country, season: x.season, note: x.reason })),
    ...m.grouped_seasons.map((x) => ({ country: m.country, season: x.season, note: x.reason })),
  ]);
  const stamp = [
    pl ? `${pl.meta.matches.toLocaleString()} English top-flight matches ${pl.meta.seasons[0]}–${pl.meta.seasons[1]}` : null,
    intl ? `${intl.totals.matches.toLocaleString()} matches in ${intl.totals.leagues} continental top flights ${intl.totals.first_season}–${intl.totals.last_season}` : null,
    nfl ? `${nfl.meta.games.toLocaleString()} NFL games ${nfl.meta.seasons[0]}–${nfl.meta.seasons[1]}` : null,
    // The newest of the ledgers actually on the page, not England's alone:
    // the continental five were built after it and the stamp must not age them.
    (() => {
      const built = [pl?.meta.generated_at, intl?.totals.generated_at].filter(Boolean).sort();
      return built.length ? `built ${String(built[built.length - 1]).slice(0, 10)}` : null;
    })(),
  ].filter(Boolean).join(" · ");

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        {" / "}
        <Link href="/sports" className="hover:underline">Sports</Link>
        {" / "}
        <span>Against Expectation</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">🎲 Against Expectation</h1>
        <p className="mt-2 text-[15px] text-[var(--text-muted)] max-w-3xl">
          The record book says who won. It cannot say who was lucky, who was robbed, or which result
          was genuinely impossible. Every match in six European top flights since 1888 and every NFL
          game since 1920 is scored here against the chance it was given before kick-off, on one
          model, which turns out to reveal several things none of those leagues has ever announced.
        </p>
        <div className="mt-2 text-[11px] uppercase tracking-wider text-[var(--text-dim)]" style={MONO}>
          {stamp}
        </div>
      </header>

      <HubNav items={[
        { label: "Home advantage is dying", href: "#home-advantage" },
        { label: "Longest odds beaten", href: "#upsets" },
        { label: "Seasons that broke the model", href: "#seasons" },
        { label: "Six leagues, one model", href: "#leagues" },
        { label: "By metro", href: "#metros" },
        { label: "Against the market", href: "#market" },
        { label: "Where the numbers come from", href: "#method" },
      ]} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-10">
        {fbShape ? (
          <Stat
            v={`${Math.round(fbShape.peak.hfa)} → ${Math.round(fbShape.last.hfa)}`}
            k="Football home advantage"
            sub={`Elo points, ${fbShape.peak.season} to ${fbShape.last.season}`}
          />
        ) : null}
        {nfShape ? (
          <Stat
            v={`${Math.round(nfShape.peak.hfa)} → ${Math.round(nfShape.last.hfa)}`}
            k="NFL home advantage"
            sub={`Elo points, ${nfShape.peak.season} to ${nfShape.last.season}`}
          />
        ) : null}
        {plBest ? (
          <Stat
            v={signed(plBest.diff)}
            k="Biggest season, football"
            sub={`${plBest.club}, ${plBest.season}`}
          />
        ) : null}
        {pl?.upsets?.[0] ? (
          <Stat
            v={`${(pl.upsets[0].p_winner * 100).toFixed(1)}%`}
            k="Longest odds ever beaten"
            sub={`${pl.upsets[0].winner} at ${pl.upsets[0].loser}, ${pl.upsets[0].season}`}
          />
        ) : null}
      </div>

      {/* ---------------------------------------------------- the claim */}
      <section className="mb-12">
        <SectionHead
          id="home-advantage"
          title="Home advantage is dying, in both sports at once"
          sub="Not a rule change, not a season, not one league."
          more="Two sports on different continents, with nothing in common but crowds and travel, both peaked around the same moment and have been falling ever since."
        />
        <div className="rounded-xl border p-4 sm:p-5 min-w-0" style={CARD}>
          {ha ? <HomeAdvantageChart series={ha.series} /> : (
            <p className="text-sm text-[var(--text-muted)]">Series unavailable.</p>
          )}
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-[var(--text-muted)] max-w-4xl">
          <p>
            {fbShape && nfShape ? (
              <>
                English football spotted the home side{" "}
                <span className="tabular-nums text-[var(--text)]" style={MONO}>{Math.round(fbShape.peak.hfa)}</span>{" "}
                Elo points at its peak in {fbShape.peak.season}. Last season it was{" "}
                <span className="tabular-nums text-[var(--text)]" style={MONO}>{Math.round(fbShape.last.hfa)}</span>.
                The NFL went from{" "}
                <span className="tabular-nums text-[var(--text)]" style={MONO}>{Math.round(nfShape.peak.hfa)}</span>{" "}
                in {nfShape.peak.season} to{" "}
                <span className="tabular-nums text-[var(--text)]" style={MONO}>{Math.round(nfShape.last.hfa)}</span>{" "}
                in {nfShape.last.season}, close enough to nothing that playing at home is now worth
                less than the gap between two mid-table sides.
              </>
            ) : null}
          </p>
          <p>
            The measure is Elo points rather than home-win share on purpose. About a quarter of
            English league matches are drawn and almost no NFL game is tied, so the two leagues&rsquo;
            home-win percentages are not comparable and never were. The rating gap a home side is
            effectively spotted is:{" "}
            <span className="text-[var(--text)]" style={MONO}>400·log₁₀(home wins / away wins)</span>,
            in which the draws divide out. That is the only reason these two lines are allowed to
            share an axis.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------- the upsets */}
      <section className="mb-12">
        <SectionHead
          id="upsets"
          title="The longest odds ever beaten"
          sub="Nobody curated these; the model went looking for improbability."
          more="It came back holding matches both sports already tell stories about, which is the best evidence it has taste."
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold mb-2">English top flight</h3>
            <TableScroll className="rounded-xl border" style={CARD}>
              <table className="w-full text-xs" data-sticky-col="2">
                <thead>
                  <tr className="text-[var(--text-dim)] text-left">
                    <th className="py-2 px-3 font-medium">#</th>
                    <th className="py-2 px-3 font-medium">Match</th>
                    <th className="py-2 px-3 font-medium text-right">Chance</th>
                    <th className="py-2 px-3 font-medium hidden sm:table-cell">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => { const rows = (pl?.upsets ?? []).slice(0, 10);
                    const colMax = Math.max(...rows.map((r) => r.p_winner), 0.0001);
                    return rows.map((u, i) => (
                    <tr key={u.date + u.home} className="border-t" style={BORD}>
                      <td className="py-1.5 px-3 tabular-nums text-[var(--text-dim)]" style={MONO}>{i + 1}</td>
                      <td className="py-1.5 px-3 whitespace-nowrap">
                        {u.home}{" "}
                        <span className="tabular-nums text-[var(--text-dim)]" style={MONO}>{u.score}</span>{" "}
                        {u.away}
                        <span className="block text-[11px] text-[var(--text-muted)]">
                          {u.winner_slug ? (
                            <Link href={`/teams/football/${u.winner_slug}`} className="text-[var(--accent)] hover:underline">{u.winner}</Link>
                          ) : u.winner}{" "}
                          won {u.at_home ? "at home" : "away"}
                        </span>
                      </td>
                      <td className="py-1.5 px-3">
                        <DataBar v={u.p_winner} max={colMax} dp={1} suffix="%" scale={100}
                                 color="var(--div-neg)" width={104} label="chance the winner had" />
                      </td>
                      <td className="py-1.5 px-3 text-[var(--text-muted)] tabular-nums hidden sm:table-cell whitespace-nowrap" style={MONO}>
                        {u.date}
                      </td>
                    </tr>
                  )); })()}
                </tbody>
              </table>
            </TableScroll>
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold mb-2">NFL</h3>
            <TableScroll className="rounded-xl border" style={CARD}>
              <table className="w-full text-xs" data-sticky-col="2">
                <thead>
                  <tr className="text-[var(--text-dim)] text-left">
                    <th className="py-2 px-3 font-medium">#</th>
                    <th className="py-2 px-3 font-medium">Match</th>
                    <th className="py-2 px-3 font-medium text-right">Chance</th>
                    <th className="py-2 px-3 font-medium hidden sm:table-cell">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => { const rows = (nfl?.upsets ?? []).slice(0, 10);
                    const colMax = Math.max(...rows.map((r) => r.p_winner), 0.0001);
                    return rows.map((u, i) => (
                    <tr key={u.game_id} className="border-t" style={BORD}>
                      <td className="py-1.5 px-3 tabular-nums text-[var(--text-dim)]" style={MONO}>{i + 1}</td>
                      <td className="py-1.5 px-3 whitespace-nowrap">
                        {u.winner_slug ? (
                          <Link href={`/teams/nfl/${u.winner_slug}`} className="text-[var(--accent)] hover:underline">{u.winner}</Link>
                        ) : u.winner}{" "}
                        <span className="tabular-nums text-[var(--text-dim)]" style={MONO}>{u.score}</span>
                        <span className="block text-[11px] text-[var(--text-muted)]">beat {u.loser}</span>
                      </td>
                      <td className="py-1.5 px-3">
                        <DataBar v={u.p_winner} max={colMax} dp={1} suffix="%" scale={100}
                                 color="var(--div-neg)" width={104} label="chance the winner had" />
                      </td>
                      <td className="py-1.5 px-3 text-[var(--text-muted)] tabular-nums hidden sm:table-cell whitespace-nowrap" style={MONO}>
                        {u.date ?? String(u.season)}
                      </td>
                    </tr>
                  )); })()}
                </tbody>
              </table>
            </TableScroll>
          </div>
        </div>
      </section>

      {/* ------------------------------------------- seasons that broke it */}
      <section className="mb-12">
        <SectionHead
          id="seasons"
          title="The seasons that broke the model"
          sub="The ratings still could not see these coming."
          more="England is measured in league points under that season's own scoring; the NFL in wins; the five continental leagues in match points, because they switched to three points for a win in three different seasons and league points cannot rank across them. None of the three is added to another."
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold mb-2">English top flight, league points vs expected</h3>
            <TableScroll className="rounded-xl border" style={CARD}>
              <table className="w-full text-xs" data-sticky-col="2">
                <thead>
                  <tr className="text-[var(--text-dim)] text-left">
                    <th className="py-2 px-3 font-medium">#</th>
                    <th className="py-2 px-3 font-medium">Club</th>
                    <th className="py-2 px-3 font-medium text-right">vs expected</th>
                    <th className="py-2 px-3 font-medium text-right hidden sm:table-cell">Got</th>
                    <th className="py-2 px-3 font-medium text-right hidden sm:table-cell">Expected</th>
                  </tr>
                </thead>
                <tbody>
                  {[...(pl?.best_seasons ?? []).slice(0, 5), ...(pl?.worst_seasons ?? []).slice(0, 5)].map((r, i) => (
                    <tr key={`${r.season}-${r.club}`} className="border-t" style={BORD}>
                      <td className="py-1.5 px-3 tabular-nums text-[var(--text-dim)]" style={MONO}>{i < 5 ? i + 1 : ""}</td>
                      <td className="py-1.5 px-3 whitespace-nowrap">
                        <span className="tabular-nums text-[var(--text-dim)] mr-1.5" style={MONO}>{r.season}</span>
                        {r.slug ? (
                          <Link href={`/teams/football/${r.slug}`} className="text-[var(--accent)] hover:underline">{r.club}</Link>
                        ) : r.club}
                      </td>
                      <td className="py-1.5 px-3 text-right"><Delta v={r.diff} /></td>
                      <td className="py-1.5 px-3 text-right tabular-nums hidden sm:table-cell" style={MONO}>{r.pts}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-[var(--text-muted)] hidden sm:table-cell" style={MONO}>{r.xpts.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold mb-2">Spain, Italy, Germany, France and the Netherlands, match points vs expected</h3>
            <TableScroll className="rounded-xl border" style={CARD}>
              <table className="w-full text-xs" data-sticky-col="2">
                <thead>
                  <tr className="text-[var(--text-dim)] text-left">
                    <th className="py-2 px-3 font-medium">#</th>
                    <th className="py-2 px-3 font-medium">Club</th>
                    <th className="py-2 px-3 font-medium text-right">vs expected</th>
                    <th className="py-2 px-3 font-medium hidden sm:table-cell">League</th>
                  </tr>
                </thead>
                <tbody>
                  {intlSeasons.map((r, i) => (
                    <tr key={`${r.country}-${r.season}-${r.club}`} className="border-t" style={BORD}>
                      <td className="py-1.5 px-3 tabular-nums text-[var(--text-dim)]" style={MONO}>{i < 5 ? i + 1 : ""}</td>
                      <td className="py-1.5 px-3 whitespace-nowrap">
                        <span className="tabular-nums text-[var(--text-dim)] mr-1.5" style={MONO}>{r.season}</span>
                        {/* 🔴 The board rows carry the ERA name and no slug. The
                            link exists only where that name resolves to exactly
                            one club in the same league's own list. */}
                        {r.slug ? (
                          <Link href={`/teams/football/${r.slug}`} className="text-[var(--accent)] hover:underline">{r.club}</Link>
                        ) : r.club}
                      </td>
                      <td className="py-1.5 px-3 text-right"><Delta v={r.surplus} dp={2} /></td>
                      <td className="py-1.5 px-3 text-[var(--text-muted)] hidden sm:table-cell whitespace-nowrap">{r.competition}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </div>

          <div className="min-w-0">
            <h3 className="text-sm font-semibold mb-2">NFL, wins vs expected</h3>
            <TableScroll className="rounded-xl border" style={CARD}>
              <table className="w-full text-xs" data-sticky-col="2">
                <thead>
                  <tr className="text-[var(--text-dim)] text-left">
                    <th className="py-2 px-3 font-medium">#</th>
                    <th className="py-2 px-3 font-medium">Team</th>
                    <th className="py-2 px-3 font-medium text-right">vs expected</th>
                    <th className="py-2 px-3 font-medium text-right hidden sm:table-cell">Won</th>
                    <th className="py-2 px-3 font-medium text-right hidden sm:table-cell">Expected</th>
                  </tr>
                </thead>
                <tbody>
                  {[...(nfl?.best_seasons ?? []).slice(0, 5), ...(nfl?.worst_seasons ?? []).slice(0, 5)].map((r, i) => (
                    <tr key={`${r.season}-${r.key}`} className="border-t" style={BORD}>
                      <td className="py-1.5 px-3 tabular-nums text-[var(--text-dim)]" style={MONO}>{i < 5 ? i + 1 : ""}</td>
                      <td className="py-1.5 px-3 whitespace-nowrap">
                        <span className="tabular-nums text-[var(--text-dim)] mr-1.5" style={MONO}>{r.season}</span>
                        {r.slug ? (
                          <Link href={`/teams/nfl/${r.slug}`} className="text-[var(--accent)] hover:underline">{r.team}</Link>
                        ) : r.team}
                      </td>
                      <td className="py-1.5 px-3 text-right"><Delta v={r.wae ?? 0} dp={2} /></td>
                      <td className="py-1.5 px-3 text-right tabular-nums hidden sm:table-cell" style={MONO}>{r.wins}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-[var(--text-muted)] hidden sm:table-cell" style={MONO}>{r.exp_wins?.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------- six leagues */}
      {leagues.length > 1 ? (
        <section className="mb-12">
          <SectionHead
            id="leagues"
            title="Six leagues, one model, and the most predictable league in Europe"
            sub="Skill is how much the ratings knew that the era's home-and-away split did not."
            more="Every league is scored against its OWN era baseline, so a century of Serie A and sixty years of the Bundesliga can share a column. The five continental ledgers import the English model rather than copying it, so this is one model applied six times, not six models compared. Surplus totals, by contrast, are comparable within a league and only loosely across them, because league size and era differ."
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="min-w-0">
              <TableScroll className="rounded-xl border" style={CARD}>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[var(--text-dim)] text-left">
                      <th className="py-2 px-3 font-medium">League</th>
                      <th className="py-2 px-3 font-medium text-right">Skill</th>
                      <th className="py-2 px-3 font-medium hidden sm:table-cell">Span</th>
                      <th className="py-2 px-3 font-medium text-right hidden sm:table-cell">Seasons</th>
                      <th className="py-2 px-3 font-medium text-right hidden sm:table-cell">Matches</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leagues.map((l) => (
                      <tr key={l.key} className="border-t" style={BORD}>
                        <td className="py-1.5 px-3 whitespace-nowrap">
                          {l.key}
                          <span className="block text-[11px] text-[var(--text-muted)]">{l.competition}</span>
                        </td>
                        <td className="py-1.5 px-3 text-right">
                          <DataBar v={l.skill} dp={2} suffix="%" scale={100}
                                   label="skill against that league's own era baseline" />
                        </td>
                        <td className="py-1.5 px-3 text-[var(--text-muted)] tabular-nums hidden sm:table-cell whitespace-nowrap" style={MONO}>
                          {l.seasons[0]}–{l.seasons[1]}
                        </td>
                        <td className="py-1.5 px-3 text-right tabular-nums text-[var(--text-muted)] hidden sm:table-cell" style={MONO}>{l.season_count}</td>
                        <td className="py-1.5 px-3 text-right tabular-nums text-[var(--text-muted)] hidden sm:table-cell" style={MONO}>
                          {l.matches.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            </div>
            <div className="min-w-0 text-sm text-[var(--text-muted)] space-y-3">
              {mostPredictable && leastPredictable ? (
                <p>
                  The {mostPredictable.competition} is the most predictable of the six and the{" "}
                  {leastPredictable.competition} the least. Predictable is not a judgement on the
                  football. It means the same model, fitted the same way, learns more from the same
                  number of matches, which usually points at a settled gap between a few clubs and
                  the rest rather than at the quality of the play.
                </p>
              ) : null}
              <p>
                The number is the improvement on a baseline that knows nothing about the two clubs,
                only how often that era&rsquo;s matches ended home, away or drawn. A league at{" "}
                <span className="tabular-nums text-[var(--text)]" style={MONO}>0%</span> would be one
                where knowing who is playing tells you nothing you did not already know from the
                fixture list.
              </p>
              <p>
                Nobody publishes this comparison, which is mostly because nobody runs one model
                across six leagues and a century. The settings were fitted on England and reused
                unchanged, so the transfer is a stated choice rather than a tuned result: skill is
                positive in all six, and refitting per league is available and not done.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {/* ---------------------------------------------------- by metro */}
      <section className="mb-12">
        <SectionHead
          id="metros"
          title="By metro, and the thing size does not buy"
          sub="The biggest metro is not the one that beats its odds."
          more="Both ledgers agree on something the league tables never say. London sits barely above par across more than twenty thousand club-matches, and New York is the NFL's biggest underachiever."
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold mb-2">English top flight, match points vs expected</h3>
            <TableScroll className="rounded-xl border" style={CARD}>
              <table className="w-full text-xs" data-sticky-col="2">
                <thead>
                  <tr className="text-[var(--text-dim)] text-left">
                    <th className="py-2 px-3 font-medium">#</th>
                    <th className="py-2 px-3 font-medium">Metro</th>
                    <th className="py-2 px-3 font-medium text-right">vs expected</th>
                    <th className="py-2 px-3 font-medium text-right hidden sm:table-cell">Club-matches</th>
                  </tr>
                </thead>
                <tbody>
                  {(pl?.metros ?? []).slice(0, 8).concat((pl?.metros ?? []).slice(-4)).map((m, i) => (
                    <tr key={m.metro} className="border-t" style={BORD}>
                      <td className="py-1.5 px-3 tabular-nums text-[var(--text-dim)]" style={MONO}>{i < 8 ? i + 1 : ""}</td>
                      <td className="py-1.5 px-3 whitespace-nowrap">
                        {m.metro_slug ? (
                          <Link href={`/rankings/${m.metro_slug}`} className="text-[var(--accent)] hover:underline">{m.metro}</Link>
                        ) : m.metro}
                      </td>
                      <td className="py-1.5 px-3 text-right"><Delta v={m.surplus} /></td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-[var(--text-muted)] hidden sm:table-cell" style={MONO}>
                        {m.club_matches.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold mb-2">The five continental top flights, match points vs expected</h3>
            <TableScroll className="rounded-xl border" style={CARD}>
              <table className="w-full text-xs" data-sticky-col="2">
                <thead>
                  <tr className="text-[var(--text-dim)] text-left">
                    <th className="py-2 px-3 font-medium">#</th>
                    <th className="py-2 px-3 font-medium">Metro</th>
                    <th className="py-2 px-3 font-medium text-right">vs expected</th>
                    <th className="py-2 px-3 font-medium text-right hidden sm:table-cell">Clubs</th>
                    <th className="py-2 px-3 font-medium text-right hidden sm:table-cell">Club-matches</th>
                  </tr>
                </thead>
                <tbody>
                  {(intl?.metros ?? []).slice(0, 8).concat((intl?.metros ?? []).slice(-4)).map((m, i) => (
                    <tr key={m.metro_slug} className="border-t" style={BORD}>
                      <td className="py-1.5 px-3 tabular-nums text-[var(--text-dim)]" style={MONO}>{i < 8 ? i + 1 : ""}</td>
                      <td className="py-1.5 px-3 whitespace-nowrap">
                        <Link href={`/rankings/${m.metro_slug}`} className="text-[var(--accent)] hover:underline">{m.metro}</Link>
                      </td>
                      <td className="py-1.5 px-3 text-right"><Delta v={m.surplus} /></td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-[var(--text-muted)] hidden sm:table-cell" style={MONO}>{m.clubs}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-[var(--text-muted)] hidden sm:table-cell" style={MONO}>
                        {m.club_matches.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </div>

          <div className="min-w-0">
            <h3 className="text-sm font-semibold mb-2">NFL, wins vs expected</h3>
            <TableScroll className="rounded-xl border" style={CARD}>
              <table className="w-full text-xs" data-sticky-col="2">
                <thead>
                  <tr className="text-[var(--text-dim)] text-left">
                    <th className="py-2 px-3 font-medium">#</th>
                    <th className="py-2 px-3 font-medium">Metro</th>
                    <th className="py-2 px-3 font-medium text-right">vs expected</th>
                    <th className="py-2 px-3 font-medium text-right hidden sm:table-cell">Team-seasons</th>
                  </tr>
                </thead>
                <tbody>
                  {(nfl?.metros ?? []).slice(0, 8).concat((nfl?.metros ?? []).slice(-4)).map((m, i) => (
                    <tr key={m.metro} className="border-t" style={BORD}>
                      <td className="py-1.5 px-3 tabular-nums text-[var(--text-dim)]" style={MONO}>{i < 8 ? i + 1 : ""}</td>
                      <td className="py-1.5 px-3 whitespace-nowrap">
                        {m.metro_slug ? (
                          <Link href={`/rankings/${m.metro_slug}`} className="text-[var(--accent)] hover:underline">{m.metro}</Link>
                        ) : m.metro}
                      </td>
                      <td className="py-1.5 px-3 text-right"><Delta v={m.wae} /></td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-[var(--text-muted)] hidden sm:table-cell" style={MONO}>{m.seasons}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </div>
        </div>
        {intlTopMetro && intlDeepestMetro && intlDeepestMetro.metro_slug !== intlTopMetro.metro_slug ? (
          <p className="mt-4 text-sm text-[var(--text-muted)] max-w-3xl">
            {intlTopMetro.metro} tops the continental board at <Delta v={intlTopMetro.surplus} /> match
            points from {intlTopMetro.clubs} club{intlTopMetro.clubs === 1 ? "" : "s"}.{" "}
            {intlDeepestMetro.metro} has {intlDeepestMetro.clubs} clubs in these leagues, more than
            anywhere else, and sits at <Delta v={intlDeepestMetro.surplus} />. Depth and dominance are
            different quantities and a league table cannot separate them. Totals are safe to compare
            within a league and only loosely across them, because league size and era differ.
          </p>
        ) : null}
      </section>

      {/* ---------------------------------------------------- vs market */}
      <section className="mb-12">
        <SectionHead
          id="market"
          title="Against the market, which usually wins"
          sub="Both ledgers are graded against the betting market, and on balance both lose."
          more={
            "A model that only ever showed its own scoreboard would be worth nothing." +
            (plMarket?.closing != null
              ? ` Football carries a true closing price on ${plMarket.closing.toLocaleString()} of ${plMarket.matches.toLocaleString()} priced matches; the rest are pre-match prices, which is all that exists for them.`
              : "")
          }
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl border p-4 min-w-0" style={CARD}>
            <div className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">English top flight</div>
            {plMarket ? (
              <>
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  {plMarket.seasons} seasons priced, {plMarket.matches.toLocaleString()} matches. The model
                  was closer in {plMarket.modelBetter} of them
                  {plMarket.modelBetter === 1 && plMarket.bestSeason ? <>: {plMarket.bestSeason}</> : null}.
                </p>
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  Over those matches the model scores{" "}
                  <span className="tabular-nums text-[var(--text)]" style={MONO}>{plMarket.model.toFixed(4)}</span>{" "}
                  and the market{" "}
                  <span className="tabular-nums text-[var(--text)]" style={MONO}>{plMarket.market.toFixed(4)}</span>.
                  Across the whole 1888 history the model&rsquo;s Brier is{" "}
                  <span className="tabular-nums text-[var(--text)]" style={MONO}>{pl?.meta.brier.toFixed(4)}</span>,
                  a{" "}
                  <span className="tabular-nums text-[var(--text)]" style={MONO}>
                    {((pl?.meta.skill_vs_era_baseline ?? 0) * 100).toFixed(1)}%
                  </span>{" "}
                  improvement on knowing nothing but the era&rsquo;s home-and-away split.
                </p>
              </>
            ) : null}
          </div>
          <div className="rounded-xl border p-4 min-w-0" style={CARD}>
            <div className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">NFL</div>
            {nfl ? (
              <>
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  {nfl.meta.head_to_head.games.toLocaleString()} games head to head. The model was closer in{" "}
                  {nfl.meta.head_to_head.seasons_model_better} of{" "}
                  {nfl.meta.head_to_head.seasons_compared} seasons.
                </p>
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  Model Brier{" "}
                  <span className="tabular-nums text-[var(--text)]" style={MONO}>
                    {nfl.meta.head_to_head.model_brier?.toFixed(4)}
                  </span>
                  , market{" "}
                  <span className="tabular-nums text-[var(--text)]" style={MONO}>
                    {nfl.meta.head_to_head.market_brier?.toFixed(4)}
                  </span>.
                </p>
              </>
            ) : null}
          </div>
        </div>
        {intl ? (
          <p className="mt-4 text-sm text-[var(--text-muted)] max-w-3xl">
            There is no third card, because there is no third market. The five continental ledgers
            carry no price at all, so Spain, Italy, Germany, France and the Netherlands are measured
            against the model and nothing else. A continental line on this section would be an
            implication the data cannot support.
          </p>
        ) : null}
        <p className="mt-4 text-sm text-[var(--text-muted)] max-w-3xl">
          Your own calls land on the same axis:{" "}
          <Link href="/play/picks" className="text-[var(--accent)] hover:underline">Citizen of Nowhere Picks</Link>{" "}
          scores a pick with the identical Brier the 1888 and 1920 ledgers use, so a call made this
          weekend is measured against a century of them.
        </p>
      </section>

      {/* ---------------------------------------------------- the method */}
      <section className="mb-6">
        <SectionHead
          id="method"
          title="Where these numbers come from, and what is wrong with them"
          sub="Everything a reader needs to disbelieve this page on purpose rather than by accident."
        />
        <div className="rounded-2xl border p-5 text-[13.5px] text-[var(--text-muted)] space-y-4 max-w-4xl" style={CARD}>
          <div>
            <h3 className="text-[var(--text)] font-semibold text-sm mb-1">The model</h3>
            <p>
              A three-way Elo, one rating per club, updated after every match and scaled by the goal
              margin, with ratings pulled back toward the middle between seasons because promotion and
              relegation churn the pool every year. Home advantage and the draw rate are estimated
              from the five seasons <em>before</em> the one being priced, never the season itself, so
              every number the model used at kick-off was available before kick-off. The NFL ledger is
              the same idea on a pre-game win probability the workbook carries for all
              {" "}{nfl ? nfl.meta.seasons[1] - nfl.meta.seasons[0] + 1 : 106}{" "}seasons.
            </p>
          </div>
          <div>
            <h3 className="text-[var(--text)] font-semibold text-sm mb-1">What it cannot do</h3>
            <p>
              Nothing is held out: the handful of settings were fitted on the whole history, so treat
              this as a description of the record rather than a forecast. And the football model has
              almost no skill before about 1960: knowing the era&rsquo;s home-and-away split is nearly
              as good as knowing which two clubs are playing. It earns its keep from roughly the 1960s
              on, and most of it in the last twenty-five years.
            </p>
          </div>
          <div>
            <h3 className="text-[var(--text)] font-semibold text-sm mb-1">How it is checked</h3>
            <p>
              Every season&rsquo;s league table is rebuilt from the matches and compared against the
              table this site already publishes on its own season hubs
              {pl ? (
                <>: {pl.meta.reconciliation.seasons} seasons, {pl.meta.reconciliation.club_seasons.toLocaleString()}{" "}
                  club-seasons, {pl.meta.reconciliation.unmatched_names} unmatched club names</>
              ) : null}
              . Separately, every club&rsquo;s count of top-flight seasons is compared against the
              number on its own club page, and all of them agree. That second check is what caught
              1939-40: the league ran three matchdays before war was declared and the results were
              expunged, but the source still carried the matches, so a phantom season was appearing on
              every club that played them.
            </p>
          </div>
          <div>
            <h3 className="text-[var(--text)] font-semibold text-sm mb-1">What is still wrong</h3>
            <p>
              {pl ? (
                <>
                  The checks leave {pl.meta.reconciliation.known_bad_fixtures} fixtures in the football
                  source that are recorded the wrong way round: both legs of the tie logged at one
                  ground, so one of them has the result reversed, across{" "}
                  {pl.meta.reconciliation.seasons_implicated.length} seasons between{" "}
                  {pl.meta.reconciliation.seasons_implicated[0]} and{" "}
                  {pl.meta.reconciliation.seasons_implicated[pl.meta.reconciliation.seasons_implicated.length - 1]}.
                  They are listed and left alone. Guessing the correction from the symptom is how a
                  half-right fix gets shipped, so they wait for the real results.
                </>
              ) : null}{" "}
              Six points deductions are modelled as deductions and not as errors, and the boards quote
              what a club earned on the pitch, with the deduction named beside it.
            </p>
          </div>
          {intl ? (
            <div>
              <h3 className="text-[var(--text)] font-semibold text-sm mb-1">The five continental ledgers</h3>
              <p>
                Spain, Italy, Germany, France and the Netherlands are scored by the SAME model as
                England, imported rather than copied: the build asserts it is running the English
                ledger&rsquo;s own functions, so the two cannot quietly drift apart. Results are
                compiled by James Curley, {" "}
                <a href="https://github.com/jalapic/engsoccerdata" rel="nofollow noopener"
                   className="text-[var(--accent)] hover:underline">github.com/jalapic/engsoccerdata</a>
                {intl.metas.some((m) => m.supplemented_seasons.length) ? (
                  <>
                    , with{" "}
                    {intl.metas
                      .flatMap((m) => m.supplemented_seasons.map((x) => `${m.country} ${x.season}`))
                      .join(", ")}{" "}
                    supplied separately because the source does not carry it
                  </>
                ) : null}
                . The settings were fitted on England and reused unchanged, which is a stated choice
                and not a derived one.
              </p>
              {intlCaveats.length ? (
                <p className="mt-2">
                  {intlCaveats.length} season{intlCaveats.length === 1 ? " is" : "s are"} recorded
                  here whose TABLE is not final, although the ratings from them are sound:{" "}
                  {intlCaveats.map((c, i) => (
                    <span key={`${c.country}-${c.season}`}>
                      {i > 0 ? "; " : ""}
                      <span className="text-[var(--text)]">{c.country} {c.season}</span>, {c.note}
                    </span>
                  ))}
                  . They are labelled wherever their numbers appear rather than quietly averaged in.
                </p>
              ) : null}
            </div>
          ) : null}
          <div>
            <h3 className="text-[var(--text)] font-semibold text-sm mb-1">Two units, never added</h3>
            <p>
              A football win was worth two league points until 1981-82 in England, and the same
              switch landed in 1994-95 in France and Italy and 1995-96 in Spain, Germany and the
              Netherlands. So league points cannot be summed down the length of one series, nor
              ranked across six of them. Club and metro totals use match points instead: a win is 1,
              a draw 0.5, which every era and every league shares. The NFL is in wins. A page that
              added them together would be inventing a quantity.
            </p>
          </div>
          <div>
            <h3 className="text-[var(--text)] font-semibold text-sm mb-1">Sources</h3>
            <p>
              English top-flight results from this site&rsquo;s own match log, extended from 2023-24
              with football-data.co.uk, which also supplies the prices: closing where it publishes
              one, pre-match before 2012-13, never the two conflated. NFL results and
              pre-game probabilities from the site&rsquo;s NFL workbook, with closing spreads loaded
              from published historical odds.{" "}
              {pl ? <>Football ledger built {pl.meta.generated_at.slice(0, 10)}</> : null}
              {nfl ? <>; NFL ledger built {nfl.meta.generated_at.slice(0, 10)}</> : null}.
            </p>
          </div>
        </div>

        <p className="mt-4 text-sm text-[var(--text-muted)]">
          The same measure appears one sentence at a time on every covered club page and on the metro
          pages, where it belongs to the club or the place rather than to the model. See it on{" "}
          <Link href="/teams/football/leicester-city" className="text-[var(--accent)] hover:underline">Leicester City</Link>,{" "}
          <Link href="/teams/football/girona-fc" className="text-[var(--accent)] hover:underline">Girona</Link>,{" "}
          <Link href="/rankings/liverpool" className="text-[var(--accent)] hover:underline">Liverpool</Link>{" "}
          or{" "}
          <Link href="/rankings/green-bay" className="text-[var(--accent)] hover:underline">Green Bay</Link>.
          Season-by-season NFL game logs live at{" "}
          <Link href="/teams/nfl/expectation/1985" className="text-[var(--accent)] hover:underline">/teams/nfl/expectation/[season]</Link>.
        </p>
      </section>
    </main>
  );
}
