"use client";

import { useMemo, useRef, type PointerEvent } from "react";
import { ChartReadout, ChartReadoutProvider, useChartReadout } from "@/app/_shared/ChartReadout";
import { ResponsiveTable, RankRow } from "@/app/teams/_shared/ResponsiveTable";
import { fmtPop, fmtSigned, type Pop2100 } from "@/lib/population2100Shape";
import Collapsible from "./Collapsible";
import { withIcon } from "./sectionIcons";

// Population to 2100 for /countries/[slug]: the UN's probabilistic projection
// drawn as a fan (median, 80% and 95% prediction intervals), the UN's own
// scenarios beside it, the drivers behind the median, and what it implies.
//
// 🔴 NOT OUR MODEL, AND THE PAGE SAYS SO. Ashwin's ruling (2026-09-10): a
// 75-year projection is an age-structure calculation the UN runs with
// Bayesian hierarchical models; the site's job is the instrument around
// it, not a rival number. The fan is the UN's; the scenario lines are the
// UN's; the only computation here is reading them off and saying which
// year the median peaks, halves or turns.
//
// 🔴 A FORECAST IS DRAWN AS A FORECAST. The estimate line stops at the last
// estimate year; from there the median is dashed and the bands are the
// point. The 95% band at 2100 is usually wider than the number itself: for
// most countries the honest answer to "how many people in 2100" is a range
// three or four times wider than the median suggests, and the page leads
// with it rather than hiding it in a footnote.
//
// Chart rules: DESIGN-STANDARDS §8 (readout not tooltip, nearest year on the
// whole surface, 12px floor on a phone).

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const LINE = "#4a9edb";      // the estimate, same blue as PopulationSection
const MEDIAN = "var(--accent)";
const PEAK = "#E2628B";

const DECADES = [1950, 1975, 2000, 2025, 2050, 2075, 2100];

export default function Population2100Section({ data, name }: { data: Pop2100; name: string }) {
  return (
    <ChartReadoutProvider>
      <Inner data={data} name={name} />
    </ChartReadoutProvider>
  );
}

function Inner({ data, name }: { data: Pop2100; name: string }) {
  const { set } = useChartReadout();
  const dragging = useRef(false);
  const f = data.facts;

  // One row per year 1950-2100: estimate or median, bands where projected.
  const rows = useMemo(() => {
    const out: { y: number; v: number; lo80?: number; hi80?: number; lo95?: number; hi95?: number; est: boolean }[] = [];
    for (const [y, v] of data.estimates) out.push({ y, v, est: true });
    for (const [y, med, lo80, hi80, lo95, hi95] of data.projection) out.push({ y, v: med, lo80, hi80, lo95, hi95, est: false });
    return out;
  }, [data]);
  const scen = data.scenarios;
  const byYear = (s?: [number, number][]) => new Map(s ?? []);
  const high = useMemo(() => byYear(scen.high), [scen.high]);
  const low = useMemo(() => byYear(scen.low), [scen.low]);
  const zero = useMemo(() => byYear(scen.zero_migration), [scen.zero_migration]);

  const W = 720, H = 240, padL = 46, padR = 12, padT = 12, padB = 24;
  const y0 = rows[0]?.y ?? 1950, y1 = data.end;
  const maxV = Math.max(...rows.map((r) => Math.max(r.v, r.hi95 ?? 0)), ...[...high.values()]) * 1.05;
  const px = (y: number) => padL + ((y - y0) / (y1 - y0)) * (W - padL - padR);
  const py = (v: number) => padT + (1 - v / maxV) * (H - padT - padB);
  const path = (pts: [number, number][]) => pts.map((p, i) => `${i === 0 ? "M" : "L"}${px(p[0]).toFixed(1)},${py(p[1]).toFixed(1)}`).join(" ");
  const band = (lo: "lo80" | "lo95", hi: "hi80" | "hi95") => {
    const pr = rows.filter((r) => !r.est && r[lo] != null && r[hi] != null);
    if (!pr.length) return "";
    const up = pr.map((r) => `${px(r.y).toFixed(1)},${py(r[hi] as number).toFixed(1)}`);
    const down = [...pr].reverse().map((r) => `${px(r.y).toFixed(1)},${py(r[lo] as number).toFixed(1)}`);
    return `M${up.join(" L")} L${down.join(" L")} Z`;
  };
  const estPath = path(rows.filter((r) => r.est).map((r) => [r.y, r.v]));
  const last = rows.filter((r) => r.est).at(-1);
  const medPath = path([...(last ? [[last.y, last.v] as [number, number]] : []), ...rows.filter((r) => !r.est).map((r) => [r.y, r.v] as [number, number])]);
  const ticks = [1950, 1975, 2000, 2025, 2050, 2075, 2100];
  const yTicks = [0.25, 0.5, 0.75, 1].map((k) => maxV * k);

  const readAt = (year: number) => {
    const r = rows.find((x) => x.y === year);
    if (!r) return;
    const parts = [`${name}, ${year}: ${fmtPop(r.v)}${r.est ? " (estimate)" : " (UN median)"}`];
    if (!r.est && r.lo80 != null) parts.push(`80% band ${fmtPop(r.lo80)} to ${fmtPop(r.hi80)}, 95% band ${fmtPop(r.lo95)} to ${fmtPop(r.hi95)}`);
    const sc: string[] = [];
    if (high.has(year)) sc.push(`high fertility ${fmtPop(high.get(year))}`);
    if (low.has(year)) sc.push(`low ${fmtPop(low.get(year))}`);
    if (zero.has(year)) sc.push(`zero migration ${fmtPop(zero.get(year))}`);
    if (sc.length) parts.push(sc.join(", "));
    set({ key: String(year), text: parts.join(". ") + "." });
  };
  const onPointer = (e: PointerEvent<SVGSVGElement>) => {
    if (e.type === "pointermove" && !dragging.current && e.pointerType !== "mouse") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const year = Math.round(y0 + ((x - padL) / (W - padL - padR)) * (y1 - y0));
    readAt(Math.max(y0, Math.min(y1, year)));
  };

  const cards: { k: string; v: string; d: string; tone?: string }[] = [
    f.peak.past
      ? { k: "Peak", v: String(f.peak.year), d: `${fmtPop(f.peak.value)}; already passed`, tone: PEAK }
      : { k: "Peak on the median", v: f.peak.year >= data.end ? "after 2100" : String(f.peak.year), d: f.peak.year >= data.end ? "still growing at 2100" : `${fmtPop(f.peak.value)} on the UN median` },
    { k: "2050", v: fmtPop(f.y2050.med), d: f.y2050.lo95 != null ? `95% band ${fmtPop(f.y2050.lo95)} to ${fmtPop(f.y2050.hi95)}` : "" },
    { k: "2100", v: fmtPop(f.y2100.med), d: f.y2100.lo95 != null ? `95% band ${fmtPop(f.y2100.lo95)} to ${fmtPop(f.y2100.hi95)}` : "" },
    { k: `2100 against ${f.base.year}`, v: f.multiple2100 != null ? `${f.multiple2100.toFixed(2)}×` : "", d: f.declineFrom ? `median falling from ${f.declineFrom}` : "median still rising in 2100", tone: f.multiple2100 != null && f.multiple2100 < 1 ? PEAK : undefined },
  ];
  if (f.naturalDeclineFrom) cards.push({ k: "Deaths outnumber births", v: f.naturalDeclineFrom <= data.last_estimate ? `since ${f.naturalDeclineFrom}` : `from ${f.naturalDeclineFrom}`, d: "on the UN medium path; migration decides the rest" });

  const drv = data.drivers;
  const at = (k: keyof typeof drv, y: number) => (drv[k] ?? []).find((p) => p[0] === y)?.[1] ?? null;
  const decadeRows = DECADES.filter((y) => at("births", y) != null).map((y) => ({
    y, births: at("births", y), deaths: at("deaths", y), netmig: at("netmig", y), tfr: at("tfr", y), lex: at("lex", y), age: at("median_age", y),
  }));
  const num = (v: number | null, dp = 1) => (v == null ? "" : v.toFixed(dp));

  return (
    <Collapsible id="population-2100" title={withIcon("population", "To 2100")} titleClassName="text-2xl font-bold tracking-tight">
      <p className="text-sm text-[var(--text-muted)] mb-3 max-w-3xl">
        The UN&rsquo;s probabilistic projection for {name}: the median with its 80% and 95% bands, the UN&rsquo;s own high, low and zero-migration scenarios beside it. Not this site&rsquo;s model; the site reads it and says what it implies.
      </p>
      <div className="flex flex-wrap gap-3 mb-4">
        {cards.map((c) => (
          <div key={c.k} className="rounded-lg border px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]" style={MONO}>{c.k}</div>
            <div className="font-semibold mt-0.5" style={{ ...MONO, color: c.tone ?? "var(--text)" }}>{c.v}</div>
            <div className="text-xs text-[var(--text-muted)]">{c.d}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border p-3 sm:p-4 min-w-0" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto touch-pan-y cursor-crosshair" role="img"
          aria-label={`${name}, population 1950 to 2100: UN estimates to ${data.last_estimate}, then the median projection with 80% and 95% prediction intervals`}
          onPointerDown={(e) => { dragging.current = true; onPointer(e); }} onPointerMove={onPointer}
          onPointerUp={() => { dragging.current = false; }} onPointerCancel={() => { dragging.current = false; }}>
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={padL} x2={W - padR} y1={py(v)} y2={py(v)} stroke="var(--border)" strokeWidth={1} />
              <text x={padL - 6} y={py(v) + 4} textAnchor="end" fontSize={12} fill="var(--text-dim)" style={MONO}>{fmtPop(v)}</text>
            </g>
          ))}
          {ticks.map((y) => (
            <text key={y} x={px(y)} y={H - 6} textAnchor="middle" fontSize={12} fill="var(--text-dim)" style={MONO}>{y}</text>
          ))}
          <path d={band("lo95", "hi95")} fill={MEDIAN} opacity={0.12} />
          <path d={band("lo80", "hi80")} fill={MEDIAN} opacity={0.2} />
          {scen.high ? <path d={path(scen.high)} fill="none" stroke="var(--text-dim)" strokeWidth={1} strokeDasharray="2 3" /> : null}
          {scen.low ? <path d={path(scen.low)} fill="none" stroke="var(--text-dim)" strokeWidth={1} strokeDasharray="2 3" /> : null}
          {scen.zero_migration ? <path d={path(scen.zero_migration)} fill="none" stroke="var(--seq-4)" strokeWidth={1} strokeDasharray="1 3" /> : null}
          <path d={estPath} fill="none" stroke={LINE} strokeWidth={2} />
          <path d={medPath} fill="none" stroke={MEDIAN} strokeWidth={2} strokeDasharray="5 3" />
          <line x1={px(data.last_estimate)} x2={px(data.last_estimate)} y1={padT} y2={H - padB} stroke="var(--border)" strokeWidth={1} strokeDasharray="3 3" />
          <Marker rows={rows} px={px} py={py} />
        </svg>
        <ChartReadout hint={`Tap or drag across the chart to read any year: the estimate to ${data.last_estimate}, then the UN median, its bands and the scenarios.`} />
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[var(--text-muted)]">
          <span><span aria-hidden style={{ display: "inline-block", width: 14, height: 2, background: LINE, verticalAlign: "middle", marginRight: 6 }} />estimate</span>
          <span><span aria-hidden style={{ display: "inline-block", width: 14, height: 0, borderTop: `2px dashed var(--accent)`, verticalAlign: "middle", marginRight: 6 }} />UN median</span>
          <span><span aria-hidden style={{ display: "inline-block", width: 14, height: 10, background: "var(--accent)", opacity: 0.2, verticalAlign: "middle", marginRight: 6 }} />80% and 95% bands</span>
          <span><span aria-hidden style={{ display: "inline-block", width: 14, height: 0, borderTop: "1px dotted var(--text-dim)", verticalAlign: "middle", marginRight: 6 }} />high and low fertility</span>
          <span><span aria-hidden style={{ display: "inline-block", width: 14, height: 0, borderTop: "1px dotted var(--seq-4)", verticalAlign: "middle", marginRight: 6 }} />zero migration</span>
        </div>
      </div>

      <h3 className="text-base font-semibold mt-6 mb-1">What drives it</h3>
      <p className="text-sm text-[var(--text-muted)] mb-2 max-w-3xl">Births, deaths and net migration on the UN medium path, with fertility, life expectancy and median age, at twenty-five-year steps.</p>
      <ResponsiveTable
        compact
        variant="list"
        mobileNoun="years"
        mobileInitial={0}
        className="rounded-xl border"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
        mobileRows={decadeRows.map((r) => (
          <RankRow key={r.y} rank={r.y}
            name={<span className="tabular-nums" style={MONO}>{fmtPop(r.births)} born · {fmtPop(r.deaths)} died · {fmtSigned(r.netmig)} net migration</span>}
            sub={<>TFR {num(r.tfr, 2)} · life expectancy {num(r.lex)} · median age {num(r.age)}</>} />
        ))}
      >
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[var(--text-dim)] text-left">
              <th className="py-2 px-3 font-medium">Year</th>
              <th className="py-2 px-3 font-medium text-right">Births</th>
              <th className="py-2 px-3 font-medium text-right">Deaths</th>
              <th className="py-2 px-3 font-medium text-right">Net migration</th>
              <th className="py-2 px-3 font-medium text-right">Fertility</th>
              <th className="py-2 px-3 font-medium text-right">Life expectancy</th>
              <th className="py-2 px-3 font-medium text-right">Median age</th>
            </tr>
          </thead>
          <tbody>
            {decadeRows.map((r) => (
              <tr key={r.y} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-1.5 px-3 tabular-nums" style={MONO}>{r.y}{r.y > data.last_estimate ? <span className="text-[var(--text-dim)]"> proj.</span> : null}</td>
                <td className="py-1.5 px-3 text-right tabular-nums" style={MONO}>{fmtPop(r.births)}</td>
                <td className="py-1.5 px-3 text-right tabular-nums" style={MONO}>{fmtPop(r.deaths)}</td>
                <td className="py-1.5 px-3 text-right tabular-nums" style={{ ...MONO, color: (r.netmig ?? 0) < 0 ? PEAK : undefined }}>{fmtSigned(r.netmig)}</td>
                <td className="py-1.5 px-3 text-right tabular-nums" style={MONO}>{num(r.tfr, 2)}</td>
                <td className="py-1.5 px-3 text-right tabular-nums" style={MONO}>{num(r.lex)}</td>
                <td className="py-1.5 px-3 text-right tabular-nums" style={MONO}>{num(r.age)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ResponsiveTable>
      <p className="mt-4 text-sm"><a href="/countries/2100" className="text-[var(--accent)] hover:underline">Every country to 2100 &rarr;</a></p>
      <p className="mt-3 text-xs text-[var(--text-dim)]">
        Source: {data.source_credit} Estimates to {data.last_estimate}; projections {data.last_estimate + 1} to {data.end}, medium variant and probabilistic intervals. The UN revises every two years; this is the {data.revision} revision.
      </p>
    </Collapsible>
  );
}

/** The selected year, drawn on the chart: a vertical line and a dot on the median. */
function Marker({ rows, px, py }: { rows: { y: number; v: number }[]; px: (y: number) => number; py: (v: number) => number }) {
  const { item } = useChartReadout();
  const year = item ? Number(item.key) : NaN;
  const r = rows.find((x) => x.y === year);
  if (!r) return null;
  return (
    <g>
      <line x1={px(r.y)} x2={px(r.y)} y1={8} y2={py(0)} stroke="var(--accent)" strokeWidth={1} />
      <circle cx={px(r.y)} cy={py(r.v)} r={4} fill="var(--accent)" stroke="var(--bg-card)" strokeWidth={1.5} />
    </g>
  );
}
