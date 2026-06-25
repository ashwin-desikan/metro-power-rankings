"use client";

import Link from "next/link";
import { useState } from "react";
import type { TopGameLeagueRow } from "@/lib/mlb";
import { WatchButton, type GameVideo } from "@/app/teams/_shared/GameVideo";
import CrestIcon from "@/app/teams/_shared/CrestIcon";

type Row = TopGameLeagueRow & { video?: GameVideo };

type Props = {
  allTime: Row[];
  byDecade: Record<string, Row[]>;
};

function decadeKeys(byDecade: Record<string, TopGameLeagueRow[]>): string[] {
  return Object.keys(byDecade)
    .filter((k) => /^\d{4}$/.test(k))
    .sort((a, b) => Number(b) - Number(a));
}

export default function TopGamesTable({ allTime, byDecade }: Props) {
  const [bucket, setBucket] = useState<string>("all");
  const rows = bucket === "all" ? allTime : (byDecade[bucket] ?? []);
  const decades = decadeKeys(byDecade);

  return (
    <section
      className="rounded-xl border p-5 mt-4"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <h2 className="text-base font-semibold">Top postseason games of all-time</h2>
      <p className="text-xs text-[var(--text-muted)] mt-1 mb-3">
        Ranked by the site's Game Score metric, which combines hype, quality, stakes, and matchup rank for every postseason game from 1882 onwards.
        Switch the filter for the top 10 of any decade.
        <a href="/methodology#game-score" className="hover:text-[var(--text)] ml-1 underline decoration-dotted">Methodology</a>.
      </p>

      <div className="flex flex-wrap gap-1.5 mb-4">
        <button
          type="button"
          onClick={() => setBucket("all")}
          className="text-xs px-3 py-1 rounded-full border transition-colors"
          style={
            bucket === "all"
              ? { background: "var(--accent-dim)", color: "var(--text)", borderColor: "var(--accent-dim)" }
              : { background: "var(--bg-card)", color: "var(--text-muted)", borderColor: "var(--border)" }
          }
        >
          All-time top 50
        </button>
        {decades.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setBucket(d)}
            className="text-xs px-3 py-1 rounded-full border transition-colors"
            style={
              bucket === d
                ? { background: "var(--accent-dim)", color: "var(--text)", borderColor: "var(--accent-dim)" }
                : { background: "var(--bg-card)", color: "var(--text-muted)", borderColor: "var(--border)" }
            }
          >
            {d}s
          </button>
        ))}
      </div>

      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full text-xs tabular-nums [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-[var(--bg)]">
          <thead>
            <tr className="text-[var(--text-muted)]">
              <th className="text-left font-medium py-2 uppercase tracking-wider text-[10px] pr-3">#</th>
              <th className="text-left font-medium py-2 uppercase tracking-wider text-[10px] pr-3">Date</th>
              <th className="text-left font-medium py-2 uppercase tracking-wider text-[10px] pr-3">Round</th>
              <th className="text-left font-medium py-2 uppercase tracking-wider text-[10px] pr-3">Match</th>
              <th className="text-right font-medium py-2 uppercase tracking-wider text-[10px]">Game Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g, i) => (
              <tr
                key={`${g.year}-${g.winner_canonical}-${g.loser_canonical}-${g.game_num ?? ""}-${i}`}
                className="border-t"
                style={{ borderColor: "var(--border)" }}
              >
                <td className="py-2 pr-3 text-[var(--text-muted)]">{i + 1}</td>
                <td className="py-2 pr-3 whitespace-nowrap">{g.date ?? g.year}</td>
                <td className="py-2 pr-3 text-[var(--text-muted)]">
                  {g.year}{g.round ? ` ${g.round}` : ""}{g.game_num ? ` G${g.game_num}` : ""}{g.extra_innings ? " · Extras" : ""}
                </td>
                <td className="py-2 pr-3">
                  <div className="leading-tight">
                    <CrestIcon name={`${g.winner_city} ${g.winner_team}`} size={18} className="mr-1.5 align-middle" />
                    {g.winner_slug ? (
                      <Link href={`/teams/mlb/${g.winner_slug}`} className="font-semibold hover:text-[var(--accent)] hover:underline decoration-dotted underline-offset-2">
                        {g.winner_city} {g.winner_team}
                      </Link>
                    ) : (
                      <span className="font-semibold">{g.winner_city} {g.winner_team}</span>
                    )}{" "}
                    <span className="tabular-nums font-semibold" style={{ color: "var(--accent)" }}>{g.winner_score}</span>
                    <span className="mx-1 text-[var(--text-dim)]">{g.is_tie ? "=" : "-"}</span>
                    <span className="tabular-nums text-[var(--text-muted)]">{g.loser_score}</span>{" "}
                    <CrestIcon name={`${g.loser_city} ${g.loser_team}`} size={18} className="mr-1.5 align-middle" />
                    {g.loser_slug ? (
                      <Link href={`/teams/mlb/${g.loser_slug}`} className="text-[var(--text-muted)] hover:text-[var(--accent)] hover:underline decoration-dotted underline-offset-2">
                        {g.loser_city} {g.loser_team}
                      </Link>
                    ) : (
                      <span className="text-[var(--text-muted)]">{g.loser_city} {g.loser_team}</span>
                    )}
                  </div>
                  {g.stadium ? (() => {
                    const locParts = [g.stadium_city, g.stadium_state].filter(Boolean).join(", ");
                    const title = g.stadium_canonical && g.stadium_canonical !== g.stadium
                      ? `${g.stadium} (now ${g.stadium_canonical})${locParts ? " — " + locParts : ""}`
                      : `${g.stadium}${locParts ? " — " + locParts : ""}`;
                    return (
                      <div
                        className="text-[10px] mt-0.5 truncate font-medium tracking-wide"
                        style={{ color: "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace" }}
                        title={title}
                      >
                        {g.stadium}
                        {locParts ? <span className="ml-1 opacity-80">· {locParts}</span> : null}
                      </div>
                    );
                  })() : null}
                  {g.video ? <WatchButton video={g.video} /> : null}
                </td>
                <td className="py-2 text-right font-semibold">{g.game_score.toFixed(3)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-[var(--text-dim)] italic">
                  No games in this bucket.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
