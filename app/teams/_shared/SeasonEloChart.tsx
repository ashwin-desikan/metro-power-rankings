"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useThroughWeek } from "./WeekScrubber";
import { ChartReadout, ChartReadoutProvider, useChartReadout } from "@/app/_shared/ChartReadout";

// 🔴 ONE CHART, TWO SPORTS. This was an NFL component copied into the NBA on
// 2026-09-17 and shared on the same day, because the first bug reported
// against it ("the highlight sticks after the pointer leaves") was present in
// both copies. A fix that has to be made twice gets made once.
//
// The team type is STRUCTURAL rather than NflEloTeam or NbaEloTeam. Both
// satisfy it and neither is imported here, so this file has no dependency on
// either sport's data layer and a third sport needs no change to it.

// ⚠️ EVERY OPTIONAL FIELD ACCEPTS null AS WELL AS undefined, deliberately.
// The two sports' readers disagree: lib/nflElo.ts types a missing rank as
// `number | null`, lib/nbaElo.ts as `number | undefined`. A structural type
// that admits only one of those rejects the other sport's data outright, and
// "widen the shared type" is the right answer rather than reshaping a live
// data layer to suit a chart.
export type EloChartWeek = {
  w: number;
  e: number;
  /** Rank that week. */
  r?: number | null;
  /** ISO date the week ended. Drives the x-axis. */
  d?: string | null;
  /** [w, l] or [w, l, t]: basketball has no ties, gridiron does. */
  rec?: number[] | null;
  /** NFL: points for and against. */
  pts?: [number, number] | null;
  /** NBA: Elo change on the week. */
  chg?: number | null;
  /** No game that week, so the rating was held rather than earned. */
  carried?: boolean | null;
  /** Phase label, e.g. "Reg. Season". */
  ph?: string | null;
};

export type EloChartTeam = {
  name: string;
  city: string | null;
  team: string | null;
  league: string | null;
  conf: string | null;
  div: string | null;
  flags?: { play_app?: boolean; div_title?: boolean } & Record<string, unknown>;
  start: number;
  end: number;
  weeks: EloChartWeek[];
};

// One season's Elo, week by week, every team on one axis.
//
// FORM: a level over time for many comparable series, so a line chart, and they
// legitimately share a scale because Elo is one pool per season by ruling,
// including the years the NFL ran alongside the AAFC or the AFL.
//
// THESE ARE CLUB COLOURS, NOT A CATEGORICAL PALETTE, and that is why 32 of
// them is allowed. The palette rules cap categorical assignment at six because
// the ORDER carries colourblind safety; a team's own colour carries identity
// instead, and identity is reinforced twice more, by the label and the
// readout. A franchise with no stored colour stays neutral rather than being
// assigned one: inventing a club colour is worse than not having it.
//
// A CHART THAT NEEDS A POINTER IS NOT FINISHED (DESIGN-STANDARDS section 8):
// a native `<title>` only answers a mouse that is already hovering, which a
// phone never is. The readout under the chart is the label now, driven by a
// pointer surface over the whole plot: the nearest (team, week) to the pointer
// is the selection, on pointerdown/move/up with a drag path on touch and a
// move path on mouse. Nothing is under 12px, and the plot is measured in
// pixels from the wrapper's real width (ResizeObserver), not a scaled viewBox
// that shrinks 32 team labels along with the marks on a phone.
//
// END LABELS ARE DECONFLICTED, NOT DROPPED. Four teams inside 20 Elo points
// put four labels inside 6px of each other. The visible labels are pushed apart
// in one pass with a leader line back to the point. On a narrow phone there is
// not room for them at all, so they are dropped there; the legend above and
// the readout below still name every emphasised line.
//
// A CARRIED WEEK IS DRAWN AS HELD. Byes and post-elimination weeks inherit
// the previous rating, so the segment into one is dashed. A solid line there
// would assert a measurement nobody took.
//
// PINNING AND PICKING ARE TWO NAMES FOR THE SAME HIGHLIGHT. Ashwin asked to be
// able to pick a team and have it stand out, without removing the rest: the
// whole point of one line among thirty-two is where it sits against them.
// Clicking a line (or the Highlight select) pins it until cleared or another
// line is clicked; dragging the pointer across the chart does the identical
// thing for whatever is nearest, without touching the persistent pin. Either
// one is "the active line" below, and the readout reports it either way.

const FONT = 12;
const MONO = "'JetBrains Mono', monospace";

function ord(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

/**
 * Push a set of label positions apart to `gap`, keeping their order and staying
 * inside [lo, hi]. One down pass, one clamp, one up pass: the standard
 * one-dimensional label placement, and enough for at most a dozen labels.
 */
function deconflict(items: { key: string; y: number }[], gap: number, lo: number, hi: number) {
  const xs = [...items].sort((a, b) => a.y - b.y).map((i) => ({ ...i }));
  if (!xs.length) return new Map<string, number>();
  for (let i = 1; i < xs.length; i++) {
    if (xs[i].y - xs[i - 1].y < gap) xs[i].y = xs[i - 1].y + gap;
  }
  const over = xs[xs.length - 1].y - hi;
  if (over > 0) for (const x of xs) x.y -= over;
  for (let i = xs.length - 2; i >= 0; i--) {
    if (xs[i + 1].y - xs[i].y < gap) xs[i].y = xs[i + 1].y - gap;
  }
  const under = lo - xs[0].y;
  if (under > 0) for (const x of xs) x.y += under;
  return new Map(xs.map((x) => [x.key, x.y]));
}

type Filter = { key: string; label: string; test: (t: EloChartTeam) => boolean };

type WeeklyEloChartProps = {
  teams: EloChartTeam[];
  season: number;
  /** Canonical franchise name to a club colour that reads on the card, or null. */
  colorByName?: Record<string, string | null>;
  /** League to the last regular-season week. Two entries when two leagues ran. */
  regEndWeek?: Record<string, number>;
  emphasise?: number;
};

export default function WeeklyEloChart(props: WeeklyEloChartProps) {
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
  regEndWeek = {},
  emphasise = 4,
}: WeeklyEloChartProps) {
  // THE FILTERS ARE BUILT FROM THE SEASON, NOT HARDCODED. 1966 has no AFC,
  // 1932 has no divisions, and a season before the playoffs existed has no
  // playoff teams. A filter that would select everything or nothing is not
  // offered at all.
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
    const madeIt = teams.filter((t) => t.flags?.play_app).length;
    if (madeIt > 0 && madeIt < teams.length) {
      out.push({ key: "po", label: "Made the playoffs", test: (t) => Boolean(t.flags?.play_app) });
      out.push({ key: "no", label: "Missed out", test: (t) => !t.flags?.play_app });
    }
    const div = teams.filter((t) => t.flags?.div_title).length;
    if (div > 0 && div < teams.length) {
      out.push({ key: "dt", label: "Division winners", test: (t) => Boolean(t.flags?.div_title) });
    }
    return out;
  }, [teams]);

  const [active, setActive] = useState("all");
  // PINNING IS NOT FILTERING. See the comment above: this sets exactly the
  // visual state dragging does, and leaves every other line drawn.
  const [pinned, setPinned] = useState<string | null>(null);
  // The pointer's current nearest (team, week), driven by pointerdown/move/up
  // over the whole plot. Ephemeral: it updates continuously while dragging and
  // simply holds its last value once the pointer lifts, same as a pin does.
  const [pick, setPick] = useState<{ name: string; week: number } | null>(null);
  const { set } = useChartReadout();
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const dragging = useRef(false);
  const through = useThroughWeek();
  const H = 380;

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(Math.floor(entries[0].contentRect.width)));
    ro.observe(el);
    setWidth(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);

  // Every hook above runs on every render, whatever `teams` turns out to
  // hold; everything below is plain data derived from it.
  const filter = filters.find((f) => f.key === active) ?? filters[0];
  const rated = teams.filter((t) => t.weeks.length >= 3);
  const shown = rated.filter(filter.test);
  const drawn = shown.length >= 1 ? shown : rated;

  if (rated.length < 2) return null;

  // THE SCALE IS THE WHOLE SEASON, ALWAYS. Rescaling to the filtered subset
  // would make the AFC and the NFC look identically spread and quietly make the
  // two views uncomparable, which is the one thing a filter must not do.
  const seasonWeeks = rated.flatMap((t) => t.weeks.map((w) => w.w));
  const x0 = Math.min(...seasonWeeks);
  const x1 = Math.max(...seasonWeeks);
  const elos = rated.flatMap((t) => t.weeks.map((w) => w.e));
  const lo = Math.floor((Math.min(...elos) - 15) / 25) * 25;
  const hi = Math.ceil((Math.max(...elos) + 15) / 25) * 25;

  const isNarrow = width > 0 && width < 480;
  const M = { top: 14, right: isNarrow ? 14 : 128, bottom: 30, left: isNarrow ? 34 : 44 };

  const px = (w: number) => M.left + ((w - x0) / Math.max(x1 - x0, 1)) * (width - M.left - M.right);
  const py = (e: number) => M.top + (1 - (e - lo) / (hi - lo)) * (H - M.top - M.bottom);

  // THE SCRUBBER CUTS THE LINES, NEVER THE SCALE. "Through week N" draws
  // every team only as far as week N and ranks and labels them by the rating
  // they held THEN, but the axes stay the whole season's, so scrubbing reads
  // as the season filling in rather than as thirty-two charts of different
  // shapes. null means the whole season, which is also what a page with no
  // scrubber gets.
  const drawnV: EloChartTeam[] = through == null
    ? drawn
    : drawn
        .map((t) => {
          const cut = t.weeks.filter((w) => w.w <= through);
          return { ...t, weeks: cut, end: cut.length ? cut[cut.length - 1].e : t.start };
        })
        .filter((t) => t.weeks.length >= 1);

  const ranked = [...drawnV].sort((a, b) => b.end - a.end);
  const leadCount = Math.min(emphasise, ranked.length);
  const lead = new Set(ranked.slice(0, leadCount).map((t) => t.name));

  const yTicks: number[] = [];
  for (let v = lo; v <= hi; v += hi - lo > 400 ? 100 : 50) yTicks.push(v);

  // week -> the ISO date that week ended. Taken from whichever team carries
  // one: the dates are a property of the SEASON, not of a club, so the first
  // team with a date for a given week answers for all of them.
  const dateOfWeek = new Map<number, string>();
  for (const t of rated) {
    for (const w of t.weeks) {
      if (w.d && !dateOfWeek.has(w.w)) dateOfWeek.set(w.w, w.d);
    }
  }
  const haveDates = dateOfWeek.size > 1;

  // Fewer ticks than the old every-fourth-week rule, because a date is a much
  // wider label than "wk 12" and 24 of them would collide on a phone.
  const tickCount = isNarrow ? 4 : 7;
  const xTicks = (() => {
    const span = x1 - x0;
    if (span <= 0) return [x0];
    const step = Math.max(1, Math.round(span / (tickCount - 1)));
    const out = new Set<number>();
    for (let w = x0; w <= x1; w += step) out.add(w);
    out.add(x1);
    return [...out].sort((a, b) => a - b);
  })();

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  /** "12 Oct", or "12 Oct 26" on the first tick and wherever the year turns
   *  over. Falls back to the old week number when a season has no dates. */
  const tickLabel = (w: number, i: number): string => {
    if (!haveDates) return w === 0 ? "seed" : `wk ${w}`;
    const iso = dateOfWeek.get(w);
    if (!iso) return "";
    const d = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return "";
    const day = d.getUTCDate();
    const mon = MONTHS[d.getUTCMonth()];
    const yr = d.getUTCFullYear();
    const prevIso = i > 0 ? dateOfWeek.get(xTicks[i - 1]) : null;
    const prevYr = prevIso ? Number(prevIso.slice(0, 4)) : null;
    const showYear = i === 0 || (prevYr != null && prevYr !== yr);
    return showYear ? `${day} ${mon} ${String(yr).slice(2)}` : `${day} ${mon}`;
  };

  // Where the regular season stopped. Two entries when two leagues ran and did
  // not finish together, which is why this is not a single number.
  const dividers = Object.entries(regEndWeek)
    .filter(([, w]) => w > 0 && w < x1)
    .sort((a, b) => a[1] - b[1]);
  const oneDivider = dividers.length > 0 && new Set(dividers.map(([, w]) => w)).size === 1;

  const uid = `elo${season}`;

  const labelY = isNarrow
    ? new Map<string, number>()
    : deconflict(
        ranked.slice(0, leadCount).map((t) => ({
          key: t.name,
          y: py(t.weeks[t.weeks.length - 1].e) + 3.5,
        })),
        14,
        M.top + 8,
        H - M.bottom - 2,
      );

  // Two numbers or three: basketball has no ties, gridiron does.
  const fmtRec = (rec?: number[]) =>
    rec ? `${rec[0]}-${rec[1]}${rec[2] ? `-${rec[2]}` : ""}` : "";

  const activeName = pinned ?? pick?.name ?? null;

  const readoutFor = (name: string, week: number) => {
    const t = drawnV.find((d) => d.name === name);
    const w = t?.weeks.find((wk) => wk.w === week);
    if (!t || !w) return null;
    const who = `${t.city ?? ""} ${t.team ?? t.name}`.trim();
    // The readout says WHEN, in full, because it has the room the axis does
    // not. The week number is gone from here too: a reader who wants to know
    // where they are in a season is served by "8 Feb 2026", not by "week 19".
    const when = w.w === 0
      ? "preseason seed"
      : w.d
        ? new Date(`${w.d}T00:00:00Z`).toLocaleDateString("en-GB", {
            day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
          })
        : `week ${w.w}`;
    const text =
      `${who}, ${when}: ${w.e}` +
      `${w.r ? `, ${w.r}${ord(w.r)} of ${rated.length}` : ""}` +
      `${w.rec ? `, ${fmtRec(w.rec)}` : ""}` +
      `${w.pts ? `, ${w.pts[0]}-${w.pts[1]}` : ""}` +
      `${w.chg != null && w.w > 0 ? `, ${w.chg > 0 ? "+" : ""}${Math.round(w.chg)} on the week` : ""}` +
      // 🔴 NAME THE DASH. A held segment is the chart's one piece of
      // non-obvious grammar, and it is exactly what a reader asks about when
      // a line goes flat and dotted after a first-round exit.
      `${w.carried ? " (no game that week, rating held)" : ""}.`;
    return { key: `${name}:${week}`, text };
  };

  const nearest = (cx: number, cy: number): { name: string; week: number } | null => {
    if (!drawnV.length || width <= 0) return null;
    let best: { name: string; week: number } | null = null;
    let bd = Infinity;
    for (const t of drawnV) {
      for (const w of t.weeks) {
        const d = Math.hypot(px(w.w) - cx, py(w.e) - cy);
        if (d < bd) { bd = d; best = { name: t.name, week: w.w }; }
      }
    }
    return best;
  };

  const onPointer = (e: PointerEvent<SVGSVGElement>) => {
    if (e.type === "pointermove" && !dragging.current && e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    const found = nearest(e.clientX - r.left, e.clientY - r.top);
    if (found) {
      setPick(found);
      const ro = readoutFor(found.name, found.week);
      if (ro) set(ro);
    }
  };
  const down = (e: PointerEvent<SVGSVGElement>) => { dragging.current = true; onPointer(e); };
  const up = () => { dragging.current = false; };

  // 🔴 A HOVER THAT OUTLIVES THE POINTER IS A LIE. Leaving the plot used to
  // only clear the drag flag, so the last line the mouse passed stayed
  // emphasised and the readout kept describing a week nobody was pointing at.
  // It reads as a selection the reader did not make. (Ashwin, 2026-09-17:
  // "if I move away from it, it should stop highlighting anything".)
  //
  // MOUSE ONLY, and that distinction is the whole subtlety. A touch pointer
  // fires pointerleave when the finger LIFTS, so clearing on touch too would
  // make the readout vanish the instant you stopped dragging, which is the one
  // moment a phone reader actually wants to read it. A finger has no hover
  // state to end; a mouse does.
  //
  // The PIN survives either way. A pinned line was chosen deliberately by a
  // click and is not the pointer's business.
  const leave = (e: PointerEvent<SVGSVGElement>) => {
    dragging.current = false;
    if (e.pointerType !== "mouse") return;
    setPick(null);
    // ChartReadout's own usage note says "keep on leave so the last reading
    // stays", which is right for a chart whose marks are discrete taps. It is
    // wrong for a 32-line hover chart, where the reading is about wherever the
    // pointer happens to be. set(null) is already supported; no change needed
    // to the shared readout.
    set(null);
  };

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

      <div className="flex flex-wrap items-center gap-2 mb-2">
        <label htmlFor={`${uid}-pin`} className="text-[11px] uppercase tracking-wider text-[var(--text-dim)]">
          Highlight
        </label>
        <select
          id={`${uid}-pin`}
          value={pinned ?? ""}
          onChange={(e) => setPinned(e.target.value || null)}
          /* 16px on a phone or iOS zooms the page on focus (section 6), and the
             control clears 44px there for the same reason. */
          className="rounded-md border px-2 min-h-11 sm:min-h-8 text-[16px] sm:text-xs max-w-[15rem]"
          style={{ background: "var(--bg-card)", borderColor: pinned ? "var(--accent)" : "var(--border)", color: pinned ? "var(--accent)" : "var(--text-muted)" }}
        >
          <option value="">no team pinned</option>
          {[...drawnV].sort((a, b) => b.end - a.end).map((t) => (
            <option key={t.name} value={t.name}>
              {`${t.city ?? ""} ${t.team ?? t.name}`.trim()}
            </option>
          ))}
        </select>
        {pinned ? (
          <button type="button" onClick={() => setPinned(null)}
            className="text-[11px] px-2 min-h-11 sm:min-h-8 rounded-md border inline-flex items-center"
            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
            Clear
          </button>
        ) : null}
      </div>

      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs mb-2 text-[var(--text-muted)]">
        {ranked.slice(0, leadCount).map((t) => (
          <span key={t.name} className="inline-flex items-center gap-1.5">
            <span aria-hidden style={{ background: colorByName[t.name] || "var(--text-dim)", width: 14, height: 3, borderRadius: 2, display: "inline-block" }} />
            {t.team ?? t.name}
          </span>
        ))}
        <span className="text-[var(--text-dim)]">
          {drawnV.length} of {rated.length} shown &middot; tap or drag any point for that week &middot;{" "}
          {pinned ? "tap the line again to release it" : "tap a line to lock it"}
        </span>
      </figcaption>

      <div ref={wrap} className="w-full min-w-0">
        {width > 0 ? (
          <svg
            width={width}
            height={H}
            role="img"
            aria-label={`Elo rating by week for ${drawnV.length} teams in the ${season} season. ${ranked.slice(0, leadCount).map((t) => `${t.team ?? t.name} ${through == null ? "ended on" : `stood at`} ${t.end}`).join("; ")}.`}
            className="block cursor-crosshair touch-pan-y select-none"
            onPointerDown={down}
            onPointerMove={onPointer}
            onPointerUp={up}
            onPointerCancel={leave}
            onPointerLeave={leave}
          >
            {yTicks.map((v) => (
              <g key={v}>
                <line x1={M.left} x2={width - M.right} y1={py(v)} y2={py(v)} stroke="var(--border)" strokeWidth={1} />
                <text x={M.left - 8} y={py(v) + 3} textAnchor="end" fontSize={FONT} fill="var(--text-dim)" style={{ fontFamily: MONO }}>{v}</text>
              </g>
            ))}
            {1500 >= lo && 1500 <= hi ? (
              <line x1={M.left} x2={width - M.right} y1={py(1500)} y2={py(1500)} stroke="var(--text-dim)" strokeWidth={1} strokeDasharray="2 3" />
            ) : null}

            {/* Where the regular season ended: the line sits ON the last regular-
                season week, not half a step into the playoffs (Ashwin, 2026-09-08:
                the playoffs start the weekend the regular season ends). Labelled
                per league when they differ. */}
            {dividers.map(([lg, w]) => (
              <g key={lg}>
                <line x1={px(w)} x2={px(w)} y1={M.top} y2={H - M.bottom} stroke="var(--text-dim)" strokeWidth={1} strokeDasharray="4 4" />
                {!isNarrow ? (
                  <text x={px(w) + 4} y={M.top + 10} fontSize={FONT} fill="var(--text-dim)" style={{ fontFamily: MONO }}>
                    {oneDivider ? "playoffs" : `${lg} playoffs`}
                  </text>
                ) : null}
              </g>
            ))}

            {through != null && through > x0 ? (
              <g>
                <line x1={px(through)} x2={px(through)} y1={M.top} y2={H - M.bottom}
                  stroke="var(--accent)" strokeWidth={1} strokeOpacity={0.6} strokeDasharray="2 3" />
                {/* The scrub line says WHEN it is (Ashwin, 2026-09-19: "sometimes I
                    have to look around and see what date it actually is"). The
                    label flips to the left of the line past the midpoint so it
                    never runs off the plot. */}
                {dateOfWeek.get(through) ? (
                  <text
                    x={px(through) + (px(through) > (M.left + width - M.right) / 2 ? -5 : 5)}
                    y={M.top + 11}
                    textAnchor={px(through) > (M.left + width - M.right) / 2 ? "end" : "start"}
                    fontSize={FONT} fontWeight={600} fill="var(--accent)"
                    stroke="var(--bg)" strokeWidth={3} paintOrder="stroke"
                    style={{ fontFamily: MONO }}
                  >
                    {new Date(`${dateOfWeek.get(through)}T00:00:00Z`).toLocaleDateString("en-GB", {
                      day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
                    })}
                  </text>
                ) : null}
              </g>
            ) : null}

            {/* 🔴 DATES, NOT WEEK NUMBERS. The week number is an internal
                counter in the source workbook and means nothing to a reader
                (Ashwin, 2026-09-17: "that's just an internal tracker for me").
                A date also solves the thing a week number actively hides: both
                sports run across the new year, so week 14 sits in a different
                YEAR from week 4 and the axis never said so. The year is shown
                on the first tick and again on any tick where it changes, which
                marks the crossing without repeating itself on every label. */}
            {xTicks.map((w, i) => {
              const label = tickLabel(w, i);
              if (!label) return null;
              return (
                <text key={w} x={px(w)} y={H - 10} textAnchor="middle" fontSize={FONT} fill="var(--text-dim)" style={{ fontFamily: MONO }}>
                  {label}
                </text>
              );
            })}

            {/* Trailing teams first so the emphasised or active few paint on top. */}
            {[...drawnV].sort((a, b) => {
              const aOn = a.name === activeName ? 1 : 0;
              const bOn = b.name === activeName ? 1 : 0;
              if (aOn !== bOn) return aOn - bOn;
              return (lead.has(a.name) ? 1 : 0) - (lead.has(b.name) ? 1 : 0);
            }).map((t) => {
              const color = colorByName[t.name] || "var(--border)";
              const isLead = lead.has(t.name);
              const isActive = t.name === activeName;
              const dimmed = activeName != null && !isActive;
              const strokeW = isActive ? 4 : isLead ? 2.4 : 1.4;
              const lineOpacity = dimmed ? 0.07 : 1;
              const showLabel = !isNarrow && (isActive || (isLead && activeName == null));
              const solid: string[] = [];
              const held: string[] = [];
              for (let i = 1; i < t.weeks.length; i++) {
                const a = t.weeks[i - 1];
                const b = t.weeks[i];
                (b.carried ? held : solid).push(
                  `M${px(a.w).toFixed(1)},${py(a.e).toFixed(1)}L${px(b.w).toFixed(1)},${py(b.e).toFixed(1)}`);
              }
              const all = t.weeks.map((w, i) => `${i ? "L" : "M"}${px(w.w).toFixed(1)},${py(w.e).toFixed(1)}`).join("");
              const last = t.weeks[t.weeks.length - 1];
              const who = `${t.city ?? ""} ${t.team ?? t.name}`.trim();
              const ly = labelY.get(t.name) ?? null;
              const moved = ly !== null && Math.abs(ly - (py(last.e) + 3.5)) > 1.5;
              return (
                /* Click (or tap) the line to lock it. Dragging picks the same
                   highlight for whatever is nearest, without touching the pin. */
                <g
                  key={t.name}
                  onClick={() => setPinned(pinned === t.name ? null : t.name)}
                  style={{ cursor: "pointer" }}
                >
                  <title>{`${who}${t.league ? ` (${t.league})` : ""}${t.div ? ` · ${t.div}` : ""}`}</title>
                  <path d={all} stroke="transparent" strokeWidth={14} fill="none" style={{ pointerEvents: "stroke" }} />
                  <path
                    d={solid.join("")}
                    fill="none"
                    stroke={color}
                    strokeWidth={strokeW}
                    strokeOpacity={lineOpacity}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={isActive ? { filter: "drop-shadow(0 0 4px var(--bg-card)) drop-shadow(0 0 2px var(--bg-card))" } : undefined}
                  />
                  {held.length ? (
                    <path d={held.join("")} fill="none" stroke={color} strokeWidth={strokeW} strokeOpacity={lineOpacity} strokeDasharray="3 3" />
                  ) : null}

                  {/* One point per rated week, marking the one nearest the pointer. */}
                  {t.weeks.map((w) => {
                    const picked = pick?.name === t.name && pick.week === w.w;
                    return (
                      <circle key={w.w} cx={px(w.w)} cy={py(w.e)} r={picked ? 5 : 4.5}
                        fill={picked ? "var(--text)" : "transparent"} fillOpacity={picked ? 0.9 : 1}>
                        <title>
                          {`${who} · ${w.w === 0 ? "preseason seed" : `week ${w.w}`}` +
                           `\n${w.e}${w.r ? ` · ${w.r}${ord(w.r)} of ${rated.length}` : ""}` +
                           `${w.rec ? ` · ${fmtRec(w.rec)}` : ""}` +
                           `${w.pts ? ` · ${w.pts[0]}-${w.pts[1]}` : ""}` +
                           `${w.ph ? `\n${w.ph}` : ""}${w.carried ? " · no game, rating held" : ""}`}
                        </title>
                      </circle>
                    );
                  })}

                  <circle cx={px(last.w)} cy={py(last.e)} r={isActive ? 5 : isLead ? 3 : 2} fill={color} pointerEvents="none" />
                  {showLabel && moved ? (
                    <polyline
                      points={`${(px(last.w) + 4).toFixed(1)},${py(last.e).toFixed(1)} ${(px(last.w) + 9).toFixed(1)},${(ly! - 3.5).toFixed(1)} ${(px(last.w) + 13).toFixed(1)},${(ly! - 3.5).toFixed(1)}`}
                      fill="none" stroke={color} strokeWidth={1} strokeOpacity={0.7} pointerEvents="none"
                    />
                  ) : null}
                  {showLabel ? (
                    <>
                      <rect x={px(last.w) + (moved ? 14 : 5)} y={(ly ?? py(last.e) + 3.5) - 10}
                        width={Math.max((t.team ?? t.name).length * 7 + 6, 24)} height={15} rx={3}
                        fill="var(--bg-card)" pointerEvents="none" />
                      <text x={px(last.w) + (moved ? 16 : 7)} y={ly ?? py(last.e) + 3.5}
                        fontSize={FONT} fill="var(--text)" fontWeight={700} style={{ fontFamily: MONO }} pointerEvents="none">
                        {t.team ?? t.name}
                      </text>
                    </>
                  ) : null}
                </g>
              );
            })}
          </svg>
        ) : (
          <div style={{ height: H }} aria-hidden />
        )}
      </div>
      <ChartReadout hint="Tap or drag on the chart: the nearest team's rating that week." />
    </figure>
  );
}
