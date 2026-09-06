// NflStandings — current-season standings widget for the /teams/nfl index.
// Mirrors MlbStandings in position and style. The 8 divisions are anchored on
// the franchise workbook so all 32 teams render even before the season starts
// ("in place"); live records are overlaid from @/lib/standings (ESPN public
// feed, hourly ISR) and applied only when ESPN's season.year matches the
// current calendar year. Pre-season the table shows blank records.

import Link from "next/link";
import { getCurrentNflStandings, type TeamStanding } from "@/lib/standings";
import { getAllFranchises, logoUrlFor, monogramFor, type Franchise } from "@/lib/nfl";
import { CappedList } from "@/app/_shared/Disclosure";
import { DataBar } from "@/app/_shared/DataBar";
import { getNflSim } from "@/lib/nflSim";
import { fmtOdds } from "@/lib/mlbSim";

const DIVISION_ORDER = [
  "AFC East", "AFC North", "AFC South", "AFC West",
  "NFC East", "NFC North", "NFC South", "NFC West",
];

function fmtPct(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return "—";
  return p.toFixed(3).replace(/^0/, "");
}

// 🔴 THE ODDS ARE SHOWN IN THE PRESEASON, UNLIKE MLB'S. MlbStandings gates its
// playoff odds on games_played > 0 because a baseball sim run on a 0-0 table is
// its own prior and nothing else. The NFL sim is not that: it blends a market
// rating from posted lines and Super Bowl futures, so a week-0 number is the
// market's own view of the season and is worth printing. It says "projected"
// until a game is played, and it names the day it was run either way.

export default async function NflStandings({
  columns = 4,
  bare = false,
}: {
  /** Division cards per row at the widest breakpoint. 2 when the standings sit
   *  beside the power rankings rather than across the page. */
  columns?: 2 | 4;
  /** Drop the component's own h2 and lede: the page is already heading it. */
  bare?: boolean;
} = {}) {
  const [standings, sim] = await Promise.all([
    getCurrentNflStandings(),
    getNflSim().catch(() => null),
  ]);
  const now = new Date();
  const currentYear = now.getFullYear();
  // The NFL season runs early September through early February. In the
  // offseason (roughly March–August) ESPN rolls season.year forward to the
  // upcoming season while still serving the prior season's final standings,
  // so we guard on the calendar too: outside the season window all records are
  // zeroed out (blank) rather than rendering stale data as if it were live.
  const month = now.getMonth(); // 0 = January
  const inSeasonWindow = month >= 8 || month <= 1; // Sep–Dec or Jan–Feb
  const isCurrentYear = standings.season_year === currentYear;
  const live: Record<string, TeamStanding> = inSeasonWindow && isCurrentYear ? standings.by_canonical : {};
  const hasLive = Object.values(live).some((t) => t.games_played > 0);
  // ESPN publishes its own season calendar in the standings payload; use it
  // rather than a hardcoded "Thursday after Labor Day" that would need editing
  // every year and would be wrong in any year the league moves the opener.
  const opensLabel = (() => {
    if (!standings.regular_season_start) return null;
    const d = new Date(standings.regular_season_start);
    if (!Number.isFinite(d.getTime()) || d.getTime() < Date.now()) return null;
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
  })();

  const byDivision = new Map<string, Franchise[]>();
  for (const f of getAllFranchises()) {
    const key = DIVISION_ORDER.includes(f.division) ? f.division : "Other";
    if (!byDivision.has(key)) byDivision.set(key, []);
    byDivision.get(key)!.push(f);
  }

  // Playoff and Super Bowl odds from our own simulation of the remaining
  // schedule (scripts/predictions/build_nfl_sim.py). Keyed on slug, which is
  // the same key the franchise rows carry.
  const odds = new Map((sim?.table ?? []).map((r) => [r.slug, r]));
  const simIsThisSeason = sim?.meta.season === currentYear;
  const showOdds = simIsThisSeason && odds.size >= 30;
  const oddsAsOf = showOdds ? sim!.meta.generated_at : null;
  const oddsPlayed = (sim?.meta.games_played ?? 0) > 0;

  const fetchedDate = (() => {
    try {
      return new Date(standings.fetched_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch { return ""; }
  })();

  return (
    <section className={bare ? "" : "mb-8"}>
      <header className="mb-3 flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          {bare ? null : <h2 className="text-lg font-bold tracking-tight">{currentYear} NFL Standings</h2>}
          <p className="text-xs text-[var(--text-muted)]">
            {hasLive
              ? <>Live from ESPN, refreshed hourly{fetchedDate ? `. As of ${fetchedDate}.` : "."}</>
              : <>The {currentYear} regular season has not started yet
                  {opensLabel ? <>. It opens on {opensLabel}</> : null}. Live standings from ESPN appear here once Week 1 begins.</>}
            {oddsAsOf ? (
              <> Playoff and {sim!.meta.title_game ?? "Super Bowl"} odds are our own simulation of the remaining
                schedule ({sim!.meta.sims.toLocaleString()} runs, {oddsAsOf}), blended with the market
                {oddsPlayed ? "" : ", and projected rather than earned until a game is played"}.</>
            ) : null}
          </p>
        </div>
        <a href="https://www.espn.com/nfl/standings" target="_blank" rel="noreferrer" className="text-xs text-[var(--accent)] hover:underline whitespace-nowrap">Full standings on ESPN &rarr;</a>
      </header>

      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${columns === 4 ? "lg:grid-cols-4" : "xl:grid-cols-2"}`}>
        {DIVISION_ORDER.map((divName) => {
          const teams = byDivision.get(divName) ?? [];
          if (teams.length === 0) return null;
          const rows = teams.map((f) => ({ f, t: live[f.canonical] ?? null }));
          rows.sort((a, b) => {
            if (hasLive) {
              const aw = a.t?.win_pct ?? -1, bw = b.t?.win_pct ?? -1;
              if (bw !== aw) return bw - aw;
              const awn = a.t?.wins ?? 0, bwn = b.t?.wins ?? 0;
              if (bwn !== awn) return bwn - awn;
            }
            return a.f.name.localeCompare(b.f.name);
          });
          // Pct is the board's argument: rows are sorted by win_pct desc
          // whenever live data exists. colMax is this division's own max,
          // computed once over the full `rows` set above, before the row map.
          const colMax = hasLive ? Math.max(...rows.map((r) => r.t?.win_pct ?? 0), 0.001) : 1;
          return (
            <div key={divName} className="rounded-xl border p-3" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
              <h3 className="text-[11px] uppercase tracking-widest font-semibold text-[var(--text-muted)] mb-2">{divName}</h3>

              {/* Mobile: compact stacked rows instead of a cramped 5-column
                  table. Same rows/order as the desktop table below. */}
              <div className="sm:hidden divide-y" style={{ borderColor: "var(--border)" }}>
                <CappedList
                  initial={12}
                  noun="teams"
                  bodyClassName="divide-y"
                  items={rows.map(({ f, t }) => {
                  const logo = logoUrlFor(f.slug);
                  const mono = monogramFor(f.slug);
                  const showRec = hasLive && t != null && t.games_played > 0;
                  return (
                    <Link
                      key={f.slug}
                      href={`/teams/nfl/${f.slug}`}
                      className="flex items-center gap-2 py-2 hover:text-[var(--accent)] transition-colors"
                      style={{ borderColor: "var(--border)" }}
                    >
                      {logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logo} alt="" className="w-4 h-4 flex-shrink-0 object-contain" loading="lazy" decoding="async" />
                      ) : (
                        <span className="inline-grid place-items-center rounded-full flex-shrink-0" style={{ background: mono.bg, color: mono.fg, width: 16, height: 16, fontSize: 7, fontWeight: 700 }} aria-hidden>{mono.mono}</span>
                      )}
                      <span className="truncate text-xs flex-1 min-w-0">{f.name}</span>
                      <span className="tabular-nums text-xs flex-shrink-0" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {showRec ? `${t!.wins}-${t!.losses}${t!.ties ? `-${t!.ties}` : ""}` : "—"}
                      </span>
                      <span className="tabular-nums text-xs text-[var(--text-muted)] flex-shrink-0 w-10 text-right">
                        {showRec ? fmtPct(t!.win_pct) : "—"}
                      </span>
                      {/* 🔴 THE PHONE GETS THE ODDS TOO. §2: same information,
                          different density. The win percentage is the column
                          that gives way, not the one a reader came for. */}
                      {showOdds ? (
                        <span className="tabular-nums text-xs flex-shrink-0 w-9 text-right" title="chance of reaching the playoffs">
                          {fmtOdds(odds.get(f.slug)?.p_playoffs)}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
                />
              </div>

              <div className="overflow-x-auto hidden sm:block">
              <table className="w-full text-xs tabular-nums">
                <thead className="text-[var(--text-muted)]">
                  <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                    <th className="text-left py-1 pr-1 font-medium text-[9px] uppercase tracking-wider">Team</th>
                    <th className="text-right py-1 px-1 font-medium text-[9px] uppercase tracking-wider">W</th>
                    <th className="text-right py-1 px-1 font-medium text-[9px] uppercase tracking-wider">L</th>
                    <th className="text-right py-1 px-1 font-medium text-[9px] uppercase tracking-wider">T</th>
                    <th className="text-right py-1 px-1 font-medium text-[9px] uppercase tracking-wider">Pct</th>
                    {showOdds ? <th className="text-right py-1 px-1 font-medium text-[9px] uppercase tracking-wider" title="chance of reaching the playoffs">Play</th> : null}
                    {showOdds ? <th className="text-right py-1 pl-1 font-medium text-[9px] uppercase tracking-wider" title={`chance of winning the ${sim!.meta.title_game ?? "Super Bowl"}`}>Title</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ f, t }) => {
                    const logo = logoUrlFor(f.slug);
                    const mono = monogramFor(f.slug);
                    const showRec = hasLive && t != null && t.games_played > 0;
                    return (
                      <tr key={f.slug} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                        <td className="py-2 pr-1">
                          <Link href={`/teams/nfl/${f.slug}`} className="flex items-center gap-1.5 hover:text-[var(--accent)] transition-colors">
                            {logo ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={logo} alt="" className="w-4 h-4 flex-shrink-0 object-contain" loading="lazy" decoding="async" />
                            ) : (
                              <span className="inline-grid place-items-center rounded-full flex-shrink-0" style={{ background: mono.bg, color: mono.fg, width: 16, height: 16, fontSize: 7, fontWeight: 700 }} aria-hidden>{mono.mono}</span>
                            )}
                            <span className="truncate">{f.name}</span>
                          </Link>
                        </td>
                        <td className="py-1 px-1 text-right">{showRec ? t!.wins : "—"}</td>
                        <td className="py-1 px-1 text-right">{showRec ? t!.losses : "—"}</td>
                        <td className="py-1 px-1 text-right text-[var(--text-muted)]">{showRec ? t!.ties : "—"}</td>
                        <td className="py-1 px-1 text-right">
                          <DataBar v={showRec ? t!.win_pct : null} max={colMax} dp={3} width={70} label="win percentage" />
                        </td>
                        {showOdds ? (
                          <td className="py-1 px-1 text-right" style={{ color: "var(--text)" }}>
                            {fmtOdds(odds.get(f.slug)?.p_playoffs)}
                          </td>
                        ) : null}
                        {showOdds ? (
                          <td className="py-1 pl-1 text-right text-[var(--text-muted)]">
                            {fmtOdds(odds.get(f.slug)?.p_sb)}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
