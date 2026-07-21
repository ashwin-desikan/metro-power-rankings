"use client";

import { useMemo, useRef, useState } from "react";

// Shared interactive line chart for the election hubs (UK now, US next).
// Hover anywhere on the plot: a crosshair snaps to the nearest election and a
// tooltip lists every series' exact value at that point.

export type ChartSeries = {
  name: string;
  color: string;
  points: { x: number; y: number; label: string }[];
};

const W = 720, H = 200, PL = 34, PR = 74, PT = 10, PB = 24;

export default function LineChart({
  series,
  yMax = 100,
  yTicks = [25, 50, 75],
  unit = "%",
}: {
  series: ChartSeries[];
  yMax?: number;
  yTicks?: number[];
  unit?: string;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);

  const xs = useMemo(() => {
    const set = new Set<number>();
    for (const s of series) for (const p of s.points) set.add(p.x);
    return Array.from(set).sort((a, b) => a - b);
  }, [series]);
  const x0 = xs[0], x1 = xs[xs.length - 1];

  const px = (x: number) => PL + ((x - x0) / (x1 - x0)) * (W - PL - PR);
  const py = (y: number) => PT + (1 - y / yMax) * (H - PT - PB);

  const decades = useMemo(() => {
    const out: number[] = [];
    for (let d = Math.ceil(x0 / 20) * 20; d <= x1; d += 20) out.push(d);
    return out;
  }, [x0, x1]);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const xView = ((e.clientX - rect.left) / rect.width) * W;
    let best: number | null = null, bestD = Infinity;
    for (const x of xs) {
      const d = Math.abs(px(x) - xView);
      if (d < bestD) { bestD = d; best = x; }
    }
    setHoverX(best);
  }

  const fmt = (v: number) =>
    `${Number.isInteger(v) ? v.toLocaleString("en-GB") : v.toFixed(1)}${unit}`;

  const hoverRows = hoverX == null ? [] : series
    .map((s) => ({ s, p: s.points.find((p) => p.x === hoverX) }))
    .filter((r): r is { s: ChartSeries; p: { x: number; y: number; label: string } } => r.p != null);
  const hoverLabel = hoverRows.length > 0 ? hoverRows[0].p.label : null;

  return (
    <div>
      {/* Fixed readout strip above the plot: values never cover the chart. */}
      <div className="flex items-baseline gap-x-4 gap-y-0.5 flex-wrap text-xs mb-1" style={{ minHeight: "1.25rem" }}>
        {hoverRows.length > 0 ? (
          <>
            <span className="font-bold text-[var(--text)] tabular-nums">{hoverLabel}</span>
            {hoverRows.map(({ s, p }) => (
              <span key={s.name} className="flex items-center gap-1.5 text-[var(--text-muted)]">
                <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                <span>{s.name}</span>
                <span className="tabular-nums font-semibold text-[var(--text)]">{fmt(p.y)}</span>
              </span>
            ))}
          </>
        ) : (
          <span className="text-[var(--text-dim)]">Hover the chart for exact values</span>
        )}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        onMouseMove={onMove}
        onMouseLeave={() => setHoverX(null)}
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={PL} x2={W - PR} y1={py(t)} y2={py(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={PL - 6} y={py(t) + 3} textAnchor="end" fontSize={9} fill="var(--text-dim)">
              {t >= 1000 ? `${t / 1000}k` : t}{unit}
            </text>
          </g>
        ))}
        {decades.map((d) => (
          <text key={d} x={px(d)} y={H - 8} textAnchor="middle" fontSize={9} fill="var(--text-dim)">{d}</text>
        ))}
        {hoverX != null ? (
          <line x1={px(hoverX)} x2={px(hoverX)} y1={PT} y2={H - PB} stroke="var(--text-dim)" strokeWidth={1} strokeDasharray="3 3" />
        ) : null}
        {series.map((s) => (
          <g key={s.name}>
            <polyline
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              points={s.points.map((p) => `${px(p.x)},${py(p.y)}`).join(" ")}
            />
            {s.points.map((p, i) => (
              <circle
                key={i}
                cx={px(p.x)}
                cy={py(p.y)}
                r={p.x === hoverX ? 5 : 3}
                fill={s.color}
                stroke="var(--bg-card)"
                strokeWidth={1.5}
              />
            ))}
            <text
              x={px(s.points[s.points.length - 1].x) + 8}
              y={py(s.points[s.points.length - 1].y) + 3}
              fontSize={10}
              fill={s.color}
            >
              {s.name}
            </text>
          </g>
        ))}
        {/* full-plot hover target */}
        <rect x={PL} y={PT} width={W - PL - PR} height={H - PT - PB} fill="transparent" />
      </svg>
    </div>
  );
}
