import type { CSSProperties } from "react";

/**
 * In-cell bars. The site's answer to being a table site.
 *
 * Why this exists
 * ---------------
 * Measured 2026-09-03: of 364 routes, 130 carry a table, 7% carry any bar, 1% a
 * sparkline, and 113 are a table with no visual encoding of any kind. Shortening
 * the prose was necessary and not sufficient, because what the prose was hiding
 * is that a ranked row shows its rank only if you read every number in the
 * column.
 *
 * The pattern was already invented here once and never propagated: `SkillBar` on
 * /predictions/scoreboard, a diverging bar in a table cell carrying the whole
 * argument of the page. This is that component, generalised, so it can go in the
 * cell that is already rendering a number. No chart library, no new page, no
 * extra vertical space.
 *
 * Two rules it enforces so call sites cannot get them wrong:
 *
 *  1. **The number keeps a text token.** Values wear --text / --text-muted; the
 *     coloured mark beside them carries the identity. Colouring the figure spends
 *     the identity channel twice and fails for anyone reading in forced-colors.
 *     (The original SkillBar coloured its number. That is the one thing changed.)
 *  2. **A diverging bar always draws its zero line.** The two poles sit in the
 *     CVD floor band, which is legal only with secondary encoding, and direction
 *     from the baseline IS that encoding. Remove the line and the pair becomes
 *     illegal, not merely worse.
 *
 * Colours come from the validated tokens in globals.css. Never pass a hex.
 */

const TRACK = "var(--bg-card-hover)";

function fmt(v: number, dp: number, suffix: string) {
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(dp)}${suffix}`;
}

/**
 * Magnitude in a cell: a left-anchored bar plus the value.
 *
 * `max` is the column's own maximum, so pass the same value for every row or the
 * bars stop being comparable, which is the entire point of them.
 */
export function DataBar({
  v,
  max,
  dp = 0,
  suffix = "",
  /** Display multiplier only. A 0..1 ratio shown as a percentage passes 100. */
  scale = 1,
  format,
  color = "var(--seq-4)",
  width = 120,
  label,
}: {
  v: number | null | undefined;
  max: number;
  dp?: number;
  suffix?: string;
  scale?: number;
  /** Keep a call site's own formatter (currency, height, compact counts). Wins over dp/suffix/scale. */
  format?: (v: number) => string;
  /** A --seq-* or --cat-* token. Not a hex. */
  color?: string;
  width?: number;
  /** Screen-reader text when the number alone is not self-describing. */
  label?: string;
}) {
  if (v == null || !isFinite(v)) return <span className="text-[var(--text-dim)]">—</span>;
  const frac = max > 0 ? Math.min(Math.abs(v) / max, 1) * 100 : 0;
  return (
    <span className="flex items-center gap-2" style={{ minWidth: width }}>
      <span
        className="relative flex-1 h-[7px] rounded-sm overflow-hidden"
        style={{ background: TRACK }}
        aria-hidden
      >
        {/* 4px rounded data-end, anchored to the baseline */}
        <span
          className="absolute inset-y-0 left-0 rounded-r-[4px]"
          style={{ width: `${frac}%`, background: color }}
        />
      </span>
      <span className="tabular-nums text-xs text-[var(--text-muted)]">
        {label ? <span className="sr-only">{label} </span> : null}
        {format ? format(v) : `${(v * scale).toFixed(dp)}${suffix}`}
      </span>
    </span>
  );
}

/**
 * Polarity in a cell: a bar growing left or right of a zero line.
 *
 * For anything signed — skill against market, over- and under-performance, net
 * spend, rank movement. `max` clamps the arms; pass the column's own maximum
 * absolute value.
 */
export function DivergingBar({
  v,
  max,
  dp = 2,
  suffix = "%",
  /** Display multiplier only. A 0..1 ratio shown as a percentage passes 100. */
  scale = 1,
  width = 132,
  label,
  style,
}: {
  v: number | null | undefined;
  max: number;
  dp?: number;
  suffix?: string;
  scale?: number;
  width?: number;
  label?: string;
  style?: CSSProperties;
}) {
  if (v == null || !isFinite(v)) return <span className="text-[var(--text-dim)]">—</span>;
  const frac = max > 0 ? Math.min(Math.abs(v) / max, 1) * 50 : 0;
  const pos = v > 0;
  return (
    <span className="flex items-center gap-2" style={{ minWidth: width }}>
      <span
        className="relative flex-1 h-[7px] rounded-sm overflow-hidden"
        style={{ background: TRACK }}
        aria-hidden
      >
        {/* The zero line. This is the secondary encoding the palette requires. */}
        <span
          className="absolute inset-y-0 w-px"
          style={{ left: "50%", background: "var(--div-mid)" }}
        />
        <span
          className="absolute inset-y-0"
          style={
            pos
              ? { left: "50%", width: `${frac}%`, background: "var(--div-pos)" }
              : { right: "50%", width: `${frac}%`, background: "var(--div-neg)" }
          }
        />
      </span>
      <span className="tabular-nums text-xs text-[var(--text-muted)]" style={style}>
        {label ? <span className="sr-only">{label} </span> : null}
        {fmt(v * scale, dp, suffix)}
      </span>
    </span>
  );
}
