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
/** The predecessor territory. Deliberately not LINE: it is a different place. */
const PRIOR = "#8b8f98";

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

  // The predecessor territory, when the source has one. Ireland only: the
  // whole island 1800-1920 against the Republic 1950 on. Drawn on the same
  // axes so the Famine is legible, in a different colour and never joined to
  // the modern line, because they are not the same place.
  const priorPts = useMemo(() => {
    if (!pop.prior || mode !== "count") return [];
    return pop.prior.series.map(([y, v]) => [y, v] as [number, number]);
  }, [pop.prior, mode]);

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
  // Scales span both series, or Ireland's 8.1m in 1841 would run off the top
  // of an axis built for a country that peaks at 5.2m.
  const scalePts = priorPts.length ? [...priorPts, ...pts] : pts;
  const y0 = Math.min(...scalePts.map((p) => p[0]));
  const y1 = Math.max(...scalePts.map((p) => p[0]));
  const maxV = Math.max(...scalePts.map((p) => p[1]));
  const px = (y: number) => padL + (y1 === y0 ? 0 : ((y - y0) / (y1 - y0)) * (W - padL - padR));
  const py = (v: number) => padT + (1 - v / (maxV * 1.08)) * (H - padT - padB);
  const d = (ps: [number, number][]) =>
    ps.map((p, i) => `${i === 0 ? "M" : "L"}${px(p[0]).toFixed(1)},${py(p[1]).toFixed(1)}`).join(" ");

  // Two paths, not one. Everything up to pop.latest is estimated; anything
  // after it is a UN WPP projection and is drawn dashed, because a forecast
  // rendered in the same stroke as a measurement is a forecast presented as a
  // measurement. The estimate path keeps the boundary year so the two join.
  const estPts = pts.filter((p) => p[0] <= pop.latest);
  const prjPts = pts.filter((p) => p[0] >= pop.latest);
  const isProjected = (y: number) => y > pop.latest;

  // Fourteen of the small territories have holes in their history: Gibraltar,
  // the Isle of Man, Kosovo and the Northern Marianas each jump straight from
  // 1820 to 1950. Drawing one continuous path across that renders a 130-year
  // guess in the same stroke as the measured years, so the line breaks instead.
  // The threshold is deliberately above the source's own decadal resolution
  // before 1830 - a ten-year step there is the data's shape, not a hole.
  const MAX_GAP = 25;
  const runs = (ps: [number, number][]): [number, number][][] => {
    const out: [number, number][][] = [];
    let cur: [number, number][] = [];
    for (const p of ps) {
      const prev = cur[cur.length - 1];
      if (prev && p[0] - prev[0] > MAX_GAP) {
        out.push(cur);
        cur = [];
      }
      cur.push(p);
    }
    if (cur.length) out.push(cur);
    return out;
  };
  const estRuns = runs(estPts);

  // Ticks used to be hardcoded to [1960, 1980, 2000, 2020], which was fine
  // when the series began in 1960 and unreadable now that it begins in 1800.
  const ticks = (() => {
    const span = y1 - y0;
    const step = span > 150 ? 50 : span > 60 ? 20 : span > 25 ? 10 : 5;
    const out: number[] = [];
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) out.push(y);
    return out;
  })();

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
          {ticks.map((y) => (
            <text key={y} x={px(y)} y={H - 6} textAnchor="middle" fontSize={8} fill="var(--text-dim)" style={MONO}>
              {y}
            </text>
          ))}
          {runs(priorPts).map((run, i) =>
            run.length > 1 ? (
              <path key={`p${i}`} d={d(run)} fill="none" stroke={PRIOR} strokeWidth={1.5} strokeLinejoin="round" />
            ) : (
              <circle key={`p${i}`} cx={px(run[0][0])} cy={py(run[0][1])} r={1.5} fill={PRIOR} />
            ),
          )}
          {estRuns.map((run, i) =>
            run.length > 1 ? (
              <path key={i} d={d(run)} fill="none" stroke={LINE} strokeWidth={1.8} strokeLinejoin="round" />
            ) : (
              <circle key={i} cx={px(run[0][0])} cy={py(run[0][1])} r={1.8} fill={LINE} />
            ),
          )}
          {prjPts.length > 1 && (
            <path
              d={d(prjPts)}
              fill="none"
              stroke={LINE}
              strokeWidth={1.8}
              strokeLinejoin="round"
              strokeDasharray="4 3"
              opacity={0.75}
            />
          )}
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
            ? `${hoverYear}: ${label(hovered[1])}${isProjected(hoverYear) ? " · projected" : ""}`
            : `${name} · ${mode === "count" ? "people" : "share of world population"}, ${y0}–${pop.latest}` +
              (pop.projectedTo ? ` · dashed to ${pop.projectedTo} is projected` : "")}
        </div>
      </div>

      <p className="text-xs text-[var(--text-dim)] leading-relaxed max-w-3xl mt-3">
        {pop.source || "Our World in Data"}. Figures above are as of {pop.latest}, the last year
        that is estimated rather than forecast.
        {pop.prior ? (
          <>
            {" "}The grey line is {pop.prior.label}, {pop.prior.series[0][0]} to{" "}
            {pop.prior.series[pop.prior.series.length - 1][0]}. It is drawn separately, and never
            joined to the blue one, because it is a different territory: most of the fall between
            the two is the border, not the people. Nothing in the cards above is computed from it.
          </>
        ) : null}
        {pop.projectedTo ? (
          <>
            {" "}The dashed tail to {pop.projectedTo} is a UN WPP medium-variant projection. It is
            drawn because the line should reach the present, and drawn differently because it has
            not happened yet: no rank, peak or share on this page uses it.
          </>
        ) : null}{" "}
        Before 1950 the series is reconstruction rather than contemporaneous statistics, which is
        worth knowing when a country&rsquo;s peak sits back there.{" "}
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
