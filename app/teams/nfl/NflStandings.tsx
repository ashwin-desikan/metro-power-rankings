// NflStandings - current-season standings widget for the /teams/nfl index.
// Mirrors MlbStandings in position and style. The 8 divisions are anchored on
// the franchise workbook so all 32 teams render even before the season starts
// ("in place"); live records are overlaid from @/lib/standings (ESPN public
// feed, hourly ISR) and applied only when ESPN's season.year matches the
// current calendar year. Pre-season the table shows blank records.

import Link from "next/link";
import { getCurrentNflStandings, type TeamStanding } from "@/lib/standings";
import { getAllFranchises, logoUrlFor, monogramFor, type Franchise } from "@/lib/nfl";
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

      {/* 🔴 TWO ACROSS, AND THE ARITHMETIC IS WHY. The page container caps at
          max-w-6xl, so it is 1,120px of usable width at EVERY viewport above
          1,152px. Four cards across that is 271px, 247px inside the padding, and
          the five things a standings row owes the reader (crest, name, record,
          win percentage, playoff and title odds) need about 176px of fixed
          columns. That left 71px for a name, so "Commanders" and "Buccaneers"
          were cut off and no width would have saved them. Two across gives the
          name 200px or more and nothing truncates at any width.

          🔴 THE NICKNAME, NOT THE FULL NAME. The crest beside it already carries
          the city, and the nickname is what fits without ellipsis at 390px. The
          full name is on the row's title attribute and on the team page. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            // Before a snap, the model's own order is more informative than the
            // alphabet: the division reads as the simulation ranks it.
            if (showOdds) {
              const ao = odds.get(a.f.slug)?.p_playoffs ?? -1;
              const bo = odds.get(b.f.slug)?.p_playoffs ?? -1;
              if (bo !== ao) return bo - ao;
            }
            return a.f.name.localeCompare(b.f.name);
          });
          return (
            <div key={divName} className="rounded-xl border p-3" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <h3 className="text-[11px] uppercase tracking-widest font-semibold text-[var(--text-muted)]">{divName}</h3>
                <span className="text-[9px] uppercase tracking-wider text-[var(--text-dim)]">
                  {showOdds ? (oddsPlayed ? "odds" : "projected") : ""}
                </span>
              </div>

              {/* ONE tree, two densities: the same five values at every width.
                  Only the column widths change, so nothing is hidden on a phone
                  that a desktop shows. */}
              <div className="flex items-center gap-2 pb-1 text-[9px] uppercase tracking-wider text-[var(--text-dim)] border-b" style={{ borderColor: "var(--border)" }}>
                <span className="flex-1">Team</span>
                <span className="w-11 text-right">Rec</span>
                <span className="w-9 text-right">Pct</span>
                {showOdds ? <span className="w-9 text-right" title="chance of reaching the playoffs">Play</span> : null}
                {showOdds ? <span className="w-9 text-right" title={`chance of winning the ${sim!.meta.title_game ?? "Super Bowl"}`}>Title</span> : null}
              </div>

              <div>
                {rows.map(({ f, t }) => {
                  const logo = logoUrlFor(f.slug);
                  const mono = monogramFor(f.slug);
                  const showRec = hasLive && t != null && t.games_played > 0;
                  const o = odds.get(f.slug);
                  return (
                    <Link
                      key={f.slug}
                      href={`/teams/nfl/${f.slug}`}
                      title={`${f.name}${showRec ? ` · ${t!.wins}-${t!.losses}${t!.ties ? `-${t!.ties}` : ""}` : ""}${o ? ` · playoffs ${fmtOdds(o.p_playoffs)}, title ${fmtOdds(o.p_sb)}` : ""}`}
                      className="flex items-center gap-2 py-1 min-h-11 sm:min-h-0 sm:py-1.5 border-b last:border-b-0 hover:text-[var(--accent)] transition-colors"
                      style={{ borderColor: "var(--border)" }}
                    >
                      {logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logo} alt="" width={18} height={18} className="flex-shrink-0 object-contain" style={{ width: 18, height: 18 }} loading="lazy" decoding="async" />
                      ) : (
                        <span className="inline-grid place-items-center rounded-full flex-shrink-0" style={{ background: mono.bg, color: mono.fg, width: 18, height: 18, fontSize: 7, fontWeight: 700 }} aria-hidden>{mono.mono}</span>
                      )}
                      {/* No `truncate`: the column is sized so the longest
                          nickname in the league fits whole. If a future name
                          does not, widen the column rather than clipping it. */}
                      <span className="flex-1 text-xs whitespace-nowrap">{f.team}</span>
                      <span className="w-11 text-right text-xs tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {showRec ? `${t!.wins}-${t!.losses}${t!.ties ? `-${t!.ties}` : ""}` : "\u2014"}
                      </span>
                      <span className="w-9 text-right text-xs tabular-nums text-[var(--text-muted)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {showRec ? fmtPct(t!.win_pct) : "\u2014"}
                      </span>
                      {showOdds ? (
                        <span className="w-9 text-right text-xs tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                          {fmtOdds(o?.p_playoffs)}
                        </span>
                      ) : null}
                      {showOdds ? (
                        <span className="w-9 text-right text-xs tabular-nums text-[var(--text-muted)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                          {fmtOdds(o?.p_sb)}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
