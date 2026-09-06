import type { NflEloTeam } from "@/lib/nflElo";

// One season's Elo, week by week, every team on one axis.
//
// FORM: change over time for many comparable series. A line chart, and the
// series legitimately share a scale because Elo is one pool per season by
// ruling, including the years the NFL ran alongside the AAFC or the AFL.
//
// 🔴 NOT 32 COLOURS. The palette is six categorical tokens and the ordering IS
// the colourblind-safety mechanism, so a 32-series rainbow is not a worse
// chart, it is an illegal one. This is highlight-in-context: every team is
// drawn in the border token as shape, and the few that ended highest take
// --cat-1..4 in sequence with a direct label at the line's end. Identity is
// carried twice for those, colour plus label, so nobody has to separate hues.
//
// 🔴 A CARRIED WEEK IS DRAWN AS HELD. Byes and post-elimination weeks inherit
// the previous rating; they are real rows but not fresh measurements, so the
// segment into a carried week is dashed. A solid line there would assert a
// measurement nobody took.
//
// Server-rendered, no client JavaScript. Hover is a native <title> per line.

const W = 940;
const H = 360;
const M = { top: 14, right: 132, bottom: 28, left: 44 };
const MONO = "'JetBrains Mono', monospace";
const HILITE = ["var(--cat-1)", "var(--cat-2)", "var(--cat-3)", "var(--cat-4)"];

export default function WeeklyEloChart({
  teams,
  season,
  highlight = 4,
}: {
  teams: NflEloTeam[];
  season: number;
  highlight?: number;
}) {
  const rated = teams.filter((t) => t.weeks.length >= 3);
  if (rated.length < 2) return null;

  const weeks = rated.flatMap((t) => t.weeks.map((w) => w.w));
  const x0 = Math.min(...weeks);
  const x1 = Math.max(...weeks);
  const elos = rated.flatMap((t) => t.weeks.map((w) => w.e));
  // Pad the band so the extremes are not welded to the frame.
  const lo = Math.floor((Math.min(...elos) - 15) / 25) * 25;
  const hi = Math.ceil((Math.max(...elos) + 15) / 25) * 25;

  const px = (w: number) => M.left + ((w - x0) / Math.max(x1 - x0, 1)) * (W - M.left - M.right);
  const py = (e: number) => M.top + (1 - (e - lo) / (hi - lo)) * (H - M.top - M.bottom);

  const ranked = [...rated].sort((a, b) => b.end - a.end);
  const top = ranked.slice(0, Math.min(highlight, HILITE.length));
  const topNames = new Set(top.map((t) => t.name));

  const yTicks: number[] = [];
  for (let v = lo; v <= hi; v += hi - lo > 400 ? 100 : 50) yTicks.push(v);
  const xTicks = [x0, ...Array.from({ length: 10 }, (_, i) => i + 1).filter((w) => w % 4 === 0 && w <= x1), x1]
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort((a, b) => a - b);

  /** Solid path for measured segments, dashed for carried ones. */
  function paths(t: NflEloTeam) {
    const solid: string[] = [];
    const held: string[] = [];
    for (let i = 1; i < t.weeks.length; i++) {
      const a = t.weeks[i - 1];
      const b = t.weeks[i];
      const seg = `M${px(a.w).toFixed(1)},${py(a.e).toFixed(1)}L${px(b.w).toFixed(1)},${py(b.e).toFixed(1)}`;
      (b.carried ? held : solid).push(seg);
    }
    return { solid: solid.join(""), held: held.join("") };
  }

  return (
    <figure className="m-0 min-w-0">
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs mb-2">
        {top.map((t, i) => (
          <span key={t.name} className="inline-flex items-center gap-1.5 text-[var(--text-muted)]">
            <span aria-hidden style={{ background: HILITE[i], width: 14, height: 3, borderRadius: 2, display: "inline-block" }} />
            {t.team ?? t.name}
          </span>
        ))}
        <span className="text-[var(--text-dim)]">every other team in grey</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label={`Elo rating by week for every team in the ${season} season. ${top.map((t) => `${t.team ?? t.name} ended on ${t.end}`).join("; ")}.`}
      >
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={M.left} x2={W - M.right} y1={py(v)} y2={py(v)} stroke="var(--border)" strokeWidth={1} />
            <text x={M.left - 8} y={py(v) + 3} textAnchor="end" fontSize={10} fill="var(--text-dim)" style={{ fontFamily: MONO }}>
              {v}
            </text>
          </g>
        ))}
        {/* 1500 is the league mean by construction: the line every rating is measured against. */}
        {1500 >= lo && 1500 <= hi ? (
          <line x1={M.left} x2={W - M.right} y1={py(1500)} y2={py(1500)} stroke="var(--text-dim)" strokeWidth={1} strokeDasharray="2 3" />
        ) : null}
        {xTicks.map((w) => (
          <text key={w} x={px(w)} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--text-dim)" style={{ fontFamily: MONO }}>
            {w === 0 ? "seed" : `wk ${w}`}
          </text>
        ))}

        {/* Context first, so the highlighted lines paint over it. */}
        {rated.filter((t) => !topNames.has(t.name)).map((t) => {
          const p = paths(t);
          return (
            <g key={t.name}>
              <path d={p.solid} fill="none" stroke="var(--border)" strokeWidth={1.25} strokeLinecap="round" />
              {p.held ? <path d={p.held} fill="none" stroke="var(--border)" strokeWidth={1.25} strokeDasharray="3 3" /> : null}
              <title>{`${t.city ?? ""} ${t.team ?? t.name}: ${t.start} to ${t.end}, peak ${t.peak.e} at week ${t.peak.w}`}</title>
            </g>
          );
        })}

        {top.map((t, i) => {
          const p = paths(t);
          const last = t.weeks[t.weeks.length - 1];
          return (
            <g key={t.name}>
              <path d={p.solid} fill="none" stroke={HILITE[i]} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />
              {p.held ? <path d={p.held} fill="none" stroke={HILITE[i]} strokeWidth={2.25} strokeDasharray="3 3" /> : null}
              <circle cx={px(last.w)} cy={py(last.e)} r={3} fill={HILITE[i]} />
              <text x={px(last.w) + 8} y={py(last.e) + 3.5} fontSize={11} fill="var(--text)" style={{ fontFamily: MONO }}>
                {t.team ?? t.name}
              </text>
              <title>{`${t.city ?? ""} ${t.team ?? t.name}: ${t.start} to ${t.end}, peak ${t.peak.e} at week ${t.peak.w}`}</title>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
