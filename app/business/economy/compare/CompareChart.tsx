"use client";

import { useMemo, useState } from "react";

// Overlay chart for /business/economy/compare.
//
// NOT REBASED. The markets overlay (../../markets/compare) indexes every
// series to 100 because index levels are not comparable with each other. A
// policy rate needs none of that: every bank's rate is already in the same
// unit, per cent, on the same scale, so the raw level IS the honest
// comparison and rebasing would only throw that away.
//
// STEP, NOT LINE, same reasoning as RateChart.tsx: a rate holds between
// decisions and jumps on one, so each series is drawn as a step, not a
// straight interpolation between two levels that were never actually
// crossed.
//
// SIX COLOURS, HARD CAP. The site's categorical palette (--cat-1..6, see
// DESIGN-STANDARDS.md 7) is validated for exactly six mutually distinguishable
// slots and is never cycled - a seventh pick would either repeat a colour
// (ambiguous) or fall back to an unvalidated one (illegal), so the picker
// simply refuses a seventh pick rather than do either.
//
// Linear scale only (no log, no real-terms toggle): the whole point is
// comparing per-cent levels directly, and none of the reasons SeriesChart or
// the markets overlay reach for those toggles - multi-order-of-magnitude
// spread, a currency to deflate - apply to a rate already denominated in the
// same small unit for every bank.

export type CompareBank = {
  code: string;
  short: string;
  country: string;
  ended: string | null;
  path: [string, number][];
};

const STARTS = ["1900-01-01", "1950-01-01", "1970-01-01", "1990-01-01", "2000-01-01", "2010-01-01", "2020-01-01"];
const MAX_PICKS = 6;
const PALETTE = ["var(--cat-1)", "var(--cat-2)", "var(--cat-3)", "var(--cat-4)", "var(--cat-5)", "var(--cat-6)"];
const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;

function fmtLevel(n: number): string {
  const dp = Math.abs(Math.round(n * 1000) - Math.round(n * 100) * 10) > 0.5 ? 3 : 2;
  return n.toFixed(dp);
}

function niceTicks(lo: number, hi: number): number[] {
  const span = hi - lo || Math.abs(hi) || 1;
  const step = Math.pow(10, Math.floor(Math.log10(span / 4)));
  const mult = span / 4 / step >= 5 ? 5 : span / 4 / step >= 2 ? 2 : 1;
  const s = step * mult;
  const first = Math.ceil(lo / s) * s;
  const out: number[] = [];
  for (let v = first; v <= hi + 1e-12; v += s) out.push(v);
  return out.slice(0, 7);
}

export default function CompareChart({ all }: { all: CompareBank[] }) {
  const [from, setFrom] = useState("1990-01-01");
  const [picked, setPicked] = useState<string[]>(["fed", "ecb", "boe", "boj"]);

  // A bank is eligible from the from-date if it has ANY point at or before it
  // (so its window can be seeded with the right starting level) or begins
  // after it (drawn from its own first point instead, legend says so).
  const windows = useMemo(() => {
    const map = new Map<string, { pts: [string, number][]; clamped: boolean }>();
    for (const b of all) {
      if (!b.path.length) continue;
      const before = b.path.filter(([d]) => d <= from);
      const after = b.path.filter(([d]) => d > from);
      const seed = before.length ? [before[before.length - 1]] : [];
      const pts = [...seed, ...after];
      if (pts.length >= 2 || (pts.length === 1 && before.length)) {
        map.set(b.code, { pts, clamped: !before.length });
      }
    }
    return map;
  }, [all, from]);

  function toggle(code: string) {
    setPicked((p) => (p.includes(code) ? p.filter((x) => x !== code) : p.length >= MAX_PICKS ? p : [...p, code]));
  }

  const lines = useMemo(() => {
    const out: { code: string; short: string; color: string; pts: [number, number][]; last: number; clamped: boolean; startYear: string }[] = [];
    let ci = 0;
    for (const code of picked) {
      const b = all.find((x) => x.code === code);
      const w = windows.get(code);
      if (!b || !w || w.pts.length < 2) continue;
      const pts = w.pts.map(([d, v]) => [Date.parse(`${d}T00:00:00Z`), v] as [number, number]);
      out.push({ code, short: b.short, color: PALETTE[ci++ % PALETTE.length], pts, last: pts[pts.length - 1][1], clamped: w.clamped, startYear: w.pts[0][0].slice(0, 4) });
    }
    return out;
  }, [all, picked, windows]);

  const W = 720, H = 340, PL = 46, PR = 96, PT = 14, PB = 26;
  const allPts = lines.flatMap((l) => l.pts);
  const hasData = lines.length > 0 && allPts.length > 1;

  let body: React.ReactNode = null;
  if (!hasData) {
    body = (
      <p className="text-sm text-[var(--text-muted)] py-10 text-center">
        Nothing to draw. Pick at least one bank with history at or after {from.slice(0, 4)}.
      </p>
    );
  } else {
    const vs = allPts.map((p) => p[1]);
    const lo = Math.min(0, ...vs);
    const hi = Math.max(0, ...vs);
    const pad = (hi - lo) * 0.08 || 0.5;
    const y0 = lo - pad, y1 = hi + pad;
    const ts = allPts.map((p) => p[0]);
    const t0 = Math.min(...ts), tSpan = Math.max(...ts) - t0 || 1;
    const px = (t: number) => PL + ((t - t0) / tSpan) * (W - PL - PR);
    const py = (v: number) => PT + (1 - (v - y0) / (y1 - y0)) * (H - PT - PB);
    const ticks = niceTicks(y0, y1);
    const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ f, label: new Date(t0 + f * tSpan).toISOString().slice(0, 4) }));

    body = (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Selected central bank policy rates from ${from}`}>
        {ticks.map((t) => (
          <g key={`g${t}`}>
            <line x1={PL} x2={W - PR} y1={py(t)} y2={py(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={PL - 5} y={py(t) + 3} textAnchor="end" fontSize={9} fill="var(--text-dim)" style={MONO}>
              {fmtLevel(t)}
            </text>
          </g>
        ))}
        {y0 <= 0 && y1 >= 0 && (
          <line x1={PL} x2={W - PR} y1={py(0)} y2={py(0)} stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="4 3" />
        )}
        {xTicks.map((t, k) => (
          <text key={`x${k}`} x={PL + t.f * (W - PL - PR)} y={H - 8} textAnchor={k === 0 ? "start" : k === 4 ? "end" : "middle"} fontSize={9} fill="var(--text-dim)" style={MONO}>
            {t.label}
          </text>
        ))}
        {lines.map((l) => {
          let d = `M${px(l.pts[0][0]).toFixed(1)},${py(l.pts[0][1]).toFixed(1)}`;
          for (let i = 1; i < l.pts.length; i++) {
            d += ` H${px(l.pts[i][0]).toFixed(1)} V${py(l.pts[i][1]).toFixed(1)}`;
          }
          return (
            <g key={l.code}>
              <path d={d} fill="none" stroke={l.color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
              <text x={W - PR + 5} y={py(l.last) + 3} fontSize={9} fill={l.color} style={MONO}>
                {fmtLevel(l.last)}%
              </text>
            </g>
          );
        })}
      </svg>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <label className="text-xs text-[var(--text-muted)]">
          From{" "}
          <select
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border px-2 py-1 text-xs min-h-11 sm:min-h-0"
            style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text)" }}
          >
            {STARTS.map((d) => <option key={d} value={d}>{d.slice(0, 4)}</option>)}
          </select>
        </label>
        <span className="text-xs text-[var(--text-dim)]">{picked.length}/{MAX_PICKS} selected</span>
      </div>

      <div className="rounded-2xl border p-3 sm:p-4 mb-4 min-w-0" style={{ borderColor: "var(--border)" }}>
        {body}
        {lines.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            {lines.map((l) => (
              <span key={l.code} className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: l.color }} />
                {l.short}
                {l.clamped && <span style={MONO}>from {l.startYear}</span>}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {all.map((b) => {
          const on = picked.includes(b.code);
          const w = windows.get(b.code);
          const ok = !!w;
          return (
            <button
              key={b.code}
              onClick={() => ok && toggle(b.code)}
              disabled={!ok}
              title={ok ? `${b.short} (${b.country})` : `${b.short} has no history in this range`}
              className="rounded-md border px-2 py-1 text-xs transition min-h-11 sm:min-h-0"
              style={{
                borderColor: on ? "var(--accent)" : "var(--border)",
                color: !ok ? "var(--text-dim)" : on ? "var(--accent)" : "var(--text-muted)",
                background: "var(--bg-card)",
                opacity: ok ? 1 : 0.45,
                cursor: ok ? "pointer" : "not-allowed",
              }}
            >
              {b.short}
              {b.ended && <span style={MONO}> ended</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
