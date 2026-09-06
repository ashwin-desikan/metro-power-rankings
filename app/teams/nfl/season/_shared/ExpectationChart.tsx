import type { SeasonSummary } from "@/lib/nflExpectation";

// The model against the closing line, every season it can be scored in.
//
// FORM: two comparable series over 107 seasons, so two lines on one axis. They
// legitimately share it: Brier is the same unit for both and the whole question
// is which one is lower.
//
// 🔴 LOWER IS BETTER, SO THE AXIS IS INVERTED. A reader looks at a chart and
// reads "up is good". Leaving Brier the right way up would make every season
// the model lost look like a season it won. The axis is flipped once, here, and
// labelled, rather than asking every reader to invert it in their head.
//
// 🔴 THE MARKET LINE STOPS WHERE THE MARKET DOES. There is no closing line for
// 1931. A market series drawn across the years it does not cover would be an
// invention, so it is broken into runs and simply absent before 1978.

const W = 940;
const H = 210;
const M = { top: 16, right: 14, bottom: 26, left: 46 };
const MONO = "'JetBrains Mono', monospace";

export default function ExpectationChart({ rows }: { rows: SeasonSummary[] }) {
  const pts = rows.filter((r) => r.model_brier != null);
  if (pts.length < 5) return null;

  const x0 = pts[0].season;
  const x1 = pts[pts.length - 1].season;
  const vals = pts.flatMap((r) => [r.model_brier!, ...(r.market_brier != null ? [r.market_brier] : [])]);
  const lo = Math.max(0, Math.floor((Math.min(...vals) - 0.01) * 50) / 50);
  const hi = Math.min(0.5, Math.ceil((Math.max(...vals) + 0.01) * 50) / 50);

  const px = (s: number) => M.left + ((s - x0) / Math.max(x1 - x0, 1)) * (W - M.left - M.right);
  // Inverted on purpose: a lower Brier is a better forecast, so it sits higher.
  const py = (v: number) => M.top + ((v - lo) / (hi - lo)) * (H - M.top - M.bottom);
  const bandW = Math.max((W - M.left - M.right) / Math.max(x1 - x0, 1), 3);

  const decades: number[] = [];
  for (let d = Math.ceil(x0 / 10) * 10; d <= x1; d += 10) decades.push(d);

  function runs(pick: (r: SeasonSummary) => number | null | undefined): string[] {
    const out: string[] = [];
    let cur: string[] = [];
    let prevSeason: number | null = null;
    for (const r of pts) {
      const v = pick(r);
      if (v == null || !Number.isFinite(v)) {
        if (cur.length > 1) out.push(cur.join(""));
        cur = [];
        prevSeason = null;
        continue;
      }
      const gap = prevSeason != null && r.season !== prevSeason + 1;
      if (gap) {
        if (cur.length > 1) out.push(cur.join(""));
        cur = [];
      }
      cur.push(`${cur.length ? "L" : "M"}${px(r.season).toFixed(1)},${py(v).toFixed(1)}`);
      prevSeason = r.season;
    }
    if (cur.length > 1) out.push(cur.join(""));
    return out;
  }

  const modelRuns = runs((r) => r.model_brier);
  const marketRuns = runs((r) => r.market_brier);
  const ticks = [lo, (lo + hi) / 2, hi];

  return (
    <figure className="m-0 min-w-0">
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs mb-2 text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden style={{ background: "var(--cat-1)", width: 14, height: 3, borderRadius: 2, display: "inline-block" }} />
          this site&rsquo;s model
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden style={{ background: "var(--cat-2)", width: 14, height: 3, borderRadius: 2, display: "inline-block" }} />
          the betting market
        </span>
        <span className="text-[var(--text-dim)]">higher is a better forecast</span>
      </figcaption>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto exc" role="img"
        aria-label={`Brier score by season for the site's model and for the closing betting line, ${x0} to ${x1}. Lower is better and the axis is inverted, so higher on the chart is a better forecast.`}>
        <style>{`
          .exc .bd .hit { fill: transparent; }
          .exc .bd .mk, .exc .bd .rd { opacity: 0; }
          .exc .bd:hover .mk, .exc .bd:hover .rd { opacity: 1; }
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
        {ticks.map((v) => (
          <text key={v} x={M.left - 6} y={py(v) + 3} textAnchor="end" fontSize={9} fill="var(--text-dim)" style={{ fontFamily: MONO }}>
            {v.toFixed(2)}
          </text>
        ))}

        {marketRuns.map((d, i) => (
          <path key={`mk${i}`} d={d} fill="none" stroke="var(--cat-2)" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {modelRuns.map((d, i) => (
          <path key={`md${i}`} d={d} fill="none" stroke="var(--cat-1)" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
        ))}

        {pts.map((r) => {
          const cx = px(r.season);
          const right = cx > W - M.right - 230;
          const beat = r.market_brier != null && r.model_brier != null && r.model_brier < r.market_brier;
          return (
            <g key={r.season} className="bd">
              <title>
                {`${r.season}  ${r.games} games` +
                 `\nmodel ${r.model_brier!.toFixed(4)}` +
                 (r.market_brier != null
                   ? `\nmarket ${r.market_brier.toFixed(4)}  (${beat ? "the model won" : "the market won"})`
                   : "\nno closing line survives from this season")}
              </title>
              <circle className="mk" cx={cx} cy={py(r.model_brier!)} r={3} fill="var(--cat-1)" />
              {r.market_brier != null ? <circle className="mk" cx={cx} cy={py(r.market_brier)} r={3} fill="var(--cat-2)" /> : null}
              <text className="rd" x={right ? cx - 6 : cx + 6} y={M.top + 9} textAnchor={right ? "end" : "start"}
                fontSize={10} fill="var(--text)" style={{ fontFamily: MONO }}>
                {`${r.season}  model ${r.model_brier!.toFixed(3)}${r.market_brier != null ? `  market ${r.market_brier.toFixed(3)}` : ""}`}
              </text>
              <rect className="hit" x={cx - bandW / 2} y={M.top} width={bandW} height={H - M.top - M.bottom} />
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
