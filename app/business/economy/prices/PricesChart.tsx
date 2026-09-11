"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { ChartReadout, ChartReadoutProvider, useChartReadout } from "@/app/_shared/ChartReadout";

// The annual-rate line for US CPI-U and UK CPIH, last 30 years, one axis.
// Both rates are computed identically in build_prices.py (index this month
// over the index twelve months earlier), so the two lines are directly
// comparable even though the underlying indices have different base years.
//
// A CHART THAT NEEDS A POINTER IS NOT FINISHED (DESIGN-STANDARDS §8): the
// readout under the chart is the label, the pointer surface is the whole
// plot, selection is the nearest month, nothing here is under 12px.

export type PricePoint = [number, number, number, number | null]; // year, month, index, yoy

type Props = {
  us: PricePoint[];
  uk: PricePoint[];
  hint?: string;
};

const PAD = { top: 20, right: 16, bottom: 30, left: 40 };
const FONT = 12;
const MONTH_NAME = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function t(p: PricePoint): number {
  return p[0] + (p[1] - 1) / 12;
}

function niceTicks(lo: number, hi: number, n: number): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(6)));
  return out;
}

export default function PricesChart(props: Props) {
  return (
    <ChartReadoutProvider>
      <Plot {...props} />
    </ChartReadoutProvider>
  );
}

function Plot({ us, uk, hint }: Props) {
  const usPts = useMemo(() => us.filter((p) => p[3] != null), [us]);
  const ukPts = useMemo(() => uk.filter((p) => p[3] != null), [uk]);
  const { item, set } = useChartReadout();
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const dragging = useRef(false);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(Math.floor(entries[0].contentRect.width)));
    ro.observe(el);
    setWidth(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);

  const phone = width > 0 && width < 640;
  const height = width > 0 ? Math.round(Math.min(360, Math.max(220, width * (phone ? 0.62 : 0.42)))) : 260;
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = Math.max(0, height - PAD.top - PAD.bottom);

  // Every (year, month) present in either series, ascending, for the pointer
  // to step through - a month one series lacks still gets a tick, so the
  // nearest-mark search never skips a gap in only one line.
  const ticks = useMemo(() => {
    const map = new Map<number, { x: number; y: number; m: number; us: number | null; uk: number | null }>();
    for (const p of usPts) {
      const x = t(p);
      const e = map.get(x) ?? { x, y: p[0], m: p[1], us: null, uk: null };
      e.us = p[3]; map.set(x, e);
    }
    for (const p of ukPts) {
      const x = t(p);
      const e = map.get(x) ?? { x, y: p[0], m: p[1], us: null, uk: null };
      e.uk = p[3]; map.set(x, e);
    }
    return [...map.values()].sort((a, b) => a.x - b.x);
  }, [usPts, ukPts]);

  const scale = useMemo(() => {
    if (!ticks.length) return null;
    const x0 = ticks[0].x, x1 = ticks[ticks.length - 1].x;
    const vals = ticks.flatMap((e) => [e.us, e.uk]).filter((v): v is number => v != null);
    let y0 = Math.min(0, ...vals), y1 = Math.max(0, ...vals);
    const pad = (y1 - y0) * 0.08 || 1;
    y0 -= pad; y1 += pad;
    return {
      x: (v: number) => PAD.left + ((v - x0) / Math.max(x1 - x0, 0.25)) * plotW,
      y: (v: number) => PAD.top + (1 - (v - y0) / (y1 - y0)) * plotH,
      x0, x1, y0, y1,
      yt: niceTicks(y0, y1, phone ? 4 : 6),
    };
  }, [ticks, plotW, plotH, phone]);

  const path = (pick: (e: (typeof ticks)[number]) => number | null) => {
    let d = "";
    let open = false;
    for (const e of ticks) {
      const v = pick(e);
      if (v == null || !scale) { open = false; continue; }
      d += `${open ? "L" : "M"}${scale.x(e.x).toFixed(1)},${scale.y(v).toFixed(1)}`;
      open = true;
    }
    return d;
  };

  const readoutFor = useCallback((e: (typeof ticks)[number]) => {
    const label = `${MONTH_NAME[e.m]} ${e.y}`;
    const parts: string[] = [];
    if (e.us != null) parts.push(`US CPI-U ${e.us >= 0 ? "+" : ""}${e.us.toFixed(1)}%`);
    if (e.uk != null) parts.push(`UK CPIH ${e.uk >= 0 ? "+" : ""}${e.uk.toFixed(1)}%`);
    return { key: `${e.y}-${e.m}`, text: `${label}, year on year: ${parts.join("; ") || "no data"}.` };
  }, []);

  // Open on the latest month so the readout is never empty.
  useEffect(() => {
    if (item || !ticks.length) return;
    set(readoutFor(ticks[ticks.length - 1]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticks]);

  const nearest = useCallback((cx: number): number | null => {
    if (!scale || !ticks.length) return null;
    let best = -1, bd = Infinity;
    for (let i = 0; i < ticks.length; i++) {
      const d = Math.abs(scale.x(ticks[i].x) - cx);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }, [ticks, scale]);

  const onPointer = (e: PointerEvent<SVGSVGElement>) => {
    if (e.type === "pointermove" && !dragging.current && e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    const i = nearest(e.clientX - r.left);
    if (i != null && i >= 0) set(readoutFor(ticks[i]));
  };
  const down = (e: PointerEvent<SVGSVGElement>) => { dragging.current = true; onPointer(e); };
  const up = () => { dragging.current = false; };

  const selectedIdx = item ? ticks.findIndex((e) => `${e.y}-${e.m}` === item.key) : -1;
  const decades: number[] = [];
  if (scale) for (let y = Math.ceil(scale.x0 / 5) * 5; y <= scale.x1; y += 5) decades.push(y);

  return (
    <figure className="m-0 min-w-0">
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs mb-2 text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden style={{ background: "var(--cat-1)", width: 14, height: 3, borderRadius: 2, display: "inline-block" }} />US CPI-U</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden style={{ background: "var(--cat-2)", width: 14, height: 3, borderRadius: 2, display: "inline-block" }} />UK CPIH</span>
        <span className="text-[var(--text-dim)]">year-on-year change, last 30 years</span>
      </figcaption>
      <div ref={wrap} className="w-full min-w-0">
        {width > 0 && scale ? (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`US CPI-U and UK CPIH year-on-year inflation, ${ticks.length ? `${MONTH_NAME[ticks[0].m]} ${ticks[0].y} to ${MONTH_NAME[ticks[ticks.length - 1].m]} ${ticks[ticks.length - 1].y}` : ""}.`}
            className="block cursor-crosshair touch-pan-y select-none"
            onPointerDown={down}
            onPointerMove={onPointer}
            onPointerUp={up}
            onPointerCancel={up}
            onPointerLeave={up}
          >
            {scale.yt.map((v) => (
              <g key={v}>
                <line x1={PAD.left} x2={PAD.left + plotW} y1={scale.y(v)} y2={scale.y(v)}
                  stroke={v === 0 ? "var(--text-dim)" : "var(--border)"} strokeDasharray={v === 0 ? "" : "2 4"} />
                <text x={PAD.left - 6} y={scale.y(v) + 4} textAnchor="end" fontSize={FONT} fill="var(--text-dim)" fontFamily="'JetBrains Mono', monospace">{v}%</text>
              </g>
            ))}
            {decades.map((y) => (
              <text key={y} x={scale.x(y)} y={height - 8} textAnchor="middle" fontSize={FONT} fill="var(--text-dim)" fontFamily="'JetBrains Mono', monospace">{y}</text>
            ))}
            <path d={path((e) => e.uk)} fill="none" stroke="var(--cat-2)" strokeWidth={1.6} strokeLinejoin="round" />
            <path d={path((e) => e.us)} fill="none" stroke="var(--cat-1)" strokeWidth={2} strokeLinejoin="round" />
            {selectedIdx >= 0 ? (
              <line x1={scale.x(ticks[selectedIdx].x)} x2={scale.x(ticks[selectedIdx].x)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--accent)" strokeWidth={1} strokeDasharray="3 3" />
            ) : null}
          </svg>
        ) : (
          <div style={{ height }} aria-hidden />
        )}
      </div>
      <ChartReadout hint={hint ?? "Tap or drag on the chart: the nearest month's year-on-year rate for both countries."} />
    </figure>
  );
}
