"use client";

import { useMemo, useState } from "react";
import type { NflEloTeam } from "@/lib/nflElo";

// One season's Elo, week by week, every team on one axis.
//
// FORM: a level over time for many comparable series, so a line chart, and they
// legitimately share a scale because Elo is one pool per season by ruling,
// including the years the NFL ran alongside the AAFC or the AFL.
//
// 🔴 THESE ARE CLUB COLOURS, NOT A CATEGORICAL PALETTE, and that is why 32 of
// them is allowed. The palette rules cap categorical assignment at six because
// the ORDER carries colourblind safety; a team's own colour carries identity
// instead, and identity is reinforced twice more, by the hover label and the
// tooltip. A franchise with no stored colour stays neutral rather than being
// assigned one: inventing a club colour is worse than not having it.
//
// 🔴 THE TOOLTIP IS THE POINT UNDER THE CURSOR, NOT THE SEASON. Every rated
// week carries its own hit circle and its own title: the week, the rating, the
// rank, the record and the phase. The line still answers "whose line is this",
// because that is what a reader asks when the cursor is between two points.
//
// 🔴 END LABELS ARE DECONFLICTED, NOT DROPPED. Four teams inside 20 Elo points
// put four labels inside 6px of each other. The visible labels are pushed apart
// in one pass with a leader line back to the point, and while a line is hovered
// every OTHER label is hidden outright rather than dimmed, because a dimmed
// label still overlaps the hovered one.
//
// 🔴 A CARRIED WEEK IS DRAWN AS HELD. Byes and post-elimination weeks inherit
// the previous rating, so the segment into one is dashed. A solid line there
// would assert a measurement nobody took.
//
// 🔴 CLIENT COMPONENT FOR THE FILTERS ONLY. Grouping 32 lines by conference,
// division or playoff fate is the difference between a hairball and a chart,
// and it has to be instant. The drawing itself is still pure: same data in,
// same SVG out.

const W = 940;
const H = 380;
const M = { top: 14, right: 128, bottom: 30, left: 44 };
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

type Filter = { key: string; label: string; test: (t: NflEloTeam) => boolean };

export default function WeeklyEloChart({
  teams,
  season,
  colorByName = {},
  regEndWeek = {},
  emphasise = 4,
}: {
  teams: NflEloTeam[];
  season: number;
  /** Canonical franchise name to a club colour that reads on the card, or null. */
  colorByName?: Record<string, string | null>;
  /** League to the last regular-season week. Two entries when two leagues ran. */
  regEndWeek?: Record<string, number>;
  emphasise?: number;
}) {
  // 🔴 THE FILTERS ARE BUILT FROM THE SEASON, NOT HARDCODED. 1966 has no AFC,
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
  // 🔴 PINNING IS NOT FILTERING. Ashwin asked to be able to pick a team and have
  // it stand out "as if you're hovering over" it, WITHOUT removing the rest: the
  // whole point of one line among thirty-two is where it sits against them. So
  // this sets exactly the same visual state hover does, and leaves every other
  // line drawn. It also makes the chart usable without a pointer at all, which
  // a hover-only interaction never was.
  const [pinned, setPinned] = useState<string | null>(null);
  const filter = filters.find((f) => f.key === active) ?? filters[0];

  const rated = teams.filter((t) => t.weeks.length >= 3);
  const shown = rated.filter(filter.test);
  if (rated.length < 2) return null;
  const drawn = shown.length >= 1 ? shown : rated;

  // 🔴 THE SCALE IS THE WHOLE SEASON, ALWAYS. Rescaling to the filtered subset
  // would make the AFC and the NFC look identically spread and quietly make the
  // two views uncomparable, which is the one thing a filter must not do.
  const weeks = rated.flatMap((t) => t.weeks.map((w) => w.w));
  const x0 = Math.min(...weeks);
  const x1 = Math.max(...weeks);
  const elos = rated.flatMap((t) => t.weeks.map((w) => w.e));
  const lo = Math.floor((Math.min(...elos) - 15) / 25) * 25;
  const hi = Math.ceil((Math.max(...elos) + 15) / 25) * 25;

  const px = (w: number) => M.left + ((w - x0) / Math.max(x1 - x0, 1)) * (W - M.left - M.right);
  const py = (e: number) => M.top + (1 - (e - lo) / (hi - lo)) * (H - M.top - M.bottom);

  const ranked = [...drawn].sort((a, b) => b.end - a.end);
  const leadCount = Math.min(emphasise, ranked.length);
  const lead = new Set(ranked.slice(0, leadCount).map((t) => t.name));

  const yTicks: number[] = [];
  for (let v = lo; v <= hi; v += hi - lo > 400 ? 100 : 50) yTicks.push(v);
  const xTicks = Array.from(new Set([x0, ...Array.from({ length: 24 }, (_, i) => i).filter((w) => w > 0 && w % 4 === 0 && w <= x1), x1])).sort((a, b) => a - b);

  // Where the regular season stopped. Two entries when two leagues ran and did
  // not finish together, which is why this is not a single number.
  const dividers = Object.entries(regEndWeek)
    .filter(([, w]) => w > 0 && w < x1)
    .sort((a, b) => a[1] - b[1]);
  const oneDivider = dividers.length > 0 && new Set(dividers.map(([, w]) => w)).size === 1;

  const uid = `elo${season}`;

  const labelY = deconflict(
    ranked.slice(0, leadCount).map((t) => ({
      key: t.name,
      y: py(t.weeks[t.weeks.length - 1].e) + 3.5,
    })),
    12,
    M.top + 8,
    H - M.bottom - 2,
  );

  const fmtRec = (rec?: [number, number, number]) =>
    rec ? `${rec[0]}-${rec[1]}${rec[2] ? `-${rec[2]}` : ""}` : "";

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
          /* 16px on a phone or iOS zooms the page on focus (§6), and the
             control clears 44px there for the same reason. */
          className="rounded-md border px-2 min-h-11 sm:min-h-8 text-[16px] sm:text-xs max-w-[15rem]"
          style={{ background: "var(--bg-card)", borderColor: pinned ? "var(--accent)" : "var(--border)", color: pinned ? "var(--accent)" : "var(--text-muted)" }}
        >
          <option value="">no team pinned</option>
          {[...drawn].sort((a, b) => b.end - a.end).map((t) => (
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
          {drawn.length} of {rated.length} shown &middot; hover any point for that week &middot;{" "}
          {pinned ? "click the line again to release it" : "click a line to lock it"}
        </span>
      </figcaption>

      <svg viewBox={`0 0 ${W} ${H}`} className={`w-full h-auto ${uid}${pinned ? " haspin" : ""}`} role="img"
        aria-label={`Elo rating by week for ${drawn.length} teams in the ${season} season. ${ranked.slice(0, leadCount).map((t) => `${t.team ?? t.name} ended on ${t.end}`).join("; ")}.`}>
        <style>{`
          /* 🔴 THE BASE OPACITY IS A CLASS, NOT AN INLINE STYLE. It was inline,
             and an inline style beats a stylesheet rule, so neither the dim nor
             the highlight could touch a line: hovering the Chargers left them at
             the same 0.55 they started at while everything else stayed put. The
             whole interaction was a no-op that looked like a subtle one. */
          .${uid} .ln { opacity: 0.5; }
          .${uid} .ln.lead { opacity: 1; }
          .${uid} .ln .hit { stroke: transparent; stroke-width: 14; fill: none; pointer-events: stroke; }
          .${uid} .ln .lbl { opacity: 0; }
          .${uid} .ln.lead .lbl { opacity: 1; }

          /* One line held: everything else drops to a ghost, and the held one
             goes to full strength, thicker, and separated from what it crosses
             by a halo in the card colour. There is no z-index in SVG, so the
             halo is what puts it visually on top of the lines painted after it. */
          .${uid}:has(.ln:hover) .ln { opacity: 0.07; }
          .${uid}:has(.ln:hover) .ln:hover { opacity: 1; }
          .${uid}:has(.ln:hover) .ln:not(:hover) .lbl,
          .${uid}:has(.ln:hover) .ln:not(:hover) .lead-line { opacity: 0; }
          .${uid} .ln:hover .stroke {
            stroke-width: 4;
            filter: drop-shadow(0 0 4px var(--bg-card)) drop-shadow(0 0 2px var(--bg-card));
          }
          .${uid} .ln:hover .lbl { opacity: 1; font-weight: 700; }
          .${uid} .ln:hover .dot { r: 5; }
          .${uid} .ln:hover .lblbg { opacity: 1; }
          .${uid} .lblbg { opacity: 0; }
          .${uid} .ln.lead .lblbg { opacity: 0; }

          /* A pinned line gets exactly what a hovered one gets. Written before
             the hover block so that hovering a DIFFERENT line still takes over. */
          .${uid}.haspin .ln { opacity: 0.07; }
          .${uid}.haspin .ln.on { opacity: 1; }
          .${uid}.haspin .ln:not(.on) .lbl,
          .${uid}.haspin .ln:not(.on) .lead-line { opacity: 0; }
          .${uid}.haspin .ln.on .stroke {
            stroke-width: 4;
            filter: drop-shadow(0 0 4px var(--bg-card)) drop-shadow(0 0 2px var(--bg-card));
          }
          .${uid}.haspin .ln.on .lbl { opacity: 1; font-weight: 700; }
          .${uid}.haspin .ln.on .lblbg { opacity: 1; }
          .${uid}.haspin .ln.on .dot { r: 5; }

          .${uid} .pt { fill: transparent; }
          .${uid} .pt:hover { fill: var(--text); fill-opacity: 0.9; }
          /* 🔴 A PIN OUTRANKS HOVER, and this block is what makes that true.
             The first version let hover win, which meant the pinned line was
             lost the moment the cursor crossed anything on its way to it: the
             chart kept handing the highlight to whatever was under the mouse,
             which is the behaviour pinning exists to escape. A pin now holds
             until it is cleared or another line is clicked. The per-point
             tooltips still answer wherever the cursor is, because those are
             native titles and owe nothing to opacity. */
          .${uid}.haspin:has(.ln:hover) .ln { opacity: 0.07; }
          .${uid}.haspin:has(.ln:hover) .ln.on { opacity: 1; }
          .${uid}.haspin .ln:hover:not(.on) .stroke { stroke-width: 1.4; filter: none; }
          .${uid}.haspin .ln:hover:not(.on) .lbl { opacity: 0; }
          .${uid}.haspin .ln:hover:not(.on) .dot { r: 2; }

          @media (prefers-reduced-motion: no-preference) {
            .${uid} .ln { transition: opacity .12s ease; }
            .${uid} .ln .stroke { transition: stroke-width .12s ease; }
          }
        `}</style>

        {yTicks.map((v) => (
          <g key={v}>
            <line x1={M.left} x2={W - M.right} y1={py(v)} y2={py(v)} stroke="var(--border)" strokeWidth={1} />
            <text x={M.left - 8} y={py(v) + 3} textAnchor="end" fontSize={10} fill="var(--text-dim)" style={{ fontFamily: MONO }}>{v}</text>
          </g>
        ))}
        {1500 >= lo && 1500 <= hi ? (
          <line x1={M.left} x2={W - M.right} y1={py(1500)} y2={py(1500)} stroke="var(--text-dim)" strokeWidth={1} strokeDasharray="2 3" />
        ) : null}

        {/* Where the regular season ended. Labelled per league when they differ. */}
        {dividers.map(([lg, w]) => (
          <g key={lg}>
            <line x1={px(w + 0.5)} x2={px(w + 0.5)} y1={M.top} y2={H - M.bottom} stroke="var(--text-dim)" strokeWidth={1} strokeDasharray="4 4" />
            <text x={px(w + 0.5) + 4} y={M.top + 10} fontSize={9} fill="var(--text-dim)" style={{ fontFamily: MONO }}>
              {oneDivider ? "playoffs" : `${lg} playoffs`}
            </text>
          </g>
        ))}

        {xTicks.map((w) => (
          <text key={w} x={px(w)} y={H - 10} textAnchor="middle" fontSize={10} fill="var(--text-dim)" style={{ fontFamily: MONO }}>
            {w === 0 ? "seed" : `wk ${w}`}
          </text>
        ))}

        {/* Trailing teams first so the emphasised few paint on top. */}
        {[...drawn].sort((a, b) => (lead.has(a.name) ? 1 : 0) - (lead.has(b.name) ? 1 : 0)).map((t) => {
          const color = colorByName[t.name] || "var(--border)";
          const isLead = lead.has(t.name);
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
            /* 🔴 CLICK THE LINE TO LOCK IT. Hover alone is a state you lose the
               moment you move to read the thing you were hovering for: the line
               you were following disappears the instant the cursor leaves its
               14px hit stroke. Clicking pins the same state so it survives the
               mouse, and clicking again releases it. The select above does the
               same thing for anyone not using a pointer. */
            <g
              key={t.name}
              className={`ln${isLead ? " lead" : ""}${t.name === pinned ? " on" : ""}`}
              onClick={() => setPinned(pinned === t.name ? null : t.name)}
              style={{ cursor: "pointer" }}
            >
              {/* Whose line is this. The per-week detail is on the points. */}
              <title>{`${who}${t.league ? ` (${t.league})` : ""}${t.div ? ` · ${t.div}` : ""}`}</title>
              <path className="hit" d={all} />
              <path className="stroke" d={solid.join("")} fill="none" stroke={color} strokeWidth={isLead ? 2.4 : 1.4} strokeLinecap="round" strokeLinejoin="round" />
              {held.length ? <path className="stroke" d={held.join("")} fill="none" stroke={color} strokeWidth={isLead ? 2.4 : 1.4} strokeDasharray="3 3" /> : null}

              {/* 🔴 ONE HIT CIRCLE PER RATED WEEK, each with its own title, so
                  the tooltip answers "what is this point" rather than "what was
                  this season". Transparent until hovered, then it marks itself. */}
              {t.weeks.map((w) => (
                <circle key={w.w} className="pt" cx={px(w.w)} cy={py(w.e)} r={4.5}>
                  <title>
                    {`${who} · ${w.w === 0 ? "preseason seed" : `week ${w.w}`}` +
                     `\n${w.e}${w.r ? ` · ${w.r}${ord(w.r)} of ${rated.length}` : ""}` +
                     `${w.rec ? ` · ${fmtRec(w.rec)}` : ""}` +
                     `${w.pts ? ` · ${w.pts[0]}-${w.pts[1]}` : ""}` +
                     `${w.ph ? `\n${w.ph}` : ""}${w.carried ? " · no game, rating held" : ""}`}
                  </title>
                </circle>
              ))}

              <circle className="dot" cx={px(last.w)} cy={py(last.e)} r={isLead ? 3 : 2} fill={color} pointerEvents="none" />
              {moved ? (
                <polyline
                  className="lead-line"
                  points={`${(px(last.w) + 4).toFixed(1)},${py(last.e).toFixed(1)} ${(px(last.w) + 9).toFixed(1)},${(ly! - 3.5).toFixed(1)} ${(px(last.w) + 13).toFixed(1)},${(ly! - 3.5).toFixed(1)}`}
                  fill="none" stroke={color} strokeWidth={1} strokeOpacity={0.7} pointerEvents="none"
                />
              ) : null}
              <rect className="lblbg" x={px(last.w) + (moved ? 14 : 5)} y={(ly ?? py(last.e) + 3.5) - 10}
                width={Math.max((t.team ?? t.name).length * 6.8 + 6, 24)} height={14} rx={3}
                fill="var(--bg-card)" pointerEvents="none" />
              <text className="lbl" x={px(last.w) + (moved ? 16 : 7)} y={ly ?? py(last.e) + 3.5}
                fontSize={11} fill="var(--text)" style={{ fontFamily: MONO }} pointerEvents="none">
                {t.team ?? t.name}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
