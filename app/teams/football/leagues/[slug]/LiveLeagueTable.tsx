"use client";

import { useState } from "react";
import Link from "next/link";
import CrestIcon from "@/app/teams/_shared/CrestIcon";
import { Tabs } from "@/app/teams/_shared/Tabs";
import { Badge } from "@/app/teams/_shared/Badge";
import { ResponsiveTable, RankRow } from "@/app/teams/_shared/ResponsiveTable";

// Live standings for a whole country: a switcher across every tracked league/level
// (Premier League, Championship, League One … and, once wired, the domestic cups),
// each table pre-resolved server-side and fed in as serializable data.

export type LiveCell = number | string;
export type LiveTableRow = { rank: number | null; name: string; slug: string | null; badge: string | null; cup: string[] | null; cells: LiveCell[] };
export type LiveTableGroup = { label: string | null; rows: LiveTableRow[] };
export type LiveCompTable = { id: number; name: string; level: number | null; groups: LiveTableGroup[] };

const COLS = ["P", "W", "D", "L", "GF", "GA", "GD", "Pts"];
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const cardStyle = { background: "var(--bg-card)", borderColor: "var(--border)" } as const;
const BADGES: Record<string, { label: string; bg: string; fg: string; title: string }> = {
  UCL: { label: "UCL", bg: "rgba(212,175,55,0.22)", fg: "#d4af37", title: "In the Champions League" },
  UEL: { label: "UEL", bg: "rgba(255,138,0,0.18)", fg: "#ff8a00", title: "In the Europa League" },
  UECL: { label: "UECL", bg: "rgba(16,185,129,0.18)", fg: "#10b981", title: "In the Conference League" },
  LIB: { label: "LIB", bg: "rgba(59,130,246,0.18)", fg: "#3b82f6", title: "In the Copa Libertadores" },
};

function Table({ group }: { group: LiveTableGroup }) {
  return (
    <ResponsiveTable
      compact
      variant="list"
      className="rounded-lg border"
      style={cardStyle}
      mobileRows={group.rows.map((r, i) => {
        const b = r.badge ? BADGES[r.badge] : undefined;
        return (
          <RankRow
            key={i}
            rank={r.rank ?? i + 1}
            name={
              <>
                <CrestIcon name={r.name} size={15} className="flex-shrink-0" />
                {r.slug ? <Link href={`/teams/football/${r.slug}`} className="hover:text-[var(--accent)] truncate">{r.name}</Link> : <span className="truncate">{r.name}</span>}
                {b && <span className="flex-shrink-0"><Badge color={{ bg: b.bg, fg: b.fg }}>{b.label}</Badge></span>}
              </>
            }
            sub={<>{r.cells[0]} P · {r.cells[1]}-{r.cells[2]}-{r.cells[3]} · {typeof r.cells[6] === "number" && r.cells[6] > 0 ? `+${r.cells[6]}` : r.cells[6]} GD</>}
            right={r.cells[7]}
            rightSub="pts"
          />
        );
      })}
    >
      <table className="w-full text-sm min-w-[480px]" data-sticky-col="2">
        <thead>
          <tr className="text-xs text-[var(--text-muted)] uppercase tracking-wide border-b" style={{ borderColor: "var(--border)" }}>
            <th className="py-2 text-left font-medium">Pos</th>
            <th className="py-2 text-left font-medium">Club</th>
            <th className="py-2 pl-2 text-left font-medium">Europe</th>
            <th className="py-2 pl-2 text-left font-medium">Cup</th>
            {COLS.map((c) => (
              <th key={c} className={`py-2 text-right font-medium ${c === "GF" || c === "GA" ? "hidden sm:table-cell" : ""}`}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {group.rows.map((r, i) => {
            const b = r.badge ? BADGES[r.badge] : undefined;
            return (
              <tr key={i} className="border-b" style={{ borderColor: "var(--border)" }}>
                <td className="py-1.5 tabular-nums text-[var(--text-muted)]" style={mono}>{r.rank ?? i + 1}</td>
                <td className="py-1.5">
                  <span className="inline-flex items-center gap-2">
                    <CrestIcon name={r.name} size={20} className="flex-shrink-0" />
                    {r.slug ? <Link href={`/teams/football/${r.slug}`} className="hover:underline font-medium">{r.name}</Link> : <span className="font-medium">{r.name}</span>}
                  </span>
                </td>
                <td className="py-1.5 pl-2">
                  {b && (
                    <span title={b.title}>
                      <Badge color={{ bg: b.bg, fg: b.fg }}>{b.label}</Badge>
                    </span>
                  )}
                </td>
                <td className="py-1.5 pl-2">
                  {r.cup && r.cup.length > 0 && (
                    <span title={`Still alive: ${r.cup.join(", ")}`}>
                      <Badge color={{ bg: "rgba(139,92,246,0.18)", fg: "#8b5cf6" }}>Cup{r.cup.length > 1 ? ` ×${r.cup.length}` : ""}</Badge>
                    </span>
                  )}
                </td>
                {r.cells.map((c, j) => (
                  <td key={j} className={`py-1.5 text-right tabular-nums ${COLS[j] === "GF" || COLS[j] === "GA" ? "hidden sm:table-cell" : ""} ${COLS[j] === "Pts" ? "font-semibold" : ""}`} style={mono}>{c}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </ResponsiveTable>
  );
}

export default function LiveLeagueTable({ tables, defaultId, season }: { tables: LiveCompTable[]; defaultId: number; season: string }) {
  const [active, setActive] = useState(defaultId);
  const t = tables.find((x) => x.id === active) ?? tables[0];
  if (!t) return null;
  return (
    <section className="rounded-xl border p-5 mb-6" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <h2 className="text-base font-semibold">{season} standings <span className="text-[var(--text-muted)] font-normal text-sm">· live</span></h2>
      </div>
      {tables.length > 1 && (
        <Tabs
          className="mb-4"
          aria-label="League / tier"
          active={String(t.id)}
          onChange={(key) => setActive(Number(key))}
          items={tables.map((x) => ({
            key: String(x.id),
            label: x.name,
            badge: x.level != null ? <span className="text-[var(--text-dim)]"> · T{x.level}</span> : undefined,
          }))}
        />
      )}
      {t.groups.map((g, gi) => (
        <div key={gi} className={gi > 0 ? "mt-4" : ""}>
          {t.groups.length > 1 && g.label && <div className="text-[11px] font-semibold text-[var(--text-muted)] mb-1">{g.label}</div>}
          <Table group={g} />
        </div>
      ))}
      <p className="mt-3 text-[11px] text-[var(--text-dim)]">Live tables, refreshed daily. Europe badges mark clubs currently active in a continental competition and clear on elimination. Domestic cups coming soon.</p>
    </section>
  );
}
