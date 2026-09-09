import type { CSSProperties } from "react";
import type { NflEloTeam } from "@/lib/nflElo";
import type { GameRow, SeasonFile } from "@/lib/nflExpectation";
import type { TeamIdent } from "./TeamCell";
import { MONOGRAM_BY_SLUG } from "@/lib/nfl";
import { eraAbbr } from "@/lib/nflEra";

// The season as a shape: one column per team, one box per regular-season
// WEEK, stacked bottom (week 1) to top (the last regular-season week), a
// bye drawn as an empty dashed slot so every column is the same height and
// every row is the same week across all 32 teams. Above a thin seam, the
// playoffs: one row per ROUND the season had (wild card, divisional,
// conference, Super Bowl, or just the championship before 1966), a seeded
// bye drawn dashed, and a blank slot for a team whose season was already
// over. Ashwin's call (2026-09-09): a season recap that stops at week 18 is
// not a recap, and the extra rows do not spoil the rectangle, they top it.
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
const SEAM_H = 6; // the line between the regular season and the playoffs
const AXIS_WEEKS = [1, 5, 10, 15, 20];

// 🔴 PLAYOFF ROWS ARE KEYED BY ROUND, NOT BY WEEK NUMBER. Before 1969 the
// ledger's playoff week numbers overlap the regular season (the 1967 NFL
// conference playoffs sit at "week 15" while the AFL regular season ran to
// 17), so a week-keyed grid would put a championship game beside a week-15
// loss. Every playoff row carries `round`, and that names the tier. Tier 3
// is the final of the season (Super Bowl from 1966, the league championship
// before it); "NFL Champ" and "AFL Champ" move DOWN to tier 2 from 1966 on,
// when they became the step before the Super Bowl; "Conf. Champ" is tier 2
// for the 1948-49 AAFC and tier 1 for the 1967-69 NFL, where it was the
// four-team semifinal. The Playoff Bowl (the 1960s third-place game) is not
// a playoff and is left out on purpose.
type Tier = 0 | 1 | 2 | 3;
const TIER_LABEL = ["WC", "DIV", "CONF", "SB"] as const;
const TIER_TITLE = ["Wild card", "Divisional", "Conference championship", "Super Bowl"] as const;

function tierFor(round: string | null | undefined, season: number): Tier | null {
  switch (round) {
    case "Wild Card":
    case "AFC Round 1":
    case "NFC Round 1":
      return 0;
    case "Div. Playoff":
    case "AFC Round 2":
    case "NFC Round 2":
      return 1;
    case "Conf. Champ":
      return season <= 1949 ? 2 : 1;
    case "AFC Champ":
    case "NFC Champ":
      return 2;
    case "NFL Champ":
    case "AFL Champ":
      return season >= 1966 ? 2 : 3;
    case "AAFC Champ":
    case "Super Bowl":
      return 3;
    default:
      return null;
  }
}

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
  | { kind: "bye"; title?: string }
  | { kind: "out" } // playoff round the team was not in: nothing drawn
  | { kind: "seam" }; // the line between the regular season and the playoffs

type Col = {
  key: string;
  slug: string | null;
  logo: string | null;
  mono: { bg: string; fg: string; mono: string } | null;
  abbr: string;
  labelTitle: string;
  cells: Cell[]; // index 0 = week 1; then the seam; then one per playoff tier
};

// One cell from one graded game, seen from `t`'s side. Shared by the
// regular-season weeks and the playoff rounds; only the leading label differs.
function cellFor(g: GameRow, isHome: boolean, lead: string): { cell: Cell; pTeam: number | null; won: boolean | null } {
  const pHome = g.model?.pH_rest ?? g.model?.pH ?? null;
  const pTeam = pHome != null ? (isHome ? pHome : 1 - pHome) : null;
  const oppName = isHome ? g.away_era : g.home_era;
  const scoreStr = scoreTeamFirst(g, isHome);
  if (g.result === "T") {
    return { cell: { kind: "tie", title: `${lead}: tied ${oppName}${scoreStr ? ` ${scoreStr}` : ""}` }, pTeam, won: null };
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
  // 🔴 THE PERCENTAGE IS ALWAYS THIS TEAM'S OWN CHANCE TO WIN. `p` is the
  // winner's probability, which for a loss is the other side's, and "shock
  // loss (given 32%)" read as if the loser had been given 32% (Ashwin,
  // 2026-09-09). A loss now says what THIS team had been given, so a shock
  // loss reads "had been given 68% to win" and the band and the number agree.
  const ownPct = Math.round((teamWon ? p : 1 - p) * 100);
  const title = teamWon
    ? `${lead}: beat ${oppName}${scoreStr ? ` ${scoreStr}` : ""}, ${BAND_LABEL[band]} win (given ${ownPct}% to win)`
    : `${lead}: lost to ${oppName}${scoreStr ? ` ${scoreStr}` : ""}, ${BAND_LABEL[band]} loss (had been given ${ownPct}% to win)`;
  return {
    cell: { kind: "game", band, win: teamWon, title },
    pTeam,
    won: teamWon,
  };
}

// The label under each tower is the abbreviation of THAT season (STL for the
// 1999 Rams, RAI for the 1990 Raiders), never the franchise monogram; see
// eraAbbr in lib/nflEra.ts. The crest above it stays franchise-level.
function abbrFor(t: NflEloTeam, slug: string | null): string {
  return eraAbbr(t.city, t.team ?? t.name, slug && MONOGRAM_BY_SLUG[slug] ? MONOGRAM_BY_SLUG[slug].mono : null);
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

  // The playoff rounds this season actually had, as tiers (see tierFor), in
  // order. Empty for a season still in its regular season, or one whose
  // playoffs the ledger does not carry.
  const post = allGames
    .filter((g) => g.result && g.playoff)
    .map((g) => ({ g, tier: tierFor(g.round, season) }))
    .filter((x): x is { g: GameRow; tier: Tier } => x.tier != null);
  const tiers = ([0, 1, 2, 3] as Tier[]).filter((tier) => post.some((x) => x.tier === tier));
  const finalLabel = season >= 1966 ? "SB" : "CH";
  const tierLabel = (tier: Tier) => (tier === 3 ? finalLabel : TIER_LABEL[tier]);
  const tierTitle = (tier: Tier) => (tier === 3 && season < 1966 ? "Championship" : TIER_TITLE[tier]);

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
    const mine = (g: GameRow) => {
      if (slug) return g.home_slug === slug || g.away_slug === slug;
      return g.home_era === t.name || g.away_era === t.name || g.home === t.name || g.away === t.name;
    };
    const homeSide = (g: GameRow) => (slug ? g.home_slug === slug : g.home_era === t.name || g.home === t.name);
    const own = graded.filter(mine);
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
      const { cell, pTeam, won } = cellFor(g, homeSide(g), `Wk ${wk}`);
      if (pTeam != null) {
        expWinsSum += pTeam;
        expWinsCount++;
      }
      if (won === null) ties++;
      else if (won) wins++;
      else losses++;
      cells.push(cell);
    }

    // The playoffs, one row per tier the season had. A team with a game in a
    // later tier but none in this one had a bye (a seeded rest, drawn dashed
    // like a regular-season bye); a team with nothing from here up was out.
    let poWins = 0;
    let poLosses = 0;
    if (tiers.length) {
      cells.push({ kind: "seam" });
      const ownPost = post.filter((x) => mine(x.g));
      const lastTier = ownPost.length ? Math.max(...ownPost.map((x) => x.tier)) : -1;
      for (const tier of tiers) {
        // 🔴 First by date if the ledger carries two rows in one round
        // (2002 Falcons, a Div. Playoff label on a wild-card row).
        const x = ownPost
          .filter((y) => y.tier === tier)
          .sort((p1, p2) => (p1.g.date ?? "").localeCompare(p2.g.date ?? ""))[0];
        if (x) {
          const { cell, won } = cellFor(x.g, homeSide(x.g), x.g.round ?? tierTitle(tier));
          if (won) poWins++;
          else if (won === false) poLosses++;
          cells.push(cell);
        } else if (tier === 0 && tier < lastTier) {
          // A wild-card bye is a seeded rest and is drawn like one. A missing
          // divisional row before 1970 is not a bye, it is a tiebreaker
          // playoff the team was never part of, so it stays blank.
          cells.push({ kind: "bye", title: `${tierTitle(tier)}: bye` });
        } else {
          cells.push({ kind: "out" });
        }
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
      labelTitle: `${label} ${recStr}${waeStr ? ` · ${waeStr}` : ""}${poWins + poLosses ? ` · playoffs ${poWins}-${poLosses}` : ""}`,
      cells,
    });
  }

  if (!cols.length) return null;

  const rows = maxWeek + tiers.length;
  const stackH = rows * (BOX_H + BOX_GAP) - BOX_GAP + (tiers.length ? SEAM_H + BOX_GAP : 0);

  // The seam: a hairline across every column at the same height, so the eye
  // reads one line across the whole grid rather than 32 short dashes.
  function Seam() {
    return <div aria-hidden className="w-full" style={{ height: SEAM_H, backgroundImage: "linear-gradient(var(--border), var(--border))", backgroundSize: "100% 1px", backgroundPosition: "center", backgroundRepeat: "no-repeat" }} />;
  }

  function Box({ cell }: { cell: Cell }) {
    if (cell.kind === "seam") return <Seam />;
    if (cell.kind === "out") {
      return <div aria-hidden className="w-full" style={{ height: BOX_H }} />;
    }
    if (cell.kind === "bye") {
      return (
        <div
          title={cell.title ?? "Bye or no game that week"}
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
              {tiers.length ? <Seam /> : null}
              {tiers.map((tier) => (
                <div key={`t${tier}`} title={tierTitle(tier)} className="flex items-center justify-end text-[7px]" style={{ height: BOX_H }}>
                  {tierLabel(tier)}
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
          Expected win (given 60% or more)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden style={{ background: "var(--div-pos)", opacity: 0.65, width: 12, height: 12, borderRadius: 2, display: "inline-block" }} />
          Toss-up win (given 40 to 60%)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden style={{ background: "var(--div-pos)", opacity: 1, width: 12, height: 12, borderRadius: 2, border: "1.5px solid var(--text)", display: "inline-block" }} />
          Shock win (given under 40%)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden style={{ background: "var(--div-neg)", opacity: 0.3, width: 12, height: 12, borderRadius: 2, display: "inline-block" }} />
          Expected loss (given under 40%)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden style={{ background: "var(--div-neg)", opacity: 0.65, width: 12, height: 12, borderRadius: 2, display: "inline-block" }} />
          Toss-up loss (given 40 to 60%)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden style={{ background: "var(--div-neg)", opacity: 1, width: 12, height: 12, borderRadius: 2, border: "1.5px solid var(--text)", display: "inline-block" }} />
          Shock loss (given 60% or more)
        </span>
        <span className="text-[var(--text-dim)]">a dashed box is a bye &middot; a grey box is a tie{tiers.length ? " \u00b7 above the line: the playoffs, round by round; an empty slot is a season already over" : ""}</span>
      </div>
    </figure>
  );
}
