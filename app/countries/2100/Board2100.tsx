"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ResponsiveTable, RankRow } from "@/app/teams/_shared/ResponsiveTable";
import { fmtPop, type Pop2100IndexRow } from "@/lib/population2100Shape";

// The ranking table for /countries/2100. One sort control that drives both
// the desktop table and the phone list (DESIGN-STANDARDS §6: every control
// the table offers exists on the phone). No in-cell bars: a number beside
// its own label encodes nothing (ruling of 2026-09-04).

const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;
const PEAK = "#E2628B";

type SortKey = "y2100" | "y2050" | "multiple" | "peak" | "base";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "y2100", label: "2100 population" },
  { key: "y2050", label: "2050 population" },
  { key: "base", label: "Today" },
  { key: "multiple", label: "Multiple on today" },
  { key: "peak", label: "Peak year" },
];

export default function Board2100({ rows, baseYear }: { rows: Pop2100IndexRow[]; baseYear: number }) {
  const [sort, setSort] = useState<SortKey>("y2100");
  const [dir, setDir] = useState<"desc" | "asc">("desc");
  const sorted = useMemo(() => {
    const v = (r: Pop2100IndexRow) =>
      sort === "y2100" ? r.y2100.med : sort === "y2050" ? r.y2050.med : sort === "base" ? r.base.value ?? 0
      : sort === "multiple" ? r.multiple2100 ?? 0 : r.peak.year;
    return [...rows].sort((a, b) => (dir === "desc" ? v(b) - v(a) : v(a) - v(b)));
  }, [rows, sort, dir]);
  const mult = (r: Pop2100IndexRow) => (r.multiple2100 != null ? `${r.multiple2100.toFixed(2)}×` : "");
  const peak = (r: Pop2100IndexRow) => (r.peak.year >= 2100 && !r.peak.past ? "after 2100" : String(r.peak.year));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
        <label className="text-[var(--text-muted)]" htmlFor="sort-2100">Sort by</label>
        <select id="sort-2100" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-md border px-2 py-1.5 min-h-[44px] sm:min-h-0 text-xs" style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}>
          {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <button type="button" onClick={() => setDir(dir === "desc" ? "asc" : "desc")} aria-label={dir === "desc" ? "largest first; switch to smallest first" : "smallest first; switch to largest first"}
          className="rounded-md border px-2.5 py-1.5 min-h-[44px] sm:min-h-0 text-xs" style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-muted)" }}>
          {dir === "desc" ? "largest first" : "smallest first"}
        </button>
      </div>
      <ResponsiveTable
        variant="list"
        mobileNoun="countries"
        mobileInitial={25}
        className="rounded-xl border"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
        mobileRows={sorted.map((r, i) => (
          <RankRow key={r.slug} rank={i + 1}
            name={<Link href={`/countries/${r.slug}#population-2100`} className="hover:underline">{r.name}</Link>}
            sub={<>{fmtPop(r.base.value)} today · 2050 {fmtPop(r.y2050.med)} · 95% band {fmtPop(r.y2100.lo95)} to {fmtPop(r.y2100.hi95)} · peak {peak(r)}</>}
            right={fmtPop(r.y2100.med)} rightSub={mult(r)} />
        ))}
      >
        <table className="w-full text-xs" data-sticky-col="2">
          <thead>
            <tr className="text-[var(--text-dim)] text-left">
              <th className="py-2 px-3 font-medium">#</th>
              <th className="py-2 px-3 font-medium">Country</th>
              <th className="py-2 px-3 font-medium text-right">2100</th>
              <th className="py-2 px-3 font-medium text-right">95% band</th>
              <th className="py-2 px-3 font-medium text-right">{baseYear}</th>
              <th className="py-2 px-3 font-medium text-right">2050</th>
              <th className="py-2 px-3 font-medium text-right">Multiple</th>
              <th className="py-2 px-3 font-medium text-right">Peak</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={r.slug} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-1.5 px-3 tabular-nums text-[var(--text-dim)]" style={MONO}>{i + 1}</td>
                <td className="py-1.5 px-3 whitespace-nowrap"><Link href={`/countries/${r.slug}#population-2100`} className="hover:text-[var(--accent)] hover:underline">{r.name}</Link></td>
                <td className="py-1.5 px-3 text-right tabular-nums font-semibold" style={MONO}>{fmtPop(r.y2100.med)}</td>
                <td className="py-1.5 px-3 text-right tabular-nums text-[var(--text-muted)] whitespace-nowrap" style={MONO}>{fmtPop(r.y2100.lo95)} to {fmtPop(r.y2100.hi95)}</td>
                <td className="py-1.5 px-3 text-right tabular-nums text-[var(--text-muted)]" style={MONO}>{fmtPop(r.base.value)}</td>
                <td className="py-1.5 px-3 text-right tabular-nums text-[var(--text-muted)]" style={MONO}>{fmtPop(r.y2050.med)}</td>
                <td className="py-1.5 px-3 text-right tabular-nums" style={{ ...MONO, color: (r.multiple2100 ?? 1) < 1 ? PEAK : undefined }}>{mult(r)}</td>
                <td className="py-1.5 px-3 text-right tabular-nums" style={{ ...MONO, color: r.peak.past ? PEAK : undefined }}>{peak(r)}{r.peak.past ? " (past)" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ResponsiveTable>
    </div>
  );
}
