// A house-price index over time, real and nominal on one axis. Server
// renderable (no hooks): the page passes the series and gets an SVG back.
// Colour is computed from the site's categorical tokens (--cat-1 real,
// --cat-2 nominal); the 2007 to 2012 crash window is a faint band so the
// drawdown the boards quote can be seen on the line.

import type { CSSProperties } from "react";

const MONO: CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const W = 720;
const H = 260;
const M = { top: 14, right: 16, bottom: 28, left: 44 };

export type HousingPoint = [number, number, number, number | null, number]; // yr, q, nsa, sa, real

export default function HousingChart({
  series,
  baseYear,
  title,
  compact = false,
}: {
  series: HousingPoint[];
  baseYear: number;
  title: string;
  compact?: boolean;
}) {
  if (series.length < 4) return <p className="text-sm text-[var(--text-muted)]">Not enough quarters to chart.</p>;
  const h = compact ? 180 : H;
  const t = (p: HousingPoint) => p[0] + (p[1] - 1) / 4;
  const x0 = t(series[0]);
  const x1 = t(series[series.length - 1]);
  const vals = series.flatMap((p) => [p[2], p[4]]);
  const lo = 0;
  const hi = Math.ceil(Math.max(...vals) / 50) * 50;
  const px = (x: number) => M.left + ((x - x0) / Math.max(x1 - x0, 0.25)) * (W - M.left - M.right);
  const py = (v: number) => M.top + (1 - (v - lo) / (hi - lo)) * (h - M.top - M.bottom);
  const path = (pick: (p: HousingPoint) => number) =>
    series.map((p, i) => `${i ? "L" : "M"}${px(t(p)).toFixed(1)},${py(pick(p)).toFixed(1)}`).join("");
  const decades: number[] = [];
  for (let y = Math.ceil(x0 / 10) * 10; y <= x1; y += 10) decades.push(y);
  const yTicks: number[] = [];
  const step = hi > 400 ? 100 : 50;
  for (let v = lo; v <= hi; v += step) yTicks.push(v);
  const crashFrom = Math.max(x0, 2007);
  const crashTo = Math.min(x1, 2012.75);
  const last = series[series.length - 1];
  return (
    <figure className="m-0 min-w-0">
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs mb-2 text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden style={{ background: "var(--cat-1)", width: 14, height: 3, borderRadius: 2, display: "inline-block" }} />real, {baseYear} dollars</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden style={{ background: "var(--cat-2)", width: 14, height: 3, borderRadius: 2, display: "inline-block" }} />nominal</span>
        <span className="text-[var(--text-dim)]">index, first quarter = 100 · shaded: 2007 to 2012</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${h}`} className="w-full h-auto" role="img"
        aria-label={`${title}: house price index from ${series[0][0]} to ${last[0]} Q${last[1]}, ${last[2].toFixed(0)} nominal and ${last[4].toFixed(0)} in ${baseYear} dollars.`}>
        {crashTo > crashFrom ? (
          <rect x={px(crashFrom)} y={M.top} width={px(crashTo) - px(crashFrom)} height={h - M.top - M.bottom} fill="var(--text-dim)" fillOpacity={0.08} />
        ) : null}
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={M.left} x2={W - M.right} y1={py(v)} y2={py(v)} stroke="var(--border)" strokeWidth={1} />
            <text x={M.left - 6} y={py(v) + 3} textAnchor="end" fontSize={10} fill="var(--text-dim)" style={MONO}>{v}</text>
          </g>
        ))}
        {decades.map((y) => (
          <text key={y} x={px(y)} y={h - 8} textAnchor="middle" fontSize={10} fill="var(--text-dim)" style={MONO}>{y}</text>
        ))}
        <path d={path((p) => p[2])} fill="none" stroke="var(--cat-2)" strokeWidth={1.6} strokeLinejoin="round" />
        <path d={path((p) => p[4])} fill="none" stroke="var(--cat-1)" strokeWidth={2.2} strokeLinejoin="round" />
        <circle cx={px(t(last))} cy={py(last[4])} r={3} fill="var(--cat-1)" />
        <circle cx={px(t(last))} cy={py(last[2])} r={2.5} fill="var(--cat-2)" />
      </svg>
    </figure>
  );
}
