"use client";

import { useMemo, useRef, useState } from "react";
import { makeDeflator, deflateSeries, type MarketCpi } from "@/lib/realTerms";

// Daily history chart for /business/markets/[symbol]. Same idiom as FxChart:
// plain SVG, theme tokens, hover crosshair with a header readout rather than a
// floating tooltip. Two things differ, both because these series are far
// longer-lived than an exchange rate.
//
// LOG SCALE. The Dow runs from 30.92 in 1885 to about 53,770 today, a
// 1,700-fold range. On a linear axis its first century is a flat line along the
// floor and the chart says nothing. The scale therefore defaults to log
// whenever the visible high/low ratio exceeds 20, with a manual toggle, so
// short ranges still read linearly (which is what you want for a year of gold)
// and long ones read as growth rates (which is what you want for a century of
// equities).
//
// CHANGE SINCE RANGE START. An index level in isolation means little, so the
// readout carries the move from the first visible point as well as the level.
//
// REAL TERMS. Every level here is nominal, and over these spans that is the
// difference between a fact and a fiction: the Dow is up 1,737-fold since 1885
// in dollars and 52-fold in purchasing power. The Real toggle deflates by the
// CPI of the country the series is priced in (US CPI for the USD commodity
// contracts), expressed in the latest CPI year's money. Deflation happens
// before the range window and before decimation, so every derived number on
// the chart follows the toggle. See lib/realTerms.ts for the interpolation and
// the deliberate clamp at the start of the CPI record.

type Props = {
  name: string;
  unit: string | null;
  series: [string, number][];
  cpi?: MarketCpi | null;
};

const RANGES: [string, number | null][] = [
  ["1Y", 1],
  ["5Y", 5],
  ["20Y", 20],
  ["50Y", 50],
  ["Max", null],
];

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const MAX_DRAWN = 800; // decimate long ranges; the line's shape survives

function fmtLevel(n: number): string {
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 100) return n.toFixed(1);
  if (n >= 1) return n.toFixed(2);
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
  return out.slice(0, 6);
}

// 1-2-5 decade ticks, so a log axis reads 100 / 200 / 500 / 1,000 rather than
// arbitrary fractions of a power.
function logTicks(lo: number, hi: number): number[] {
  const out: number[] = [];
  const start = Math.floor(Math.log10(lo));
  for (let e = start; e <= Math.ceil(Math.log10(hi)); e++) {
    for (const m of [1, 2, 5]) {
      const v = m * Math.pow(10, e);
      if (v >= lo && v <= hi) out.push(v);
    }
  }
  if (out.length <= 7) return out;
  const keep = Math.ceil(out.length / 6);
  return out.filter((_, i) => i % keep === 0);
}

export default function SeriesChart({ name, unit, series, cpi }: Props) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [range, setRange] = useState<string>("Max");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [logPref, setLogPref] = useState<boolean | null>(null);
  const [real, setReal] = useState(false);

  const deflator = useMemo(() => makeDeflator(cpi), [cpi]);
  const on = real && deflator != null;
  const source = useMemo(
    () => (on && deflator ? deflateSeries(series, deflator) : series),
    [series, on, deflator],
  );
  const clamped = on && deflator != null && Number(series[0][0].slice(0, 4)) < deflator.minYear;

  const view = useMemo(() => {
    const years = RANGES.find(([label]) => label === range)?.[1] ?? null;
    let pts = source;
    if (years !== null && source.length > 0) {
      const [ly, lm, ld] = source[source.length - 1][0].split("-").map(Number);
      const cut = `${String(ly - years).padStart(4, "0")}-${String(lm).padStart(2, "0")}-${String(ld).padStart(2, "0")}`;
      pts = source.filter(([d]) => d >= cut);
    }
    if (pts.length > MAX_DRAWN) {
      const step = (pts.length - 1) / (MAX_DRAWN - 1);
      const keep: [string, number][] = [];
      for (let i = 0; i < MAX_DRAWN; i++) keep.push(pts[Math.round(i * step)]);
      pts = keep;
    }
    return pts;
  }, [source, range]);

  const vals = view.map((p) => p[1]);
  const lo = vals.length ? Math.min(...vals) : 0;
  const hiV = vals.length ? Math.max(...vals) : 1;
  const canLog = lo > 0;
  const autoLog = canLog && hiV / lo > 20;
  const useLog = canLog && (logPref ?? autoLog);

  if (view.length < 2) return null;

  const W = 640, H = 280, PL = 52, PR = 10, PT = 14, PB = 26;
  const pad = (hiV - lo) * 0.06 || hiV * 0.02 || 0.01;
  const y0 = useLog ? Math.log10(lo) - 0.02 : lo - pad;
  const y1 = useLog ? Math.log10(hiV) + 0.02 : hiV + pad;
  // Time-proportional x. These series mix monthly and daily points and span up
  // to 141 years, so index-spaced x would compress whole decades.
  const times = view.map((p) => Date.parse(`${p[0]}T00:00:00Z`));
  const t0 = times[0], tSpan = (times[times.length - 1] - t0) || 1;
  const px = (i: number) => PL + ((times[i] - t0) / tSpan) * (W - PL - PR);
  const py = (v: number) => {
    const u = useLog ? Math.log10(Math.max(v, 1e-9)) : v;
    return PT + (1 - (u - y0) / (y1 - y0)) * (H - PT - PB);
  };
  const path = view
    .map((p, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(p[1]).toFixed(1)}`)
    .join("");

  const ticks = useLog ? logTicks(lo, hiV) : niceTicks(lo, hiV);
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    f,
    label: new Date(t0 + f * tSpan).toISOString().slice(0, range === "1Y" ? 7 : 4),
  }));

  const first = view[0][1];
  const cur = hoverIdx != null ? view[hoverIdx] : null;
  const shown = cur ?? view[view.length - 1];
  const chg = first > 0 ? (shown[1] - first) / first : null;

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
    setHoverIdx(target - times[a] <= times[b] - target ? a : b);
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2 mb-2">
        <div className="flex flex-wrap gap-1.5">
          {RANGES.map(([label]) => (
            <button
              key={label}
              onClick={() => { setRange(label); setHoverIdx(null); }}
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
          {canLog && (
            <button
              onClick={() => setLogPref(!useLog)}
              aria-pressed={useLog}
              title="A log axis shows equal percentage moves as equal distances, which is the only way a century of an index reads sensibly."
              className="rounded-md border px-2.5 py-1 text-xs font-medium transition ml-1"
              style={{
                borderColor: useLog ? "var(--accent)" : "var(--border)",
                color: useLog ? "var(--accent)" : "var(--text-muted)",
                background: "var(--bg-card)",
              }}
            >
              Log
            </button>
          )}
          {deflator && (
            <button
              onClick={() => { setReal(!real); setHoverIdx(null); }}
              aria-pressed={on}
              title={`Deflate by ${cpi?.basis ?? "CPI"}, expressed in ${deflator.baseYear} money. Nominal levels over spans this long mostly measure the currency, not the market.`}
              className="rounded-md border px-2.5 py-1 text-xs font-medium transition"
              style={{
                borderColor: on ? "var(--accent)" : "var(--border)",
                color: on ? "var(--accent)" : "var(--text-muted)",
                background: "var(--bg-card)",
              }}
            >
              Real
            </button>
          )}
        </div>
        <div className="text-xs tabular-nums" style={{ minHeight: "1rem" }}>
          <span className="text-[var(--text-muted)]">
            <span className="font-semibold text-[var(--text)]" style={MONO}>{shown[0]}</span>
            {" — "}
            <span className="font-semibold text-[var(--text)]" style={MONO}>{fmtLevel(shown[1])}</span>
            {unit ? ` ${unit}` : ""}
            {chg != null && (
              <>
                {" · "}
                <span style={{ ...MONO, color: chg >= 0 ? "#10b981" : "#E2628B" }}>
                  {chg >= 0 ? "+" : ""}{(chg * 100).toFixed(chg > 10 ? 0 : 1)}%
                </span>
                {" from "}{view[0][0].slice(0, 4)}
              </>
            )}
          </span>
        </div>
      </div>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${name} over time, ${useLog ? "logarithmic" : "linear"} scale`}
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {ticks.map((t) => (
          <g key={`g${t}`}>
            <line x1={PL} x2={W - PR} y1={py(t)} y2={py(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={PL - 5} y={py(t) + 3} textAnchor="end" fontSize={9} fill="var(--text-dim)" style={MONO}>
              {fmtLevel(t)}
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
        {hoverIdx != null && (
          <g>
            <line x1={px(hoverIdx)} x2={px(hoverIdx)} y1={PT} y2={H - PB} stroke="var(--text-dim)" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={px(hoverIdx)} cy={py(view[hoverIdx][1])} r={4} fill="var(--accent)" stroke="var(--bg)" strokeWidth={1.5} />
          </g>
        )}
      </svg>
      {on && deflator && (
        <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
          Real terms: deflated by {cpi?.basis ?? "CPI"} and expressed in {deflator.baseYear} money.
          {clamped ? ` The real view starts in ${deflator.minYear}, where that CPI record begins; the nominal view goes back to ${series[0][0].slice(0, 4)}.` : ""}
          {" "}CPI is annual, interpolated between mid-year points.
        </p>
      )}
    </div>
  );
}
