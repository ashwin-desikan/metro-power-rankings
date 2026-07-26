"use client";

import Link from "next/link";
import CrestIcon from "@/app/teams/_shared/CrestIcon";
import type { WLiveGroupVM } from "@/lib/wLive";

// Standings table for a women's live league (Liga F / NWSL / FA WSL). Rows are
// pre-resolved server-side; clubs with a portal page deep-link to it.

const COLS = ["P", "W", "D", "L", "GF", "GA", "GD", "Pts"];
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

export default function WLiveTable({ groups }: { groups: WLiveGroupVM[] }) {
  const nonEmpty = groups.filter((g) => g.rows.length > 0);
  if (nonEmpty.length === 0) return null;
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
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r, i) => (
                  <tr key={`${r.name}-${i}`} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
