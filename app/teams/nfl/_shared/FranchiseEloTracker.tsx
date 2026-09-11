"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { NflFranchise } from "@/lib/nflElo";
import { ChartReadout, ChartReadoutProvider, useChartReadout } from "@/app/_shared/ChartReadout";

// One franchise's whole life against the league, at season resolution.
//
// SEASON RESOLUTION ON PURPOSE, NOT FOR WANT OF DATA. The spine holds every
// WEEK: the Bears have roughly 1,500 team-weeks. At full width that is a
// fraction of a pixel per point, which is a smear, not a chart. The weekly
// detail lives on the season hub, where 23 points across one year can
// actually be read. This strip answers a different question: when was this
// franchise good, and for how long.
//
// FORM: a level over time, so a line, and the reference is 1500 because that
// is the league mean by construction rather than a chosen baseline. Fill
// between the line and 1500 in the site's diverging pair, so above and below
// average read at a glance; the 1500 line is drawn, which is the secondary
// encoding the palette requires of any diverging pair.
//
// A GAP IS DRAWN AS A GAP. Canton played 1920-23 and 1925-26. Joining 1923
// to 1925 with a straight line asserts a season that did not happen.
//
// DECADES ARE DRAWN BECAUSE THE X AXIS CAN BE 100+ YEARS LONG. Two end labels
// cannot answer "when was that dip", so every decade boundary is a rule and a
// label. They are --border, quieter than the mean line, because they are
// wayfinding rather than a comparison.
//
// A CHART THAT NEEDS A POINTER IS NOT FINISHED (DESIGN-STANDARDS section 8):
// the readout under the chart is the label, not a hover-only title, the
// pointer surface is the whole plot, selection is the nearest season, and
// nothing here is under 12px. The plot is measured in pixels from the
// wrapper's real width (ResizeObserver), not a scaled viewBox.

const M = { top: 14, right: 12, bottom: 26, left: 40 };
const FONT = 12;
const MONO = "'JetBrains Mono', monospace";
const POS = "var(--div-pos)";
const NEG = "var(--div-neg)";
const MEAN = 1500;

export default function FranchiseEloTracker({
  entry,
  displayName,
}: {
  entry: NflFranchise | null;
  displayName: string;
}) {
  if (!entry || entry.seasons.length < 3) return null;

  const rows = entry.seasons;
  const x0 = rows[0].season;
  const x1 = rows[rows.length - 1].season;
  const above = rows.filter((r) => r.end >= MEAN).length;
  const peak = entry.peak;
  const trough = entry.trough;

  return (
    <section
      className="rounded-xl border p-5 mb-6 min-w-0"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <h2 className="text-base font-semibold">Rating through time</h2>
      <p className="mt-1 text-[13.5px] text-[var(--text-muted)]">
        Where {displayName} sat against the rest of the league at the end of every season it
        played, from {x0} to {x1}.{" "}
        <span className="text-[var(--text)]">
          Above average in {above} of {rows.length} season{rows.length === 1 ? "" : "s"}.
        </span>
      </p>

      <ChartReadoutProvider>
        <Plot entry={entry} displayName={displayName} />
      </ChartReadoutProvider>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 text-[12.5px]">
        {peak ? (
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-dim)]">Highest it ever rated</div>
            <div className="mt-0.5 text-sm">
              <span className="tabular-nums font-semibold" style={{ fontFamily: MONO, color: POS }}>{peak.elo.toFixed(0)}</span>{" "}
              <Link href={`/teams/nfl/season/${peak.season}`} className="text-[var(--accent)] hover:underline tabular-nums">{peak.season}</Link>
              <span className="text-[var(--text-muted)]">, week {peak.week}</span>
            </div>
          </div>
        ) : null}
        {trough ? (
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-dim)]">Lowest it ever rated</div>
            <div className="mt-0.5 text-sm">
              <span className="tabular-nums font-semibold" style={{ fontFamily: MONO, color: NEG }}>{trough.elo.toFixed(0)}</span>{" "}
              <Link href={`/teams/nfl/season/${trough.season}`} className="text-[var(--accent)] hover:underline tabular-nums">{trough.season}</Link>
              <span className="text-[var(--text-muted)]">, week {trough.week}</span>
            </div>
          </div>
        ) : null}
      </div>

      <p className="mt-3 text-[12.5px] text-[var(--text-dim)]">
        One point per season, at the rating it finished on, with a rule at every decade.
        Tap or drag any year for what it started on, where it peaked and where it finished.
        1500 is the league average by construction, not a chosen line. The week-by-week detail for any season is on its own{" "}
        <Link href="/teams/nfl/season" className="text-[var(--accent)] hover:underline">season page</Link>.
      </p>
    </section>
  );
}

function Plot({ entry, displayName }: { entry: NflFranchise; displayName: string }) {
  const rows = entry.seasons;
  const x0 = rows[0].season;
  const x1 = rows[rows.length - 1].season;
  const { item, set } = useChartReadout();
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const dragging = useRef(false);
  const H = 200;

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(Math.floor(entries[0].contentRect.width)));
    ro.observe(el);
    setWidth(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);

  const values = rows.flatMap((r) => [r.end, r.peak, r.trough]);
  const lo = Math.min(Math.floor((Math.min(...values) - 20) / 50) * 50, MEAN - 50);
  const hi = Math.max(Math.ceil((Math.max(...values) + 20) / 50) * 50, MEAN + 50);

  const px = useCallback(
    (s: number) => M.left + ((s - x0) / Math.max(x1 - x0, 1)) * (width - M.left - M.right),
    [x0, x1, width],
  );
  const py = useCallback((e: number) => M.top + (1 - (e - lo) / (hi - lo)) * (H - M.top - M.bottom), [lo, hi]);

  // Break the path wherever a season is missing from the franchise's record.
  const runs = useMemo(() => {
    const out: (typeof rows)[] = [];
    let run: typeof rows = [];
    for (const r of rows) {
      if (run.length && r.season !== run[run.length - 1].season + 1) {
        out.push(run);
        run = [];
      }
      run.push(r);
    }
    if (run.length) out.push(run);
    return out;
  }, [rows]);

  const uid = `fr${entry.name.replace(/\W/g, "")}`;

  // Decade boundaries inside the franchise's own life, never outside it.
  const decades: number[] = [];
  for (let d = Math.ceil(x0 / 10) * 10; d <= x1; d += 10) decades.push(d);
  // Every decade is labelled when there is room for it; otherwise every other.
  const plotW = Math.max(width - M.left - M.right, 1);
  const step = plotW / Math.max(decades.length, 1);
  const labelEvery = step >= 44 ? 1 : step >= 22 ? 2 : 5;

  const peak = entry.peak;
  const trough = entry.trough;
  const yMean = width > 0 ? py(MEAN) : 0;

  const readoutFor = useCallback((season: number) => {
    const r = rows.find((row) => row.season === season);
    if (!r) return null;
    const move = r.end - r.start;
    const text =
      `${season}: ended ${r.end.toFixed(0)}${r.rank_end ? `, ${r.rank_end}${ord(r.rank_end)} in the league` : ""}. ` +
      `Started ${r.start.toFixed(0)} (${move >= 0 ? "+" : ""}${move.toFixed(0)} across the season). ` +
      `Peak ${r.peak.toFixed(0)} at week ${r.peak_w}, low ${r.trough.toFixed(0)} at week ${r.trough_w}.` +
      `${r.status === "final" ? "" : " Preseason rating only."}`;
    return { key: String(season), text };
  }, [rows]);

  const nearest = useCallback((cx: number): number | null => {
    if (!rows.length || width <= 0) return null;
    let best: number | null = null;
    let bd = Infinity;
    for (const r of rows) {
      const d = Math.abs(px(r.season) - cx);
      if (d < bd) { bd = d; best = r.season; }
    }
    return best;
  }, [rows, px, width]);

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

  return (
    <figure className="m-0 mt-3 min-w-0">
      <div ref={wrap} className="w-full min-w-0">
        {width > 0 ? (
          <svg
            width={width}
            height={H}
            role="img"
            aria-label={`${displayName} Elo rating at the end of each season from ${x0} to ${x1}. Peak ${peak?.elo ?? "unknown"} in ${peak?.season ?? "unknown"}.`}
            className="block cursor-crosshair touch-pan-y select-none"
            onPointerDown={down}
            onPointerMove={onPointer}
            onPointerUp={up}
            onPointerCancel={up}
            onPointerLeave={up}
          >
            <defs>
              <clipPath id={`above-${uid}`}>
                <rect x={0} y={M.top} width={width} height={Math.max(yMean - M.top, 0)} />
              </clipPath>
              <clipPath id={`below-${uid}`}>
                <rect x={0} y={yMean} width={width} height={Math.max(H - M.bottom - yMean, 0)} />
              </clipPath>
            </defs>

            {decades.map((d, i) => (
              <g key={d}>
                <line x1={px(d)} x2={px(d)} y1={M.top} y2={H - M.bottom} stroke="var(--border)" strokeWidth={1} />
                {i % labelEvery === 0 ? (
                  <text x={px(d)} y={H - 6} textAnchor="middle" fontSize={FONT} fill="var(--text-dim)" style={{ fontFamily: MONO }}>
                    {`${String(d).slice(2)}s`}
                  </text>
                ) : null}
              </g>
            ))}

            {[lo, MEAN, hi].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
              <text key={v} x={M.left - 6} y={py(v) + 3} textAnchor="end" fontSize={FONT} fill="var(--text-dim)" style={{ fontFamily: MONO }}>
                {v}
              </text>
            ))}

            {runs.map((seg, i) => {
              const line = seg.map((r, j) => `${j ? "L" : "M"}${px(r.season).toFixed(1)},${py(r.end).toFixed(1)}`).join("");
              const area = `${line}L${px(seg[seg.length - 1].season).toFixed(1)},${yMean.toFixed(1)}L${px(seg[0].season).toFixed(1)},${yMean.toFixed(1)}Z`;
              return (
                <g key={i}>
                  <path d={area} fill={POS} fillOpacity={0.35} clipPath={`url(#above-${uid})`} />
                  <path d={area} fill={NEG} fillOpacity={0.35} clipPath={`url(#below-${uid})`} />
                  <path d={line} fill="none" stroke="var(--text)" strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
                </g>
              );
            })}

            {/* The league mean, drawn because a diverging fill is only legal with it. */}
            <line x1={M.left} x2={width - M.right} y1={yMean} y2={yMean} stroke="var(--text-dim)" strokeWidth={1} strokeDasharray="3 3" />

            {rows.map((r) => {
              const cx = px(r.season);
              const cy = py(r.end);
              const selected = r.season === selectedSeason;
              return (
                <g key={r.season}>
                  <circle cx={cx} cy={cy} r={selected ? 4.5 : 2.5} fill="var(--text)" />
                  {selected ? (
                    <line x1={cx} x2={cx} y1={M.top} y2={H - M.bottom} stroke="var(--accent)" strokeWidth={1} strokeDasharray="3 3" />
                  ) : null}
                </g>
              );
            })}

            {peak ? <circle cx={px(peak.season)} cy={py(peak.elo)} r={3} fill={POS} pointerEvents="none" /> : null}
            {trough ? <circle cx={px(trough.season)} cy={py(trough.elo)} r={3} fill={NEG} pointerEvents="none" /> : null}

            {/* The franchise's own first and last year, which a decade rule never is. */}
            <text x={M.left} y={H - 6} fontSize={FONT} fill="var(--text-muted)" style={{ fontFamily: MONO }}>{x0}</text>
            <text x={width - M.right} y={H - 6} textAnchor="end" fontSize={FONT} fill="var(--text-muted)" style={{ fontFamily: MONO }}>{x1}</text>
          </svg>
        ) : (
          <div style={{ height: H }} aria-hidden />
        )}
      </div>
      <ChartReadout hint="Tap or drag on the chart: the nearest season's rating, start, peak and low." />
    </figure>
  );
}

function ord(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
