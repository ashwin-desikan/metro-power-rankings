import type { CSSProperties } from "react";

/**
 * In-cell numbers.
 *
 * What changed, and why
 * ---------------------
 * These two started life as in-cell bars: a track and a fill beside the figure,
 * added on 2026-09-03 to give a table site some visual encoding. Ashwin ruled
 * against them on 2026-09-04. The judgement was that a bar sitting next to its
 * own number encodes nothing the number did not already say, and spends a column
 * of width to repeat it. That is right. A bar earns its place when it carries a
 * comparison the reader cannot make by eye, and a single value beside its own
 * label is not that.
 *
 * So the bars are gone and the components remain, because the call sites still
 * want what they were doing around the bar:
 *
 *  - a null or non-finite value renders an em-dash rather than NaN
 *  - figures are tabular-nums, so a column lines up on the decimal
 *  - the value wears a text token, never a colour, which is what keeps it
 *    readable in forced-colors
 *  - `DivergingBar` keeps its sign, because direction was never the bar's job:
 *    the leading + or − is what tells the reader which way the value points
 *
 * `max`, `color` and `width` are accepted and ignored. They are kept so the
 * roughly sixty call sites did not all have to change in one commit; treat them
 * as deprecated and drop them when you next touch a caller.
 */

function fmt(v: number, dp: number, suffix: string) {
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(dp)}${suffix}`;
}

/** Magnitude in a cell. */
export function DataBar({
  v,
  dp = 0,
  suffix = "",
  /** Display multiplier only. A 0..1 ratio shown as a percentage passes 100. */
  scale = 1,
  format,
  label,
}: {
  v: number | null | undefined;
  /** @deprecated The column maximum. No longer read. */
  max?: number;
  dp?: number;
  suffix?: string;
  scale?: number;
  /** Keep a call site's own formatter (currency, height, compact counts). Wins over dp/suffix/scale. */
  format?: (v: number) => string;
  /** @deprecated No longer read. */
  color?: string;
  /** @deprecated No longer read. */
  width?: number;
  /** Screen-reader text when the number alone is not self-describing. */
  label?: string;
}) {
  if (v == null || !isFinite(v)) return <span className="text-[var(--text-dim)]">—</span>;
  return (
    <span className="tabular-nums text-xs text-[var(--text-muted)]">
      {label ? <span className="sr-only">{label} </span> : null}
      {format ? format(v) : `${(v * scale).toFixed(dp)}${suffix}`}
    </span>
  );
}

/** Polarity in a cell: the value with its sign kept. */
export function DivergingBar({
  v,
  dp = 2,
  suffix = "%",
  /** Display multiplier only. A 0..1 ratio shown as a percentage passes 100. */
  scale = 1,
  label,
  style,
}: {
  v: number | null | undefined;
  /** @deprecated The column maximum. No longer read. */
  max?: number;
  dp?: number;
  suffix?: string;
  scale?: number;
  /** @deprecated No longer read. */
  width?: number;
  label?: string;
  style?: CSSProperties;
}) {
  if (v == null || !isFinite(v)) return <span className="text-[var(--text-dim)]">—</span>;
  return (
    <span className="tabular-nums text-xs text-[var(--text-muted)]" style={style}>
      {label ? <span className="sr-only">{label} </span> : null}
      {fmt(v * scale, dp, suffix)}
    </span>
  );
}
