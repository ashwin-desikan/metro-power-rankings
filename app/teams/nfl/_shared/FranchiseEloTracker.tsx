import Link from "next/link";
import type { NflFranchise } from "@/lib/nflElo";

// One franchise's whole life against the league, at season resolution.
//
// 🔴 SEASON RESOLUTION ON PURPOSE, NOT FOR WANT OF DATA. The spine holds every
// WEEK: the Bears have roughly 1,500 team-weeks. At 900px that is 0.6px per
// point, which is a smear, not a chart. The weekly detail lives on the season
// hub, where 23 points across one year can actually be read. This strip answers
// a different question: when was this franchise good, and for how long.
//
// FORM: a level over time, so a line, and the reference is 1500 because that is
// the league mean by construction rather than a chosen baseline. Fill between
// the line and 1500 in the site's diverging pair, so above and below average
// read at a glance; the 1500 line is drawn, which is the secondary encoding the
// palette requires of any diverging pair.
//
// 🔴 A GAP IS DRAWN AS A GAP. Canton played 1920-23 and 1925-26. Joining 1923
// to 1925 with a straight line asserts a season that did not happen.
//
// Server-rendered, no client JavaScript. Hover is a native <title> per season.

const W = 900;
const H = 170;
const M = { top: 12, right: 12, bottom: 22, left: 40 };
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
  const values = rows.flatMap((r) => [r.end, r.peak, r.trough]);
  const lo = Math.min(Math.floor((Math.min(...values) - 20) / 50) * 50, MEAN - 50);
  const hi = Math.max(Math.ceil((Math.max(...values) + 20) / 50) * 50, MEAN + 50);

  const px = (s: number) => M.left + ((s - x0) / Math.max(x1 - x0, 1)) * (W - M.left - M.right);
  const py = (e: number) => M.top + (1 - (e - lo) / (hi - lo)) * (H - M.top - M.bottom);

  // Break the path wherever a season is missing from the franchise's record.
  const runs: (typeof rows)[] = [];
  let run: typeof rows = [];
  for (const r of rows) {
    if (run.length && r.season !== run[run.length - 1].season + 1) {
      runs.push(run);
      run = [];
    }
    run.push(r);
  }
  if (run.length) runs.push(run);

  const above = rows.filter((r) => r.end >= MEAN).length;
  const peak = entry.peak;
  const trough = entry.trough;
  const yMean = py(MEAN);

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

      <figure className="m-0 mt-3 min-w-0">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto"
          role="img"
          aria-label={`${displayName} Elo rating at the end of each season from ${x0} to ${x1}. Peak ${peak?.elo ?? "unknown"} in ${peak?.season ?? "unknown"}.`}
        >
          <defs>
            <clipPath id={`above-${entry.name.replace(/\W/g, "")}`}>
              <rect x={0} y={M.top} width={W} height={Math.max(yMean - M.top, 0)} />
            </clipPath>
            <clipPath id={`below-${entry.name.replace(/\W/g, "")}`}>
              <rect x={0} y={yMean} width={W} height={Math.max(H - M.bottom - yMean, 0)} />
            </clipPath>
          </defs>

          {[lo, MEAN, hi].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
            <text key={v} x={M.left - 6} y={py(v) + 3} textAnchor="end" fontSize={9} fill="var(--text-dim)" style={{ fontFamily: MONO }}>
              {v}
            </text>
          ))}

          {runs.map((seg, i) => {
            const line = seg.map((r, j) => `${j ? "L" : "M"}${px(r.season).toFixed(1)},${py(r.end).toFixed(1)}`).join("");
            const area = `${line}L${px(seg[seg.length - 1].season).toFixed(1)},${yMean.toFixed(1)}L${px(seg[0].season).toFixed(1)},${yMean.toFixed(1)}Z`;
            const key = entry.name.replace(/\W/g, "");
            return (
              <g key={i}>
                <path d={area} fill={POS} fillOpacity={0.35} clipPath={`url(#above-${key})`} />
                <path d={area} fill={NEG} fillOpacity={0.35} clipPath={`url(#below-${key})`} />
                <path d={line} fill="none" stroke="var(--text)" strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
              </g>
            );
          })}

          {/* The league mean, drawn because a diverging fill is only legal with it. */}
          <line x1={M.left} x2={W - M.right} y1={yMean} y2={yMean} stroke="var(--text-dim)" strokeWidth={1} strokeDasharray="3 3" />

          {rows.map((r) => (
            <g key={r.season}>
              <circle cx={px(r.season)} cy={py(r.end)} r={5} fill="transparent" />
              <title>{`${r.season}: ended ${r.end}${r.rank_end ? `, ${r.rank_end}${ord(r.rank_end)} in the league` : ""} · peak ${r.peak} at week ${r.peak_w}`}</title>
            </g>
          ))}

          {peak ? <circle cx={px(peak.season)} cy={py(peak.elo)} r={3} fill={POS} /> : null}
          {trough ? <circle cx={px(trough.season)} cy={py(trough.elo)} r={3} fill={NEG} /> : null}

          <text x={M.left} y={H - 6} fontSize={9} fill="var(--text-dim)" style={{ fontFamily: MONO }}>{x0}</text>
          <text x={W - M.right} y={H - 6} textAnchor="end" fontSize={9} fill="var(--text-dim)" style={{ fontFamily: MONO }}>{x1}</text>
        </svg>
      </figure>

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
        One point per season, at the rating it finished on. 1500 is the league average by
        construction, not a chosen line. The week-by-week detail for any season is on its own{" "}
        <Link href="/teams/nfl/season" className="text-[var(--accent)] hover:underline">season page</Link>.
      </p>
    </section>
  );
}

function ord(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
