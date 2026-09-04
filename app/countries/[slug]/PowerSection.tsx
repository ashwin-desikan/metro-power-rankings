"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { PowerPoint } from "@/lib/powerHistory";
import Collapsible from "./Collapsible";
import { withIcon } from "./sectionIcons";

const TIER_COLOR: Record<string, string> = {
  "Superpower": "#f5c518", "Great Power": "#e8833a", "Middle Power": "#4a9edb", "Regional": "#7a8a99", "Minor": "#464659",
};
const LATENT = "#8b6fd6";      // material mass / war potential
const RECOGNIZED = "#3ac0a0";  // actualised + recognised
const POWER = "#d4a017";       // headline power share (full span)

export default function PowerSection({ series, name }: { series: PowerPoint[]; name: string }) {
  const [hoverYear, setHoverYear] = useState<number | null>(null);
  // material sub-indices exist only where CINC does (through 2016)
  const pts = useMemo(
    () => series.filter((p) => p.lat != null && p.rec != null && p.year <= 2016) as Array<PowerPoint & { lat: number; rec: number }>,
    [series],
  );
  // headline power share runs the full span (benchmark estimates before 1816)
  const spts = useMemo(
    () => series.filter((p) => p.share != null) as Array<PowerPoint & { share: number }>,
    [series],
  );
  const hovMap = useMemo(() => {
    const m = new Map<number, { share?: number; lat?: number; rec?: number }>();
    for (const p of spts) m.set(p.year, { ...(m.get(p.year) ?? {}), share: p.share });
    for (const p of pts) m.set(p.year, { ...(m.get(p.year) ?? {}), lat: p.lat, rec: p.rec });
    return m;
  }, [spts, pts]);
  const hovYears = useMemo(() => [...hovMap.keys()].sort((a, b) => a - b), [hovMap]);
  if (!series.length) return null;

  const current = series[series.length - 1];
  const last = pts[pts.length - 1];
  const gapNow = last ? last.lat - last.rec : 0;

  const W = 720, H = 210, padL = 34, padR = 12, padT = 12, padB = 22;
  const y0 = hovYears.length ? hovYears[0] : 1816;
  const y1 = hovYears.length ? hovYears[hovYears.length - 1] : 2016;
  const maxV = Math.max(0.1, ...pts.map((p) => Math.max(p.lat, p.rec)), ...spts.map((p) => p.share));
  const px = (y: number) => padL + (y1 === y0 ? 0 : ((y - y0) / (y1 - y0)) * (W - padL - padR));
  const py = (v: number) => padT + (1 - v / (maxV * 1.1)) * (H - padT - padB);
  const line = (key: "lat" | "rec") =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${px(p.year).toFixed(1)},${py(p[key]).toFixed(1)}`).join(" ");
  const powerLine = spts.map((p, i) => `${i === 0 ? "M" : "L"}${px(p.year).toFixed(1)},${py(p.share).toFixed(1)}`).join(" ");
  const band = pts.length
    ? `${pts.map((p, i) => `${i === 0 ? "M" : "L"}${px(p.year).toFixed(1)},${py(p.lat).toFixed(1)}`).join(" ")} ${[...pts].reverse().map((p) => `L${px(p.year).toFixed(1)},${py(p.rec).toFixed(1)}`).join(" ")} Z`
    : "";
  const hovered = hoverYear != null ? hovMap.get(hoverYear) ?? null : null;

  return (
    <Collapsible
      id="power"
      title={withIcon("power", "Power over time")}
      titleClassName="text-2xl font-bold tracking-tight"
      right={
        <Link href="/power-atlas" className="ml-auto text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          The Power Atlas &rarr;
        </Link>
      }
    >

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="rounded-lg border px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Today</div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: TIER_COLOR[current.tier] }} />
            <span className="font-semibold" style={{ color: TIER_COLOR[current.tier] }}>{current.tier}</span>
            <span className="text-sm text-[var(--text-muted)]">#{current.rank}{current.share != null ? ` · ${(current.share * 100).toFixed(1)}%` : ""}</span>
          </div>
        </div>
        {last && Math.abs(gapNow) > 0.005 && (
          <div className="rounded-lg border px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Latent vs recognised</div>
            <div className="mt-0.5 text-sm">
              {gapNow > 0
                ? <span><span className="font-semibold" style={{ color: LATENT }}>Under-recognised</span><span className="text-[var(--text-muted)]">: more mass than standing</span></span>
                : <span><span className="font-semibold" style={{ color: RECOGNIZED }}>Punches above its mass</span><span className="text-[var(--text-muted)]">: standing beats material weight</span></span>}
            </div>
          </div>
        )}
      </div>

      {(pts.length > 1 || spts.length > 1) ? (
        <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${name}: share of world power over time`}
            onMouseLeave={() => setHoverYear(null)}>
            {[0.25, 0.5, 0.75, 1].map((f) => {
              const g = maxV * f;
              return (
                <g key={f}>
                  <line x1={padL} y1={py(g)} x2={W - padR} y2={py(g)} stroke="var(--border)" strokeWidth={0.5} />
                  <text x={padL - 4} y={py(g) + 3} textAnchor="end" fontSize={8} fill="var(--text-dim)">{(g * 100).toFixed(0)}%</text>
                </g>
              );
            })}
            {[1600, 1700, 1800, 1900, 1950, 2000].filter((y) => y >= y0 && y <= y1).map((y) => (
              <text key={y} x={px(y)} y={H - 6} textAnchor="middle" fontSize={8} fill="var(--text-dim)">{y}</text>
            ))}
            {spts.length > 1 && <path d={powerLine} fill="none" stroke={POWER} strokeWidth={1.6} opacity={0.9} />}
            {band && <path d={band} fill="var(--accent)" opacity={0.06} />}
            {pts.length > 1 && <path d={line("lat")} fill="none" stroke={LATENT} strokeWidth={1.8} />}
            {pts.length > 1 && <path d={line("rec")} fill="none" stroke={RECOGNIZED} strokeWidth={1.8} />}
            {hovered && hoverYear != null && (
              <>
                <line x1={px(hoverYear)} y1={padT} x2={px(hoverYear)} y2={H - padB} stroke="var(--accent)" strokeWidth={0.75} strokeDasharray="3 3" />
                {hovered.share != null && <circle cx={px(hoverYear)} cy={py(hovered.share)} r={3} fill={POWER} />}
                {hovered.lat != null && <circle cx={px(hoverYear)} cy={py(hovered.lat)} r={3} fill={LATENT} />}
                {hovered.rec != null && <circle cx={px(hoverYear)} cy={py(hovered.rec)} r={3} fill={RECOGNIZED} />}
              </>
            )}
            {hovYears.map((y) => (
              <rect key={y} x={px(y) - 3} y={padT} width={6} height={H - padT - padB} fill="transparent" onMouseEnter={() => setHoverYear(y)} />
            ))}
          </svg>
          <div className="flex items-center gap-4 mt-1 text-[11px] flex-wrap">
            {spts.length > 1 && <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-[3px] rounded-full" style={{ background: POWER }} /><span className="text-[var(--text-muted)]">Power (headline share)</span></span>}
            <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-[3px] rounded-full" style={{ background: LATENT }} /><span className="text-[var(--text-muted)]">Latent (material mass)</span></span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-[3px] rounded-full" style={{ background: RECOGNIZED }} /><span className="text-[var(--text-muted)]">Recognised (standing)</span></span>
          </div>
          <div className="text-xs text-[var(--text-muted)] mt-1 h-4" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {hovered && hoverYear != null
              ? `${hoverYear}: ${[
                  hovered.share != null ? `power ${(hovered.share * 100).toFixed(1)}%` : null,
                  hovered.lat != null ? `latent ${(hovered.lat * 100).toFixed(1)}%` : null,
                  hovered.rec != null ? `recognised ${(hovered.rec * 100).toFixed(1)}%` : null,
                ].filter(Boolean).join(" · ")}`
              : `${name} · share of world power, ${y0}–${y1}`}
          </div>
        </div>
      ) : null}

      <p className="text-xs text-[var(--text-dim)] leading-relaxed max-w-3xl mt-3">
        The <span style={{ color: POWER }}>power</span> line is the headline share of world power, running from the state&rsquo;s
        first ranked year (benchmark estimates with wide error bars before 1816). <span style={{ color: LATENT }}>Latent</span> power
        is material mass a state could mobilise (population, manpower, heavy industry). <span style={{ color: RECOGNIZED }}>Recognised</span> power
        is what the system actually treats it as (military spending, productive economy, reach, and status such as a Security
        Council seat or nuclear arsenal). When latent runs above recognised, a power is rising or under-rated; when recognised
        runs higher, it is punching above its weight or coasting on prestige. Material sub-indices run 1816 through 2016.
      </p>
    </Collapsible>
  );
}
