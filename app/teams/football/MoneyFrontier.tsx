"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { ChartReadout, ChartReadoutProvider, useChartReadout } from "@/app/_shared/ChartReadout";
import { fmtEurM, fmtEurSigned, unpackFrontier, type PackedFrontier } from "@/lib/footballMoneyShape";

// Money against football: one dot per club and season. x is the season's
// surplus from the Against Expectation ledger (match points above expected,
// a win counting one), y is the season's appreciation (squad value gained
// beyond the net spend). The Pareto set is joined as the frontier: the
// club-seasons nothing else beat on both axes. A club page passes its own
// slug and the chart draws that club's trail through the seasons over the
// same field of dots, so the reader sees where one club sits against all
// of them, not a chart of one club alone.
//
// 🔴 A CHART THAT NEEDS A POINTER IS NOT FINISHED (DESIGN-STANDARDS §8):
// the readout under the chart is the label, the pointer surface is the
// whole plot, selection is the nearest dot, and nothing here is under 12px.
// The plot is drawn in PIXELS from a measured width, not a scaled viewBox,
// so a phone does not shrink the text along with the marks.
//
// 🔴 COLOUR IS COMPUTED, NEVER CHOSEN: the field is the dim text token, the
// frontier is --cat-1, the club's trail is --cat-2, the selection ring is the
// accent. A scatter is capped at three categorical colours and uses two.

type Props = {
  packed: PackedFrontier;
  /** Draw this club's seasons as a trail and start the readout on its latest. */
  highlight?: string | null;
  hint?: string;
};

export default function MoneyFrontier(props: Props) {
  return (
    <ChartReadoutProvider>
      <Plot {...props} />
    </ChartReadoutProvider>
  );
}

const PAD = { top: 26, right: 16, bottom: 40, left: 52 };
const FONT = 12;

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

function fmtSurplus(v: number): string {
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}`;
}

/** `net` is received minus spent, so a positive net is a selling window. */
function netPhrase(net: number): string {
  if (net < -0.5) return `beyond a net spend of ${fmtEurM(net)}`;
  if (net > 0.5) return `on top of ${fmtEurM(net)} of net sales`;
  return "with nothing spent net";
}

function Plot({ packed, highlight = null, hint }: Props) {
  const points = useMemo(() => unpackFrontier(packed), [packed]);
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
  const height = width > 0 ? Math.round(Math.min(440, Math.max(260, width * (phone ? 0.8 : 0.58)))) : 300;
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = Math.max(0, height - PAD.top - PAD.bottom);

  const scale = useMemo(() => {
    if (!points.length) return null;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of points) {
      if (p.surplus < x0) x0 = p.surplus;
      if (p.surplus > x1) x1 = p.surplus;
      if (p.appreciation < y0) y0 = p.appreciation;
      if (p.appreciation > y1) y1 = p.appreciation;
    }
    // Symmetric-ish padding so the zero lines sit inside the plot.
    const px = (x1 - x0) * 0.04 || 1, py = (y1 - y0) * 0.05 || 1;
    x0 = Math.min(0, x0) - px; x1 = Math.max(0, x1) + px; y0 = Math.min(0, y0) - py; y1 = Math.max(0, y1) + py;
    return {
      x: (v: number) => PAD.left + ((v - x0) / (x1 - x0)) * plotW,
      y: (v: number) => PAD.top + plotH - ((v - y0) / (y1 - y0)) * plotH,
      xt: niceTicks(x0, x1, phone ? 5 : 7),
      yt: niceTicks(y0, y1, phone ? 4 : 6),
    };
  }, [points, plotW, plotH, phone]);

  const frontier = useMemo(
    () => points.map((p, i) => ({ p, i })).filter((e) => e.p.frontier).sort((a, b) => b.p.surplus - a.p.surplus),
    [points],
  );
  const trail = useMemo(
    () => (highlight ? points.map((p, i) => ({ p, i })).filter((e) => e.p.slug === highlight) : []),
    [points, highlight],
  );

  const readoutFor = useCallback((i: number) => {
    const p = points[i];
    return {
      key: `${p.slug}:${p.season}`,
      text: `${p.club}, ${p.season} (${p.country}). ${fmtSurplus(p.surplus)} points against expectation; ${fmtEurSigned(p.appreciation)} of squad value ${netPhrase(p.net)}${p.frontier ? ". On the frontier" : ""}.`,
    };
  }, [points]);

  // The club page opens on the club's latest season so the readout is never
  // empty where there is something to say.
  useEffect(() => {
    if (item || !trail.length) return;
    set(readoutFor(trail[trail.length - 1].i));
  }, [item, trail, set, readoutFor]);

  const nearest = useCallback((cx: number, cy: number): number | null => {
    if (!scale) return null;
    let best = -1, bd = Infinity;
    for (let i = 0; i < points.length; i++) {
      const dx = scale.x(points[i].surplus) - cx, dy = scale.y(points[i].appreciation) - cy;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best >= 0 ? best : null;
  }, [points, scale]);

  const onPointer = (e: PointerEvent<SVGSVGElement>) => {
    if (e.type === "pointermove" && !dragging.current && e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    const i = nearest(e.clientX - r.left, e.clientY - r.top);
    if (i != null) set(readoutFor(i));
  };
  const down = (e: PointerEvent<SVGSVGElement>) => { dragging.current = true; onPointer(e); };
  const up = () => { dragging.current = false; };

  const selectedKey = item?.key ?? null;
  const selected = selectedKey ? points.findIndex((p) => `${p.slug}:${p.season}` === selectedKey) : -1;

  return (
    <figure className="m-0 min-w-0">
      <div ref={wrap} className="w-full min-w-0">
        {width > 0 && scale ? (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`${points.length} club-seasons plotted: points against expectation across, squad value gained beyond spend up${highlight ? ", one club's seasons joined" : ""}.`}
            className="block cursor-crosshair touch-pan-y select-none"
            onPointerDown={down}
            onPointerMove={onPointer}
            onPointerUp={up}
            onPointerCancel={up}
            onPointerLeave={up}
          >
            {/* grid and zero lines */}
            {scale.yt.map((v) => (
              <line key={`y${v}`} x1={PAD.left} x2={PAD.left + plotW} y1={scale.y(v)} y2={scale.y(v)}
                stroke={v === 0 ? "var(--text-dim)" : "var(--border)"} strokeDasharray={v === 0 ? "" : "2 4"} />
            ))}
            {scale.xt.map((v) => (
              <line key={`x${v}`} y1={PAD.top} y2={PAD.top + plotH} x1={scale.x(v)} x2={scale.x(v)}
                stroke={v === 0 ? "var(--text-dim)" : "var(--border)"} strokeDasharray={v === 0 ? "" : "2 4"} />
            ))}
            {/* tick labels */}
            {scale.yt.map((v) => (
              <text key={`yl${v}`} x={PAD.left - 6} y={scale.y(v) + 4} textAnchor="end" fontSize={FONT} fill="var(--text-muted)" fontFamily="'JetBrains Mono', monospace">
                {v === 0 ? "0" : `${v > 0 ? "+" : "−"}${Math.abs(v) >= 1000 ? `${(Math.abs(v) / 1000).toFixed(1)}b` : `${Math.abs(v)}m`}`}
              </text>
            ))}
            {scale.xt.map((v) => (
              <text key={`xl${v}`} x={scale.x(v)} y={PAD.top + plotH + 16} textAnchor="middle" fontSize={FONT} fill="var(--text-muted)" fontFamily="'JetBrains Mono', monospace">
                {v === 0 ? "0" : fmtSurplus(v).replace(".0", "")}
              </text>
            ))}
            {/* axis titles */}
            <text x={PAD.left + plotW} y={PAD.top + plotH + 32} textAnchor="end" fontSize={FONT} fill="var(--text-dim)">
              points against expectation, a win counting one →
            </text>
            <text x={PAD.left} y={PAD.top - 10} textAnchor="start" fontSize={FONT} fill="var(--text-dim)">
              ↑ squad value gained beyond net spend, €
            </text>
            {/* the field */}
            {points.map((p, i) => {
              if (p.frontier || p.slug === highlight) return null;
              return <circle key={i} cx={scale.x(p.surplus)} cy={scale.y(p.appreciation)} r={phone ? 2.5 : 3} fill="var(--text-dim)" fillOpacity={highlight ? 0.28 : 0.45} />;
            })}
            {/* the frontier */}
            {frontier.length > 1 ? (
              <polyline
                points={frontier.map((e) => `${scale.x(e.p.surplus)},${scale.y(e.p.appreciation)}`).join(" ")}
                fill="none" stroke="var(--cat-1)" strokeWidth={1.5} strokeDasharray="4 3" strokeOpacity={0.8}
              />
            ) : null}
            {frontier.map((e) => (
              e.p.slug === highlight ? null : (
                <circle key={`f${e.i}`} cx={scale.x(e.p.surplus)} cy={scale.y(e.p.appreciation)} r={phone ? 4 : 4.5}
                  fill="var(--cat-1)" stroke="var(--bg-card)" strokeWidth={1} />
              )
            ))}
            {/* the club's trail */}
            {trail.length > 1 ? (
              <polyline
                points={trail.map((e) => `${scale.x(e.p.surplus)},${scale.y(e.p.appreciation)}`).join(" ")}
                fill="none" stroke="var(--cat-2)" strokeWidth={1.5} strokeOpacity={0.7}
              />
            ) : null}
            {trail.map((e, k) => (
              <circle key={`t${e.i}`} cx={scale.x(e.p.surplus)} cy={scale.y(e.p.appreciation)} r={k === trail.length - 1 ? 6 : 4.5}
                fill="var(--cat-2)" stroke="var(--bg-card)" strokeWidth={1} />
            ))}
            {/* the selection ring, drawn last so it sits over everything */}
            {selected >= 0 ? (
              <>
                <circle cx={scale.x(points[selected].surplus)} cy={scale.y(points[selected].appreciation)} r={phone ? 3 : 3.5} fill="var(--accent)" />
                <circle cx={scale.x(points[selected].surplus)} cy={scale.y(points[selected].appreciation)} r={9}
                  fill="none" stroke="var(--accent)" strokeWidth={2} />
              </>
            ) : null}
          </svg>
        ) : (
          <div style={{ height }} aria-hidden />
        )}
      </div>
      <ChartReadout hint={hint ?? "Tap or drag on the plot: the nearest club-season, its points and its money."} />
      <figcaption className="mt-1 text-[12px] text-[var(--text-dim)]">
        <span style={{ color: "var(--cat-1)" }}>●</span> the frontier: no other club-season beat it on both axes
        {highlight ? <> · <span style={{ color: "var(--cat-2)" }}>●</span> this club, season by season, the largest dot the latest</> : null}
      </figcaption>
    </figure>
  );
}
