"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { ChartReadout, ChartReadoutProvider, useChartReadout } from "@/app/_shared/ChartReadout";
import { fmtPop, type Pop2100Bloc, type Pop2100IndexRow } from "@/lib/population2100Shape";

// Every year from 1950 to 2100, as lines: UN estimates to the last estimate
// year and the median after, for up to six countries or blocs on one axis,
// absolute or indexed to the base year. This is the view
// Ashwin asked for on 2026-09-10 ("every year from now to 2100 ... see the
// trend instead of discrete points separated by decades"); the board under
// it keeps the decade columns and every sort.
//
// Rules carried (DESIGN-STANDARDS §7 and §8): six series at most, coloured
// `--cat-1..6` in the order they were added and never repainted when one is
// removed (colour follows the entity); a legend AND a direct label at the
// line's end; one axis, so two scales become the indexed view; the readout
// under the chart is the pointer surface's answer, nearest year, whole
// surface, 12px floor on the axis.

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const MAX_SERIES = 6;
const CAT = ["var(--cat-1)", "var(--cat-2)", "var(--cat-3)", "var(--cat-4)", "var(--cat-5)", "var(--cat-6)"];

type Mode = "absolute" | "indexed";

function yTicks(max: number, n = 4): number[] {
  const raw = max / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = step; v <= max + 1e-9; v += step) out.push(v);
  return out;
}

type Series = { slug: string; name: string; path: number[]; y2100: number; bloc: boolean };

function Inner({ rows: countries, blocs, baseYear, pathStart, lastEstimate, end }: { rows: Pop2100IndexRow[]; blocs: Pop2100Bloc[]; baseYear: number; pathStart: number; lastEstimate: number; end: number }) {
  // Countries and blocs are one list of series; a bloc's key starts "org-"
  // or is a proposed key, and its name carries a marker in the picker.
  const rows = useMemo<Series[]>(() => [
    ...countries.map((r) => ({ slug: r.slug, name: r.name, path: r.path, y2100: r.y2100.med, bloc: false })),
    ...blocs.map((b) => ({ slug: b.key, name: b.name, path: b.path, y2100: b.y2100, bloc: true })),
  ], [countries, blocs]);
  const bySlug = useMemo(() => new Map(rows.map((r) => [r.slug, r])), [rows]);
  const defaults = useMemo(
    () => [...countries].sort((a, b) => b.y2100.med - a.y2100.med).slice(0, MAX_SERIES).map((r) => r.slug),
    [countries],
  );
  // Each picked country keeps the colour slot it was given; a removed slot
  // is reused by the next addition, so survivors are never repainted.
  const [slots, setSlots] = useState<(string | null)[]>(() => defaults.slice());
  const [mode, setMode] = useState<Mode>("absolute");
  const { set } = useChartReadout();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const picked = slots.map((s, i) => (s ? { row: bySlug.get(s)!, color: CAT[i], i } : null)).filter((x): x is { row: Series; color: string; i: number } => !!x && !!x.row);
  const years = end - pathStart + 1;
  const b0 = baseYear - pathStart;   // the index of the base year, what "= 100" divides by
  const value = (r: Series, k: number) => (mode === "indexed" ? (r.path[k] / (r.path[b0] || 1)) * 100 : r.path[k]);
  const maxV = Math.max(1, ...picked.flatMap((p) => Array.from({ length: years }, (_, k) => value(p.row, k))));
  const minV = mode === "indexed" ? Math.min(100, ...picked.flatMap((p) => Array.from({ length: years }, (_, k) => value(p.row, k)))) : 0;

  // 🔴 THE PHONE GETS ITS OWN GEOMETRY, not a scaled-down desktop. A 900×360
  // box rendered at 332px wide is 133px tall with 4px axis text (measured
  // 2026-09-10). Under 640px the box is 390×420, so the axis text is a real
  // 12px and the lines have room; the end labels shorten to fit.
  const W = phone ? 390 : 900, H = phone ? 420 : 360, L = phone ? 50 : 58, R = phone ? 78 : 120, T = 14, B = 30;
  // 15 viewBox units at the 332px a phone renders the 390 box is 12.8px real (11.1 measured at 13).
  const FS = phone ? 15 : 12;
  const NAME_MAX = phone ? 9 : 14;
  const iw = W - L - R, ih = H - T - B;
  const x = (k: number) => L + (k / (years - 1)) * iw;
  const lo = mode === "indexed" ? Math.floor(minV / 10) * 10 : 0;
  const hi = mode === "indexed" ? Math.ceil(maxV / 10) * 10 : maxV * 1.04;
  const y = (v: number) => T + ih - ((v - lo) / (hi - lo || 1)) * ih;
  const ticks = mode === "indexed" ? yTicks(hi - lo, 4).map((t) => t + lo).filter((t) => t <= hi) : yTicks(hi, 4);
  const xTicks = (phone ? [1950, 2000, 2050, 2100] : [1950, 1975, 2000, 2025, 2050, 2075, 2100]).filter((v) => v >= pathStart && v <= end);

  // Direct labels at the line ends, pushed apart to a 13px floor.
  const ends = picked
    .map((p) => ({ ...p, v: value(p.row, years - 1) }))
    .sort((a, b) => b.v - a.v)
    .map((p) => ({ ...p, ly: y(p.v) }));
  for (let i = 1; i < ends.length; i++) if (ends[i].ly - ends[i - 1].ly < FS + 1) ends[i].ly = ends[i - 1].ly + FS + 1;

  const fmtV = (r: Series, k: number) =>
    mode === "indexed" ? `${value(r, k).toFixed(0)}` : fmtPop(r.path[k]);
  const readYear = (k: number) => {
    setYear(pathStart + k);
    const parts = [...picked].sort((a, b) => value(b.row, k) - value(a.row, k)).map((p) => `${p.row.name} ${fmtV(p.row, k)}`);
    set({ key: String(k), text: `${pathStart + k}${pathStart + k <= lastEstimate ? " (estimate)" : " (UN median)"}${mode === "indexed" ? `, ${baseYear} = 100` : ""}: ${parts.join(" · ")}` });
  };
  const onPointer = (e: PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const k = Math.max(0, Math.min(years - 1, Math.round(((px - L) / iw) * (years - 1))));
    readYear(k);
  };

  const add = (slug: string) => {
    if (!slug || slots.includes(slug)) return;
    const free = slots.findIndex((s) => s == null);
    if (free === -1) {
      if (slots.length >= MAX_SERIES) return;
      setSlots([...slots, slug]);
    } else {
      const next = slots.slice(); next[free] = slug; setSlots(next);
    }
  };
  const remove = (slug: string) => setSlots(slots.map((s) => (s === slug ? null : s)));
  const full = picked.length >= MAX_SERIES;
  const btn = "rounded-md border px-2.5 py-1.5 min-h-[44px] sm:min-h-0 text-xs";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
        <label className="text-[var(--text-muted)]" htmlFor="add-2100">Add a country</label>
        <select
          id="add-2100"
          value=""
          disabled={full}
          onChange={(e) => add(e.target.value)}
          className={`${btn} max-w-full min-w-0`}
          style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
        >
          <option value="">{full ? `Six is the limit; remove one first` : "Choose…"}</option>
          {rows.filter((r) => !slots.includes(r.slug)).map((r) => (
            <option key={r.slug} value={r.slug}>{r.bloc ? `${r.name} (bloc)` : r.name}</option>
          ))}
        </select>
        <div role="group" aria-label="Scale" className="inline-flex rounded-md border overflow-hidden" style={{ borderColor: "var(--border)" }}>
          {(["absolute", "indexed"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className="px-2.5 py-1.5 min-h-[44px] sm:min-h-0 text-xs"
              style={{ background: mode === m ? "var(--accent)" : "var(--bg-card)", color: mode === m ? "var(--bg)" : "var(--text-muted)" }}
            >
              {m === "absolute" ? "People" : `${baseYear} = 100`}
            </button>
          ))}
        </div>
      </div>
      <ul className="flex flex-wrap gap-1.5 mb-2" aria-label="Countries on the chart">
        {picked.map((p) => (
          <li key={p.row.slug} className="inline-flex items-center gap-1.5 rounded-full border pl-2 pr-1 py-0.5 text-xs" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
            <span aria-hidden className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: p.color }} />
            <span>{p.row.name}</span>
            <button type="button" onClick={() => remove(p.row.slug)} aria-label={`Remove ${p.row.name}`} className="rounded-full w-7 h-7 sm:w-5 sm:h-5 grid place-items-center hover:text-[var(--accent)] text-[var(--text-dim)]">×</button>
          </li>
        ))}
      </ul>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto touch-pan-y select-none"
        style={{ maxHeight: "70vh" }}
        role="img"
        aria-label={`Population on the UN median, ${pathStart} to ${end}, for ${picked.map((p) => p.row.name).join(", ")}`}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={L + iw} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize={FS} fill="var(--text-dim)" style={MONO}>{mode === "indexed" ? t.toFixed(0) : fmtPop(t)}</text>
          </g>
        ))}
        {mode === "indexed" ? <line x1={L} x2={L + iw} y1={y(100)} y2={y(100)} stroke="var(--text-dim)" strokeWidth={1} strokeDasharray="3 3" /> : null}
        {xTicks.map((v) => (
          <text key={v} x={x(v - pathStart)} y={H - 8} textAnchor="middle" fontSize={FS} fill="var(--text-dim)" style={MONO}>{v}</text>
        ))}
        {picked.map((p) => (
          <path
            key={p.row.slug}
            d={p.row.path.map((_, k) => `${k === 0 ? "M" : "L"}${x(k).toFixed(1)},${y(value(p.row, k)).toFixed(1)}`).join(" ")}
            fill="none"
            stroke={p.color}
            strokeWidth={2}
            strokeLinejoin="round"
          />
        ))}
        {ends.map((p) => (
          <text key={p.row.slug} x={L + iw + 8} y={p.ly + 4} fontSize={FS} fill="var(--text)" style={MONO}>
            {p.row.name.length > NAME_MAX ? `${p.row.name.slice(0, NAME_MAX - 1)}…` : p.row.name}
          </text>
        ))}
        {/* the estimate / projection boundary */}
        <line x1={x(lastEstimate - pathStart)} x2={x(lastEstimate - pathStart)} y1={T} y2={T + ih} stroke="var(--border)" strokeWidth={1} strokeDasharray="3 3" />
        {year != null ? (
          <g>
            <line x1={x(year - pathStart)} x2={x(year - pathStart)} y1={T} y2={T + ih} stroke="var(--text-dim)" strokeWidth={1} />
            {picked.map((p) => (
              <circle key={p.row.slug} cx={x(year - pathStart)} cy={y(value(p.row, year - pathStart))} r={4} fill={p.color} stroke="var(--bg)" strokeWidth={1.5} />
            ))}
          </g>
        ) : null}
      </svg>
      <ChartReadout hint={`Tap or drag across the chart for any year from ${pathStart}: UN estimates to ${lastEstimate}, the median after${mode === "indexed" ? `, ${baseYear} = 100 for every series` : ""}.`} />
    </div>
  );
}

export default function Chart2100(props: { rows: Pop2100IndexRow[]; blocs: Pop2100Bloc[]; baseYear: number; pathStart: number; lastEstimate: number; end: number }) {
  return (
    <ChartReadoutProvider>
      <Inner {...props} />
    </ChartReadoutProvider>
  );
}
