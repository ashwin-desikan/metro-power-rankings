import type { CSSProperties } from "react";
import type { NflEloTeam } from "@/lib/nflElo";
import type { GameRow, SeasonFile } from "@/lib/nflExpectation";
import type { TeamIdent } from "./TeamCell";
import { MONOGRAM_BY_SLUG } from "@/lib/nfl";

// The season as a shape: one column per team, one box per regular-season
// game, wins stacked up from a baseline and losses hung down from it.
//
// 🔴 THE AXIS IS OURS. The visual idea (a record as a stack of boxes) is
// borrowed; the encoding is not. A generic version stacks a fixed-height box
// per win or loss, which draws a bar chart of the standings the reader
// already has above in the SectionHead. Here box HEIGHT is surprise, 1 minus
// the probability the model gave the actual winner, so a 13-3 season that
// blew out lesser teams draws as a short, quiet tower and a 9-8 season full
// of coin-flip finishes draws as a tall, jagged one on the SAME record. That
// is a fact the standings table cannot show at all.
//
// 🔴 REGULAR SEASON ONLY. A playoff win is worth more than a regular-season
// win, which would need a second encoding this chart does not have room for,
// so playoff games are excluded outright and the sub says so rather than
// mixing the two silently into one bar.
//
// 🔴 CHRONOLOGICAL STACKING, NOT SORTED. A win in week 1 sits at the bottom
// of the win stack and a week 17 win sits near the top, in the order the
// season actually happened, the same convention WeeklyEloChart's x-axis
// uses. Sorting by surprise instead would turn the shape into a bar chart
// with extra steps.
//
// 🔴 SVG WIDTH IS TWO RULES IN ONE STYLE ATTRIBUTE. `min-width` in pixels
// pins each column at 18px so a 32-team season is a real 576px chart that
// scrolls INSIDE its own box on a phone; `width: 100%` on the wrapper lets
// the same markup stretch to fill a desktop container once it is wider than
// that floor. No breakpoint, no JS, the same trick WeeklyEloChart already
// uses for viewBox scaling, just anchored with a minimum instead of left
// free.

const MONO: CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const COL_W = 18;
const BOX_W = 13;
const BOX_SCALE = 26; // px of box height per 1.0 of surprise
const MIN_BOX_H = 3;
const TOP_PAD = 10;
const BOTTOM_PAD = 34; // room for the abbreviation label

type Col = {
  key: string;
  slug: string | null;
  abbr: string;
  label: string;
  wins: number;
  losses: number;
  ties: number;
  winsAbove: number | null;
  winRects: { y: number; h: number; opacity: number; title: string }[];
  lossRects: { y: number; h: number; opacity: number; title: string }[];
  tieRects: { title: string }[];
  finalRank: number | null;
};

function opacityFor(surprise: number): number {
  // 0.35 for a fully expected result up to 1.0 for a coin the model got
  // completely wrong, clamped so a null/garbage surprise never disappears.
  return Math.max(0.35, Math.min(1, 0.35 + 0.65 * surprise));
}

function abbrFor(t: NflEloTeam, slug: string | null): string {
  if (slug && MONOGRAM_BY_SLUG[slug]) return MONOGRAM_BY_SLUG[slug].mono;
  const nick = (t.team ?? t.name ?? "").trim();
  return nick.slice(0, 3).toUpperCase() || "NFL";
}

function scoreTeamFirst(g: GameRow, isHome: boolean): string | null {
  if (!g.score) return null;
  const [h, a] = g.score.split("-");
  if (a == null) return g.score;
  return isHome ? `${h}-${a}` : `${a}-${h}`;
}

export default function ExpectationTowers({
  season,
  teams,
  ident,
  file,
}: {
  season: number;
  teams: NflEloTeam[];
  ident: Record<string, TeamIdent>;
  file: SeasonFile | null;
}) {
  const allGames = file?.games ?? [];
  // Skip silently: 2026's hub shows nothing until games are played, then
  // fills in as the expectation shard fills in behind it.
  const graded = allGames.filter((g) => g.result && !g.playoff);
  if (!graded.length) return null;

  const finalRank = (t: NflEloTeam): number | null => {
    const rated = [...t.weeks].reverse().find((w) => w.r != null);
    return rated?.r ?? null;
  };

  const ordered = [...teams].sort((a, b) => {
    const wa = a.rec?.[0] ?? 0;
    const wb = b.rec?.[0] ?? 0;
    if (wb !== wa) return wb - wa;
    const ra = finalRank(a);
    const rb = finalRank(b);
    if (ra != null && rb != null && ra !== rb) return ra - rb;
    return b.end - a.end;
  });

  const cols: Col[] = [];
  for (const t of ordered) {
    const slug = ident[t.name]?.slug ?? null;
    const own = graded
      .filter((g) => {
        if (slug) return g.home_slug === slug || g.away_slug === slug;
        return g.home_era === t.name || g.away_era === t.name || g.home === t.name || g.away === t.name;
      })
      .sort((a, b) => {
        const wa = typeof a.week === "number" ? a.week : 0;
        const wb = typeof b.week === "number" ? b.week : 0;
        return wa - wb || (a.date ?? "").localeCompare(b.date ?? "");
      });
    if (!own.length) continue;

    let wins = 0;
    let losses = 0;
    let ties = 0;
    let expWinsSum = 0;
    let expWinsCount = 0;
    let winCum = 0;
    let lossCum = 0;
    const winRects: Col["winRects"] = [];
    const lossRects: Col["lossRects"] = [];
    const tieRects: Col["tieRects"] = [];

    for (const g of own) {
      const isHome = slug ? g.home_slug === slug : g.home_era === t.name || g.home === t.name;
      const pHome = g.model?.pH_rest ?? g.model?.pH ?? null;
      const pTeam = pHome != null ? (isHome ? pHome : 1 - pHome) : null;
      if (pTeam != null) {
        expWinsSum += pTeam;
        expWinsCount++;
      }

      let surprise = g.surprise;
      if (surprise == null && pHome != null) {
        const pWinner = g.result === "H" ? pHome : g.result === "A" ? 1 - pHome : 0.5;
        surprise = 1 - pWinner;
      }
      surprise = surprise ?? 0;

      const oppName = isHome ? g.away_era : g.home_era;
      const scoreStr = scoreTeamFirst(g, isHome);
      const weekLabel = g.playoff ? (g.round ?? "playoff") : `Wk ${g.week}`;
      const givenPct = Math.round((1 - surprise) * 100);

      if (g.result === "T") {
        ties++;
        const title = `${weekLabel}: tied ${oppName}${scoreStr ? ` ${scoreStr}` : ""} (given ${givenPct}%)`;
        tieRects.push({ title });
        continue;
      }

      const teamWon = g.result === "H" ? isHome : !isHome;
      const h = Math.max(MIN_BOX_H, surprise * BOX_SCALE);
      const opacity = opacityFor(surprise);

      if (teamWon) {
        wins++;
        const title = `${weekLabel}: beat ${oppName}${scoreStr ? ` ${scoreStr}` : ""} (given ${givenPct}%)`;
        winRects.push({ y: -winCum - h, h, opacity, title });
        winCum += h;
      } else {
        losses++;
        const title = `${weekLabel}: lost to ${oppName}${scoreStr ? ` ${scoreStr}` : ""} (given ${100 - givenPct}%)`;
        lossRects.push({ y: lossCum, h, opacity, title });
        lossCum += h;
      }
    }

    const winsAbove = expWinsCount ? wins - expWinsSum : null;
    const label = `${t.city ?? ""} ${t.team ?? t.name}`.trim() || t.name;
    cols.push({
      key: t.name,
      slug,
      abbr: abbrFor(t, slug),
      label,
      wins,
      losses,
      ties,
      winsAbove,
      winRects,
      lossRects,
      tieRects,
      finalRank: finalRank(t),
    });
  }

  if (!cols.length) return null;

  const maxWinH = Math.max(...cols.map((c) => c.winRects.reduce((s, r) => s + r.h, 0)), 0);
  const maxLossH = Math.max(...cols.map((c) => c.lossRects.reduce((s, r) => s + r.h, 0)), 0);
  const baselineY = TOP_PAD + maxWinH;
  const svgH = baselineY + maxLossH + BOTTOM_PAD;
  const svgW = cols.length * COL_W;

  return (
    <figure className="m-0 min-w-0">
      <div className="overflow-x-auto min-w-0">
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="h-auto"
          style={{ width: "100%", minWidth: svgW }}
          role="img"
          aria-label={`Regular-season record shape for every team in the ${season} season. Wins stack up from the baseline, losses hang down, and box height is how surprising the result was.`}
        >
          <line x1={0} x2={svgW} y1={baselineY} y2={baselineY} stroke="var(--border)" strokeWidth={1} />
          {cols.map((c, i) => {
            const cx = i * COL_W + COL_W / 2;
            const recStr = `${c.wins}-${c.losses}${c.ties ? `-${c.ties}` : ""}`;
            const waeStr =
              c.winsAbove != null
                ? `${c.winsAbove >= 0 ? "+" : ""}${c.winsAbove.toFixed(1)} wins against expectation`
                : "";
            const labelTitle = `${c.label} ${recStr}${waeStr ? ` · ${waeStr}` : ""}`;
            return (
              <g key={c.key}>
                {c.winRects.map((r, j) => (
                  <rect
                    key={`w${j}`}
                    x={cx - BOX_W / 2}
                    y={baselineY + r.y}
                    width={BOX_W}
                    height={r.h}
                    rx={1}
                    fill="var(--div-pos)"
                    fillOpacity={r.opacity}
                  >
                    <title>{r.title}</title>
                  </rect>
                ))}
                {c.lossRects.map((r, j) => (
                  <rect
                    key={`l${j}`}
                    x={cx - BOX_W / 2}
                    y={baselineY + r.y}
                    width={BOX_W}
                    height={r.h}
                    rx={1}
                    fill="var(--div-neg)"
                    fillOpacity={r.opacity}
                  >
                    <title>{r.title}</title>
                  </rect>
                ))}
                {c.tieRects.map((r, j) => (
                  <rect
                    key={`t${j}`}
                    x={cx - BOX_W / 2}
                    y={baselineY - MIN_BOX_H / 2}
                    width={BOX_W}
                    height={MIN_BOX_H}
                    rx={0.5}
                    fill="var(--div-mid)"
                    fillOpacity={0.9}
                  >
                    <title>{r.title}</title>
                  </rect>
                ))}
                <a href={c.slug ? `/teams/nfl/${c.slug}` : undefined}>
                  <text
                    x={cx}
                    y={svgH - BOTTOM_PAD + 22}
                    textAnchor="middle"
                    fontSize={8.5}
                    fill={c.slug ? "var(--accent)" : "var(--text-dim)"}
                    style={MONO}
                  >
                    <title>{labelTitle}</title>
                    {c.abbr}
                  </text>
                </a>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden style={{ background: "var(--div-pos)", opacity: 0.4, width: 12, height: 12, borderRadius: 2, display: "inline-block" }} />
          Expected win
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden style={{ background: "var(--div-pos)", opacity: 1, width: 12, height: 12, borderRadius: 2, display: "inline-block" }} />
          Shock win
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden style={{ background: "var(--div-neg)", opacity: 0.75, width: 12, height: 12, borderRadius: 2, display: "inline-block" }} />
          Loss
        </span>
        <span className="text-[var(--text-dim)]">hover any box for the game, hover a name for the season</span>
      </div>
    </figure>
  );
}
