"use client";

import { useRef, useState, type MouseEvent } from "react";

// A season-spanning STEP chart of squad market value.
//
// 🔴 STEP, NEVER SMOOTHED. Transfermarkt reprices every squad globally each
// December and June and revalues continuously between: Nottingham Forest
// 2024-25 goes 379 / 379 / 402 / 445 / 455 / 462 across Jul, Sep, Nov, Jan,
// Mar, May. A step line is the honest shape of that, not a simplification;
// a smoothed curve would invent months where the number moved.
//
// Colour is the site's own categorical token, never chosen: --cat-1 (see
// DESIGN-STANDARDS.md section 8). The value in the hover tooltip stays in a
// text token; only the line itself wears the series colour.

export type ValueStepPoint = { m: string; v: number; n: number };

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function seasonLabel(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  const startYear = mo >= 7 ? y : y - 1;
  return `${String(startYear).slice(2)}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

function monthLabel(m: string): string {
  const [y, mo] = m.split("-");
  return `${MONTH_NAMES[Number(mo) - 1]} ${y}`;
}

function fmtEur(v: number): string {
  return v >= 1000 ? `€${(v / 1000).toFixed(2)}b` : `€${v.toFixed(0)}m`;
}

export default function ValueStepChart({
  series,
  label,
  width = 640,
  height = 180,
}: {
  /** Oldest first, EUR millions. Every point already valued: filter nulls before calling. */
  series: ValueStepPoint[];
  label: string;
  width?: number;
  height?: number;
}) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [hi, setHi] = useState<number | null>(null);
  if (series.length < 2) return null;

  const PL = 44, PR = 12, PT = 12, PB = 24;
  const iw = width - PL - PR;
  const ih = height - PT - PB;
  const maxV = Math.max(1, ...series.map((p) => p.v)) * 1.08;
  const x = (i: number) => PL + (i / (series.length - 1)) * iw;
  const y = (v: number) => PT + ih - (v / maxV) * ih;

  // Horizontal hold, then a vertical jump: an honest step, not a curve fit.
  let d = `M${x(0).toFixed(1)},${y(series[0].v).toFixed(1)}`;
  for (let i = 1; i < series.length; i++) d += ` H${x(i).toFixed(1)} V${y(series[i].v).toFixed(1)}`;

  const seasonTicks = series
    .map((p, i) => ({ i, m: p.m }))
    .filter((p) => p.m.endsWith("-07") || p.i === 0);
  const everyN = Math.max(1, Math.ceil(seasonTicks.length / 8));
  const shownTicks = seasonTicks.filter((_, k) => k % everyN === 0);

  // December and June: the two months Transfermarkt reprices every squad.
  const repriceMonths = series
    .map((p, i) => ({ i, reprice: p.m.endsWith("-12") || p.m.endsWith("-06") }))
    .filter((p) => p.reprice);

  const gridV = [0, maxV / 2, maxV];

  function onMove(e: MouseEvent<SVGSVGElement>) {
    const svg = ref.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return;
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const frac = (px - PL) / iw;
    const idx = Math.round(frac * (series.length - 1));
    setHi(Math.max(0, Math.min(series.length - 1, idx)));
  }

  const hp = hi != null ? series[hi] : null;

  return (
    <div className="relative min-w-0">
      <svg
        ref={ref}
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
        style={{ display: "block", width: "100%", height }}
        onMouseMove={onMove}
        onMouseLeave={() => setHi(null)}
      >
        <title>{label}</title>
        {gridV.map((v, i) => (
          <g key={i}>
            <line x1={PL} y1={y(v)} x2={width - PR} y2={y(v)} stroke="var(--border)" strokeWidth={1} opacity={i === 0 ? 0.6 : 0.3} />
            <text x={PL - 6} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize={9} fill="var(--text-dim)" style={MONO}>
              {v >= 1000 ? `${(v / 1000).toFixed(1)}b` : Math.round(v)}
            </text>
          </g>
        ))}
        {repriceMonths.map((p) => (
          <line key={p.i} x1={x(p.i)} y1={height - PB} x2={x(p.i)} y2={height - PB + 4} stroke="var(--text-dim)" strokeWidth={1} opacity={0.5} />
        ))}
        {shownTicks.map((t) => (
          <text key={t.i} x={x(t.i)} y={height - 6} fontSize={9} fill="var(--text-dim)" style={MONO} textAnchor="start">
            {seasonLabel(t.m)}
          </text>
        ))}
        <path d={d} fill="none" stroke="var(--cat-1)" strokeWidth={2} strokeLinejoin="round" />
        {hp && hi != null ? (
          <>
            <line x1={x(hi)} y1={PT} x2={x(hi)} y2={height - PB} stroke="var(--text-dim)" strokeWidth={1} strokeDasharray="2,2" opacity={0.6} />
            <circle cx={x(hi)} cy={y(hp.v)} r={3} fill="var(--cat-1)" />
          </>
        ) : null}
      </svg>
      {hp ? (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-md border px-2 py-1 text-[11px] whitespace-nowrap"
          style={{
            background: "var(--bg-card)",
            borderColor: "var(--border)",
            left: `${Math.min(88, Math.max(4, (x(hi ?? 0) / width) * 100))}%`,
            transform: "translateX(-50%)",
          }}
        >
          <span className="font-semibold text-[var(--text)]" style={MONO}>{monthLabel(hp.m)}</span>{" "}
          <span className="tabular-nums text-[var(--text)]" style={MONO}>{fmtEur(hp.v)}</span>{" "}
          <span className="text-[var(--text-muted)]">· {hp.n} valued</span>
        </div>
      ) : null}
    </div>
  );
}
