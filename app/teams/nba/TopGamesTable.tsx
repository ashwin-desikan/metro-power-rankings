"use client";

import Link from "next/link";
import { useState } from "react";
import type { TopGameLeagueRow } from "@/lib/nba";
import { WatchButton, type GameVideo } from "@/app/teams/_shared/GameVideo";

const US_STATE_ABBR: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR",
  California: "CA", Colorado: "CO", Connecticut: "CT", Delaware: "DE",
  Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID",
  Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS",
  Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS",
  Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK",
  Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT",
  Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV",
  Wisconsin: "WI", Wyoming: "WY", "District of Columbia": "DC",
};

function abbrevState(state: string | null | undefined): string {
  if (!state) return "";
  return US_STATE_ABBR[state] || state;
}

// Collapse verbose NBA round names to short tokens for the table.
function roundLabel(round: string, gameNum: number | null | undefined): string {
  const label = round
    .replace("NBA Finals", "Finals")
    .replace("Conference Finals", "Conf Finals")
    .replace("Conference Semifinals", "Conf Semis")
    .replace("Conference Quarterfinals", "Conf Qtrs")
    .replace("First Round", "1st Round")
    .replace("ABA Finals", "ABA Finals")
    .replace("Divisional", "Divisional")
    .replace("Tiebreaker", "Tiebreaker");
  return gameNum ? `${label} G${gameNum}` : label;
}

function otLabel(ot: boolean, count: number | null | undefined): string {
  if (!ot) return "";
  return (count ?? 1) > 1 ? ` · ${count}OT` : " · OT";
}

function decadeKeys(byDecade: Record<string, TopGameLeagueRow[]>): string[] {
  return Object.keys(byDecade)
    .filter((k) => /^\d{4}$/.test(k))
    .sort((a, b) => Number(b) - Number(a));
}

type Row = TopGameLeagueRow & { video?: GameVideo };

type Props = {
  allTime: Row[];
  byDecade: Record<string, Row[]>;
};

export default function TopGamesTable({ allTime, byDecade }: Props) {
  const [bucket, setBucket] = useState<string>("all");
  const rows = bucket === "all" ? allTime : (byDecade[bucket] ?? []);
  const decades = decadeKeys(byDecade);

  return (
    <section
      className="rounded-xl border p-5 mt-4"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <h2 className="text-base font-semibold">Top games of all-time</h2>
      <p className="text-xs text-[var(--text-muted)] mt-1 mb-3">
        Ranked by Game Score — a composite of game stakes, quality, and matchup
        strength weighted by round and ELO. Switch the filter for the top 10 of
        any decade.{" "}
        <a
          href="/methodology#game-score"
          className="hover:text-[var(--text)] underline decoration-dotted"
        >
          Methodology
        </a>
        .
      </p>

      {/* Decade filter tabs */}
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
                key={`${g.year}-${g.winner_canonical}-${g.loser_canonical}-${i}`}
                className="border-t"
                style={{ borderColor: "var(--border)" }}
              >
                <td className="py-2 pr-3 text-[var(--text-muted)]">{i + 1}</td>
                <td className="py-2 pr-3 whitespace-nowrap">{g.date ?? g.year}</td>
                <td className="py-2 pr-3 text-[var(--text-muted)]">
                  {g.year}
                  {g.round ? ` · ${roundLabel(g.round, g.game_num)}` : ""}
                  {otLabel(g.ot, g.ot_count)}
                </td>
                <td className="py-2 pr-3">
                  <div className="leading-tight">
                    {g.winner_slug ? (
                      <Link
                        href={`/teams/nba/${g.winner_slug}`}
                        className="font-semibold hover:text-[var(--accent)] hover:underline decoration-dotted underline-offset-2"
                      >
                        {g.winner_city} {g.winner_team}
                      </Link>
                    ) : (
                      <span className="font-semibold">
                        {g.winner_city} {g.winner_team}
                      </span>
                    )}{" "}
                    <span
                      className="tabular-nums font-semibold"
                      style={{ color: "var(--accent)" }}
                    >
                      {g.winner_pts}
                    </span>
                    <span className="mx-1 text-[var(--text-dim)]">–</span>
                    <span className="tabular-nums text-[var(--text-muted)]">
                      {g.loser_pts}
                    </span>{" "}
                    {g.loser_slug ? (
                      <Link
                        href={`/teams/nba/${g.loser_slug}`}
                        className="text-[var(--text-muted)] hover:text-[var(--accent)] hover:underline decoration-dotted underline-offset-2"
                      >
                        {g.loser_city} {g.loser_team}
                      </Link>
                    ) : (
                      <span className="text-[var(--text-muted)]">
                        {g.loser_city} {g.loser_team}
                      </span>
                    )}
                  </div>
                  {(g.arena_as_of || g.arena_canonical) ? (
                    <div
                      className="text-[10px] mt-0.5 truncate font-medium tracking-wide"
                      style={{
                        color: "var(--text-dim)",
                        fontFamily: "'JetBrains Mono', monospace",
                      }}
                      title={[(g.arena_as_of || g.arena_canonical), g.arena_metro, g.arena_state]
                        .filter(Boolean)
                        .join(" — ")}
                    >
                      {g.arena_as_of || g.arena_canonical}
                      {g.arena_metro ? (
                        <span className="ml-1 opacity-80">
                          · {g.arena_metro}
                          {g.arena_state ? `, ${abbrevState(g.arena_state)}` : ""}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  {g.video ? <WatchButton video={g.video} /> : null}
                </td>
                <td className="py-2 text-right font-semibold">
                  {g.game_score != null ? g.game_score.toFixed(3) : "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="py-6 text-center text-[var(--text-dim)] italic"
                >
                  No games recorded for this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
