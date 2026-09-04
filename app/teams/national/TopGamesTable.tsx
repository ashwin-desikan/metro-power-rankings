"use client";

import Link from "next/link";
import { useState } from "react";
import type { TopGameNationalRow } from "@/lib/international";
import { WatchButton, type GameVideo } from "@/app/teams/_shared/GameVideo";

// International Football "greatest games" table, mirroring the NFL/NBA/MLB
// TopGamesTable: an all-time list plus a per-decade filter, ranked by the
// workbook Game Score. Football-specific: shows competition + stage, marks
// draws (decided on penalties) and links both nations to their team pages.
type Row = TopGameNationalRow & { video?: GameVideo };
type Props = { allTime: Row[]; byDecade: Record<string, Row[]>; allTimeLabel?: string };

function decadeKeys(b: Record<string, Row[]>): string[] {
  return Object.keys(b).filter((k) => /^\d{4}$/.test(k)).sort((a, c) => Number(c) - Number(a));
}

export default function TopGamesTable({ allTime, byDecade, allTimeLabel = "All-time top 50" }: Props) {
  const [bucket, setBucket] = useState<string>("all");
  const rows = bucket === "all" ? allTime : (byDecade[bucket] ?? []);
  const decades = decadeKeys(byDecade);
  const pill = (active: boolean) =>
    active
      ? { background: "var(--accent-dim)", color: "var(--text)", borderColor: "var(--accent-dim)" }
      : { background: "var(--bg-card)", color: "var(--text-muted)", borderColor: "var(--border)" };

  return (
    <section className="rounded-xl border p-5 mt-4" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <h2 className="text-base font-semibold">Top games of all-time</h2>
      <p className="text-xs text-[var(--text-muted)] mt-1 mb-3">
        Ranked by the site&apos;s Game Score (ELO) metric, which combines hype, quality, stakes, and matchup rank.
        Switch the filter for the top 10 of any decade.
        <a href="/methodology#game-score" className="hover:text-[var(--text)] ml-1 underline decoration-dotted">Methodology</a>.
      </p>

      <div className="flex flex-wrap gap-1.5 mb-4">
        <button type="button" onClick={() => setBucket("all")} className="text-xs px-3 py-1 rounded-full border transition-colors" style={pill(bucket === "all")}>
          {allTimeLabel}
        </button>
        {decades.map((d) => (
          <button key={d} type="button" onClick={() => setBucket(d)} className="text-xs px-3 py-1 rounded-full border transition-colors" style={pill(bucket === d)}>
            {d}s
          </button>
        ))}
      </div>

      {/* Mobile: one card per game instead of a 5-column table. Same `rows`
          array (bucket-filtered above) drives both this block and the
          desktop table below. */}
      <div className="grid grid-cols-1 gap-2 sm:hidden max-h-[70vh] overflow-auto">
        {rows.map((g, i) => (
          <div
            key={`${g.year}-${g.winner_name}-${g.loser_name}-${i}-card`}
            className="rounded-lg border p-3"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm leading-tight min-w-0">
                {g.winner_slug ? (
                  <Link href={`/teams/national/${g.winner_slug}`} className="font-semibold hover:text-[var(--accent)] hover:underline decoration-dotted underline-offset-2">{g.winner_name}</Link>
                ) : (
                  <span className="font-semibold">{g.winner_name}</span>
                )}{" "}
                <span className="tabular-nums font-semibold" style={{ color: "var(--accent)" }}>{g.winner_score}</span>
                <span className="mx-1 text-[var(--text-dim)]">{g.is_draw ? "=" : "-"}</span>
                <span className="tabular-nums text-[var(--text-muted)]">{g.loser_score}</span>{" "}
                {g.loser_slug ? (
                  <Link href={`/teams/national/${g.loser_slug}`} className="text-[var(--text-muted)] hover:text-[var(--accent)] hover:underline decoration-dotted underline-offset-2">{g.loser_name}</Link>
                ) : (
                  <span className="text-[var(--text-muted)]">{g.loser_name}</span>
                )}
                {g.pens ? <span className="ml-1 text-[10px] text-[var(--text-dim)]">(pens {g.pens})</span> : null}
              </div>
              <span className="flex-shrink-0 text-xs tabular-nums text-[var(--text-muted)]">
                #{i + 1}
              </span>
            </div>
            {g.stadium ? (
              <div className="text-[10px] mt-1 font-medium tracking-wide" style={{ color: "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace" }}>
                {g.stadium}{g.stadium_metro ? <span className="ml-1 opacity-80">· {g.stadium_metro}{g.stadium_country ? `, ${g.stadium_country}` : ""}</span> : null}
              </div>
            ) : null}
            {g.video ? <div className="mt-1"><WatchButton video={g.video} /></div> : null}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs mt-2">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Date</div>
                <div className="tabular-nums">{g.date ?? g.year}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Stage</div>
                <div className="text-[var(--text-muted)]">{g.competition}{g.round ? ` · ${g.round}` : ""}</div>
              </div>
              <div className="col-span-2">
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Game Score</div>
                <div className="tabular-nums font-semibold">{g.game_score.toFixed(3)}</div>
              </div>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="py-6 text-center text-xs text-[var(--text-dim)] italic">No games in this bucket.</p>
        )}
      </div>

      <div className="max-h-[70vh] overflow-auto hidden sm:block">
        <table className="w-full text-xs tabular-nums [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-[var(--bg)]">
          <thead>
            <tr className="text-[var(--text-muted)]">
              <th className="text-left font-medium py-2 uppercase tracking-wider text-[10px] pr-3">#</th>
              <th className="text-left font-medium py-2 uppercase tracking-wider text-[10px] pr-3">Date</th>
              <th className="text-left font-medium py-2 uppercase tracking-wider text-[10px] pr-3">Stage</th>
              <th className="text-left font-medium py-2 uppercase tracking-wider text-[10px] pr-3">Match</th>
              <th className="text-right font-medium py-2 uppercase tracking-wider text-[10px]">Game Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g, i) => (
              <tr key={`${g.year}-${g.winner_name}-${g.loser_name}-${i}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-2 pr-3 text-[var(--text-muted)]">{i + 1}</td>
                <td className="py-2 pr-3 whitespace-nowrap">{g.date ?? g.year}</td>
                <td className="py-2 pr-3 text-[var(--text-muted)] whitespace-nowrap">
                  {g.competition}{g.round ? ` · ${g.round}` : ""}
                </td>
                <td className="py-2 pr-3">
                  <div className="leading-tight">
                    {g.winner_slug ? (
                      <Link href={`/teams/national/${g.winner_slug}`} className="font-semibold hover:text-[var(--accent)] hover:underline decoration-dotted underline-offset-2">{g.winner_name}</Link>
                    ) : (
                      <span className="font-semibold">{g.winner_name}</span>
                    )}{" "}
                    <span className="tabular-nums font-semibold" style={{ color: "var(--accent)" }}>{g.winner_score}</span>
                    <span className="mx-1 text-[var(--text-dim)]">{g.is_draw ? "=" : "-"}</span>
                    <span className="tabular-nums text-[var(--text-muted)]">{g.loser_score}</span>{" "}
                    {g.loser_slug ? (
                      <Link href={`/teams/national/${g.loser_slug}`} className="text-[var(--text-muted)] hover:text-[var(--accent)] hover:underline decoration-dotted underline-offset-2">{g.loser_name}</Link>
                    ) : (
                      <span className="text-[var(--text-muted)]">{g.loser_name}</span>
                    )}
                    {g.pens ? <span className="ml-1 text-[10px] text-[var(--text-dim)]">(pens {g.pens})</span> : null}
                  </div>
                  {g.stadium ? (
                    <div className="text-[10px] mt-0.5 truncate font-medium tracking-wide" style={{ color: "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace" }} title={[g.stadium, g.stadium_metro, g.stadium_country].filter(Boolean).join(", ")}>
                      {g.stadium}{g.stadium_metro ? <span className="ml-1 opacity-80">· {g.stadium_metro}{g.stadium_country ? `, ${g.stadium_country}` : ""}</span> : null}
                    </div>
                  ) : null}
                  {g.video ? <WatchButton video={g.video} /> : null}
                </td>
                <td className="py-2 text-right font-semibold">{g.game_score.toFixed(3)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-[var(--text-dim)] italic">No games in this bucket.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
