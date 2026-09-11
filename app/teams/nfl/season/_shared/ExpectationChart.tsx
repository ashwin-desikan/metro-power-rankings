"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { SeasonSummary } from "@/lib/nflExpectation";
import { ChartReadout, ChartReadoutProvider, useChartReadout } from "@/app/_shared/ChartReadout";

// The model against the closing line, every season it can be scored in.
//
// FORM: two comparable series over 107 seasons, so two lines on one axis. They
// legitimately share it: Brier is the same unit for both and the whole question
// is which one is lower.
//
// LOWER IS BETTER, SO THE AXIS IS INVERTED. A reader looks at a chart and
// reads "up is good". Leaving Brier the right way up would make every season
// the model lost look like a season it won. The axis is flipped once, here, and
// labelled, rather than asking every reader to invert it in their head.
//
// THE MARKET LINE STOPS WHERE THE MARKET DOES. There is no closing line for
// 1931. A market series drawn across the years it does not cover would be an
// invention, so it is broken into runs and simply absent before 1978.
//
// A CHART THAT NEEDS A POINTER IS NOT FINISHED (DESIGN-STANDARDS section 8):
// the readout under the chart is the label, not a hover-only title, the
// pointer surface is the whole plot, selection is the nearest season, and
// nothing here is under 12px. The plot is measured in pixels from the
// wrapper's real width (ResizeObserver), not a scaled viewBox.

const M = { top: 16, right: 14, bottom: 26, left: 46 };
const FONT = 12;
const MONO = "'JetBrains Mono', monospace";

export default function ExpectationChart({ rows }: { rows: SeasonSummary[] }) {
  return (
    <ChartReadoutProvider>
      <Plot rows={rows} />
    </ChartReadoutProvider>
  );
}

function Plot({ rows }: { rows: SeasonSummary[] }) {
  const pts = useMemo(() => rows.filter((r) => r.model_brier != null), [rows]);
  const { item, set } = useChartReadout();
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const dragging = useRef(false);
  const H = 220;

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(Math.floor(entries[0].contentRect.width)));
    ro.observe(el);
    setWidth(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);

  const x0 = pts[0]?.season ?? 0;
  const x1 = pts[pts.length - 1]?.season ?? 0;
  const vals = pts.flatMap((r) => [r.model_brier!, ...(r.market_brier != null ? [r.market_brier] : [])]);
  const lo = vals.length ? Math.max(0, Math.floor((Math.min(...vals) - 0.01) * 50) / 50) : 0;
  const hi = vals.length ? Math.min(0.5, Math.ceil((Math.max(...vals) + 0.01) * 50) / 50) : 0.5;

  const px = useCallback(
    (s: number) => M.left + ((s - x0) / Math.max(x1 - x0, 1)) * (width - M.left - M.right),
    [x0, x1, width],
  );
  // Inverted on purpose: a lower Brier is a better forecast, so it sits higher.
  const py = useCallback((v: number) => M.top + ((v - lo) / (hi - lo)) * (H - M.top - M.bottom), [lo, hi]);

  const decades: number[] = [];
  for (let d = Math.ceil(x0 / 10) * 10; d <= x1; d += 10) decades.push(d);

  function runs(pick: (r: SeasonSummary) => number | null | undefined): string[] {
    const out: string[] = [];
    let cur: string[] = [];
    let prevSeason: number | null = null;
    for (const r of pts) {
      const v = pick(r);
      if (v == null || !Number.isFinite(v)) {
        if (cur.length > 1) out.push(cur.join(""));
        cur = [];
        prevSeason = null;
        continue;
      }
      const gap = prevSeason != null && r.season !== prevSeason + 1;
      if (gap) {
        if (cur.length > 1) out.push(cur.join(""));
        cur = [];
      }
      cur.push(`${cur.length ? "L" : "M"}${px(r.season).toFixed(1)},${py(v).toFixed(1)}`);
      prevSeason = r.season;
    }
    if (cur.length > 1) out.push(cur.join(""));
    return out;
  }

  const modelRuns = width > 0 ? runs((r) => r.model_brier) : [];
  const marketRuns = width > 0 ? runs((r) => r.market_brier) : [];
  const ticks = [lo, (lo + hi) / 2, hi];

  const readoutFor = useCallback((season: number) => {
    const r = pts.find((p) => p.season === season);
    if (!r || r.model_brier == null) return null;
    const beat = r.market_brier != null && r.model_brier < r.market_brier;
    const market = r.market_brier != null
      ? `, the market ${r.market_brier.toFixed(3)} (${beat ? "the model won" : "the market won"})`
      : ", no closing line survives from this season";
    return { key: String(season), text: `${season}: the model scored ${r.model_brier.toFixed(3)}${market}.` };
  }, [pts]);

  const nearest = useCallback((cx: number): number | null => {
    if (!pts.length || width <= 0) return null;
    let best: number | null = null;
    let bd = Infinity;
    for (const r of pts) {
      const d = Math.abs(px(r.season) - cx);
      if (d < bd) { bd = d; best = r.season; }
    }
    return best;
  }, [pts, px, width]);

  const onPointer = (e: PointerEvent<SVGSVGElement>) => {
    if (e.type === "pointermove" && !dragging.current && e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    const season = nearest(e.clientX - r.left);
    if (season != null) {
      const ro = readoutFor(season);
      if (ro) set(ro);
    }
  };
  const down = (e: PointerEvent<SVGSVGElement>) => { dragging.current = true; onPointer(e); };
  const up = () => { dragging.current = false; };

  const selectedSeason = item ? Number(item.key) : null;

  if (pts.length < 5) return null;

  return (
    <figure className="m-0 min-w-0">
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs mb-2 text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden style={{ background: "var(--cat-1)", width: 14, height: 3, borderRadius: 2, display: "inline-block" }} />
          this site&rsquo;s model
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden style={{ background: "var(--cat-2)", width: 14, height: 3, borderRadius: 2, display: "inline-block" }} />
          the betting market
        </span>
        <span className="text-[var(--text-dim)]">higher is a better forecast</span>
      </figcaption>

      <div ref={wrap} className="w-full min-w-0">
        {width > 0 ? (
          <svg
            width={width}
            height={H}
            role="img"
            aria-label={`Brier score by season for the site's model and for the closing betting line, ${x0} to ${x1}. Lower is better and the axis is inverted, so higher on the chart is a better forecast.`}
            className="block cursor-crosshair touch-pan-y select-none"
            onPointerDown={down}
            onPointerMove={onPointer}
            onPointerUp={up}
            onPointerCancel={up}
            onPointerLeave={up}
          >
            {decades.map((d, i) => (
              <g key={d}>
                <line x1={px(d)} x2={px(d)} y1={M.top} y2={H - M.bottom} stroke="var(--border)" strokeWidth={1} />
                {i % 2 === 0 ? (
                  <text x={px(d)} y={H - 6} textAnchor="middle" fontSize={FONT} fill="var(--text-dim)" style={{ fontFamily: MONO }}>
                    {`${String(d).slice(2)}s`}
                  </text>
                ) : null}
              </g>
            ))}
            {ticks.map((v) => (
              <text key={v} x={M.left - 6} y={py(v) + 3} textAnchor="end" fontSize={FONT} fill="var(--text-dim)" style={{ fontFamily: MONO }}>
                {v.toFixed(2)}
              </text>
            ))}

            {marketRuns.map((d, i) => (
              <path key={`mk${i}`} d={d} fill="none" stroke="var(--cat-2)" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {modelRuns.map((d, i) => (
              <path key={`md${i}`} d={d} fill="none" stroke="var(--cat-1)" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
            ))}

            {pts.map((r) => {
              const cx = px(r.season);
              const selected = r.season === selectedSeason;
              return (
                <g key={r.season}>
                  <circle cx={cx} cy={py(r.model_brier!)} r={selected ? 4.5 : 2.5} fill="var(--cat-1)" />
                  {r.market_brier != null ? (
                    <circle cx={cx} cy={py(r.market_brier)} r={selected ? 4.5 : 2.5} fill="var(--cat-2)" />
                  ) : null}
                  {selected ? (
                    <line x1={cx} x2={cx} y1={M.top} y2={H - M.bottom} stroke="var(--accent)" strokeWidth={1} strokeDasharray="3 3" />
                  ) : null}
                </g>
              );
            })}
          </svg>
        ) : (
          <div style={{ height: H }} aria-hidden />
        )}
      </div>
      <ChartReadout hint="Tap or drag on the chart: the nearest season, the model's score and the market's." />
    </figure>
  );
}
