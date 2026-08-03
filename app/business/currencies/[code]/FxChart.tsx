"use client";

import { useMemo, useRef, useState } from "react";

// USD-rate history chart for /business/currencies/[code]. Same idiom as
// ClubHistoryChart: plain SVG, theme tokens, hover crosshair with a header
// readout instead of a floating tooltip. Single series (units per USD), so
// no legend; range chips filter client-side. Data: public/data/business/
// fx-series/{code}.json - seeded by scripts/business/build_fx_series.py,
// extended each morning by build_fx.py in the daily refresh.

type Props = { code: string; series: [string, number][] };

const RANGES: [string, number | null][] = [
  ["1Y", 1],
  ["5Y", 5],
  ["20Y", 20],
  ["Max", null],
];

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const MAX_DRAWN = 800; // decimate long ranges; the line's shape survives

function fmtRate(n: number): string {
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 100) return n.toFixed(1);
  if (n >= 10) return n.toFixed(2);
  return n.toFixed(4);
}

function niceTicks(lo: number, hi: number): number[] {
  const span = hi - lo || Math.abs(hi) || 1;
  const step = Math.pow(10, Math.floor(Math.log10(span / 3)));
  const mult = span / 3 / step >= 5 ? 5 : span / 3 / step >= 2 ? 2 : 1;
  const s = step * mult;
  const first = Math.ceil(lo / s) * s;
  const out: number[] = [];
  for (let v = first; v <= hi + 1e-12; v += s) out.push(v);
  return out.slice(0, 5);
}

export default function FxChart({ code, series }: Props) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [range, setRange] = useState<string>("5Y");
  const [hi, setHi] = useState<number | null>(null);

  const view = useMemo(() => {
    const years = RANGES.find(([label]) => label === range)?.[1] ?? null;
    let pts = series;
    if (years !== null && series.length > 0) {
      const [ly, lm, ld] = series[series.length - 1][0].split("-").map(Number);
      const cut = `${String(ly - years).padStart(4, "0")}-${String(lm).padStart(2, "0")}-${String(ld).padStart(2, "0")}`;
      pts = series.filter(([d]) => d >= cut);
    }
    if (pts.length > MAX_DRAWN) {
      const step = (pts.length - 1) / (MAX_DRAWN - 1);
      const keep: [string, number][] = [];
      for (let i = 0; i < MAX_DRAWN; i++) keep.push(pts[Math.round(i * step)]);
      pts = keep;
    }
    return pts;
  }, [series, range]);

  if (view.length < 2) return null;

  const W = 640, H = 260, PL = 46, PR = 10, PT = 14, PB = 26;
  const vals = view.map((p) => p[1]);
  const lo = Math.min(...vals), hiV = Math.max(...vals);
  const pad = (hiV - lo) * 0.06 || hiV * 0.02 || 0.01;
  const y0 = lo - pad, y1 = hiV + pad;
  // Time-proportional x: the series mixes monthly (pre-1971), weekly and
  // daily points, so index-spaced x would compress whole decades. Map by
  // actual date instead.
  const times = view.map((p) => Date.parse(`${p[0]}T00:00:00Z`));
  const t0 = times[0], tSpan = (times[times.length - 1] - t0) || 1;
  const px = (i: number) => PL + ((times[i] - t0) / tSpan) * (W - PL - PR);
  const py = (v: number) => PT + (1 - (v - y0) / (y1 - y0)) * (H - PT - PB);
  const path = view.map((p, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(p[1]).toFixed(1)}`).join("");

  const ticks = niceTicks(lo, hiV);
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    f,
    label: new Date(t0 + f * tSpan).toISOString().slice(0, range === "1Y" ? 7 : 4),
  }));

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    const xv = ((e.clientX - r.left) / r.width) * W;
    const frac = Math.min(1, Math.max(0, (xv - PL) / (W - PL - PR)));
    const target = t0 + frac * tSpan;
    let a = 0, b = times.length - 1;
    while (b - a > 1) {
      const mid = (a + b) >> 1;
      if (times[mid] < target) a = mid;
      else b = mid;
    }
    setHi(target - times[a] <= times[b] - target ? a : b);
  }
  const cur = hi != null ? view[hi] : null;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-2">
        <div className="flex gap-1.5">
          {RANGES.map(([label]) => (
            <button
              key={label}
              onClick={() => { setRange(label); setHi(null); }}
              className="rounded-md border px-2.5 py-1 text-xs font-medium transition"
              style={{
                borderColor: range === label ? "var(--accent)" : "var(--border)",
                color: range === label ? "var(--accent)" : "var(--text-muted)",
                background: "var(--bg-card)",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="text-xs tabular-nums" style={{ minHeight: "1rem" }}>
          {cur ? (
            <span className="text-[var(--text-muted)]">
              <span className="font-semibold text-[var(--text)]" style={MONO}>{cur[0]}</span>
              {" — 1 USD = "}
              <span className="font-semibold text-[var(--text)]" style={MONO}>{fmtRate(cur[1])} {code}</span>
              {" · 1 "}{code}{" = "}
              <span className="font-semibold text-[var(--text)]" style={MONO}>${(1 / cur[1]).toFixed(4)}</span>
            </span>
          ) : (
            <span className="text-[var(--text-dim)]">Hover for the rate on any date</span>
          )}
        </div>
      </div>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${code} per US dollar over time`}
        onMouseMove={onMove}
        onMouseLeave={() => setHi(null)}
      >
        {ticks.map((t) => (
          <g key={`g${t}`}>
            <line x1={PL} x2={W - PR} y1={py(t)} y2={py(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={PL - 5} y={py(t) + 3} textAnchor="end" fontSize={9} fill="var(--text-dim)" style={MONO}>
              {fmtRate(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t, k) => (
          <text
            key={`x${k}`}
            x={PL + t.f * (W - PL - PR)}
            y={H - 8}
            textAnchor={k === 0 ? "start" : k === 4 ? "end" : "middle"}
            fontSize={9}
            fill="var(--text-dim)"
            style={MONO}
          >
            {t.label}
          </text>
        ))}
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hi != null && (
          <g>
            <line x1={px(hi)} x2={px(hi)} y1={PT} y2={H - PB} stroke="var(--text-dim)" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={px(hi)} cy={py(view[hi][1])} r={4} fill="var(--accent)" stroke="var(--bg)" strokeWidth={1.5} />
          </g>
        )}
      </svg>
    </div>
  );
}
