"use client";

// Sortable Most Decorated table for European tournament hubs. Server page
// passes the most_decorated array (already sorted by Cups desc on the
// ETL side); this component re-sorts in the browser when the user clicks
// a column header.
//
// The table now includes clubs that reached the final but never won. Those
// rows have champion_count = 0 and sit at the bottom under the default
// Cups sort. Clicking the Finals header surfaces them next to clubs with
// the same total number of final appearances.

import { useMemo, useState } from "react";
import Link from "next/link";
import type { EuropeanMostDecorated } from "@/lib/football";
import { ResponsiveTable, RankRow } from "@/app/teams/_shared/ResponsiveTable";
import { DataBar } from "@/app/_shared/DataBar";

type SortKey = "cups" | "finals" | "last_won" | "last_final" | "club";
type SortDir = "asc" | "desc";

type Props = {
  rows: EuropeanMostDecorated[];
};

function SortableTh({
  label,
  active,
  dir,
  align,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  align: "left" | "right";
  onClick: () => void;
  className?: string;
}) {
  const arrow = active ? (dir === "asc" ? "↑" : "↓") : "↕";
  return (
    <th
      className={`py-2 px-2 font-medium whitespace-nowrap align-bottom ${
        align === "right" ? "text-right" : "text-left"
      } ${className ?? ""}`}
    >
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 py-2 hover:text-[var(--accent)] transition"
        style={{
          color: active ? "var(--accent)" : "inherit",
          fontWeight: "inherit",
        }}
        title={`Sort by ${label}`}
      >
        <span>{label}</span>
        <span className="text-[10px] opacity-70" aria-hidden>{arrow}</span>
      </button>
    </th>
  );
}

export default function MostDecoratedTable({ rows }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("cups");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [announce, setAnnounce] = useState("");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Numeric and date columns default desc (largest / newest first);
      // club name defaults asc (A-Z).
      setSortDir(key === "club" ? "asc" : "desc");
    }
  }

  const sorted = useMemo(() => {
    const arr = [...rows];
    const dirMul = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (sortKey === "cups") {
        const diff = (a.champion_count - b.champion_count) * dirMul;
        if (diff !== 0) return diff;
        // Tiebreaker: finals desc, then alphabetical.
        const f = (b.finals_count - a.finals_count);
        if (f !== 0) return f;
        return a.cur_name.localeCompare(b.cur_name);
      }
      if (sortKey === "finals") {
        const diff = (a.finals_count - b.finals_count) * dirMul;
        if (diff !== 0) return diff;
        const c = (b.champion_count - a.champion_count);
        if (c !== 0) return c;
        return a.cur_name.localeCompare(b.cur_name);
      }
      if (sortKey === "last_won") {
        // Null last_won goes to the bottom regardless of direction, since
        // "never won" is not a meaningful value to interleave with years.
        const al = a.last_won;
        const bl = b.last_won;
        if (al === null && bl === null) return a.cur_name.localeCompare(b.cur_name);
        if (al === null) return 1;
        if (bl === null) return -1;
        const diff = (al - bl) * dirMul;
        if (diff !== 0) return diff;
        return a.cur_name.localeCompare(b.cur_name);
      }
      if (sortKey === "last_final") {
        const al = a.last_final;
        const bl = b.last_final;
        if (al === null && bl === null) return a.cur_name.localeCompare(b.cur_name);
        if (al === null) return 1;
        if (bl === null) return -1;
        const diff = (al - bl) * dirMul;
        if (diff !== 0) return diff;
        return a.cur_name.localeCompare(b.cur_name);
      }
      // club name
      return a.cur_name.localeCompare(b.cur_name) * dirMul;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  // Cups is this table's argument (the default sort, and what "most
  // decorated" means); max is the column's own maximum, computed once over
  // the full row set, unaffected by the active sort/column.
  const cupsMax = useMemo(() => Math.max(...rows.map((r) => r.champion_count), 1), [rows]);

  return (
    <section
      className="rounded-xl border p-5 mb-6"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <h2 className="text-base font-semibold">Most decorated</h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Every club that has reached a final, ranked by titles won. Finals shows total final
        appearances; clubs at the bottom with zero Cups are programs that reached the final but
        never lifted the trophy. Click any column header to sort.
      </p>
      {/* Mobile sort control: the desktop header buttons (onClick={() => toggleSort(k)})
          are hidden along with the table below sm, so cards need their own way
          to drive the same sortKey/sortDir state - a Sort-by select (reuses
          toggleSort, which already sets each column's sensible default
          direction) plus a direction flip button. */}
      <div
        className="sticky top-20 z-30 flex items-center gap-2 py-2 mb-1 sm:hidden"
        style={{ backgroundColor: "var(--bg)" }}
      >
        <label className="flex-1 flex items-center gap-2 text-xs min-w-0">
          <span className="uppercase tracking-wide text-[var(--text-dim)] flex-shrink-0">Sort</span>
          <select
            value={sortKey}
            onChange={(e) => {
              const label = e.target.options[e.target.selectedIndex]?.text ?? "";
              toggleSort(e.target.value as SortKey);
              setAnnounce(`Sorted by ${label}`);
            }}
            className="flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            <option value="club">Club</option>
            <option value="cups">Cups</option>
            <option value="finals">Finals</option>
            <option value="last_won">Last won</option>
            <option value="last_final">Last final</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            toggleSort(sortKey);
            setAnnounce(`Sort direction: ${sortDir === "asc" ? "descending" : "ascending"}`);
          }}
          aria-label={sortDir === "asc" ? "Sort ascending" : "Sort descending"}
          className="rounded-lg border px-3 py-2 text-sm flex-shrink-0"
          style={{ borderColor: "var(--border)", color: "var(--text)" }}
        >
          {sortDir === "asc" ? "▲" : "▼"}
        </button>
        <span aria-live="polite" className="sr-only">{announce}</span>
      </div>

      <ResponsiveTable
        variant="list"
        mobileRows={sorted.map((d, i) => (
          <RankRow
            key={d.cur_name}
            rank={i + 1}
            name={
              d.slug ? (
                <Link href={`/teams/football/${d.slug}`} className="hover:underline truncate">
                  {d.cur_name}
                </Link>
              ) : (
                <span className="truncate">{d.cur_name}</span>
              )
            }
            sub={
              <>
                {(d.finals_count ?? d.champion_count)} finals{(d.finals_lost ?? 0) > 0 ? ` (${d.finals_lost} L)` : ""} · won {d.last_won ?? "—"} · final {d.last_final ?? "—"}
              </>
            }
            right={d.champion_count > 0 ? d.champion_count : "—"}
            rightSub="titles"
          />
        ))}
      >
        <table className="w-full text-sm" data-sticky-col="2">
          <thead>
            <tr
              className="text-xs text-[var(--text-muted)] uppercase tracking-wide border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <th className="py-2 pr-2 text-right font-medium w-10 align-bottom">#</th>
              <SortableTh
                label="Club"
                active={sortKey === "club"}
                dir={sortDir}
                align="left"
                onClick={() => toggleSort("club")}
              />
              <SortableTh
                label="Cups"
                active={sortKey === "cups"}
                dir={sortDir}
                align="right"
                onClick={() => toggleSort("cups")}
              />
              <SortableTh
                label="Finals"
                active={sortKey === "finals"}
                dir={sortDir}
                align="right"
                onClick={() => toggleSort("finals")}
              />
              <SortableTh
                label="Last won"
                active={sortKey === "last_won"}
                dir={sortDir}
                align="right"
                onClick={() => toggleSort("last_won")}
                className="hidden sm:table-cell"
              />
              <SortableTh
                label="Last final"
                active={sortKey === "last_final"}
                dir={sortDir}
                align="right"
                onClick={() => toggleSort("last_final")}
                className="hidden md:table-cell"
              />
            </tr>
          </thead>
          <tbody>
            {sorted.map((d, i) => (
              <tr key={d.cur_name} className="border-b" style={{ borderColor: "var(--border)" }}>
                <td className="py-1.5 pr-2 text-right tabular-nums text-[var(--text-muted)]">{i + 1}</td>
                <td className="py-1.5 px-2">
                  {d.slug ? (
                    <Link href={`/teams/football/${d.slug}`} className="hover:underline font-medium">
                      {d.cur_name}
                    </Link>
                  ) : (
                    <span className="font-medium">{d.cur_name}</span>
                  )}
                </td>
                <td className="py-1.5 px-2 text-right">
                  <DataBar v={d.champion_count > 0 ? d.champion_count : null} max={cupsMax} width={72} label="cups" />
                </td>
                <td className="py-1.5 px-2 text-right tabular-nums">
                  {(d.finals_count ?? d.champion_count)}
                  {(d.finals_lost ?? 0) > 0 && (
                    <span className="text-[var(--text-muted)] text-xs"> ({d.finals_lost} L)</span>
                  )}
                </td>
                <td className="py-1.5 px-2 text-right tabular-nums hidden sm:table-cell">
                  {d.last_won ?? <span className="text-[var(--text-dim)]">—</span>}
                </td>
                <td className="py-1.5 px-2 text-right tabular-nums hidden md:table-cell">
                  {d.last_final ?? <span className="text-[var(--text-dim)]">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ResponsiveTable>
    </section>
  );
}
