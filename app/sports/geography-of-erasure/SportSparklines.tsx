import { leagueLabel } from "@/lib/movesShared";

// Small multiples: one sparkline strip per league, moves-per-decade. Server
// component (no interaction needed - the reading key is the peak decade,
// already named in text beside each strip). Capped at --cat-1..3 per
// DESIGN-STANDARDS 7 (small multiples are capped at three series); here
// every strip is its own single-colour sparkline, so it uses --cat-1 alone
// with the peak bar in --cat-2 for a second, minimal encoding of "where the
// peak is" without adding a real second series.
export default function SportSparklines({
  decades,
  byLeagueDecade,
  busiest,
}: {
  decades: string[];
  byLeagueDecade: Record<string, Record<string, number>>;
  busiest: Record<string, string | null>;
}) {
  const leagues = Object.keys(byLeagueDecade).sort(
    (a, b) => totalOf(byLeagueDecade[b]) - totalOf(byLeagueDecade[a]),
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {leagues.map((lg) => {
        const counts = decades.map((d) => byLeagueDecade[lg]?.[d] ?? 0);
        const max = Math.max(...counts, 1);
        const total = totalOf(byLeagueDecade[lg]);
        const peak = busiest[lg];
        const W = 200, H = 40;
        const bw = W / decades.length;
        return (
          <div
            key={lg}
            className="rounded-xl border p-3 min-w-0"
            style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
          >
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
              <span className="font-semibold text-sm text-[var(--text)]">{leagueLabel(lg)}</span>
              <span className="text-xs tabular-nums text-[var(--text-muted)]">{total} moves</span>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${leagueLabel(lg)} moves per decade`}>
              {counts.map((v, i) => {
                if (v <= 0) return null;
                const h = (v / max) * (H - 4);
                const isPeak = decades[i] === peak;
                return (
                  <rect
                    key={i}
                    x={i * bw + bw * 0.15}
                    y={H - h}
                    width={bw * 0.7}
                    height={h}
                    fill={isPeak ? "var(--cat-2)" : "var(--cat-1)"}
                  />
                );
              })}
            </svg>
            <p className="mt-1.5 text-xs text-[var(--text-dim)]">
              Busiest decade: <span className="text-[var(--text-muted)] font-medium">{peak ?? "—"}</span>
            </p>
          </div>
        );
      })}
    </div>
  );
}

function totalOf(m: Record<string, number> | undefined): number {
  if (!m) return 0;
  return Object.values(m).reduce((a, b) => a + b, 0);
}
