import Link from "next/link";
import type { CSSProperties } from "react";
import type { NbaEloIndexRow } from "@/lib/nbaElo";
import { seasonLabel } from "@/lib/nba";

// Every season, reachable from any season. A port of the NFL's jumper, kept
// deliberately identical in behaviour so the two sports navigate the same way.
//
// 🔴 PREVIOUS AND NEXT IS NOT NAVIGATION, IT IS A CORRIDOR. Getting from 1966
// to 2004 through the arrows is thirty-eight clicks, so in practice a reader
// goes back to the archive and starts again, which is a page load to answer a
// question the page they were on could have answered. (Ashwin, 2026-09-17:
// "I don't like going back to the main page to find the seasons".)
//
// 🔴 COLLAPSED, BECAUSE IT IS A CONTROL AND NOT CONTENT. Eighty chips above
// the fold would push the season itself off the first screen on a phone, which
// is the opposite trade. It costs one tap and it is closed on every viewport,
// including desktop, because nobody arrives at the 1966 page wanting the list.
//
// Labels are the two-year form the rest of the NBA pages use: 2026 is shown as
// 2025-26, because a bare end-year is ambiguous for a sport whose season
// crosses the new year.

const MONO: CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const CARD: CSSProperties = { background: "var(--bg-card)", borderColor: "var(--border)" };

export default function SeasonJumper({
  rows,
  current,
}: {
  rows: NbaEloIndexRow[];
  current: number;
}) {
  if (rows.length < 2) return null;
  const decades = new Map<number, NbaEloIndexRow[]>();
  for (const r of rows) {
    const d = Math.floor(r.season / 10) * 10;
    (decades.get(d) ?? decades.set(d, []).get(d)!).push(r);
  }

  return (
    <details className="mt-3 rounded-xl border jump-open" style={CARD}>
      <summary className="cursor-pointer select-none px-3 min-h-11 flex items-center justify-between gap-3 text-sm text-[var(--text-muted)] hover:text-[var(--accent)]">
        <span>Jump to any season</span>
        <span className="text-xs text-[var(--text-dim)]" style={MONO}>
          {seasonLabel(rows[0].season)}&ndash;{seasonLabel(rows[rows.length - 1].season)}
        </span>
      </summary>
      <div className="border-t p-3 space-y-2" style={{ borderColor: "var(--border)" }}>
        {[...decades.entries()].sort((a, b) => b[0] - a[0]).map(([d, list]) => (
          <div key={d} className="flex items-baseline gap-3">
            <div
              className="text-xs font-semibold text-[var(--text-dim)] w-11 flex-shrink-0 tabular-nums pt-0.5"
              style={MONO}
            >
              {d}s
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[...list].sort((a, b) => b.season - a.season).map((r) => {
                const now = r.season === current;
                const who = r.top
                  ? [r.top.city, r.top.team].filter(Boolean).join(" ") || r.top.name
                  : null;
                return (
                  <Link
                    key={r.season}
                    href={`/teams/nba/season/${r.season}`}
                    aria-current={now ? "page" : undefined}
                    title={[
                      who ? `Top rated: ${who}` : null,
                      r.champion
                        ? `Champion: ${[r.champion.city, r.champion.team].filter(Boolean).join(" ")}`
                        : r.status === "upcoming"
                          ? "Not played yet"
                          : null,
                    ].filter(Boolean).join(" · ")}
                    className="text-xs px-3 min-h-11 sm:min-h-0 sm:px-2.5 sm:py-1 rounded-md border transition hover:border-[var(--accent)] hover:text-[var(--accent)] inline-flex items-center gap-1.5 tabular-nums"
                    style={{
                      background: now ? "var(--bg-card-hover)" : "var(--bg-card)",
                      borderColor: now ? "var(--accent)" : "var(--border)",
                      color: now ? "var(--accent)" : undefined,
                      fontWeight: now ? 700 : undefined,
                    }}
                  >
                    <span style={MONO}>{seasonLabel(r.season)}</span>
                    {r.status === "upcoming" ? (
                      <span
                        className="text-[9px] uppercase tracking-wider"
                        style={{ color: "var(--accent)" }}
                      >
                        next
                      </span>
                    ) : r.status !== "final" ? (
                      <span
                        className="text-[9px] uppercase tracking-wider"
                        style={{ color: "var(--accent)" }}
                      >
                        live
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
