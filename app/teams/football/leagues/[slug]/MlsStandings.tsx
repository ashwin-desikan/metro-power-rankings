"use client";

// MLS standings table for the MLS league hub. MLS has no promotion/relegation
// and splits into Eastern/Western conferences, so this renders a combined
// table by default with a toggle to the two-conference view. Honor flags
// (Supporters Shield, made playoffs, conference final, MLS Cup final, MLS Cup)
// come straight from the workbook columns CH/CE/CA/BW/BX.

import { useState } from "react";
import Link from "next/link";
import { monogramForFootball } from "@/lib/football-colors";
import type { MlsStanding } from "@/lib/football";

function TeamCell({ row }: { row: MlsStanding }) {
  const name = row.cur_name;
  const m = monogramForFootball(name, row.slug ?? undefined);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-grid place-items-center rounded-full flex-shrink-0" style={{ background: m.bg, color: m.fg, width: 18, height: 18, fontSize: 8, fontWeight: 700 }} aria-hidden>{m.mono}</span>
      {row.slug ? <Link href={`/teams/football/${row.slug}`} className="hover:underline font-medium">{name}</Link> : <span className="font-medium">{name}</span>}
    </span>
  );
}

function Honors({ row }: { row: MlsStanding }) {
  const badges: React.ReactNode[] = [];
  const gold = { background: "rgba(245,215,110,0.18)", color: "#b58900" } as const;
  if (row.supporters_shield) {
    badges.push(<span key="ss" className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap" style={gold} title="Supporters' Shield (best regular-season record)">★ Shield</span>);
  }
  // Deepest playoff result, most significant first.
  if (row.mls_cup) {
    badges.push(<span key="cup" className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap" style={gold} title="MLS Cup champion">★ MLS Cup</span>);
  } else if (row.mls_cup_app) {
    badges.push(<span key="final" className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap border" style={{ borderColor: "rgba(245,215,110,0.5)", color: "#b58900" }} title="Reached the MLS Cup final">MLS Cup Final</span>);
  } else if (row.playoff_sf) {
    badges.push(<span key="sf" className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap" style={{ background: "rgba(99,102,241,0.12)", color: "#818cf8" }} title="Reached the conference final (final four)">Conf Final</span>);
  } else if (row.playoffs) {
    badges.push(<span key="po" className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap border" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }} title="Qualified for the MLS Cup Playoffs">Playoffs</span>);
  }
  if (badges.length === 0) return <span className="text-[var(--text-dim)]">—</span>;
  return <span className="inline-flex flex-wrap gap-1">{badges}</span>;
}

function Table({ rows, showConf, showHonors }: { rows: MlsStanding[]; showConf: boolean; showHonors: boolean }) {
  return (
    <div className="rounded-xl border overflow-x-auto" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <table className="w-full min-w-[640px] text-sm tabular-nums">
        <thead>
          <tr className="border-b text-[11px] uppercase tracking-wide" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
            <th className="text-left py-2 px-3 font-medium">#</th>
            <th className="text-left py-2 px-3 font-medium">Team</th>
            {showConf && <th className="text-left py-2 px-2 font-medium hidden sm:table-cell">Conf</th>}
            <th className="text-right py-2 px-2 font-medium">W</th>
            <th className="text-right py-2 px-2 font-medium">D</th>
            <th className="text-right py-2 px-2 font-medium">L</th>
            <th className="text-right py-2 px-2 font-medium">Pts</th>
            <th className="text-right py-2 px-2 font-medium hidden sm:table-cell">GF</th>
            <th className="text-right py-2 px-2 font-medium hidden sm:table-cell">GA</th>
            <th className="text-right py-2 px-2 font-medium">GD</th>
            {showHonors && <th className="text-left py-2 px-3 font-medium">Honors</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.cur_name} className="border-b last:border-b-0" style={{ borderColor: "var(--border)", background: r.supporters_shield ? "rgba(245,215,110,0.06)" : undefined }}>
              <td className="py-1.5 px-3 text-[var(--text-muted)]">{i + 1}</td>
              <td className="py-1.5 px-3"><TeamCell row={r} /></td>
              {showConf && <td className="py-1.5 px-2 text-[var(--text-muted)] hidden sm:table-cell">{r.conference ?? "—"}</td>}
              <td className="py-1.5 px-2 text-right">{r.w}</td>
              <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{r.d}</td>
              <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{r.l}</td>
              <td className="py-1.5 px-2 text-right font-semibold">{r.pts ?? "—"}</td>
              <td className="py-1.5 px-2 text-right text-[var(--text-muted)] hidden sm:table-cell">{r.gs}</td>
              <td className="py-1.5 px-2 text-right text-[var(--text-muted)] hidden sm:table-cell">{r.ga}</td>
              <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
              {showHonors && <td className="py-1.5 px-3"><Honors row={r} /></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MlsStandings({ standings, conferences, showHonors = true }: { standings: MlsStanding[]; conferences: string[]; showHonors?: boolean }) {
  const [view, setView] = useState<"combined" | "conference">("combined");
  const btn = (active: boolean) =>
    `text-xs px-3 py-1 rounded-md border transition ${active ? "" : "hover:border-[var(--accent)] hover:text-[var(--accent)]"}`;
  return (
    <section className="mb-8">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h2 className="text-lg font-semibold">Current standings</h2>
        <div className="inline-flex gap-1.5">
          <button type="button" onClick={() => setView("combined")} className={btn(view === "combined")}
            style={{ background: view === "combined" ? "var(--accent)" : "var(--bg-card)", borderColor: view === "combined" ? "var(--accent)" : "var(--border)", color: view === "combined" ? "#0b0f17" : "var(--text)" }}>
            Combined
          </button>
          <button type="button" onClick={() => setView("conference")} className={btn(view === "conference")}
            style={{ background: view === "conference" ? "var(--accent)" : "var(--bg-card)", borderColor: view === "conference" ? "var(--accent)" : "var(--border)", color: view === "conference" ? "#0b0f17" : "var(--text)" }}>
            By conference
          </button>
        </div>
      </div>

      {view === "combined" ? (
        <Table rows={standings} showConf showHonors={showHonors} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {conferences.map((conf) => {
            const rows = standings.filter((r) => r.conference === conf);
            return (
              <div key={conf}>
                <h3 className="text-sm font-semibold mb-2">{conf} Conference</h3>
                <Table rows={rows} showConf={false} showHonors={showHonors} />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
