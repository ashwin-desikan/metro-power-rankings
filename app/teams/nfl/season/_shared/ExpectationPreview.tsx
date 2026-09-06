import Link from "next/link";
import type { CSSProperties } from "react";
import { getNflExpectation, getNflExpectationSeason } from "@/lib/nflExpectation";

// What the season looked like to a model that had to say so beforehand.
//
// 🔴 A LINK IS NOT A SURFACE. /teams/nfl/expectation/[season] holds a priced
// game log for all 107 seasons and it was reachable from the season hub as one
// line of blue text among three, which is the same as not existing. A reader
// will click into a board they have already seen a row of; they will not click
// a noun. So the panel shows the season's actual score against the betting
// market and its three most surprising results, and THEN offers the log.
//
// 🔴 THE SCORE IS REPORTED WHICHEVER WAY IT FELL. Brier is lower-is-better and
// the model loses to the market in most seasons. Printing that plainly is the
// only thing that makes the seasons it wins worth reading.

const MONO: CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const CARD: CSSProperties = { background: "var(--bg-card)", borderColor: "var(--border)" };

function pct(p: number): string {
  return `${(p * 100).toFixed(0)}%`;
}

export default async function ExpectationPreview({ season }: { season: number }) {
  const [index, file] = await Promise.all([
    getNflExpectation().catch(() => null),
    getNflExpectationSeason(season).catch(() => null),
  ]);
  const row = index?.seasons.find((s) => s.season === season) ?? null;
  const games = file?.games ?? [];
  if (!row && !games.length) return null;

  // The most surprising results of the season: the probability the model put on
  // the side that lost. Ties carry no surprise and are excluded by the builder.
  const upsets = games
    .filter((g) => typeof g.surprise === "number" && g.result)
    .sort((a, b) => (b.surprise ?? 0) - (a.surprise ?? 0))
    .slice(0, 3);

  const model = row?.model_brier ?? null;
  const market = row?.market_brier ?? null;
  const beat = model != null && market != null ? model < market : null;
  const graded = row?.games ?? games.length;

  return (
    <div className="rounded-2xl border p-4 sm:p-5 min-w-0" style={CARD}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-base font-semibold">
          The {season} season, priced before it happened
        </h3>
        <Link href={`/teams/nfl/expectation/${season}`} className="text-sm text-[var(--accent)] hover:underline whitespace-nowrap">
          Open the {season} game log &rarr;
        </Link>
      </div>

      <p className="mt-1.5 text-[13.5px] text-[var(--text-muted)] max-w-3xl">
        Every one of the {graded.toLocaleString()} games that season carries the probability the model gave
        the home side before kick-off, the result, and what the betting market said.{" "}
        {model != null && market != null ? (
          <>
            Over the season the model scored{" "}
            <span className="tabular-nums text-[var(--text)]" style={MONO}>{model.toFixed(4)}</span> against the
            market&rsquo;s <span className="tabular-nums text-[var(--text)]" style={MONO}>{market.toFixed(4)}</span>{" "}
            on Brier, where lower is better, so{" "}
            <span className="text-[var(--text)]">{beat ? "the model won that year" : "the market won that year"}</span>.
          </>
        ) : model != null ? (
          <>The model scored <span className="tabular-nums text-[var(--text)]" style={MONO}>{model.toFixed(4)}</span> on
            Brier. No usable closing line survives from {season}, so there is nothing to score it against.</>
        ) : null}
      </p>

      {upsets.length ? (
        <>
          <div className="mt-3 text-[11px] uppercase tracking-wider text-[var(--text-dim)]" style={MONO}>
            The three results it got most wrong
          </div>
          <ul className="mt-1 m-0 p-0 list-none">
            {upsets.map((g) => {
              const homeWon = g.result === "H";
              const winner = homeWon ? g.home_era : g.away_era;
              const loser = homeWon ? g.away_era : g.home_era;
              const wSlug = homeWon ? g.home_slug : g.away_slug;
              return (
                <li key={g.game_id} className="flex items-baseline gap-2 py-1 border-t first:border-t-0 text-[13px]" style={{ borderColor: "var(--border)" }}>
                  <span className="tabular-nums text-[var(--text-dim)] text-[11px] w-16 flex-shrink-0" style={MONO}>
                    {g.playoff ? (g.round ?? "playoff") : `wk ${g.week}`}
                  </span>
                  <span className="min-w-0 flex-1">
                    {wSlug ? (
                      <Link href={`/teams/nfl/${wSlug}`} className="hover:text-[var(--accent)] hover:underline">{winner}</Link>
                    ) : winner}
                    <span className="text-[var(--text-muted)]"> beat {loser}</span>
                    {g.score ? <span className="ml-1.5 tabular-nums text-[var(--text-dim)]" style={MONO}>{g.score}</span> : null}
                  </span>
                  <span className="text-[var(--text-muted)] tabular-nums text-[12px] whitespace-nowrap flex-shrink-0" style={MONO}>
                    given {pct(1 - (g.surprise ?? 0))}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}
