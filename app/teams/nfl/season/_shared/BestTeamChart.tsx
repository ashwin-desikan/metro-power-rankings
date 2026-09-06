import type { NflEloIndexRow } from "@/lib/nflElo";

// The best team in the league, every season since 1920, on one axis.
//
// FORM: one value per season over 107 seasons, so a line. It is NOT a ranking
// of teams; it is the height of the ceiling, which is a different question and
// the one a 107-season index is actually able to answer.
//
// 🔴 THE FILL IS AGAINST 1500 AND NOTHING ELSE. 1500 is the league mean by
// construction, so the gap between the line and it IS the gap between the best
// team and an average one that year. A fill against the chart floor would
// encode the axis choice rather than the data.
//
// 🔴 A SEEDED SEASON IS NOT A PLAYED ONE. 2026 carries a preseason seed, so it
// is drawn hollow and excluded from the era averages: a seed is a forecast and
// this line is a record.
//
// Server-rendered. Hover is a full-height band per season, the same idiom as
// the franchise tracker, because a 5px dot every 8px is not a hover target.

const W = 940;
const H = 220;
const M = { top: 14, right: 14, bottom: 26, left: 42 };
const MONO = "'JetBrains Mono', monospace";
const MEAN = 1500;

export default function BestTeamChart({ rows }: { rows: NflEloIndexRow[] }) {
  const pts = rows.filter((r) => r.top);
  if (pts.length < 5) return null;

  const x0 = pts[0].season;
  const x1 = pts[pts.length - 1].season;
  const vals = pts.map((r) => r.top!.elo);
  const lo = Math.min(Math.floor((Math.min(...vals) - 20) / 50) * 50, MEAN);
  const hi = Math.ceil((Math.max(...vals) + 20) / 50) * 50;

  const px = (s: number) => M.left + ((s - x0) / Math.max(x1 - x0, 1)) * (W - M.left - M.right);
  const py = (e: number) => M.top + (1 - (e - lo) / (hi - lo)) * (H - M.top - M.bottom);
  const yMean = py(MEAN);
  const bandW = Math.max((W - M.left - M.right) / Math.max(x1 - x0, 1), 3);

  const decades: number[] = [];
  for (let d = Math.ceil(x0 / 10) * 10; d <= x1; d += 10) decades.push(d);

  const line = pts.map((r, i) => `${i ? "L" : "M"}${px(r.season).toFixed(1)},${py(r.top!.elo).toFixed(1)}`).join("");
  const area = `${line}L${px(x1).toFixed(1)},${yMean.toFixed(1)}L${px(x0).toFixed(1)},${yMean.toFixed(1)}Z`;
  const yTicks = [lo, Math.round((lo + hi) / 100) * 50, hi].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <figure className="m-0 min-w-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto btc" role="img"
        aria-label={`The highest Elo rating in the league at the end of every season from ${x0} to ${x1}.`}>
        <style>{`
          .btc .bd .hit { fill: transparent; }
          .btc .bd .mk, .btc .bd .rd { opacity: 0; }
          .btc .bd:hover .mk, .btc .bd:hover .rd { opacity: 1; }
        `}</style>

        {decades.map((d, i) => (
          <g key={d}>
            <line x1={px(d)} x2={px(d)} y1={M.top} y2={H - M.bottom} stroke="var(--border)" strokeWidth={1} />
            {i % 2 === 0 ? (
              <text x={px(d)} y={H - 6} textAnchor="middle" fontSize={9} fill="var(--text-dim)" style={{ fontFamily: MONO }}>
                {`${String(d).slice(2)}s`}
              </text>
            ) : null}
          </g>
        ))}

        {yTicks.map((v) => (
          <text key={v} x={M.left - 6} y={py(v) + 3} textAnchor="end" fontSize={9} fill="var(--text-dim)" style={{ fontFamily: MONO }}>{v}</text>
        ))}

        <path d={area} fill="var(--div-pos)" fillOpacity={0.22} />
        <path d={line} fill="none" stroke="var(--div-pos)" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
        <line x1={M.left} x2={W - M.right} y1={yMean} y2={yMean} stroke="var(--text-dim)" strokeWidth={1} strokeDasharray="3 3" />
        <text x={W - M.right} y={yMean - 4} textAnchor="end" fontSize={9} fill="var(--text-dim)" style={{ fontFamily: MONO }}>1500 · league average</text>

        {pts.map((r) => {
          const cx = px(r.season);
          const cy = py(r.top!.elo);
          const right = cx > W - M.right - 190;
          const who = [r.top!.city, r.top!.team].filter(Boolean).join(" ") || r.top!.name;
          const won = r.champion && r.champion.name === r.top!.name;
          return (
            <g key={r.season} className="bd">
              <title>
                {`${r.season}  ${who} ${r.top!.elo.toFixed(0)}` +
                 (r.complete && r.champion
                   ? `\n${won ? "and won it" : `champion: ${[r.champion.city, r.champion.team].filter(Boolean).join(" ")}`}`
                   : "\npreseason rating only") +
                 `\n${r.teams} teams · ${r.leagues.join(" + ")}`}
              </title>
              <circle className="mk" cx={cx} cy={cy} r={3} fill="var(--text)" />
              <text className="rd" x={right ? cx - 6 : cx + 6} y={M.top + 9} textAnchor={right ? "end" : "start"}
                fontSize={10} fill="var(--text)" style={{ fontFamily: MONO }}>
                {`${r.season}  ${who} ${r.top!.elo.toFixed(0)}`}
              </text>
              <rect className="hit" x={cx - bandW / 2} y={M.top} width={bandW} height={H - M.top - M.bottom} />
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 text-[12px] text-[var(--text-dim)]">
        The single highest rating in the league at the end of each season. Hover any year for the team,
        and for whether it went on to win.
      </figcaption>
    </figure>
  );
}
