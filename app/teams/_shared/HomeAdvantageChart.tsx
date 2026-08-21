import type { HomeAdvantageSeries } from "@/lib/expectation";

// Home advantage, two sports, ONE axis.
//
// FORM: change over time for two comparable series, so a line chart, and the
// two lines share a scale because the measure was chosen to make that legal
// (see scripts/expectation/build_home_advantage.py: draws divide out of
// 400*log10(home/away), so a sport with draws and a sport without can sit on
// the same axis honestly). 🔴 Never a second y-axis. If a measure needs one,
// it needed a second chart.
//
// COLOUR: the site's own teal and amber, stepped down to the lightness band
// that passes the palette validator against --bg-card #12121A. Both pass CVD
// separation comfortably (ΔE 15.7 deutan, 26.2 tritan) and identity is carried
// twice over anyway - legend plus a direct label at the end of each line - so
// nobody has to tell the colours apart to read it.
//
// Server-rendered, no client JavaScript. The hover layer is a transparent
// circle per point carrying a native <title>.

const GRID = "var(--border)";
const INK_DIM = "var(--text-dim)";
const MONO = "'JetBrains Mono', monospace";

const W = 900;
const H = 300;
const M = { top: 16, right: 104, bottom: 30, left: 46 };

export default function HomeAdvantageChart({
  series,
  yMax = 200,
}: {
  series: HomeAdvantageSeries[];
  yMax?: number;
}) {
  const withRows = series.filter((s) => s.rows.length > 0);
  if (withRows.length === 0) return null;

  const years = withRows.flatMap((s) => s.rows.map((r) => r.year));
  const x0 = Math.min(...years);
  const x1 = Math.max(...years);
  const px = (year: number) => M.left + ((year - x0) / (x1 - x0)) * (W - M.left - M.right);
  const py = (v: number) => M.top + (1 - Math.min(v, yMax) / yMax) * (H - M.top - M.bottom);

  const ticks = [0, 50, 100, 150, 200].filter((t) => t <= yMax);
  const xTicks: number[] = [];
  for (let y = Math.ceil(x0 / 20) * 20; y <= x1; y += 20) xTicks.push(y);

  return (
    <figure className="m-0 min-w-0">
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs mb-2">
        {withRows.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-[var(--text-muted)]">
            <span
              aria-hidden
              style={{ background: s.accent, width: 14, height: 3, borderRadius: 2, display: "inline-block" }}
            />
            {s.label}
          </span>
        ))}
        <span className="text-[var(--text-dim)]">
          Elo points of home advantage, five-season moving window
        </span>
      </figcaption>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Home advantage in Elo points, ${x0} to ${x1}, for ${withRows
          .map((s) => s.label)
          .join(" and ")}`}
        style={{ display: "block", width: "100%", height: "auto" }}
      >
        <title>Home advantage in Elo points, {x0} to {x1}</title>

        {/* Recessive grid. The zero line is the meaningful one: no advantage at all. */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={M.left}
              y1={py(t)}
              x2={W - M.right}
              y2={py(t)}
              stroke={GRID}
              strokeWidth={1}
              opacity={t === 0 ? 1 : 0.55}
            />
            <text
              x={M.left - 8}
              y={py(t) + 3.5}
              textAnchor="end"
              fill={INK_DIM}
              fontSize={10}
              fontFamily={MONO}
            >
              {t}
            </text>
          </g>
        ))}
        {xTicks.map((y) => (
          <text
            key={y}
            x={px(y)}
            y={H - 10}
            textAnchor="middle"
            fill={INK_DIM}
            fontSize={10}
            fontFamily={MONO}
          >
            {y}
          </text>
        ))}

        {withRows.map((s) => {
          const pts = s.rows.map((r) => `${px(r.year).toFixed(1)},${py(r.hfa).toFixed(1)}`).join(" ");
          const last = s.rows[s.rows.length - 1];
          return (
            <g key={s.key}>
              <polyline
                points={pts}
                fill="none"
                stroke={s.accent}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Direct label, so identity is never colour alone. */}
              <text
                x={px(last.year) + 8}
                y={py(last.hfa) + 3.5}
                fill={s.accent}
                fontSize={11}
                fontWeight={600}
                fontFamily={MONO}
              >
                {Math.round(last.hfa)}
              </text>
              <text
                x={px(last.year) + 8}
                y={py(last.hfa) + 16}
                fill={INK_DIM}
                fontSize={9}
                fontFamily={MONO}
              >
                {s.key === "nfl" ? "NFL" : "football"}
              </text>
              {s.rows.map((r) => (
                <circle key={r.season} cx={px(r.year)} cy={py(r.hfa)} r={5} fill="transparent">
                  <title>{`${s.label} ${r.season}: ${Math.round(r.hfa)} Elo points, home win ${(
                    r.home * 100
                  ).toFixed(1)}%`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
