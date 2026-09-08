"use client";

import { useMemo, useRef, useState } from "react";

// Step-line history chart for a bank's policy rate, /business/economy/rates/
// [code]. Same idiom as ../../markets/[symbol]/SeriesChart.tsx (plain SVG,
// theme tokens, hover crosshair with a header readout, not a tooltip), with
// two differences a rate series needs and a price series does not:
//
// STEP, NOT LINE. A policy rate is constant between decisions, so the path
// jumps horizontally then vertically at each change date, rather than
// interpolating a straight line between two levels that were never actually
// crossed. The last held level is extended flat to the build date, since the
// rate is still in force even though nothing changed today.
//
// INSTRUMENT ERAS. `instruments[]` boundaries are drawn as thin vertical
// rules labelled with the era name, because "3.75%" means something
// different under "Bank Rate" than under "Minimum Lending Rate". Market eras
// (`kind === "market"`) are shaded, because that span is a BIS-observed proxy
// rather than a decision the bank made.
//
// LINEAR ONLY. Levels sit in a narrow single-digit-to-low-double-digit band,
// nothing like the multi-order-of-magnitude spread that makes SeriesChart
// default to log. A zero line is drawn whenever the visible range dips below
// zero (ECB, SNB, BoJ, Riksbank all have).

type Instrument = { from: string; to: string | null; name: string; kind: "policy" | "market" };

type Props = {
  name: string;
  path: [string, number][];
  instruments: Instrument[];
  built: string;
};

const RANGES: [string, number | null][] = [
  ["5Y", 5],
  ["20Y", 20],
  ["50Y", 50],
  ["Max", null],
];

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const MAX_DRAWN = 800;

function fmtLevel(n: number): string {
  const dp = Math.abs(Math.round(n * 1000) - Math.round(n * 100) * 10) > 0.5 ? 3 : 2;
  return `${n.toFixed(dp)}%`;
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

export default function RateChart({ name, path: rawPath, instruments, built }: Props) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [range, setRange] = useState<string>("Max");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Extend the series with a synthetic point at the build date, holding the
  // last known level flat - the step should reach "now", not stop dangling
  // at the last decision date.
  const full = useMemo<[string, number][]>(() => {
    if (!rawPath.length) return rawPath;
    const last = rawPath[rawPath.length - 1];
    return last[0] === built ? rawPath : [...rawPath, [built, last[1]]];
  }, [rawPath, built]);

  const view = useMemo(() => {
    const years = RANGES.find(([label]) => label === range)?.[1] ?? null;
    let pts = full;
    if (years !== null && full.length > 0) {
      const [ly, lm, ld] = full[full.length - 1][0].split("-").map(Number);
      const cut = `${String(ly - years).padStart(4, "0")}-${String(lm).padStart(2, "0")}-${String(ld).padStart(2, "0")}`;
      const before = full.filter((p) => p[0] < cut);
      const inRange = full.filter((p) => p[0] >= cut);
      // Keep the last point before the cut so the step into view starts at
      // the right level rather than assuming zero.
      pts = before.length ? [before[before.length - 1], ...inRange] : inRange;
    }
    if (pts.length > MAX_DRAWN) {
      const step = (pts.length - 1) / (MAX_DRAWN - 1);
      const keep: [string, number][] = [];
      for (let i = 0; i < MAX_DRAWN; i++) keep.push(pts[Math.round(i * step)]);
      pts = keep;
    }
    return pts;
  }, [full, range]);

  if (view.length < 2) return null;

  const vals = view.map((p) => p[1]);
  const lo = Math.min(...vals);
  const hiV = Math.max(...vals);
  const showZero = lo < 0 && hiV > 0;

  const W = 640, H = 300, PL = 46, PR = 10, PT = 14, PB = 46;
  const pad = (hiV - lo) * 0.08 || Math.abs(hiV) * 0.1 || 0.5;
  const y0 = lo - pad;
  const y1 = hiV + pad;

  const times = view.map((p) => Date.parse(`${p[0]}T00:00:00Z`));
  const t0 = times[0], tSpan = (times[times.length - 1] - t0) || 1;
  const px = (i: number) => PL + ((times[i] - t0) / tSpan) * (W - PL - PR);
  const py = (v: number) => PT + (1 - (v - y0) / (y1 - y0)) * (H - PT - PB);
  const pxAt = (ms: number) => PL + Math.min(1, Math.max(0, (ms - t0) / tSpan)) * (W - PL - PR);

  // Step path: horizontal to the next date's x at the CURRENT level, then
  // vertical to the next level.
  let path = `M${px(0).toFixed(1)},${py(view[0][1]).toFixed(1)}`;
  for (let i = 1; i < view.length; i++) {
    path += ` H${px(i).toFixed(1)} V${py(view[i][1]).toFixed(1)}`;
  }

  const ticks = niceTicks(y0, y1);

  const visStart = t0, visEnd = t0 + tSpan;
  const eraBounds = instruments
    .map((ins) => {
      const from = Date.parse(`${ins.from}T00:00:00Z`);
      const to = ins.to ? Date.parse(`${ins.to}T00:00:00Z`) : visEnd;
      return { ...ins, from, to };
    })
    .filter((ins) => ins.to >= visStart && ins.from <= visEnd);

  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    f,
    label: new Date(t0 + f * tSpan).toISOString().slice(0, range === "5Y" ? 7 : 4),
  }));

  const cur = hoverIdx != null ? view[hoverIdx] : null;
  const shown = cur ?? view[view.length - 1];
  const hasMarketEra = eraBounds.some((e) => e.kind === "market");

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
              className="rounded-md border px-2.5 py-1 text-xs font-medium transition min-h-11 sm:min-h-0"
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
          <span className="text-[var(--text-muted)]">
            <span className="font-semibold text-[var(--text)]" style={MONO}>{shown[0]}</span>
            {" · "}
            <span className="font-semibold text-[var(--text)]" style={MONO}>{fmtLevel(shown[1])}</span>
          </span>
        </div>
      </div>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${name} policy rate over time, step chart`}
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {eraBounds.filter((e) => e.kind === "market").map((e, i) => (
          <rect
            key={`m${i}`}
            x={pxAt(e.from)}
            y={PT}
            width={Math.max(0, pxAt(e.to) - pxAt(e.from))}
            height={H - PT - PB}
            fill="var(--text-dim)"
            opacity={0.08}
          />
        ))}
        {ticks.map((t) => (
          <g key={`g${t}`}>
            <line x1={PL} x2={W - PR} y1={py(t)} y2={py(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={PL - 5} y={py(t) + 3} textAnchor="end" fontSize={9} fill="var(--text-dim)" style={MONO}>
              {t.toFixed(t === Math.round(t) ? 0 : 1)}
            </text>
          </g>
        ))}
        {showZero && (
          <line x1={PL} x2={W - PR} y1={py(0)} y2={py(0)} stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="2 2" />
        )}
        {eraBounds.map((e, i) => (
          <g key={`e${i}`}>
            {i > 0 && (
              <line x1={pxAt(e.from)} x2={pxAt(e.from)} y1={PT} y2={H - PB} stroke="var(--border)" strokeWidth={1} strokeDasharray="2 3" />
            )}
            <text
              x={Math.min(pxAt(e.to) - 3, Math.max(pxAt(e.from) + 3, PL + 3))}
              y={H - PB + 12}
              fontSize={8}
              fill="var(--text-dim)"
              style={MONO}
            >
              {e.name}
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
      {hasMarketEra && (
        <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
          Shaded: market rate used as a proxy, not a decision.
        </p>
      )}
    </div>
  );
}
