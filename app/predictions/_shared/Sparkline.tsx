// Tiny inline trend line for a probability/rating series. Server component,
// no client JS: a single <svg><polyline> sized to sit next to a team name.
// Renders nothing when there are fewer than two points (no trend to draw).

const WIDTH = 64;
const HEIGHT = 18;
const PAD = 2;

export function Sparkline({ points, className = "" }: { points: number[]; className?: string }) {
  if (points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);

  // A series that has not moved is not a trend, and drawing it is worse than
  // drawing nothing: with `span || 1` below, every identical point maps to the
  // BOTTOM of the box, so a team that has not budged renders a hard flat line
  // pinned to the floor. On 2026-09-04, the first day two snapshots existed and
  // no games had been played, that put an identical line beside all 32 teams in
  // the Classic tab. Render nothing until there is something to show.
  if (max === min) return null;

  const span = max - min;
  const step = (WIDTH - PAD * 2) / (points.length - 1);

  const coords = points
    .map((v, i) => {
      const x = PAD + i * step;
      const y = PAD + (1 - (v - min) / span) * (HEIGHT - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={className}
      role="img"
      aria-label={`Trend: ${points[0].toFixed(1)} to ${points[points.length - 1].toFixed(1)} over ${points.length} snapshots`}
    >
      <polyline
        points={coords}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
