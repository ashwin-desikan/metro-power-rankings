import type { CSSProperties } from "react";
import type { NflEloTeam } from "@/lib/nflElo";
import type { GameRow, SeasonFile } from "@/lib/nflExpectation";
import type { TeamIdent } from "./TeamCell";
import { MONOGRAM_BY_SLUG } from "@/lib/nfl";

// The season as a shape: one column per team, one box per regular-season
// WEEK, stacked bottom (week 1) to top (the last regular-season week), a
// bye drawn as an empty dashed slot so every column is the same height and
// every row is the same week across all 32 teams.
//
// 🔴 THE GRID IS THE POINT, NOT A BAR CHART. A first draft stacked wins up
// and losses down from a shared baseline, which is a standings table wearing
// a costume: the record is right there in the shape and nothing else is.
// Fixing the row to WEEK instead removes that: a team's wins and losses
// interleave exactly as the season played them out, and two teams with the
// same 11-6 record can look completely different depending on when their
// six losses fell.
//
// 🔴 COLOUR CARRIES ONE BIT (WIN/LOSS) AND OPACITY PLUS A STROKE CARRIES A
// SECOND (HOW SURPRISING). `p` is the probability the model gave the result
// that actually happened, from `surprise` when present. Below 0.4 the model
// was more often wrong than right about that particular game, so the box
// gets a stroke and a corner dot on top of full opacity: the shock class has
// to survive greyscale and a glance, not just a hover.
//
// 🔴 DIV-BASED, NOT ONE SVG. Earlier drafts of this file were pure SVG, the
// idiom WeeklyEloChart uses, but a per-breakpoint logo size (16px on a phone,
// 24px on desktop) is a Tailwind class, not a viewBox number, and a grid of
// fixed-height rows needs no path math at all. `flex-col-reverse` puts week 1
// at the bottom for free, in document order, with no y-coordinate arithmetic
// anywhere in this file.

const MONO: CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const COL_MIN_W = 28; // phones: fixed column width, so 32 teams = 896px
const COL_MAX_W = 44; // desktop: a column never grows past this
const BOX_H = 10;
const BOX_GAP = 2;
const AXIS_WEEKS = [1, 5, 10, 15, 20];

type Band = "expected" | "tossup" | "shock";

function bandFor(p: number): Band {
  if (p >= 0.6) return "expected";
  if (p < 0.4) return "shock";
  return "tossup";
}

const OPACITY: Record<Band, number> = { expected: 0.3, tossup: 0.65, shock: 1 };
const BAND_LABEL: Record<Band, string> = { expected: "expected", tossup: "toss-up", shock: "shock" };

type Cell =
  | { kind: "game"; band: Band; win: boolean; title: string }
  | { kind: "tie"; title: string }
  | { kind: "bye" };

type Col = {
  key: string;
  slug: string | null;
  logo: string | null;
  mono: { bg: string; fg: string; mono: string } | null;
  abbr: string;
  labelTitle: string;
  cells: Cell[]; // index 0 = week 1
};

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
  const graded = allGames.filter((g) => g.result && !g.playoff && typeof g.week === "number");
  if (!graded.length) return null;

  const maxWeek = Math.max(...graded.map((g) => g.week as number));

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
    const own = graded.filter((g) => {
      if (slug) return g.home_slug === slug || g.away_slug === slug;
      return g.home_era === t.name || g.away_era === t.name || g.home === t.name || g.away === t.name;
    });
    if (!own.length) continue;

    const byWeek = new Map<number, GameRow>();
    for (const g of own) byWeek.set(g.week as number, g);

    let wins = 0;
    let losses = 0;
    let ties = 0;
    let expWinsSum = 0;
    let expWinsCount = 0;

    const cells: Cell[] = [];
    for (let wk = 1; wk <= maxWeek; wk++) {
      const g = byWeek.get(wk);
      if (!g) {
        cells.push({ kind: "bye" });
        continue;
      }
      const isHome = slug ? g.home_slug === slug : g.home_era === t.name || g.home === t.name;
      const pHome = g.model?.pH_rest ?? g.model?.pH ?? null;
      const pTeam = pHome != null ? (isHome ? pHome : 1 - pHome) : null;
      if (pTeam != null) {
        expWinsSum += pTeam;
        expWinsCount++;
      }

      const oppName = isHome ? g.away_era : g.home_era;
      const scoreStr = scoreTeamFirst(g, isHome);
      const weekLabel = `Wk ${wk}`;

      if (g.result === "T") {
        ties++;
        cells.push({
          kind: "tie",
          title: `${weekLabel}: tied ${oppName}${scoreStr ? ` ${scoreStr}` : ""}`,
        });
        continue;
      }

      let surprise = g.surprise;
      if (surprise == null && pHome != null) {
        const pWinner = g.result === "H" ? pHome : 1 - pHome;
        surprise = 1 - pWinner;
      }
      surprise = surprise ?? 0;
      const p = 1 - surprise;
      const band = bandFor(p);
      const teamWon = g.result === "H" ? isHome : !isHome;
      const givenPct = Math.round(p * 100);

      if (teamWon) {
        wins++;
        cells.push({
          kind: "game",
          band,
          win: true,
          title: `${weekLabel}: beat ${oppName}${scoreStr ? ` ${scoreStr}` : ""}, ${BAND_LABEL[band]} (given ${givenPct}%)`,
        });
      } else {
        losses++;
        cells.push({
          kind: "game",
          band,
          win: false,
          title: `${weekLabel}: lost to ${oppName}${scoreStr ? ` ${scoreStr}` : ""}, ${BAND_LABEL[band]} (given ${givenPct}%)`,
        });
      }
    }

    const winsAbove = expWinsCount ? wins - expWinsSum : null;
    const label = `${t.city ?? ""} ${t.team ?? t.name}`.trim() || t.name;
    const recStr = `${wins}-${losses}${ties ? `-${ties}` : ""}`;
    const waeStr =
      winsAbove != null ? `${winsAbove >= 0 ? "+" : ""}${winsAbove.toFixed(1)} wins against expectation` : "";
    cols.push({
      key: t.name,
      slug,
      logo: ident[t.name]?.logo ?? null,
      mono: ident[t.name]?.mono ?? (slug && MONOGRAM_BY_SLUG[slug] ? MONOGRAM_BY_SLUG[slug] : null),
      abbr: abbrFor(t, slug),
      labelTitle: `${label} ${recStr}${waeStr ? ` · ${waeStr}` : ""}`,
      cells,
    });
  }

  if (!cols.length) return null;

  const stackH = maxWeek * (BOX_H + BOX_GAP) - BOX_GAP;

  function Box({ cell }: { cell: Cell }) {
    if (cell.kind === "bye") {
      return (
        <div
          title="Bye or no game that week"
          className="w-full rounded-[1px]"
          style={{ height: BOX_H, border: "1px dashed var(--border)" }}
        />
      );
    }
    if (cell.kind === "tie") {
      return (
        <div
          title={cell.title}
          className="w-full rounded-[1px]"
          style={{ height: BOX_H, background: "var(--div-mid)", opacity: 0.75 }}
        />
      );
    }
    const fill = cell.win ? "var(--div-pos)" : "var(--div-neg)";
    const shock = cell.band === "shock";
    return (
      <div
        title={cell.title}
        className="relative w-full rounded-[1px]"
        style={{
          height: BOX_H,
          background: fill,
          opacity: OPACITY[cell.band],
          border: shock ? "1.5px solid var(--text)" : "none",
          boxSizing: "border-box",
        }}
      >
        {shock ? (
          <span
            aria-hidden
            className="absolute rounded-full"
            style={{ top: 1, right: 1, width: 3, height: 3, background: "#fff" }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <figure className="m-0 min-w-0">
      <div className="overflow-x-auto min-w-0">
        <div className="flex items-stretch" style={{ minWidth: (cols.length + 1) * COL_MIN_W }}>
          {/* Week axis, pinned so it stays visible while the columns scroll. */}
          <div
            className="sticky left-0 z-10 flex flex-shrink-0 flex-col items-end pr-1.5 text-[9px] text-[var(--text-dim)]"
            style={{ ...MONO, background: "var(--bg-card)", width: 22 }}
          >
            <div style={{ height: 24 }} aria-hidden />
            <div className="flex flex-col-reverse" style={{ gap: BOX_GAP }}>
              {Array.from({ length: maxWeek }, (_, i) => i + 1).map((wk) => (
                <div key={wk} className="flex items-center justify-end" style={{ height: BOX_H }}>
                  {AXIS_WEEKS.includes(wk) ? wk : ""}
                </div>
              ))}
            </div>
            <div style={{ height: 18 }} aria-hidden />
          </div>

          {cols.map((c) => (
            <div
              key={c.key}
              className="flex flex-shrink-0 flex-1 flex-col items-center gap-1"
              style={{ minWidth: COL_MIN_W, maxWidth: COL_MAX_W }}
            >
              {/* One link per column, 44px tall so it is a real tap target; the
                  abbreviation below is a label, not a second link. A stretched
                  .tap-row overlay would swallow the boxes' hover titles. */}
              <a href={c.slug ? `/teams/nfl/${c.slug}` : undefined} title={c.labelTitle} className="flex h-11 w-full flex-shrink-0 items-center justify-center">
                {c.logo ? (
                  <img
                    src={c.logo}
                    alt=""
                    className="h-4 w-4 object-contain sm:h-6 sm:w-6"
                    decoding="async"
                  />
                ) : c.mono ? (
                  <span
                    aria-hidden
                    className="inline-grid h-4 w-4 place-items-center rounded-full sm:h-6 sm:w-6"
                    style={{ background: c.mono.bg, color: c.mono.fg, fontSize: 7, fontWeight: 700 }}
                  >
                    {c.mono.mono}
                  </span>
                ) : (
                  <span aria-hidden className="inline-block h-4 w-4 rounded-full sm:h-6 sm:w-6" style={{ border: "1px solid var(--border)" }} />
                )}
              </a>

              <div className="flex w-full flex-col-reverse" style={{ gap: BOX_GAP, height: stackH }}>
                {c.cells.map((cell, i) => (
                  <Box key={i} cell={cell} />
                ))}
              </div>

              <span
                title={c.labelTitle}
                className="text-[8px] font-semibold text-[var(--accent)] sm:text-[9px]"
                style={MONO}
              >
                {c.abbr}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden style={{ background: "var(--div-pos)", opacity: 0.3, width: 12, height: 12, borderRadius: 2, display: "inline-block" }} />
          Expected win (p&ge;60%)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden style={{ background: "var(--div-pos)", opacity: 0.65, width: 12, height: 12, borderRadius: 2, display: "inline-block" }} />
          Toss-up win (40&ndash;60%)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden style={{ background: "var(--div-pos)", opacity: 1, width: 12, height: 12, borderRadius: 2, border: "1.5px solid var(--text)", display: "inline-block" }} />
          Shock win (&lt;40%)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden style={{ background: "var(--div-neg)", opacity: 0.3, width: 12, height: 12, borderRadius: 2, display: "inline-block" }} />
          Expected loss (p&ge;60%)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden style={{ background: "var(--div-neg)", opacity: 0.65, width: 12, height: 12, borderRadius: 2, display: "inline-block" }} />
          Toss-up loss (40&ndash;60%)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden style={{ background: "var(--div-neg)", opacity: 1, width: 12, height: 12, borderRadius: 2, border: "1.5px solid var(--text)", display: "inline-block" }} />
          Shock loss (&lt;40%)
        </span>
        <span className="text-[var(--text-dim)]">a dashed box is a bye &middot; a grey box is a tie</span>
      </div>
    </figure>
  );
}
