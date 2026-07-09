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

      {/* Mobile: one card per championship instead of a 5-column table that
          forces sideways scrolling at 375px. Same `filtered` data as the
          desktop table below. */}
      <div className="grid grid-cols-1 gap-2 sm:hidden max-h-[560px] overflow-y-auto">
        {filtered.map((r) => (
          <div
            key={`${r.year}-${r.tournament}-card`}
            className="rounded-lg border p-3"
            style={card}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="leading-tight font-medium text-sm flex items-center gap-1.5 flex-wrap">
                {r.flagUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.flagUrl} alt="" aria-hidden width={18} height={13} className="inline-block rounded-sm object-contain flex-shrink-0 align-middle" loading="lazy" decoding="async" />
                ) : null}
                <span>{r.champion}{r.dual ? " *" : ""}</span>
              </div>
              <span className="flex-shrink-0 text-xs tabular-nums text-[var(--text-muted)]" style={mono}>{r.year}</span>
            </div>
            <div className="text-[11px] text-[var(--text-dim)] mb-2">{r.tournament}</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Nation</div>
                <div className="text-[var(--text-muted)]">{r.nation ?? "—"}</div>
              </div>
              <div className="col-span-2">
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Host venue &amp; metro</div>
                <div className="text-[var(--text-muted)]">
                  {r.metroSlug ? (
                    <Link href={`/rankings/${r.metroSlug}#sports`} className="hover:text-[var(--accent)]">
                      {r.venue ? `${r.venue}, ` : ""}{r.metroName}
                    </Link>
                  ) : (
                    <span>{r.venue ?? "—"}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="py-6 px-3 text-center text-sm text-[var(--text-dim)] rounded-lg border" style={card}>
            No championships match those filters.
          </div>
        )}
      </div>

      <div className="rounded-xl border overflow-x-auto max-h-[560px] overflow-y-auto hidden sm:block" style={card}>
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
