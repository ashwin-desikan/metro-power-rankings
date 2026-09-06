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
// 🔴 EVERY TEAM IS HOVERABLE, not just the four labelled by default. Each line
// carries a transparent 12px hit stroke, and `:has()` dims the rest of the
// chart while one is held. No client JavaScript: this is a server component and
// the whole interaction is CSS.
//
// 🔴 END LABELS ARE DECONFLICTED, NOT DROPPED. Four teams inside 20 Elo of each
// other put four labels inside 6px of each other, which is four labels nobody
// can read. The emphasised labels are pushed apart to a minimum gap in one pass
// and a leader line is drawn from the point to wherever the label ended up, so
// the label still says which line it belongs to. While a line is hovered every
// OTHER label is hidden outright rather than dimmed, because a hovered label
// with nothing beside it cannot collide with anything.
//
// 🔴 A CARRIED WEEK IS DRAWN AS HELD. Byes and post-elimination weeks inherit
// the previous rating, so the segment into one is dashed. A solid line there
// would assert a measurement nobody took.

const W = 940;
const H = 380;
const M = { top: 14, right: 128, bottom: 30, left: 44 };
const MONO = "'JetBrains Mono', monospace";

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

function ord(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

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
  const rated = teams.filter((t) => t.weeks.length >= 3);
  if (rated.length < 2) return null;

  const weeks = rated.flatMap((t) => t.weeks.map((w) => w.w));
  const x0 = Math.min(...weeks);
  const x1 = Math.max(...weeks);
  const elos = rated.flatMap((t) => t.weeks.map((w) => w.e));
  const lo = Math.floor((Math.min(...elos) - 15) / 25) * 25;
  const hi = Math.ceil((Math.max(...elos) + 15) / 25) * 25;

  const px = (w: number) => M.left + ((w - x0) / Math.max(x1 - x0, 1)) * (W - M.left - M.right);
  const py = (e: number) => M.top + (1 - (e - lo) / (hi - lo)) * (H - M.top - M.bottom);

  const ranked = [...rated].sort((a, b) => b.end - a.end);
  const lead = new Set(ranked.slice(0, emphasise).map((t) => t.name));

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

  // The emphasised labels are the only ones on screen at rest, so they are the
  // only ones that can collide at rest. 12px is the 11px type plus a hairline.
  const labelY = deconflict(
    ranked.slice(0, emphasise).map((t) => ({
      key: t.name,
      y: py(t.weeks[t.weeks.length - 1].e) + 3.5,
    })),
    12,
    M.top + 8,
    H - M.bottom - 2,
  );

  return (
    <figure className="m-0 min-w-0">
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs mb-2 text-[var(--text-muted)]">
        {ranked.slice(0, emphasise).map((t) => (
          <span key={t.name} className="inline-flex items-center gap-1.5">
            <span aria-hidden style={{ background: colorByName[t.name] || "var(--text-dim)", width: 14, height: 3, borderRadius: 2, display: "inline-block" }} />
            {t.team ?? t.name}
          </span>
        ))}
        <span className="text-[var(--text-dim)]">hover any line to isolate it</span>
      </figcaption>

      <svg viewBox={`0 0 ${W} ${H}`} className={`w-full h-auto ${uid}`} role="img"
        aria-label={`Elo rating by week for all ${rated.length} teams in the ${season} season. ${ranked.slice(0, emphasise).map((t) => `${t.team ?? t.name} ended on ${t.end}`).join("; ")}.`}>
        <style>{`
          .${uid} .ln .hit { stroke: transparent; stroke-width: 12; fill: none; pointer-events: stroke; }
          .${uid} .ln .lbl { opacity: 0; }
          .${uid} .ln.lead .lbl { opacity: 1; }
          .${uid}:has(.ln:hover) .ln { opacity: 0.12; }
          /* Not dimmed - removed. A dimmed label still overlaps the hovered one. */
          .${uid}:has(.ln:hover) .ln:not(:hover) .lbl,
          .${uid}:has(.ln:hover) .ln:not(:hover) .lead-line { opacity: 0; }
          .${uid}:has(.ln:hover) .ln:hover { opacity: 1; }
          .${uid} .ln:hover .stroke { stroke-width: 3.2; }
          .${uid} .ln:hover .lbl { opacity: 1; }
          .${uid} .ln:hover .dot { r: 4; }
          @media (prefers-reduced-motion: no-preference) { .${uid} .ln { transition: opacity .12s ease; } }
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

        {/* Trailing teams first so the emphasised four paint on top. */}
        {[...rated].sort((a, b) => (lead.has(a.name) ? 1 : 0) - (lead.has(b.name) ? 1 : 0)).map((t) => {
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
          const rec = last.rec ? `${last.rec[0]}-${last.rec[1]}${last.rec[2] ? `-${last.rec[2]}` : ""}` : "";
          // Deconflicted for the emphasised few; every other label appears only
          // on hover, alone, so its own point is the right place for it.
          const ly = labelY.get(t.name) ?? null;
          return (
            <g key={t.name} className={`ln${isLead ? " lead" : ""}`} style={{ opacity: isLead ? 1 : 0.55 }}>
              <title>
                {`${t.city ?? ""} ${t.team ?? t.name}${t.league ? ` (${t.league})` : ""}` +
                 `\nfinished ${last.e}${last.r ? `, ${last.r}${ord(last.r)} of ${rated.length}` : ""}${rec ? ` · ${rec}` : ""}` +
                 `\nstarted ${t.start} · peak ${t.peak.e} at week ${t.peak.w} · low ${t.trough.e} at week ${t.trough.w}`}
              </title>
              <path className="hit" d={all} />
              <path className="stroke" d={solid.join("")} fill="none" stroke={color} strokeWidth={isLead ? 2.4 : 1.4} strokeLinecap="round" strokeLinejoin="round" />
              {held.length ? <path className="stroke" d={held.join("")} fill="none" stroke={color} strokeWidth={isLead ? 2.4 : 1.4} strokeDasharray="3 3" /> : null}
              <circle className="dot" cx={px(last.w)} cy={py(last.e)} r={isLead ? 3 : 2} fill={color} />
              {ly !== null && Math.abs(ly - (py(last.e) + 3.5)) > 1.5 ? (
                <polyline
                  className="lead-line"
                  points={`${(px(last.w) + 4).toFixed(1)},${py(last.e).toFixed(1)} ${(px(last.w) + 9).toFixed(1)},${(ly - 3.5).toFixed(1)} ${(px(last.w) + 13).toFixed(1)},${(ly - 3.5).toFixed(1)}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={1}
                  strokeOpacity={0.7}
                />
              ) : null}
              <text className="lbl" x={px(last.w) + (ly !== null && Math.abs(ly - (py(last.e) + 3.5)) > 1.5 ? 16 : 7)}
                y={ly ?? py(last.e) + 3.5} fontSize={11} fill="var(--text)" style={{ fontFamily: MONO }}>
                {t.team ?? t.name}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
