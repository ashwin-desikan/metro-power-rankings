"use client";

// Filterable all-time Olympic medal table: Total / Summer / Winter scope
// toggle, re-sorted by gold within the selected scope. Client component fed
// plain rows by the server hub page.

import { useState } from "react";
import Link from "next/link";
import { flagCdnUrl } from "@/lib/international-display";

export type AllTimeRow = {
  slug: string;
  name: string;
  g: number; s: number; b: number; total: number;
  apps: number; summer_apps: number; winter_apps: number;
  first: number; last: number;
  summer: { g: number; s: number; b: number; first: number | null; last: number | null };
  winter: { g: number; s: number; b: number; first: number | null; last: number | null };
};

type Scope = "total" | "summer" | "winter";
const GOLD = "#d4af37";
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;

const SCOPES: { key: Scope; label: string }[] = [
  { key: "total", label: "Total" },
  { key: "summer", label: "Summer" },
  { key: "winter", label: "Winter" },
];

function view(row: AllTimeRow, scope: Scope) {
  if (scope === "summer") {
    return { g: row.summer.g, s: row.summer.s, b: row.summer.b,
             total: row.summer.g + row.summer.s + row.summer.b,
             apps: row.summer_apps, first: row.summer.first, last: row.summer.last };
  }
  if (scope === "winter") {
    return { g: row.winter.g, s: row.winter.s, b: row.winter.b,
             total: row.winter.g + row.winter.s + row.winter.b,
             apps: row.winter_apps, first: row.winter.first, last: row.winter.last };
  }
  return { g: row.g, s: row.s, b: row.b, total: row.total,
           apps: row.apps, first: row.first, last: row.last };
}

export default function AllTimeTable({ rows }: { rows: AllTimeRow[] }) {
  const [scope, setScope] = useState<Scope>("total");

  const visible = rows
    .map((r) => ({ row: r, v: view(r, scope) }))
    .filter(({ v }) => v.apps > 0)
    .sort((a, b) => b.v.g - a.v.g || b.v.s - a.v.s || b.v.b - a.v.b);

  return (
    <div>
      <div className="flex gap-1.5 mb-3">
        {SCOPES.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setScope(s.key)}
            className="text-xs px-3 py-1.5 rounded-md border transition-colors"
            style={{
              backgroundColor: scope === s.key ? "var(--accent)" : "var(--bg-card)",
              borderColor: scope === s.key ? "var(--accent)" : "var(--border)",
              color: scope === s.key ? "var(--bg)" : "var(--text)",
              fontWeight: scope === s.key ? 600 : 400,
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="rounded-xl border overflow-x-auto max-h-[560px] overflow-y-auto" style={card}>
        <table className="w-full text-sm min-w-[680px]">
          <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
            <tr className="text-left text-xs text-[var(--text-muted)]">
              <th className="py-2 px-3 font-medium">#</th>
              <th className="py-2 px-3 font-medium">Team</th>
              <th className="py-2 px-3 text-right font-medium" style={{ color: GOLD }}>G</th>
              <th className="py-2 px-3 text-right font-medium">S</th>
              <th className="py-2 px-3 text-right font-medium">B</th>
              <th className="py-2 px-3 text-right font-medium">Total</th>
              <th className="py-2 px-3 text-right font-medium">Games</th>
              <th className="py-2 px-3 font-medium">Span</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(({ row, v }, i) => (
              <tr key={row.slug} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-1.5 px-3 tabular-nums" style={mono}>{i + 1}</td>
                <td className="py-1.5 px-3 font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    {flagCdnUrl(row.slug) && (
                      <img src={flagCdnUrl(row.slug)!} alt="" aria-hidden width={20} height={15} className="inline-block" />
                    )}
                    <Link href={`/teams/olympics/${row.slug}`} className="hover:text-[var(--accent)]">
                      {row.name}
                    </Link>
                  </span>
                </td>
                <td className="py-1.5 px-3 text-right tabular-nums font-semibold"
                    style={{ ...mono, color: v.g > 0 ? GOLD : "var(--text-dim)" }}>
                  {v.g.toLocaleString()}
                </td>
                <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{v.s.toLocaleString()}</td>
                <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{v.b.toLocaleString()}</td>
                <td className="py-1.5 px-3 text-right tabular-nums font-semibold" style={mono}>{v.total.toLocaleString()}</td>
                <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{v.apps}</td>
                <td className="py-1.5 px-3 tabular-nums text-xs text-[var(--text-muted)]" style={mono}>
                  {v.first && v.last ? `${v.first}–${v.last}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
