"use client";

import Link from "next/link";
import CrestIcon from "@/app/teams/_shared/CrestIcon";
import type { WLiveGroupVM } from "@/lib/wLive";

// Standings table for a women's live league (Liga F / NWSL / FA WSL). Rows are
// pre-resolved server-side; clubs with a portal page deep-link to it.

const COLS = ["P", "W", "D", "L", "GF", "GA", "GD", "Pts"];
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

// Optional playoff odds, keyed by the row's portal slug. Only NWSL passes
// these today (scripts/predictions/build_season_sims.py). When absent the
// table renders exactly as before, so WSL and Liga F are untouched.
export type WLiveOdds = { po: string; title: string };

export default function WLiveTable({
  groups,
  odds,
  playoffSpots,
  oddsLabels,
}: {
  groups: WLiveGroupVM[];
  odds?: Map<string, WLiveOdds> | null;
  /** Rows ranked at or above this get the green playoff tint plus a cut line. */
  playoffSpots?: number;
  oddsLabels?: [string, string];
}) {
  const nonEmpty = groups.filter((g) => g.rows.length > 0);
  if (nonEmpty.length === 0) return null;
  const showOdds = !!odds && odds.size > 0;
  const [poLabel, titleLabel] = oddsLabels ?? ["PO%", "Title%"];
  return (
    <div className="space-y-4">
      {nonEmpty.map((g, gi) => (
        <div key={gi}>
          {nonEmpty.length > 1 && g.label && (
            <div className="text-[11px] font-semibold text-[var(--text-muted)] mb-1">{g.label}</div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[420px] tabular-nums">
              <thead>
                <tr className="text-xs text-[var(--text-muted)] uppercase tracking-wide border-b" style={{ borderColor: "var(--border)" }}>
                  <th className="py-2 pr-2 text-right font-medium w-8">#</th>
                  <th className="py-2 px-2 text-left font-medium">Club</th>
                  {COLS.map((c) => (
                    <th key={c} className={`py-2 px-2 text-right font-medium ${c === "GF" || c === "GA" ? "hidden sm:table-cell" : ""}`}>{c}</th>
                  ))}
                  {showOdds && <th className="py-2 px-2 text-right font-medium">{poLabel}</th>}
                  {showOdds && <th className="py-2 px-2 text-right font-medium">{titleLabel}</th>}
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r, i) => {
                  const rank = r.rank ?? i + 1;
                  const po = !!playoffSpots && rank <= playoffSpots;
                  // Cut line under the last qualifying row. Rides an inset
                  // shadow so the next row's border-b stays intact, matching
                  // /sports/standings.
                  const cut = po && rank === playoffSpots && i < g.rows.length - 1;
                  const o = odds?.get(r.slug ?? "");
                  return (
                  <tr key={`${r.name}-${i}`} className="border-b last:border-b-0"
                    style={{
                      borderColor: "var(--border)",
                      ...(po ? { background: "rgba(34,197,94,0.06)" } : null),
                      ...(cut ? { boxShadow: "inset 0 -2px 0 rgba(34,197,94,0.45)" } : null),
                    }}>
                    <td className="py-1.5 pr-2 text-right text-[var(--text-dim)]" style={mono}>{r.rank ?? i + 1}</td>
                    <td className="py-1.5 px-2">
                      <span className="inline-flex items-center gap-2">
                        <CrestIcon name={r.name} size={18} className="flex-shrink-0" />
                        {r.slug ? (
                          <Link href={`/teams/wfootball/clubs/${r.slug}`} className="hover:underline font-medium">{r.name}</Link>
                        ) : (
                          <span className="font-medium">{r.name}</span>
                        )}
                      </span>
                    </td>
                    {r.cells.map((c, j) => (
                      <td key={j} className={`py-1.5 px-2 text-right ${COLS[j] === "GF" || COLS[j] === "GA" ? "hidden sm:table-cell" : ""} ${COLS[j] === "Pts" ? "font-semibold" : "text-[var(--text-muted)]"}`} style={mono}>{c}</td>
                    ))}
                    {showOdds && <td className="py-1.5 px-2 text-right text-[var(--text-muted)]" style={mono}>{o?.po ?? "—"}</td>}
                    {showOdds && <td className="py-1.5 px-2 text-right text-[var(--text-muted)]" style={mono}>{o?.title ?? "—"}</td>}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
