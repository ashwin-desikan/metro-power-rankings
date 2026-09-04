/**
 * A sparkline for one row.
 *
 * Why this exists
 * ---------------
 * Measured 2026-09-03: of 364 routes, 1% carried a sparkline. A ranked board is
 * a snapshot; a row with a history is a story, and the story is what brings a
 * reader back. `DataBar` in this folder answers "how big"; this answers
 * "which way, and how steadily".
 *
 * Deliberately no chart library. It is a polyline over a normalised series, and
 * pulling in a charting dependency for that would cost more than it returns.
 *
 * Rules it follows, from DESIGN-STANDARDS section 7:
 *  - 2px stroke, recessive. No axis, no grid, no gridlines: a sparkline is a
 *    shape, not a plot, and axis furniture at this size is noise.
 *  - The end point gets a marker, because "where it is now" is the one value a
 *    reader actually looks for.
 *  - Direction is never carried by colour alone. `invert` exists so a RANK
 *    series (where 1 is best and the number falls as things improve) still
 *    reads upward when the entity is improving, and the accompanying text keeps
 *    a text token.
 *  - A series shorter than two points renders nothing rather than a misleading
 *    flat line.
 */

export function Sparkline({
  values,
  width = 72,
  height = 20,
  invert = false,
  color = "var(--seq-4)",
  label,
}: {
  /** Oldest first. Nulls are gaps and are skipped, not zeroed. */
  values: (number | null | undefined)[];
  width?: number;
  height?: number;
  /** True for rank-like series where a LOWER number is better. */
  invert?: boolean;
  color?: string;
  /** Screen-reader description; the shape alone is not accessible. */
  label?: string;
}) {
  const pts = values
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => typeof p.v === "number" && isFinite(p.v));
  if (pts.length < 2) return <span className="text-[var(--text-dim)] text-xs">—</span>;

  const xs = values.length - 1 || 1;
  const lo = Math.min(...pts.map((p) => p.v));
  const hi = Math.max(...pts.map((p) => p.v));
  // A flat series is not a shape. Without this the `|| 1` fallback below maps
  // every equal value to one edge of the box and draws a hard line that reads
  // as a real trend. Same failure as app/predictions/_shared/Sparkline.tsx.
  if (hi === lo) return <span className="text-[var(--text-dim)] text-xs">—</span>;
  const span = hi - lo;
  const pad = 2;
  const h = height - pad * 2;

  const y = (v: number) => {
    // frac is 0 at the worst end and 1 at the best end
    const frac = invert ? (hi - v) / span : (v - lo) / span;
    return pad + (1 - frac) * h;
  };
  const x = (i: number) => (i / xs) * (width - pad * 2) + pad;

  const d = pts.map((p, k) => `${k ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const last = pts[pts.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
      role="img"
      aria-label={label ?? "trend"}
    >
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(last.i)} cy={y(last.v)} r={2.5} fill={color} />
    </svg>
  );
}
