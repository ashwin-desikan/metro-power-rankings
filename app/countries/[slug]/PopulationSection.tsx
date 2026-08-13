"use client";

import { useMemo, useState } from "react";
import type { CountryPopulation } from "@/lib/countries";
import Collapsible from "./Collapsible";
import { withIcon } from "./sectionIcons";

// Population over time for /countries/[slug].
//
// THE POINT IS THE SHAPE, NOT THE NUMBER. The page already states a current
// population from the workbook. What it could never say is which direction the
// country is going, and for a striking share of the world the answer is down:
// Latvia is 31% below its 1989 peak, Bulgaria 28% below 1988, Ukraine 25%
// below 1993. That fact governs everything downstream on this site, from metro
// rankings to which leagues can sustain a top division, and no single figure
// carries it.
//
// TWO LINES, TWO QUESTIONS. Absolute population answers "how many people live
// here". Share of world answers "is this country becoming more or less of the
// world", which is a different question with frequently the opposite answer:
// Japan grew by a fifth after 1960 while its share of humanity nearly halved.
// The toggle exists because both are true and neither implies the other.

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const LINE = "#4a9edb";
const PEAK = "#E2628B";

function fmtPop(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}bn`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)}m`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
  return String(n);
}

export default function PopulationSection({
  pop,
  world,
  name,
}: {
  pop: CountryPopulation;
  world: [number, number][];
  name: string;
}) {
  const [mode, setMode] = useState<"count" | "share">("count");
  const [hoverYear, setHoverYear] = useState<number | null>(null);

  const worldBy = useMemo(() => new Map(world), [world]);
  const pts = useMemo(() => {
    if (mode === "count") return pop.series.map(([y, v]) => [y, v] as [number, number]);
    return pop.series
      .map(([y, v]) => {
        const w = worldBy.get(y);
        return w ? ([y, (v / w) * 100] as [number, number]) : null;
      })
      .filter((p): p is [number, number] => p !== null);
  }, [pop.series, mode, worldBy]);

  if (pts.length < 2) return null;

  const shrinking = pop.declineFromPeak > 0.5;
  const W = 720, H = 200, padL = 42, padR = 12, padT = 12, padB = 22;
  const y0 = pts[0][0];
  const y1 = pts[pts.length - 1][0];
  const maxV = Math.max(...pts.map((p) => p[1]));
  const px = (y: number) => padL + (y1 === y0 ? 0 : ((y - y0) / (y1 - y0)) * (W - padL - padR));
  const py = (v: number) => padT + (1 - v / (maxV * 1.08)) * (H - padT - padB);
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${px(p[0]).toFixed(1)},${py(p[1]).toFixed(1)}`).join(" ");
  const hovered = hoverYear != null ? pts.find((p) => p[0] === hoverYear) ?? null : null;
  const label = (v: number) => (mode === "count" ? fmtPop(v) : `${v.toFixed(v < 1 ? 2 : 1)}%`);

  const cards: { k: string; v: string; d: string; tone?: string }[] = [
    {
      k: `Population ${pop.latest}`,
      v: fmtPop(pop.value),
      d: pop.rank ? `#${pop.rank} in the world` : "not separately ranked",
    },
    {
      k: `Since ${pop.first}`,
      v: pop.multiple != null ? `${pop.multiple.toFixed(pop.multiple >= 10 ? 0 : 2)}×` : "—",
      d: `from ${fmtPop(pop.series[0][1])}`,
    },
    shrinking
      ? {
          k: "Past its peak",
          v: `−${pop.declineFromPeak.toFixed(1)}%`,
          d: `peaked at ${fmtPop(pop.peakValue)} in ${pop.peakYear}`,
          tone: PEAK,
        }
      : {
          k: "Peak",
          v: `${pop.peakYear}`,
          d: pop.peakYear === pop.latest ? "at its largest now" : `${fmtPop(pop.peakValue)}`,
        },
    {
      k: "Share of world",
      v: pop.share != null ? `${pop.share.toFixed(pop.share < 1 ? 2 : 1)}%` : "—",
      d:
        pop.share != null && pop.shareFirst != null
          ? `${pop.shareFirst.toFixed(pop.shareFirst < 1 ? 2 : 1)}% in ${pop.first}`
          : "",
    },
  ];

  return (
    <Collapsible
      id="population"
      title={withIcon("population", "Population over time")}
      titleClassName="text-2xl font-bold tracking-tight"
    >
      <div className="flex flex-wrap gap-3 mb-4">
        {cards.map((c) => (
          <div
            key={c.k}
            className="rounded-lg border px-4 py-3"
            style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
          >
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]" style={MONO}>
              {c.k}
            </div>
            <div className="font-semibold mt-0.5" style={{ ...MONO, color: c.tone ?? "var(--text)" }}>
              {c.v}
            </div>
            <div className="text-xs text-[var(--text-muted)]">{c.d}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-1.5 mb-2">
        {(["count", "share"] as const).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setHoverYear(null); }}
            aria-pressed={mode === m}
            className="rounded-md border px-2.5 py-1 text-xs font-medium transition"
            style={{
              borderColor: mode === m ? "var(--accent)" : "var(--border)",
              color: mode === m ? "var(--accent)" : "var(--text-muted)",
              background: "var(--bg-card)",
            }}
          >
            {m === "count" ? "People" : "Share of world"}
          </button>
        ))}
      </div>

      <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={`${name}: ${mode === "count" ? "population" : "share of world population"}, ${y0} to ${y1}`}
          onMouseLeave={() => setHoverYear(null)}
        >
          {[0.25, 0.5, 0.75, 1].map((f) => {
            const g = maxV * f;
            return (
              <g key={f}>
                <line x1={padL} y1={py(g)} x2={W - padR} y2={py(g)} stroke="var(--border)" strokeWidth={0.5} />
                <text x={padL - 4} y={py(g) + 3} textAnchor="end" fontSize={8} fill="var(--text-dim)" style={MONO}>
                  {label(g)}
                </text>
              </g>
            );
          })}
          {[1960, 1980, 2000, 2020].filter((y) => y >= y0 && y <= y1).map((y) => (
            <text key={y} x={px(y)} y={H - 6} textAnchor="middle" fontSize={8} fill="var(--text-dim)" style={MONO}>
              {y}
            </text>
          ))}
          <path d={path} fill="none" stroke={LINE} strokeWidth={1.8} strokeLinejoin="round" />
          {/* The peak only deserves a marker when the country has fallen away
              from it; otherwise it is just the last point on the line. */}
          {shrinking && mode === "count" && (
            <>
              <line
                x1={px(pop.peakYear)} y1={padT} x2={px(pop.peakYear)} y2={H - padB}
                stroke={PEAK} strokeWidth={0.75} strokeDasharray="3 3"
              />
              <circle cx={px(pop.peakYear)} cy={py(pop.peakValue)} r={3} fill={PEAK} />
            </>
          )}
          {hovered && hoverYear != null && (
            <>
              <line
                x1={px(hoverYear)} y1={padT} x2={px(hoverYear)} y2={H - padB}
                stroke="var(--accent)" strokeWidth={0.75} strokeDasharray="3 3"
              />
              <circle cx={px(hoverYear)} cy={py(hovered[1])} r={3} fill={LINE} />
            </>
          )}
          {pts.map((p) => (
            <rect
              key={p[0]}
              x={px(p[0]) - 4}
              y={padT}
              width={8}
              height={H - padT - padB}
              fill="transparent"
              onMouseEnter={() => setHoverYear(p[0])}
            />
          ))}
        </svg>
        <div className="text-xs text-[var(--text-muted)] mt-1 h-4" style={MONO}>
          {hovered && hoverYear != null
            ? `${hoverYear}: ${label(hovered[1])}`
            : `${name} · ${mode === "count" ? "people" : "share of world population"}, ${y0}–${y1}`}
        </div>
      </div>

      <p className="text-xs text-[var(--text-dim)] leading-relaxed max-w-3xl mt-3">
        {pop.source || "World Bank Open Data"}, {pop.first} to {pop.latest}; earlier history needs a
        different source with its own reconciliation of modern borders against historical ones.
        {pop.source && !pop.source.includes("World Bank") ? (
          // Taiwan. Every other country here is World Bank; saying so on the
          // page is the point of carrying the source per country rather than
          // stating one line of provenance for the whole file.
          <>
            {" "}Every other country on the site uses the World Bank series, which does not report
            this one, so the substitute is named here rather than blended in silently. These are
            estimates only; the projections that would carry the series to {pop.latest + 2} are not
            used.
          </>
        ) : null}{" "}
        The current population shown elsewhere on this page comes from the workbook and is
        unchanged by this.{" "}
        {shrinking ? (
          <>
            {name} is past its peak, which is less unusual than it sounds: the two lines here can
            point in opposite directions, and for most of Europe and East Asia they now both point
            down.
          </>
        ) : (
          <>
            Note that people and share of world can move in opposite directions. A country can grow
            steadily and still become a smaller part of humanity, which is what happened to almost
            every rich country after 1960.
          </>
        )}
      </p>
    </Collapsible>
  );
}
