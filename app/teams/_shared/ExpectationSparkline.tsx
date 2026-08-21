// A season-by-season sparkline of one club's surplus against expectation.
//
// FORM: the quantity is POLARITY OVER TIME - each season is above or below
// what the ratings said, and the reader's question is "when were they good for
// it and when were they not". That is a diverging column series on a zero
// baseline, not a line: a line implies the seasons connect, and they do not (a
// club drops out of the top flight and comes back years later).
//
// Colour is the site's own diverging pair from DESIGN-STANDARDS (#10b981 /
// #E2628B) with the zero line as the neutral midpoint. One series, so no
// legend: the caption names it. Text stays in theme ink and never wears the
// series colour.
//
// 🔴 EVERY BAR'S TOOLTIP CARRIES BOTH UNITS. The bar height is match points
// (win 1, draw 0.5), which is the only scale comparable across a century in
// which a league win was worth two points and then three. The callouts beside
// the chart quote LEAGUE points, because that is what a supporter remembers.
// A reader who hovers 1988-89 and reads -4.3 under a callout saying -14.1 has
// been handed two answers one click apart, which is worse than either. Ashwin
// hit exactly that on Manchester United, so the tooltip now answers in full.

const POS = "#10b981";
const NEG = "#E2628B";

export type SparkPoint = { season: string; value: number; tooltip?: string };

export default function ExpectationSparkline({
  points,
  width = 640,
  height = 52,
  label,
}: {
  points: SparkPoint[];
  width?: number;
  height?: number;
  label: string;
}) {
  if (points.length === 0) return null;
  const peak = Math.max(1e-6, ...points.map((p) => Math.abs(p.value)));
  const mid = height / 2;
  // A 2px surface gap between adjacent bars, per the mark spec, and a floor so
  // a 128-season series still has something to draw.
  const slot = width / points.length;
  const barW = Math.max(1, Math.min(6, slot - 2));
  const usable = mid - 3;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      // Fill the card. The season labels underneath span the same box, so a
      // fixed max-width would leave them pointing at empty space.
      style={{ display: "block", width: "100%", height }}
    >
      <title>{label}</title>
      {points.map((p, i) => {
        const h = Math.max(1, (Math.abs(p.value) / peak) * usable);
        const up = p.value >= 0;
        const x = i * slot + (slot - barW) / 2;
        return (
          <rect
            key={p.season + i}
            x={x}
            y={up ? mid - h : mid}
            width={barW}
            height={h}
            rx={barW >= 3 ? 1 : 0}
            fill={up ? POS : NEG}
            opacity={0.9}
          >
            <title>
              {p.tooltip ??
                `${p.season}: ${p.value >= 0 ? "+" : "−"}${Math.abs(p.value).toFixed(1)} match points`}
            </title>
          </rect>
        );
      })}
      {/* Recessive zero baseline: the midpoint of the diverging scale. */}
      <line x1={0} y1={mid} x2={width} y2={mid} stroke="var(--border)" strokeWidth={1} />
    </svg>
  );
}
