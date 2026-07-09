"use client";

// Sortable Most Decorated clubs table, shared by the Women's Football
// home page and the per-country league hubs. The stat columns are configurable
// (see lib/wfootball WCOLS_*); the United States hub, for example, swaps the
// FA Cup / WCL columns for the two NWSL trophies. The server passes pre-computed
// rows (ordered by total honors); clicking a header re-sorts in the browser.
// Default order is total honors descending, surfaced via the rank column.

import { useMemo, useState } from "react";
import Link from "next/link";
import CrestIcon from "@/app/teams/_shared/CrestIcon";
import type { WDecoratedRow, WColumn, WStatField } from "@/lib/wfootball";

type SortKey = "total" | "club" | "country" | "metro" | WStatField;
type SortDir = "asc" | "desc";

const TEXT_KEYS = new Set<SortKey>(["club", "country", "metro"]);

function SortableTh({
  label,
  sortKey,
  active,
  dir,
  align,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  dir: SortDir;
  align: "left" | "right";
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const arrow = active ? (dir === "asc" ? "↑" : "↓") : "↕";
  return (
    <th className={`py-2 px-2 font-medium whitespace-nowrap align-bottom ${align === "right" ? "text-right" : "text-left"} ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 py-2 hover:text-[var(--accent)] transition"
        style={{ color: active ? "var(--accent)" : "inherit", fontWeight: "inherit" }}
        title={`Sort by ${label}`}
      >
        <span>{label}</span>
        <span className="text-[10px] opacity-70" aria-hidden>{arrow}</span>
      </button>
    </th>
  );
}

export default function MostDecoratedClubsTable({
  title,
  caption,
  rows,
  columns,
}: {
  title: string;
  caption?: string;
  rows: WDecoratedRow[];
  columns: WColumn[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [announce, setAnnounce] = useState("");

  function onSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(TEXT_KEYS.has(key) ? "asc" : "desc");
    }
  }

  const sorted = useMemo(() => {
    const arr = [...rows];
    const m = sortDir === "asc" ? 1 : -1;
    const statValue = (r: WDecoratedRow, k: SortKey): number =>
      k === "total" ? r.total_titles : (r[k as WStatField] as number);
    arr.sort((a, b) => {
      if (sortKey === "club") return a.name.localeCompare(b.name) * m;
      if (sortKey === "country") return ((a.country ?? "").localeCompare(b.country ?? "") || a.name.localeCompare(b.name)) * m;
      if (sortKey === "metro") return ((a.metro ?? "").localeCompare(b.metro ?? "") || a.name.localeCompare(b.name)) * m;
      const d = (statValue(a, sortKey) - statValue(b, sortKey)) * m;
      if (d !== 0) return d;
      if (b.total_titles !== a.total_titles) return b.total_titles - a.total_titles;
      if (b.total_finals !== a.total_finals) return b.total_finals - a.total_finals;
      return a.name.localeCompare(b.name);
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const num = (n: number) => (n > 0 ? n : <span className="text-[var(--text-dim)]">—</span>);

  return (
    <section className="rounded-xl border p-5" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <h2 className="text-base font-semibold">{title}</h2>
      {caption && <p className="mt-1 text-xs text-[var(--text-muted)]">{caption}</p>}

      {/* Mobile sort control: the desktop SortableTh buttons (onClick={() =>
          onSort(k)}) live only in the table below, hidden below sm, so cards
          need their own way to drive the same sortKey/sortDir state. */}
      <div
        className="sticky top-20 z-30 flex items-center gap-2 py-2 mb-1 mt-4 sm:hidden"
        style={{ backgroundColor: "var(--bg)" }}
      >
        <label className="flex-1 flex items-center gap-2 text-xs min-w-0">
          <span className="uppercase tracking-wide text-[var(--text-dim)] flex-shrink-0">Sort</span>
          <select
            value={sortKey}
            onChange={(e) => {
              const label = e.target.options[e.target.selectedIndex]?.text ?? "";
              onSort(e.target.value as SortKey);
              setAnnounce(`Sorted by ${label}`);
            }}
            className="flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            <option value="total" disabled>Total (default)</option>
            <option value="club">Club</option>
            <option value="country">Country</option>
            <option value="metro">Metro</option>
            {columns.map((col) => (
              <option key={col.field} value={col.field}>{col.label}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            onSort(sortKey);
            setAnnounce(`Sort direction: ${sortDir === "asc" ? "descending" : "ascending"}`);
          }}
          aria-label={sortDir === "asc" ? "Sort ascending" : "Sort descending"}
          className="rounded-lg border px-3 py-2 text-sm flex-shrink-0"
          style={{ borderColor: "var(--border)", color: "var(--text)" }}
        >
          {sortDir === "asc" ? "↑" : "↓"}
        </button>
        <span aria-live="polite" className="sr-only">{announce}</span>
      </div>

      {/* Mobile: one stacked card per club instead of a wide, configurable-column
          table that would force sideways scrolling. Same `sorted` data and sort
          state as the desktop table below; every configured stat column is
          rendered as a labeled chip so nothing is dropped. */}
      <div className="mt-4 grid grid-cols-1 gap-2 sm:hidden">
        {sorted.map((c, i) => (
          <div
            key={`${c.slug}-card`}
            className="rounded-lg border p-3"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex-shrink-0 text-xs tabular-nums text-[var(--text-muted)]">{i + 1}</span>
              <CrestIcon name={c.name} size={18} />
              <Link href={`/teams/wfootball/clubs/${c.slug}`} className="font-medium hover:underline truncate">
                {c.name}
              </Link>
            </div>
            <div className="mt-1 text-xs text-[var(--text-muted)]">
              {c.country ?? "—"}
              {c.metro && (
                <>
                  {" · "}
                  {c.metro_slug ? (
                    <Link href={`/rankings/${c.metro_slug}`} className="hover:underline">{c.metro}</Link>
                  ) : (
                    c.metro
                  )}
                </>
              )}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Total</div>
                <div className="font-semibold tabular-nums">{num(c.total_titles)}</div>
              </div>
              {columns.map((col) => (
                <div key={col.field}>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">{col.label}</div>
                  <div className="tabular-nums">{num(c[col.field] as number)}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto hidden sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-[var(--text-muted)] uppercase tracking-wide border-b" style={{ borderColor: "var(--border)" }}>
              <th className="py-2 pr-2 text-right font-medium w-10 align-bottom">#</th>
              <SortableTh label="Club" sortKey="club" active={sortKey === "club"} dir={sortDir} align="left" onSort={onSort} />
              <SortableTh label="Country" sortKey="country" active={sortKey === "country"} dir={sortDir} align="left" onSort={onSort} className="hidden md:table-cell" />
              <SortableTh label="Metro" sortKey="metro" active={sortKey === "metro"} dir={sortDir} align="left" onSort={onSort} className="hidden sm:table-cell" />
              {columns.map((col) => (
                <SortableTh key={col.field} label={col.label} sortKey={col.field} active={sortKey === col.field} dir={sortDir} align="right" onSort={onSort} />
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((c, i) => (
              <tr key={c.slug} className="border-b" style={{ borderColor: "var(--border)" }}>
                <td className="py-1.5 pr-2 text-right tabular-nums text-[var(--text-muted)]">{i + 1}</td>
                <td className="py-1.5 px-2"><span className="inline-flex items-center gap-1.5"><CrestIcon name={c.name} size={18} /><Link href={`/teams/wfootball/clubs/${c.slug}`} className="hover:underline font-medium">{c.name}</Link></span></td>
                <td className="py-1.5 px-2 hidden md:table-cell text-[var(--text-muted)]">{c.country ?? <span className="text-[var(--text-dim)]">—</span>}</td>
                <td className="py-1.5 px-2 hidden sm:table-cell text-[var(--text-muted)]">
                  {c.metro_slug ? <Link href={`/rankings/${c.metro_slug}`} className="hover:underline">{c.metro}</Link> : <span className="text-[var(--text-dim)]">—</span>}
                </td>
                {columns.map((col, ci) => (
                  <td key={col.field} className={`py-1.5 px-2 text-right tabular-nums ${ci === 0 ? "font-semibold" : ""}`}>{num(c[col.field] as number)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
