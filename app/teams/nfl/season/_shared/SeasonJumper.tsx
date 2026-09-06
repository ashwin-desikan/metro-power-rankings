import Link from "next/link";
import type { CSSProperties } from "react";
import type { NflEloIndexRow } from "@/lib/nflElo";

// Every season, reachable from any season.
//
// 🔴 PREVIOUS AND NEXT IS NOT NAVIGATION, IT IS A CORRIDOR. Getting from 1966
// to 2004 through the arrows is thirty-eight clicks, so in practice a reader
// went back to the archive and started again, which is a page load to answer a
// question the page they were on could have answered. Every season page now
// carries the whole set.
//
// 🔴 COLLAPSED, BECAUSE IT IS A CONTROL AND NOT CONTENT. 107 chips above the
// fold would push the season itself off the first screen on a phone, which is
// the opposite trade. It costs one tap and it is closed on every viewport,
// including desktop, because nobody arrives at the 1966 page wanting the list.

const MONO: CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const CARD: CSSProperties = { background: "var(--bg-card)", borderColor: "var(--border)" };

export default function SeasonJumper({
  rows,
  current,
}: {
  rows: NflEloIndexRow[];
  current: number;
}) {
  if (rows.length < 2) return null;
  const decades = new Map<number, NflEloIndexRow[]>();
  for (const r of rows) {
    const d = Math.floor(r.season / 10) * 10;
    (decades.get(d) ?? decades.set(d, []).get(d)!).push(r);
  }

  return (
    <details className="mt-3 rounded-xl border jump-open" style={CARD}>
      <summary className="cursor-pointer select-none px-3 min-h-11 flex items-center justify-between gap-3 text-sm text-[var(--text-muted)] hover:text-[var(--accent)]">
        <span>Jump to any season</span>
        <span className="text-xs text-[var(--text-dim)]" style={MONO}>
          {rows[0].season}&ndash;{rows[rows.length - 1].season}
        </span>
      </summary>
      <div className="border-t p-3 space-y-2" style={{ borderColor: "var(--border)" }}>
        {[...decades.entries()].sort((a, b) => b[0] - a[0]).map(([d, list]) => (
          <div key={d} className="flex items-baseline gap-3">
            <div className="text-xs font-semibold text-[var(--text-dim)] w-11 flex-shrink-0 tabular-nums pt-0.5" style={MONO}>{d}s</div>
            <div className="flex flex-wrap gap-1.5">
              {list.map((r) => {
                const now = r.season === current;
                const who = r.top ? [r.top.city, r.top.team].filter(Boolean).join(" ") || r.top.name : null;
                return (
                  <Link
                    key={r.season}
                    href={`/teams/nfl/season/${r.season}`}
                    aria-current={now ? "page" : undefined}
                    title={[
                      who ? `Top rated: ${who}` : null,
                      r.champion ? `Champion: ${[r.champion.city, r.champion.team].filter(Boolean).join(" ")}` : (r.complete ? null : "Not played yet"),
                    ].filter(Boolean).join(" · ")}
                    className="text-xs px-3 min-h-11 sm:min-h-0 sm:px-2.5 sm:py-1 rounded-md border transition hover:border-[var(--accent)] hover:text-[var(--accent)] inline-flex items-center gap-1.5 tabular-nums"
                    style={{
                      background: now ? "var(--bg-card-hover)" : "var(--bg-card)",
                      borderColor: now ? "var(--accent)" : "var(--border)",
                      color: now ? "var(--accent)" : undefined,
                      fontWeight: now ? 700 : undefined,
                    }}
                  >
                    <span style={MONO}>{r.season}</span>
                    {r.status !== "final" ? (
                      <span className="text-[9px] uppercase tracking-wider" style={{ color: "var(--accent)" }}>live</span>
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
