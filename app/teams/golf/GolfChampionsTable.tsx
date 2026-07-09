"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

// One combined, filterable ledger of every men's major champion across the four
// majors. Flags are precomputed server-side (flagUrl) so this client component
// pulls no server-only module into the client bundle.

export type GolfRow = {
  year: number;
  tournament: string;
  seasonMonth: number; // approximate month played that year, for era-correct within-year order
  champion: string;
  flagUrl: string | null;
  nation: string | null;
  dual: boolean;
  venue: string | null;
  metroSlug: string | null;
  metroName: string | null;
};

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

export default function GolfChampionsTable({
  rows,
  tournaments,
}: {
  rows: GolfRow[];
  tournaments: string[];
}) {
  const [tour, setTour] = useState<string>("All");
  const [year, setYear] = useState<string>("All");

  const years = useMemo(
    () => Array.from(new Set(rows.map((r) => r.year))).sort((a, b) => b - a),
    [rows],
  );
  const filtered = useMemo(() => {
    const yr = year === "All" ? null : Number(year);
    return rows
      .filter((r) => (tour === "All" || r.tournament === tour) && (yr === null || r.year === yr))
      // newest year first, then the latest major of that season first, using the
      // era-correct month (seasonMonth) so the PGA sits last in the years it closed.
      .sort((a, b) => b.year - a.year || b.seasonMonth - a.seasonMonth);
  }, [rows, tour, year]);

  const selCls = "text-sm rounded-md border px-2.5 py-1.5";
  const selStyle = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" } as const;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <label htmlFor="golf-tour-filter" className="text-xs text-[var(--text-muted)]">Major</label>
        <select id="golf-tour-filter" className={selCls} style={selStyle} value={tour} onChange={(e) => setTour(e.target.value)}>
          <option value="All">All majors</option>
          {tournaments.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <label htmlFor="golf-year-filter" className="text-xs text-[var(--text-muted)] ml-2">Year</label>
        <select id="golf-year-filter" className={selCls} style={selStyle} value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="All">All years</option>
          {years.map((y) => (
            <option key={y} value={String(y)}>{y}</option>
          ))}
        </select>
        {(tour !== "All" || year !== "All") && (
          <button
            type="button"
            onClick={() => { setTour("All"); setYear("All"); }}
            className="text-xs px-2 py-1 rounded-md border text-[var(--text-muted)] hover:text-[var(--text)]"
            style={{ borderColor: "var(--border)" }}
          >
            Clear
          </button>
        )}
        <span className="text-xs text-[var(--text-dim)] ml-auto tabular-nums">{filtered.length} championships</span>
      </div>

      <div className="rounded-xl border overflow-x-auto max-h-[560px] overflow-y-auto" style={card}>
        <table className="w-full text-sm min-w-[680px]">
          <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
            <tr className="text-left text-xs text-[var(--text-muted)]">
              <th className="py-2 px-3 font-medium">Year</th>
              <th className="py-2 px-3 font-medium">Major</th>
              <th className="py-2 px-3 font-medium">Champion</th>
              <th className="py-2 px-3 font-medium">Nation</th>
              <th className="py-2 px-3 font-medium">Host venue &amp; metro</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={`${r.year}-${r.tournament}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-1.5 px-3 tabular-nums" style={mono}>{r.year}</td>
                <td className="py-1.5 px-3 whitespace-nowrap">{r.tournament}</td>
                <td className="py-1.5 px-3 font-medium">{r.champion}{r.dual ? " *" : ""}</td>
                <td className="py-1.5 px-3 text-[var(--text-muted)]">
                  {r.flagUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.flagUrl} alt="" aria-hidden width={18} height={13} className="inline-block mr-1.5 align-[-2px]" loading="lazy" decoding="async" />
                  ) : null}
                  {r.nation ?? "—"}
                </td>
                <td className="py-1.5 px-3 text-[var(--text-muted)]">
                  {r.metroSlug ? (
                    <Link href={`/rankings/${r.metroSlug}#sports`} className="hover:text-[var(--accent)]">
                      {r.venue ? `${r.venue}, ` : ""}{r.metroName}
                    </Link>
                  ) : (
                    <span>{r.venue ?? "—"}</span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 px-3 text-center text-[var(--text-dim)]">No championships match those filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
