"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { NflEloTeam } from "@/lib/nflElo";
import { ChartReadout, ChartReadoutProvider, useChartReadout } from "@/app/_shared/ChartReadout";

// Where every team starts, before a snap.
//
// A SEASON WITH ONE WEEK STILL DESERVES A CHART. The seeded season used to
// get a table and nothing else, on the reasoning that a line through one point
// is not a line. True, and the answer is a different FORM rather than no chart:
// one value per team, ordered, is a dot plot, and a dot plot of 32 preseason
// ratings shows the two things the table cannot. How far the top is from the
// field, and where the gaps fall, which is where the tiers actually are.
//
// The axis is the rating itself, so the distance between two dots is the
// difference between two teams. 1500 is drawn because it is the league mean by
// construction, and the fill runs from it rather than from the chart floor.
//
// A CHART THAT NEEDS A POINTER IS NOT FINISHED (DESIGN-STANDARDS section 8): the
// readout under the chart is the label, the pointer surface is the whole
// plot, selection is the nearest row, and nothing here is under 12px. The
// plot is measured in pixels from the wrapper's real width (ResizeObserver),
// not a scaled viewBox, so a phone does not shrink the text along with the
// marks.

const M = { top: 26, right: 16, bottom: 34, left: 16 };
const ROW = 20;
const FONT = 12;
const MONO = "'JetBrains Mono', monospace";

type Filter = { key: string; label: string; test: (t: NflEloTeam) => boolean };

export default function PreseasonChart(props: {
  teams: NflEloTeam[];
  season: number;
  colorByName?: Record<string, string | null>;
}) {
  return (
    <ChartReadoutProvider>
      <Plot {...props} />
    </ChartReadoutProvider>
  );
}

function Plot({
  teams,
  season,
  colorByName = {},
}: {
  teams: NflEloTeam[];
  season: number;
  colorByName?: Record<string, string | null>;
}) {
  const filters = useMemo<Filter[]>(() => {
    const out: Filter[] = [{ key: "all", label: "All teams", test: () => true }];
    const confs = [...new Set(teams.map((t) => t.conf).filter(Boolean))] as string[];
    if (confs.length > 1) {
      for (const c of confs.sort()) out.push({ key: `c:${c}`, label: c, test: (t) => t.conf === c });
    }
    const divs = [...new Set(teams.map((t) => t.div).filter((d) => d && !confs.includes(d)))] as string[];
    if (divs.length > 1 && divs.length <= 10) {
      for (const d of divs.sort()) out.push({ key: `d:${d}`, label: d, test: (t) => t.div === d });
    }
    return out;
  }, [teams]);

  const [active, setActive] = useState("all");
  const filter = filters.find((f) => f.key === active) ?? filters[0];
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

  const all = [...teams].sort((a, b) => b.end - a.end);
  const shown = all.filter(filter.test);
  const drawn = shown.length ? shown : all;

  // The scale is the whole league at every filter, so the AFC and the NFC
  // stay comparable and a filtered view is a subset rather than a rescale.
  const values = all.map((t) => t.end);
  const lo = Math.floor((Math.min(...values) - 10) / 25) * 25;
  const hi = Math.ceil((Math.max(...values) + 10) / 25) * 25;
  const height = M.top + M.bottom + drawn.length * ROW;
  const labelW = Math.min(140, Math.max(70, width * 0.16));
  const plotRight = 56;
  const px = useCallback(
    (e: number) => M.left + labelW + ((e - lo) / (hi - lo)) * (width - M.left - M.right - labelW - plotRight),
    [labelW, lo, hi, width],
  );
  const mean = width > 0 && 1500 >= lo && 1500 <= hi ? px(1500) : null;

  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += 50) ticks.push(v);

  const readoutFor = useCallback((name: string) => {
    const t = drawn.find((d) => d.name === name);
    if (!t) return null;
    const rank = all.findIndex((a) => a.name === name) + 1;
    const who = `${t.city ?? ""} ${t.team ?? t.name}`.trim();
    return {
      key: name,
      text: `${who}: ${t.end.toFixed(0)}, ${rank} of ${all.length} going into ${season}${t.div ? ` (${t.div})` : ""}.`,
    };
  }, [drawn, all, season]);

  const nearest = useCallback((cy: number): string | null => {
    if (!drawn.length) return null;
    let best: string | null = null;
    let bd = Infinity;
    drawn.forEach((t, i) => {
      const y = M.top + i * ROW + ROW / 2;
      const d = Math.abs(y - cy);
      if (d < bd) { bd = d; best = t.name; }
    });
    return best;
  }, [drawn]);

  const onPointer = (e: PointerEvent<SVGSVGElement>) => {
    if (e.type === "pointermove" && !dragging.current && e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    const name = nearest(e.clientY - r.top);
    if (name) {
      const ro = readoutFor(name);
      if (ro) set(ro);
    }
  };
  const down = (e: PointerEvent<SVGSVGElement>) => { dragging.current = true; onPointer(e); };
  const up = () => { dragging.current = false; };

  const selectedName = item?.key ?? null;

  if (all.length < 2) return null;

  return (
    <figure className="m-0 min-w-0">
      {filters.length > 1 ? (
        <div className="flex flex-wrap items-center gap-1.5 mb-3" role="group" aria-label="Filter the chart">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setActive(f.key)}
              aria-pressed={active === f.key}
              className="text-[11px] px-2.5 min-h-11 sm:min-h-8 rounded-md border transition inline-flex items-center"
              style={{
                background: active === f.key ? "var(--bg-card-hover)" : "transparent",
                borderColor: active === f.key ? "var(--accent)" : "var(--border)",
                color: active === f.key ? "var(--accent)" : "var(--text-muted)",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      ) : null}

      <div ref={wrap} className="w-full min-w-0">
        {width > 0 ? (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`Preseason Elo rating for ${drawn.length} teams going into the ${season} season, highest first.`}
            className="block cursor-crosshair touch-pan-y select-none"
            onPointerDown={down}
            onPointerMove={onPointer}
            onPointerUp={up}
            onPointerCancel={up}
            onPointerLeave={up}
          >
            {ticks.map((v) => (
              <g key={v}>
                <line x1={px(v)} x2={px(v)} y1={M.top - 8} y2={height - M.bottom + 4} stroke="var(--border)" strokeWidth={1} />
                <text x={px(v)} y={height - M.bottom + 18} textAnchor="middle" fontSize={FONT} fill="var(--text-dim)" fontFamily={MONO}>{v}</text>
              </g>
            ))}
            {mean !== null ? (
              <>
                <line x1={mean} x2={mean} y1={M.top - 12} y2={height - M.bottom + 4} stroke="var(--text-dim)" strokeWidth={1} strokeDasharray="3 3" />
                <text x={mean} y={M.top - 16} textAnchor="middle" fontSize={FONT} fill="var(--text-dim)" fontFamily={MONO}>
                  1500 &middot; league average
                </text>
              </>
            ) : null}

            {drawn.map((t, i) => {
              const y = M.top + i * ROW + ROW / 2;
              const color = colorByName[t.name] || "var(--border)";
              const x = px(t.end);
              const from = mean ?? px(lo);
              const selected = t.name === selectedName;
              return (
                <g key={t.name}>
                  <rect x={0} y={y - ROW / 2} width={width} height={ROW} fill="transparent" />
                  <text x={M.left + labelW - 6} y={y + 4} textAnchor="end" fontSize={FONT} fill={selected ? "var(--accent)" : "var(--text)"}>
                    {`${t.city ?? ""} ${t.team ?? t.name}`.trim()}
                  </text>
                  <line x1={from} x2={x} y1={y} y2={y} stroke={color} strokeWidth={3} strokeLinecap="round" strokeOpacity={selected ? 1 : 0.85} />
                  <circle cx={x} cy={y} r={selected ? 5.5 : 4} fill={color} />
                  <text x={x + 9} y={y + 4} fontSize={FONT} fill="var(--text-muted)" fontFamily={MONO}>
                    {t.end.toFixed(0)}
                  </text>
                  {selected ? (
                    <circle cx={x} cy={y} r={9} fill="none" stroke="var(--accent)" strokeWidth={2} />
                  ) : null}
                </g>
              );
            })}
          </svg>
        ) : (
          <div style={{ height }} aria-hidden />
        )}
      </div>
      <ChartReadout hint="Tap or drag on the chart: the nearest team and its preseason rating." />
      <figcaption className="mt-2 text-[12px] text-[var(--text-dim)]">
        Each bar runs from the league average to where that team starts. The gaps between the dots are the
        gaps between the teams, which is what a table of the same numbers cannot show.
      </figcaption>
    </figure>
  );
}
