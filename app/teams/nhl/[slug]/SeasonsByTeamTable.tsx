"use client";

// Season-by-season table for /teams/nhl/[slug]. Reverse-chronological.
// Live in-progress row pinned to top when the workbook hasn't yet absorbed
// the current season. Era-aware columns: T column rendered for pre-2005
// rows, OTL absorbs shootout losses for post-2005 rows (workbook
// convention). Full history is shown (no row cap), matching the other leagues.

import { useMemo } from "react";
import type { Season } from "@/lib/nhl";

type LiveRow = {
  year: number;
  w: number;
  l: number;
  otl: number;
  pts: number;
  pts_pct: number;
  gf: number;
  ga: number;
  gp: number;
  asOf: string;
};

type Props = {
  seasons: Season[];
  liveRow: LiveRow | null;
};

function seasonLabel(year: number): string {
  const start = year - 1;
  return `${start}-${String(year).slice(-2)}`;
}

function postseasonChip(s: Season): { label: string; color?: string; bg?: string } | null {
  // Stanley Cup era (NHL, NHA, PCHA, WCHL) ships in gold. WHA Avco Cup
  // wins from 1973-79 ship in slate as a rival-league championship,
  // parallel to ABA in NBA.
  if (s.champ) {
    if (s.league === "WHA") {
      return { label: "Avco Cup", color: "#0c1320", bg: "#6e8aa6" };
    }
    return { label: "Stanley Cup", color: "#1a1408", bg: "#d4af37" };
  }
  if (s.champ_app) {
    if (s.league === "WHA") {
      return { label: "Lost Avco Final", color: "#fff", bg: "#475569" };
    }
    return { label: "Lost Final", color: "#fff", bg: "#a07a30" };
  }
  if (s.sf_cf_app) return { label: "Conference Finals", color: "#fff", bg: "#5b5b5b" };
  if (s.playoff) return { label: "Playoffs", color: "#0c1320", bg: "#6e8aa6" };
  return null;
}

export default function SeasonsByTeamTable({ seasons, liveRow }: Props) {
  // Reverse-chronological for display.
  const sorted = useMemo(() => [...seasons].sort((a, b) => b.year - a.year), [seasons]);

  // Whether the row set spans any pre-2005 ties era; if so, show T column.
  const showT = sorted.some(s => s.t > 0 || s.year <= 1998);
  const showOtl = sorted.some(s => s.otl > 0 || s.year >= 1999) || !!liveRow;

  return (
    <div className="rounded-xl border overflow-x-auto" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <table className="w-full text-xs sm:text-sm tabular-nums">
        <thead>
          <tr className="text-left text-[var(--text-muted)] border-b" style={{ borderColor: "var(--border)" }}>
            <th className="pl-4 py-2 font-medium text-[10px] uppercase tracking-wider">Season</th>
            <th className="py-2 px-2 font-medium text-[10px] uppercase tracking-wider">League</th>
            <th className="py-2 px-2 font-medium text-[10px] uppercase tracking-wider">Team</th>
            <th className="py-2 px-2 font-medium text-[10px] uppercase tracking-wider text-right">W</th>
            <th className="py-2 px-2 font-medium text-[10px] uppercase tracking-wider text-right">L</th>
            {showT && <th className="py-2 px-2 font-medium text-[10px] uppercase tracking-wider text-right">T</th>}
            {showOtl && <th className="py-2 px-2 font-medium text-[10px] uppercase tracking-wider text-right">OTL</th>}
            <th className="py-2 px-2 font-medium text-[10px] uppercase tracking-wider text-right">Pts</th>
            <th className="py-2 px-2 font-medium text-[10px] uppercase tracking-wider text-right">Pts%</th>
            <th className="py-2 px-2 font-medium text-[10px] uppercase tracking-wider text-right">GF</th>
            <th className="py-2 px-2 font-medium text-[10px] uppercase tracking-wider text-right">GA</th>
            <th className="py-2 px-2 font-medium text-[10px] uppercase tracking-wider">Place</th>
            <th className="py-2 pr-4 font-medium text-[10px] uppercase tracking-wider">Postseason</th>
          </tr>
        </thead>
        <tbody>
          {liveRow && (
            <tr
              className="border-b italic"
              style={{ borderColor: "var(--border)", background: "rgba(212, 175, 55, 0.05)" }}
            >
              <td className="pl-4 py-2 font-semibold">
                {seasonLabel(liveRow.year)}
                <span className="block text-[9px] not-italic text-[var(--text-dim)] font-normal">
                  In progress · ESPN
                </span>
              </td>
              <td className="py-2 px-2 text-[var(--text-muted)]">NHL</td>
              <td className="py-2 px-2 text-[var(--text-muted)]">{liveRow.gp} GP</td>
              <td className="py-2 px-2 text-right">{liveRow.w}</td>
              <td className="py-2 px-2 text-right">{liveRow.l}</td>
              {showT && <td className="py-2 px-2 text-right text-[var(--text-dim)]">—</td>}
              {showOtl && <td className="py-2 px-2 text-right">{liveRow.otl}</td>}
              <td className="py-2 px-2 text-right font-semibold">{liveRow.pts}</td>
              <td className="py-2 px-2 text-right text-[var(--text-muted)]">{liveRow.pts_pct.toFixed(3).replace(/^0/, "")}</td>
              <td className="py-2 px-2 text-right">{liveRow.gf}</td>
              <td className="py-2 px-2 text-right">{liveRow.ga}</td>
              <td className="py-2 px-2 text-[var(--text-dim)]">—</td>
              <td className="py-2 pr-4 text-[10px] uppercase tracking-widest text-[var(--text-dim)]">As of {liveRow.asOf}</td>
            </tr>
          )}
          {sorted.map((s) => {
            const chip = postseasonChip(s);
            return (
              <tr key={s.year} className="border-b last:border-b-0 hover:bg-[var(--bg-card-hover)]" style={{ borderColor: "var(--border)" }}>
                <td className="pl-4 py-2 font-medium">{seasonLabel(s.year)}</td>
                <td className="py-2 px-2 text-[var(--text-muted)]">{s.league}</td>
                <td className="py-2 px-2 text-[var(--text-muted)]">{s.city} {s.team}</td>
                <td className="py-2 px-2 text-right">{s.w}</td>
                <td className="py-2 px-2 text-right">{s.l}</td>
                {showT && <td className="py-2 px-2 text-right">{s.t || ""}</td>}
                {showOtl && <td className="py-2 px-2 text-right">{s.otl || ""}</td>}
                <td className="py-2 px-2 text-right font-semibold">{s.pts}</td>
                <td className="py-2 px-2 text-right text-[var(--text-muted)]">{s.pts_pct ? s.pts_pct.toFixed(3).replace(/^0/, "") : "—"}</td>
                <td className="py-2 px-2 text-right">{s.gf}</td>
                <td className="py-2 px-2 text-right">{s.ga}</td>
                <td className="py-2 px-2 text-[var(--text-muted)]">{s.place || ""}</td>
                <td className="py-2 pr-4">
                  {chip ? (
                    <span
                      className="inline-flex items-center text-[9px] uppercase tracking-widest font-semibold px-1.5 py-0.5 rounded whitespace-nowrap"
                      style={{ background: chip.bg, color: chip.color }}
                    >
                      {s.best_rec_leag && !s.champ ? "Pres · " : ""}{chip.label}
                    </span>
                  ) : s.best_rec_leag ? (
                    <span
                      className="inline-flex items-center text-[9px] uppercase tracking-widest font-semibold px-1.5 py-0.5 rounded"
                      style={{ background: "#c0c0c0", color: "#1a1a1a" }}
                    >
                      Pres
                    </span>
                  ) : (
                    <span className="text-[var(--text-dim)]">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
