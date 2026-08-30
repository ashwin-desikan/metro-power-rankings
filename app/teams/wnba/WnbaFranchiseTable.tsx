"use client";

// Sortable all-time WNBA franchise table for the hub. Includes defunct
// franchises (greyed, flagged). Server passes franchises ranked by titles;
// clicking a header re-sorts in the browser.

import { useMemo, useState } from "react";
import Link from "next/link";
import TeamCrest from "@/app/teams/_shared/TeamCrest";
import type { WnbaFranchise } from "@/lib/wnba";
import { CappedList } from "@/app/_shared/Disclosure";

type SortKey = "default" | "franchise" | "seasons" | "wl" | "pct" | "playoffs" | "finals" | "titles";
type SortDir = "asc" | "desc";

function Th({ label, k, active, dir, align, onSort, className }: {
  label: string; k: SortKey; active: boolean; dir: SortDir; align: "left" | "right"; onSort: (k: SortKey) => void; className?: string;
}) {
  const arrow = active ? (dir === "asc" ? "↑" : "↓") : "↕";
  return (
    <th className={`py-2 px-3 font-medium whitespace-nowrap align-bottom ${align === "right" ? "text-right" : "text-left"} ${className ?? ""}`}>
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1 py-2 -my-2 hover:text-[var(--accent)] transition" style={{ color: active ? "var(--accent)" : "inherit", fontWeight: "inherit" }} title={`Sort by ${label}`}>
        <span>{label}</span><span className="text-[10px] opacity-70" aria-hidden>{arrow}</span>
      </button>
    </th>
  );
}

export default function WnbaFranchiseTable({ franchises }: { franchises: WnbaFranchise[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("titles");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [announce, setAnnounce] = useState("");

  function onSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "franchise" ? "asc" : "desc"); }
  }

  const sorted = useMemo(() => {
    const arr = [...franchises];
    const m = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (sortKey === "franchise") return a.name.localeCompare(b.name) * m;
      const val = (f: WnbaFranchise) =>
        sortKey === "seasons" ? f.seasons : sortKey === "wl" ? f.w : sortKey === "pct" ? (f.win_pct ?? -1)
        : sortKey === "playoffs" ? f.playoff_appearances : sortKey === "finals" ? f.finals : f.titles;
      return (val(a) - val(b)) * m
        || b.titles - a.titles || b.finals - a.finals
        || b.playoff_appearances - a.playoff_appearances || a.name.localeCompare(b.name);
    });
    return arr;
  }, [franchises, sortKey, sortDir]);

  return (
    <div>
      {/* Mobile sort control: the desktop Th buttons (onClick={() => onSort(k)})
          live only in the table below, hidden below sm, so cards need their own
          way to drive the same sortKey/sortDir state. */}
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
              onSort(e.target.value as SortKey);
              setAnnounce(`Sorted by ${label}`);
            }}
            className="flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            <option value="franchise">Franchise</option>
            <option value="titles">Titles</option>
            <option value="finals">Finals</option>
            <option value="playoffs">Playoffs</option>
            <option value="wl">W-L</option>
            <option value="pct">Win%</option>
            <option value="seasons">Seasons</option>
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

      {/* Mobile: one card per franchise. Same `sorted` array as the desktop
          table below, driven by the same sort state. */}
      <div className="grid grid-cols-1 gap-2 sm:hidden">
        <CappedList
          initial={12}
          noun="franchises"
          className="rounded-lg border border-[var(--border)]"
          bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
          items={sorted.map((f, i) => (
          <Link
            key={f.slug}
            href={`/teams/wnba/${f.slug}`}
            className="block rounded-lg border p-3 hover:border-[var(--accent)] transition-colors"
            style={{ borderColor: "var(--border)", background: f.titles > 0 ? "rgba(251,191,36,0.04)" : "var(--bg-card)" }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <TeamCrest name={f.name} size={26} fallback={<span className="inline-flex items-center justify-center font-bold rounded flex-shrink-0" style={{ background: f.color, color: "#fff", width: 30, height: 19, fontSize: f.abbr.length > 3 ? 8 : 10, opacity: f.defunct ? 0.6 : 1 }} aria-hidden>{f.abbr}</span>} />
                <div className="min-w-0">
                  <div className="font-medium leading-tight flex items-center gap-1.5 flex-wrap">
                    <span className="truncate">{f.name}</span>
                    {f.defunct && <span className="text-[9px] uppercase tracking-wider text-[var(--text-dim)] border rounded px-1 py-0.5 font-normal flex-shrink-0" style={{ borderColor: "var(--border)" }}>Defunct</span>}
                    {f.seasons === 0 && <span className="text-[9px] uppercase tracking-wider text-[var(--text-dim)] border rounded px-1 py-0.5 font-normal flex-shrink-0" style={{ borderColor: "var(--border)" }}>Expansion</span>}
                  </div>
                  {f.city && <div className="text-[11px] text-[var(--text-dim)]">{f.city}</div>}
                </div>
              </div>
              <span className="text-[10px] text-[var(--text-dim)] tabular-nums flex-shrink-0">#{i + 1}</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-x-2 gap-y-1.5 text-xs">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Titles</div>
                <div className="tabular-nums">{f.titles > 0 ? <span className="font-bold text-yellow-400">{f.titles}</span> : <span className="text-[var(--text-dim)]">—</span>}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Finals</div>
                <div className="tabular-nums text-[var(--text-muted)]">{f.finals || "—"}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Playoffs</div>
                <div className="tabular-nums text-[var(--text-dim)]">{f.playoff_appearances || "—"}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">W-L</div>
                <div className="tabular-nums">{f.w}-{f.l}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Win%</div>
                <div className="tabular-nums text-[var(--text-muted)]">{f.win_pct != null ? f.win_pct.toFixed(3).replace(/^0/, "") : "—"}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Seasons</div>
                <div className="tabular-nums text-[var(--text-dim)]">{f.seasons || "—"}</div>
              </div>
              {f.title_years.length > 0 && (
                <div className="col-span-3">
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Title years</div>
                  <div className="text-[var(--text-muted)]">{f.title_years.join(", ")}</div>
                </div>
              )}
            </div>
          </Link>
        ))}
        />
      </div>

      <div className="rounded-xl border overflow-x-auto hidden sm:block" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-[11px] uppercase tracking-wide" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
            <th className="py-2 pr-2 pl-3 text-right font-medium w-8">#</th>
            <Th label="Franchise" k="franchise" active={sortKey === "franchise"} dir={sortDir} align="left" onSort={onSort} />
            <Th label="Titles" k="titles" active={sortKey === "titles"} dir={sortDir} align="right" onSort={onSort} />
            <Th label="Finals" k="finals" active={sortKey === "finals"} dir={sortDir} align="right" onSort={onSort} />
            <Th label="Playoffs" k="playoffs" active={sortKey === "playoffs"} dir={sortDir} align="right" onSort={onSort} className="hidden sm:table-cell" />
            <Th label="W" k="wl" active={sortKey === "wl"} dir={sortDir} align="right" onSort={onSort} className="hidden md:table-cell" />
            <Th label="L" k="default" active={false} dir={sortDir} align="right" onSort={() => onSort("wl")} className="hidden md:table-cell" />
            <Th label="Win%" k="pct" active={sortKey === "pct"} dir={sortDir} align="right" onSort={onSort} className="hidden sm:table-cell" />
            <Th label="Seasons" k="seasons" active={sortKey === "seasons"} dir={sortDir} align="right" onSort={onSort} className="hidden md:table-cell" />
            <th className="py-2 px-3 text-left font-medium hidden lg:table-cell">Title years</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((f, i) => (
            <tr key={f.slug} className="border-b last:border-b-0" style={{ borderColor: "var(--border)", background: f.titles > 0 ? "rgba(251,191,36,0.04)" : undefined }}>
              <td className="py-2.5 pr-2 pl-3 text-right text-[var(--text-dim)] text-xs tabular-nums">{i + 1}</td>
              <td className="py-2.5 px-3">
                <Link href={`/teams/wnba/${f.slug}`} className="flex items-center gap-2.5 hover:text-[var(--accent)] transition-colors">
                  <TeamCrest name={f.name} size={26} fallback={<span className="inline-flex items-center justify-center font-bold rounded flex-shrink-0" style={{ background: f.color, color: "#fff", width: 30, height: 19, fontSize: f.abbr.length > 3 ? 8 : 10, opacity: f.defunct ? 0.6 : 1 }} aria-hidden>{f.abbr}</span>} />
                  <span>
                    <span className="font-medium leading-tight inline-flex items-center gap-1.5">
                      {f.name}
                      {f.defunct && <span className="text-[9px] uppercase tracking-wider text-[var(--text-dim)] border rounded px-1 py-0.5 font-normal" style={{ borderColor: "var(--border)" }}>Defunct</span>}
                      {f.seasons === 0 && <span className="text-[9px] uppercase tracking-wider text-[var(--text-dim)] border rounded px-1 py-0.5 font-normal" style={{ borderColor: "var(--border)" }}>Expansion</span>}
                    </span>
                    {f.city && <span className="block text-[11px] text-[var(--text-dim)]">{f.city}</span>}
                  </span>
                </Link>
              </td>
              <td className="py-2.5 px-3 text-right tabular-nums">{f.titles > 0 ? <span className="font-bold text-yellow-400">{f.titles}</span> : <span className="text-[var(--text-dim)]">—</span>}</td>
              <td className="py-2.5 px-3 text-right tabular-nums text-[var(--text-muted)]">{f.finals || "—"}</td>
              <td className="py-2.5 px-3 text-right tabular-nums text-[var(--text-dim)] hidden sm:table-cell">{f.playoff_appearances || "—"}</td>
              <td className="py-2.5 px-3 text-right tabular-nums hidden md:table-cell">{f.w}</td>
              <td className="py-2.5 px-3 text-right tabular-nums text-[var(--text-muted)] hidden md:table-cell">{f.l}</td>
              <td className="py-2.5 px-3 text-right tabular-nums text-[var(--text-muted)] hidden sm:table-cell">{f.win_pct != null ? f.win_pct.toFixed(3).replace(/^0/, "") : "—"}</td>
              <td className="py-2.5 px-3 text-right tabular-nums text-[var(--text-dim)] hidden md:table-cell">{f.seasons || "—"}</td>
              <td className="py-2.5 px-3 text-left text-xs text-[var(--text-muted)] hidden lg:table-cell">{f.title_years.length ? f.title_years.join(", ") : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
