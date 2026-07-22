"use client";
import { ReactNode, useMemo, useState } from "react";

export type SortValue = string | number | null;
export type SortableCol = {
  key: string;
  label: ReactNode;
  className?: string;
  sortable?: boolean; // default true
};
export type SortableRow = {
  key: string;
  sort: Record<string, SortValue>;
  cells: ReactNode; // the row's <td> elements, rendered by the server page
};

// Shared sortable table for the election detail pages. The server pages keep
// full control of cell markup (links, colour dots, bars) and pass each row's
// tds plus a per-column sort value; this component only owns the header
// interaction and row order. Click a heading to sort (numeric columns start
// descending, text columns A-Z), click again to reverse, a third time to
// restore the source order. Nulls always sort to the bottom, and footer rows
// (totals) stay pinned below the sorted body.
export default function SortableTable({
  cols,
  rows,
  footer,
  tableClassName,
  headClassName,
  rowClassName = "border-t",
}: {
  cols: SortableCol[];
  rows: SortableRow[];
  footer?: ReactNode;
  tableClassName: string;
  headClassName: string;
  rowClassName?: string;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);

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

  const onSort = (key: string) => {
    const numeric = rows.some((r) => typeof r.sort[key] === "number");
    const first: 1 | -1 = numeric ? -1 : 1;
    setSort((s) => {
      if (!s || s.key !== key) return { key, dir: first };
      if (s.dir === first) return { key, dir: (first * -1) as 1 | -1 };
      return null;
    });
  };

  return (
    <table className={tableClassName}>
      <thead>
        <tr className={headClassName}>
          {cols.map((c) => {
            const active = sort?.key === c.key;
            return (
              <th
                key={c.key}
                className={c.className}
                aria-sort={active ? (sort!.dir === 1 ? "ascending" : "descending") : undefined}
              >
                {c.sortable === false ? (
                  c.label
                ) : (
                  <button
                    type="button"
                    onClick={() => onSort(c.key)}
                    className="inline-flex items-baseline gap-1 uppercase tracking-wider cursor-pointer hover:text-[var(--accent)]"
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
        {sorted.map((r) => (
          <tr key={r.key} className={rowClassName} style={{ borderColor: "var(--border)" }}>
            {r.cells}
          </tr>
        ))}
        {footer}
      </tbody>
    </table>
  );
}
