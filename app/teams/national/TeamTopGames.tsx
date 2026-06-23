"use client";

import Link from "next/link";
import type { TopGameNationalTeamRow } from "@/lib/international";

// Per-team "greatest games" on a national-team page: this team's top tournament
// matches by Game Score, this-team perspective (result W/D/L, score, opponent).
const RES: Record<string, { label: string; color: string }> = {
  W: { label: "W", color: "var(--accent)" },
  D: { label: "D", color: "var(--text-muted)" },
  L: { label: "L", color: "var(--text-dim)" },
};

export default function TeamTopGames({ rows, teamName }: { rows: TopGameNationalTeamRow[]; teamName: string }) {
  if (!rows || rows.length === 0) return null;
  return (
    <section className="rounded-xl border p-5 mb-6" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <h2 className="text-base font-semibold">Greatest games</h2>
      <p className="text-xs text-[var(--text-muted)] mt-1 mb-3">
        {teamName}&apos;s top tournament matches by the site&apos;s Game Score (ELO).
        <a href="/methodology#game-score" className="ml-1 underline decoration-dotted hover:text-[var(--text)]">Methodology</a>.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="text-[var(--text-muted)]">
              <th className="text-left font-medium py-2 uppercase tracking-wider text-[10px] pr-3">#</th>
              <th className="text-left font-medium py-2 uppercase tracking-wider text-[10px] pr-3">Date</th>
              <th className="text-left font-medium py-2 uppercase tracking-wider text-[10px] pr-3">Stage</th>
              <th className="text-left font-medium py-2 uppercase tracking-wider text-[10px] pr-3">Result</th>
              <th className="text-right font-medium py-2 uppercase tracking-wider text-[10px]">Game Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g, i) => {
              const r = RES[g.result] ?? RES.D;
              return (
                <tr key={`${g.year}-${g.opp_name}-${i}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 pr-3 text-[var(--text-muted)]">{i + 1}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">{g.date ?? g.year}</td>
                  <td className="py-2 pr-3 text-[var(--text-muted)] whitespace-nowrap">{g.competition}{g.round ? ` · ${g.round}` : ""}</td>
                  <td className="py-2 pr-3">
                    <span className="font-semibold" style={{ color: r.color }}>{r.label}</span>{" "}
                    <span className="tabular-nums">{g.for_score}-{g.against_score}</span>{" "}
                    <span className="text-[var(--text-muted)]">v</span>{" "}
                    {g.opp_slug ? (
                      <Link href={`/teams/national/${g.opp_slug}`} className="hover:text-[var(--accent)] hover:underline decoration-dotted underline-offset-2">{g.opp_name}</Link>
                    ) : (
                      <span>{g.opp_name}</span>
                    )}
                    {g.pens ? <span className="ml-1 text-[10px] text-[var(--text-dim)]">(pens {g.pens})</span> : null}
                  </td>
                  <td className="py-2 text-right font-semibold">{g.game_score.toFixed(3)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
