"use client";

import { useMemo, useState } from "react";
import type { HistoricalFranchise } from "@/lib/mlb";

// Sortable historical-franchise table for /teams/mlb/historical. Smaller
// scope than the NFL HistoricalTable (no per-franchise season disclosure
// in v1; deferred until historical-seasons.json is added to the MLB ETL).

type SortKey =
  | "name"
  | "city"
  | "league"
  | "first_year"
  | "last_year"
  | "seasons"
  | "championships"
  | "record"
  | "win_pct";

type SortDir = "asc" | "desc";

const TITLE_SLATE = "#6e8aa6";

function compare(a: HistoricalFranchise, b: HistoricalFranchise, key: SortKey): number {
  switch (key) {
    case "name": return a.name.localeCompare(b.name);
    case "city": return (a.city || "").localeCompare(b.city || "");
    case "league": return (a.league || "").localeCompare(b.league || "");
    case "first_year": return (a.first_year ?? 0) - (b.first_year ?? 0);
    case "last_year": return (a.last_year ?? 0) - (b.last_year ?? 0);
    case "seasons": return a.seasons - b.seasons;
    case "championships": return a.championships - b.championships;
    case "record": return a.w - b.w;
    case "win_pct": return a.win_pct - b.win_pct;
  }
}

export default function HistoricalTable({ rows }: { rows: HistoricalFranchise[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("championships");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const cmp = compare(a, b, sortKey);
      const tiebreak = sortKey === "championships" ? (b.last_year ?? 0) - (a.last_year ?? 0) : 0;
      const combined = cmp !== 0 ? cmp : tiebreak;
      return sortDir === "asc" ? combined : -combined;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  function toggle(key: SortKey) {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(key);
    const desc: SortKey[] = ["championships", "seasons", "record", "win_pct", "last_year"];
    setSortDir(desc.includes(key) ? "desc" : "asc");
  }

  return (
    <section
      className="rounded-xl border overflow-x-auto"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <table className="w-full text-xs sm:text-sm tabular-nums">
        <thead>
          <tr className="text-left text-[var(--text-muted)] border-b" style={{ borderColor: "var(--border)" }}>
            <Th label="Franchise"  k="name"          cur={sortKey} dir={sortDir} onClick={toggle} className="pl-4" />
            <Th label="City(ies)"  k="city"          cur={sortKey} dir={sortDir} onClick={toggle} />
            <Th label="League"     k="league"        cur={sortKey} dir={sortDir} onClick={toggle} />
            <Th label="First"      k="first_year"    cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
            <Th label="Last"       k="last_year"     cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
            <Th label="Seasons"    k="seasons"       cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
            <Th label="Cups/WS"    k="championships" cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
            <Th label="Record"     k="record"        cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
            <Th label="Win%"       k="win_pct"       cur={sortKey} dir={sortDir} onClick={toggle} align="right" className="pr-4" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.canonical} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
              <td className="py-2 pl-4 pr-3 font-semibold">{r.name}</td>
              <td className="py-2 pr-3 text-[var(--text-muted)]">{r.city}</td>
              <td className="py-2 pr-3 text-[var(--text-muted)]">{r.league}</td>
              <td className="py-2 pr-3 text-right text-[var(--text-muted)]">{r.first_year ?? "—"}</td>
              <td className="py-2 pr-3 text-right text-[var(--text-muted)]">{r.last_year ?? "—"}</td>
              <td className="py-2 pr-3 text-right text-[var(--text-muted)]">{r.seasons}</td>
              <td className="py-2 pr-3 text-right">
                {r.championships > 0 ? (
                  <span
                    className="text-[11px] font-semibold px-1.5 py-0.5 rounded"
                    style={{ background: "rgba(110,138,166,0.18)", color: TITLE_SLATE }}
                    title={`${r.championships} pre-1903 cup / NL pennant`}
                  >
                    {r.championships}
                  </span>
                ) : (
                  <span className="text-[var(--text-dim)]">—</span>
                )}
              </td>
              <td className="py-2 pr-3 text-right text-[var(--text-muted)]">{r.w}-{r.l}</td>
              <td className="py-2 pr-4 text-right">{r.win_pct.toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Th({
  label, k, cur, dir, onClick, align, className,
}: {
  label: string;
  k: SortKey;
  cur: SortKey;
  dir: SortDir;
  onClick: (k: SortKey) => void;
  align?: "right";
  className?: string;
}) {
  const isActive = cur === k;
  return (
    <th
      className={`font-medium py-2 pr-3 uppercase tracking-wider text-[10px] cursor-pointer select-none hover:text-[var(--text)] ${align === "right" ? "text-right" : "text-left"} ${className ?? ""}`}
      onClick={() => onClick(k)}
      style={{ color: isActive ? "var(--text)" : undefined }}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive && (
          <span aria-hidden style={{ color: "var(--accent)" }}>
            {dir === "asc" ? "▲" : "▼"}
          </span>
        )}
      </span>
    </th>
  );
}
