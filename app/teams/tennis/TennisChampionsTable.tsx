"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

// One combined, filterable Grand Slam champions ledger across all four majors.
// Flags are precomputed server-side (flagUrl) so this client component pulls no
// server-only module into the client bundle.

export type ChampCell = { name: string; flagUrl: string | null; neutral: boolean } | null;
export type EditionRow = {
  year: number;
  tournament: string;
  men: ChampCell;
  women: ChampCell;
  metroSlug: string | null;
  metroName: string | null;
};

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

function ChampSpan({ c }: { c: ChampCell }) {
  if (!c) return <span className="text-[var(--text-dim)]">—</span>;
  return (
    <span>
      {c.flagUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.flagUrl} alt="" aria-hidden width={18} height={13} className="inline-block mr-1.5 align-[-2px]" />
      ) : null}
      {c.name}
      {c.neutral ? " †" : ""}
    </span>
  );
}

export default function TennisChampionsTable({
  rows,
  tournaments,
}: {
  rows: EditionRow[];
  tournaments: string[];
}) {
  const [tour, setTour] = useState<string>("All");
  const [year, setYear] = useState<string>("All");

  const years = useMemo(
    () => Array.from(new Set(rows.map((r) => r.year))).sort((a, b) => b - a),
    [rows],
  );
  // Within a year, show the majors in reverse-calendar order (US Open, Wimbledon,
  // French Open, Australian Open) so each year reads newest-event-first.
  const displayOrder = useMemo(() => [...tournaments].reverse(), [tournaments]);
  const order = useMemo(() => new Map(displayOrder.map((t, i) => [t, i])), [displayOrder]);

  const filtered = useMemo(() => {
    const yr = year === "All" ? null : Number(year);
    return rows
      .filter((r) => (tour === "All" || r.tournament === tour) && (yr === null || r.year === yr))
      .sort((a, b) => b.year - a.year || (order.get(a.tournament) ?? 0) - (order.get(b.tournament) ?? 0));
  }, [rows, tour, year, order]);

  const selCls = "text-sm rounded-md border px-2.5 py-1.5";
  const selStyle = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" } as const;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <label htmlFor="tour-filter" className="text-xs text-[var(--text-muted)]">Tournament</label>
        <select id="tour-filter" className={selCls} style={selStyle} value={tour} onChange={(e) => setTour(e.target.value)}>
          <option value="All">All majors</option>
          {displayOrder.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <label htmlFor="year-filter" className="text-xs text-[var(--text-muted)] ml-2">Year</label>
        <select id="year-filter" className={selCls} style={selStyle} value={year} onChange={(e) => setYear(e.target.value)}>
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
        <span className="text-xs text-[var(--text-dim)] ml-auto tabular-nums">{filtered.length} editions</span>
      </div>

      <div className="rounded-xl border overflow-x-auto max-h-[560px] overflow-y-auto" style={card}>
        <table className="w-full text-sm min-w-[660px]">
          <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
            <tr className="text-left text-xs text-[var(--text-muted)]">
              <th className="py-2 px-3 font-medium">Year</th>
              <th className="py-2 px-3 font-medium">Tournament</th>
              <th className="py-2 px-3 font-medium">Men&apos;s singles</th>
              <th className="py-2 px-3 font-medium">Women&apos;s singles</th>
              <th className="py-2 px-3 font-medium">Host metro</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={`${r.year}-${r.tournament}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-1.5 px-3 tabular-nums" style={mono}>{r.year}</td>
                <td className="py-1.5 px-3 whitespace-nowrap">{r.tournament}</td>
                <td className="py-1.5 px-3"><ChampSpan c={r.men} /></td>
                <td className="py-1.5 px-3"><ChampSpan c={r.women} /></td>
                <td className="py-1.5 px-3 text-[var(--text-muted)]">
                  {r.metroSlug ? (
                    <Link href={`/rankings/${r.metroSlug}#sports`} className="hover:text-[var(--accent)]">{r.metroName}</Link>
                  ) : (
                    <span className="text-[var(--text-dim)]">—</span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 px-3 text-center text-[var(--text-dim)]">No editions match those filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
