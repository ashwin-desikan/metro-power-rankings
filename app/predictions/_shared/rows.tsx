import type { ReactNode } from "react";
import Link from "next/link";
import { MONO } from "@/app/business/ui";

// Mobile row components for the `variant="list"` side of `ResponsiveTable`
// (app/teams/_shared/ResponsiveTable.tsx) across the /predictions family.
// Each is a plain server component: ~40-56px per row, hairline-divided by
// the ResponsiveTable shell, matching the density RankRow already set for
// standings-shaped boards elsewhere on the site. Import and reuse these
// verbatim in cfb/mlb/pl/ucl/scoreboard/picks - add a prop before you fork
// a new component.

const DIM = { ...MONO, color: "var(--text-dim)" } as const;

/**
 * One fixture/game row - the mobile counterpart of a games/picks table
 * (upcoming slate, ledger, leverage board).
 *
 * The matchup renders as two stacked lines so neither team truncates the
 * other: line 1 is `team1` alone (bold, truncates on its own if it must);
 * line 2 is `sep` (muted, e.g. "at"/"v"/"vs") followed by `team2` in the
 * same 13px weight. `team1`/`team2` are exactly what the desktop table's
 * Game/Fixture column says on each side - "Away" then "at Home" for NFL/
 * MLB/CFB, "Home" then "v Away" for PL/UCL. Line 3 is the dim MONO kickoff/
 * date, 13px (DESIGN-STANDARDS §7: body text >=13px).
 *
 * Right: a MONO stack - model %, market % (muted, omit when no market),
 * pick name in accent; when the game is graded, swap the pick line for the
 * final score plus a check/cross. `flex-shrink-0` so a long two-line
 * matchup on the left never compresses the numbers on the right.
 *
 * Pass `href` to make the whole row a tap target (`tap-row` + `tap-target`
 * on the pick/result text) - omit it for a row that links nowhere.
 */
export function FixtureRow({
  team1,
  sep = "at",
  team2,
  neutral = false,
  kickoff,
  modelPct,
  marketPct,
  pick,
  graded = false,
  score,
  correct,
  href,
}: {
  /** Line 1: the first team exactly as the desktop table words it (e.g. the away side for "Away at Home"). */
  team1: ReactNode;
  /** Line 2's lead word, muted - "at" (NFL/MLB), "vs" (CFB neutral), "v" (PL/UCL). */
  sep?: ReactNode;
  /** Line 2: the second team, following `sep`. */
  team2: ReactNode;
  neutral?: boolean;
  /** Dim MONO line 3 - kickoff time or date, already formatted. */
  kickoff: ReactNode;
  /** Model win probability for the side the desktop table keys on (e.g. home). */
  modelPct?: ReactNode;
  /** Market probability for the same side; omitted (not just null) hides the line. */
  marketPct?: ReactNode;
  /** Ungraded: the picked team's name, shown in accent. */
  pick?: ReactNode;
  /** Graded: swap the pick line for the final score + check/cross. */
  graded?: boolean;
  score?: ReactNode;
  correct?: boolean;
  href?: string;
}) {
  const body = (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold truncate">{team1}</div>
        <div className="text-[13px] font-semibold truncate">
          <span className="font-normal" style={{ color: "var(--text-dim)" }}>{sep} </span>
          {team2}
          {neutral && (
            <span
              className="ml-1.5 rounded px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide align-middle"
              style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
            >
              neutral
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[13px]" style={DIM}>{kickoff}</div>
      </div>
      <div className="flex-shrink-0 text-right">
        {modelPct != null && (
          <div className="text-[13px] tabular-nums" style={MONO}>{modelPct}</div>
        )}
        {marketPct != null && (
          <div className="text-[13px] tabular-nums" style={{ ...MONO, color: "var(--text-muted)" }}>{marketPct}</div>
        )}
        {graded ? (
          <div className="text-[13px] font-semibold mt-0.5" style={{ ...MONO, color: correct ? "var(--accent)" : "#E2628B" }}>
            {score} {correct ? "✓" : "✕"}
          </div>
        ) : pick != null ? (
          <div className={`text-[13px] font-semibold mt-0.5 ${href ? "tap-target" : ""}`} style={{ color: "var(--accent)" }}>
            {pick}
          </div>
        ) : null}
      </div>
    </div>
  );
  if (!href) return body;
  return (
    <div className="tap-row">
      <Link href={href} className="block">{body}</Link>
    </div>
  );
}

/**
 * One division/conference/standings row - the mobile counterpart of a
 * TeamOddsRow-shaped table (playoff odds, title race, top-4/relegation).
 *
 * Left: identity (crest + name, truncates) with the `Band` chip as `sub`.
 * Right: the headline probability for THIS table (Playoffs % for NFL/CFB/
 * MLB division boards, Title % for the title race, Top-4 % for PL, Advance
 * % for UCL) with a REQUIRED `metricLabel` naming what that number is
 * ("playoffs", "title", "top 4", "advance", "pennant", ...) so a bare
 * percentage never appears - it renders as the first word of the dim MONO
 * sub-line, `rightSub` following after a middle dot when present (e.g.
 * "playoffs · xW 10.0 (7.0-13.0)").
 *
 * When this row replaces a table grouped by division/conference/league,
 * pair it with `<ListLabel>` (in ui.tsx) directly above the mobile list,
 * carrying the same text as the desktop table's first header cell - do not
 * rely on `metricLabel` to carry that context, it names the metric, not
 * the group.
 *
 * The desktop table keeps every column; this row is deliberately a subset.
 */
export function TeamOddsRow({
  crest,
  name,
  href,
  band,
  right,
  metricLabel,
  rightSub,
}: {
  crest?: ReactNode;
  name: ReactNode;
  href?: string | null;
  /** The Band chip (or any other short sub-line), rendered under the name. */
  band?: ReactNode;
  /** Headline probability for this table, right-aligned, bold MONO. */
  right: ReactNode;
  /** What `right` is, lowercase, e.g. "playoffs", "title", "top 4", "advance", "pennant", "bubble". */
  metricLabel: ReactNode;
  /** One dim MONO line under `right`, after `metricLabel` - xW+range, or a secondary probability. */
  rightSub?: ReactNode;
}) {
  const identity = (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      {crest}
      <span className="truncate">{name}</span>
    </span>
  );
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium leading-snug min-w-0">
          {href ? (
            <Link href={href} className="hover:text-[var(--accent)] transition-colors">{identity}</Link>
          ) : identity}
        </div>
        {band && <div className="mt-0.5">{band}</div>}
      </div>
      <div className="flex-shrink-0 text-right">
        <div className="text-[13px] font-bold tabular-nums leading-snug" style={MONO}>{right}</div>
        <div className="text-[13px] leading-tight" style={DIM}>
          {metricLabel}
          {rightSub != null ? <> · {rightSub}</> : null}
        </div>
      </div>
    </div>
  );
}

/**
 * One league row for the Ledger's per-league table (/predictions/scoreboard)
 * and any similar cross-league summary (calibration-by-league, etc).
 *
 * Left: league name, bold; sub = seasons covered + the way (two-way/
 * three-way), dim MONO. Right: skill % (bold, coloured by sign), rightSub =
 * "model X.XXX / market X.XXX" Brier pair, dim MONO.
 */
export function LedgerRow({
  league,
  seasons,
  way,
  skillPct,
  modelBrier,
  marketBrier,
  href,
}: {
  league: ReactNode;
  /** e.g. "1993-2026" */
  seasons?: ReactNode;
  /** e.g. "two-way" | "three-way" */
  way?: ReactNode;
  /** Signed skill score as already-formatted text, e.g. "+4.2%" or "-1.1%". */
  skillPct: ReactNode;
  /** Already-formatted Brier values, e.g. "0.2183". "—" when absent. */
  modelBrier?: ReactNode;
  marketBrier?: ReactNode;
  href?: string;
}) {
  const positive = typeof skillPct === "string" && skillPct.trim().startsWith("+");
  const negative = typeof skillPct === "string" && skillPct.trim().startsWith("-");
  const skillColor = positive ? "var(--band-solid)" : negative ? "var(--band-out)" : "var(--text)";
  const body = (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold truncate">{league}</div>
        {(seasons != null || way != null) && (
          <div className="mt-0.5 text-[13px]" style={DIM}>
            {seasons}{seasons != null && way != null ? " · " : null}{way}
          </div>
        )}
      </div>
      <div className="flex-shrink-0 text-right">
        <div className="text-[13px] font-bold tabular-nums" style={{ ...MONO, color: skillColor }}>{skillPct}</div>
        {(modelBrier != null || marketBrier != null) && (
          <div className="text-[10px] tabular-nums leading-tight" style={DIM}>
            {modelBrier ?? "—"} / {marketBrier ?? "—"}
          </div>
        )}
      </div>
    </div>
  );
  if (!href) return body;
  return (
    <div className="tap-row">
      <Link href={href} className="block tap-target">{body}</Link>
    </div>
  );
}
