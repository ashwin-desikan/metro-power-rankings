"use client";

import { useState } from "react";

export type StackCat = { key: string; label: string; color: string };
export type StackRow = { decade: string; values: Record<string, number>; total: number };

// Stacked bar of moves per decade, one segment per sport. Desktop draws a
// vertical stack in plain SVG; phones get a horizontal-bar twin (same data,
// same colours) because six thin vertical segments read as noise at 390px
// width but read fine stacked left-to-right in a wide short bar. Hover state
// drives a fixed readout row above the chart, never a floating tooltip -
// same idiom as app/elections/LineChart.tsx and SeriesChart.tsx.
export default function DecadeStackChart({
  cats,
  rows,
}: {
  cats: StackCat[];
  rows: StackRow[];
}) {
  const [hover, setHover] = useState<string | null>(null);
  const maxTotal = Math.max(...rows.map((r) => r.total), 1);
  const active = rows.find((r) => r.decade === hover) ?? null;

  const W = 720, H = 260, PL = 34, PR = 8, PT = 8, PB = 28;
  const bw = (W - PL - PR) / rows.length;
  const py = (v: number) => PT + (1 - v / maxTotal) * (H - PT - PB);

  return (
    <div>
      <div
        className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs mb-2 rounded-lg border px-3 py-2"
        style={{ minHeight: "2.5rem", borderColor: "var(--border)", background: "var(--bg-card)" }}
      >
        {active ? (
          <>
            <span className="font-bold text-[var(--text)] tabular-nums">{active.decade}</span>
            <span className="text-[var(--text-muted)] tabular-nums">{active.total} moves</span>
            {cats.filter((c) => (active.values[c.key] ?? 0) > 0).map((c) => (
              <span key={c.key} className="flex items-center gap-1.5 text-[var(--text-muted)]">
                <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
                <span>{c.label}</span>
                <span className="tabular-nums font-semibold text-[var(--text)]">{active.values[c.key]}</span>
              </span>
            ))}
          </>
        ) : (
          <span className="text-[var(--text-dim)]">Hover or tap a decade for the breakdown</span>
        )}
      </div>

      {/* Desktop: vertical stacked bars */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="hidden sm:block w-full"
        role="img"
        aria-label="Franchise moves per decade, stacked by sport"
        onMouseLeave={() => setHover(null)}
      >
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={PL} x2={W - PR} y1={py(f * maxTotal)} y2={py(f * maxTotal)} stroke="var(--border)" strokeWidth={1} />
            <text x={PL - 6} y={py(f * maxTotal) + 3} textAnchor="end" fontSize={9} fill="var(--text-dim)">
              {Math.round(f * maxTotal)}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          let acc = 0;
          const x = PL + i * bw + bw * 0.12;
          const bwInner = bw * 0.76;
          return (
            <g key={r.decade} onMouseEnter={() => setHover(r.decade)}>
              <rect x={x} y={PT} width={bwInner} height={H - PT - PB} fill="transparent" />
              {cats.map((c) => {
                const v = r.values[c.key] ?? 0;
                if (v <= 0) return null;
                const y0 = py(acc);
                acc += v;
                const y1 = py(acc);
                return (
                  <rect
                    key={c.key}
                    x={x}
                    y={y1}
                    width={bwInner}
                    height={Math.max(0, y0 - y1)}
                    fill={c.color}
                    opacity={hover && hover !== r.decade ? 0.45 : 1}
                  />
                );
              })}
              <text x={x + bwInner / 2} y={H - 10} textAnchor="middle" fontSize={9} fill="var(--text-dim)">
                {r.decade.replace("0s", "s")}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Phone: horizontal bars, one row per decade. Bounded by the number of
          decades on record (currently 16, 1870s-2020s) - a cap would need to
          grow before this ever could, so it is exempt rather than capped. */}
      <div className="sm:hidden space-y-1.5" data-mobile-uncapped>
        {rows.map((r) => (
          <button
            key={r.decade}
            type="button"
            onClick={() => setHover(hover === r.decade ? null : r.decade)}
            className="w-full flex items-center gap-2 text-left min-h-[28px]"
          >
            <span className="w-12 flex-shrink-0 text-[10px] tabular-nums text-[var(--text-dim)]">{r.decade}</span>
            <span className="flex-1 flex h-4 rounded-sm overflow-hidden" style={{ background: "var(--border)" }}>
              {cats.map((c) => {
                const v = r.values[c.key] ?? 0;
                if (v <= 0) return null;
                return (
                  <span
                    key={c.key}
                    style={{ width: `${(v / maxTotal) * 100}%`, backgroundColor: c.color }}
                    className="h-full"
                  />
                );
              })}
            </span>
            <span className="w-6 flex-shrink-0 text-right text-[10px] tabular-nums text-[var(--text-muted)]">{r.total}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 text-xs">
        {cats.map((c) => (
          <span key={c.key} className="flex items-center gap-1.5 text-[var(--text-muted)]">
            <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: c.color }} />
            {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}
