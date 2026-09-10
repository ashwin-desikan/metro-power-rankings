"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { ResponsiveTable, RankRow } from "@/app/teams/_shared/ResponsiveTable";

// THE ranked-board primitive. A board is sortable on every column that
// carries a value, on the desktop table (click the heading; numeric columns
// start largest-first, a second click reverses, a third restores the
// board's own order) and on the phone list (one Sort select and a direction
// button above the list, driving the same state), and the rank column is
// the POSITION under the current sort, so "#1" always means first by what
// the reader chose. DESIGN-STANDARDS §4 (added 2026-09-10 after Ashwin
// found a fourth new board shipped with a fixed order and no phone control).
//
// The caller keeps full control of cell markup: each row passes its <td>
// CONTENTS per column (links, crests, signed figures) and the phone row's
// name/sub/right pieces; this component owns column classes, the header
// interaction, the row order and the two-environment shell. Cells are
// plain ReactNodes, so a server component can build them and hand the
// board down; nothing here needs a function prop.
//
// 🔴 EVERY COLUMN WITH A NUMBER IS SORTABLE. `sortable: false` is for a
// column that has no order (a text note, a biggest-move cell). A sort value
// of null sorts to the bottom in both directions.

export type BoardSortValue = string | number | null;

export type BoardCol = {
  key: string;
  label: ReactNode;
  /** Right-aligned; numeric columns are. */
  right?: boolean;
  /** Off by default only for columns with no order. */
  sortable?: boolean;
  /**
   * The narrowest viewport the column appears at. `true` (or "sm") hides it
   * below 640px; "md" below 768, "lg" below 1024, "xl" below 1280, "2xl"
   * below 1536. 🔴 A BOARD FITS ITS CONTAINER AT EVERY WIDTH (§4, 2026-09-10):
   * give every column beyond the identity and the two or three that make the
   * argument a tier, so the table never needs its scroll box on a real
   * screen. The phone list under 640px carries the whole row regardless.
   * Never the first two columns.
   */
  demote?: boolean | "sm" | "md" | "lg" | "xl" | "2xl";
  /** Extra th classes (widths, nowrap). */
  className?: string;
  /** A heading tooltip; the label stays short. */
  title?: string;
  /** Inline style for every td in the column (a highlighted column, say). */
  tdStyle?: CSSProperties;
  /** The phone Sort option's text when `label` is not a plain string; keep it short, the select is as wide as its longest option. */
  short?: string;
};

export type BoardRow = {
  key: string;
  /** One value per sortable column key. */
  sort: Record<string, BoardSortValue>;
  /** One node per column, in column order. */
  cells: ReactNode[];
  /** The phone row (RankRow) pieces; the rank is supplied by the board. */
  mobile: { name: ReactNode; sub?: ReactNode; right?: ReactNode; rightSub?: ReactNode; highlight?: boolean };
};

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
// Spelled out in full so Tailwind sees each class.
const TIER: Record<string, string> = {
  sm: " hidden sm:table-cell",
  md: " hidden md:table-cell",
  lg: " hidden lg:table-cell",
  xl: " hidden xl:table-cell",
  "2xl": " hidden 2xl:table-cell",
};
const tierCls = (d: BoardCol["demote"]) => (d ? TIER[d === true ? "sm" : d] : "");

export default function SortableBoard({
  cols,
  rows,
  initial,
  rank = true,
  compact = false,
  mobileNoun = "rows",
  mobileInitial = 12,
  className = "rounded-xl border",
  style,
  id,
  emptyNote,
}: {
  cols: BoardCol[];
  rows: BoardRow[];
  /** The board's own order; omit for the row order as given. */
  initial?: { key: string; dir: "desc" | "asc" };
  /** Show a leading # column with the position under the current sort. */
  rank?: boolean;
  compact?: boolean;
  mobileNoun?: string;
  mobileInitial?: number;
  className?: string;
  style?: CSSProperties;
  /** Base for the phone control ids; two boards on one page need two. */
  id?: string;
  emptyNote?: ReactNode;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(
    initial ? { key: initial.key, dir: initial.dir === "asc" ? 1 : -1 } : null,
  );
  const sortableCols = cols.filter((c) => c.sortable !== false);
  const numeric = (key: string) => rows.some((r) => typeof r.sort[key] === "number");

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const { key, dir } = sort;
    return [...rows].sort((a, b) => {
      const av = a.sort[key];
      const bv = b.sort[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, sort]);

  const first = (key: string): 1 | -1 => (numeric(key) ? -1 : 1);
  const onHeading = (key: string) => {
    setSort((s) => {
      if (!s || s.key !== key) return { key, dir: first(key) };
      if (s.dir === first(key)) return { key, dir: (first(key) * -1) as 1 | -1 };
      return initial ? { key: initial.key, dir: initial.dir === "asc" ? 1 : -1 } : null;
    });
  };
  const selectKey = sort?.key ?? initial?.key ?? sortableCols[0]?.key ?? "";
  const dirDesc = (sort?.dir ?? (initial?.dir === "asc" ? 1 : -1)) === -1;

  const pad = compact ? "py-1 px-2" : "py-1.5 px-3";
  const thCls = (c: BoardCol) =>
    `${compact ? "py-1.5 px-2" : "py-2 px-3"} font-medium${c.right ? " text-right" : ""}${tierCls(c.demote)}${c.className ? ` ${c.className}` : ""}`;
  const tdCls = (c: BoardCol) => `${pad}${c.right ? " text-right" : ""}${tierCls(c.demote)}`;
  const selId = `${id ?? "board"}-sort`;

  return (
    <div>
      {sortableCols.length > 1 ? (
        <div className="sm:hidden flex flex-wrap items-center gap-2 mt-3 text-xs">
          <label className="text-[var(--text-muted)]" htmlFor={selId}>Sort by</label>
          <select
            id={selId}
            value={selectKey}
            onChange={(e) => setSort({ key: e.target.value, dir: dirDesc ? -1 : 1 })}
            className="rounded-md border px-2 py-1.5 min-h-[44px] text-xs max-w-full"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            {sortableCols.map((c) => (
              <option key={c.key} value={c.key}>{c.short ?? (typeof c.label === "string" ? c.label : c.key)}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSort({ key: selectKey, dir: dirDesc ? 1 : -1 })}
            aria-label={dirDesc ? "largest first; switch to smallest first" : "smallest first; switch to largest first"}
            className="rounded-md border px-2.5 py-1.5 min-h-[44px] text-xs"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-muted)" }}
          >
            {dirDesc ? "largest first" : "smallest first"}
          </button>
        </div>
      ) : null}
      <ResponsiveTable
        compact={compact}
        variant="list"
        className={className}
        style={style}
        mobileNoun={mobileNoun}
        mobileInitial={mobileInitial}
        mobileEmpty={emptyNote}
        mobileRows={sorted.map((r, i) => (
          <RankRow
            key={r.key}
            rank={rank ? i + 1 : undefined}
            name={r.mobile.name}
            sub={r.mobile.sub}
            right={r.mobile.right}
            rightSub={r.mobile.rightSub}
            highlight={r.mobile.highlight}
          />
        ))}
      >
        <table className="w-full text-xs" data-sticky-col={rank ? "2" : undefined}>
          <thead>
            <tr className="text-[var(--text-dim)] text-left">
              {rank ? <th className={`${compact ? "py-1.5 px-2" : "py-2 px-3"} font-medium`}>#</th> : null}
              {cols.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    className={thCls(c)}
                    title={c.title}
                    aria-sort={active ? (sort!.dir === 1 ? "ascending" : "descending") : undefined}
                  >
                    {c.sortable === false ? (
                      c.label
                    ) : (
                      <button
                        type="button"
                        onClick={() => onHeading(c.key)}
                        className={`inline-flex items-baseline gap-1 cursor-pointer hover:text-[var(--accent)]${active ? " text-[var(--text)]" : ""}`}
                        title="Sort by this column"
                      >
                        {c.label}
                        <span aria-hidden className={`text-[8px] ${active ? "" : "opacity-40"}`}>
                          {active ? (sort!.dir === 1 ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={r.key} className="border-t" style={{ borderColor: "var(--border)", ...(r.mobile.highlight ? { background: "rgba(78,205,196,0.06)" } : null) }}>
                {rank ? <td className={`${pad} tabular-nums text-[var(--text-dim)]`} style={MONO}>{i + 1}</td> : null}
                {cols.map((c, j) => (
                  <td key={c.key} className={tdCls(c)} style={c.tdStyle}>{r.cells[j]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </ResponsiveTable>
    </div>
  );
}
