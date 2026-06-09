"use client";

import Link from "next/link";
import { useState } from "react";
import type { TopGameLeagueRow } from "@/lib/nfl";
import { WatchButton, type GameVideo } from "@/app/teams/_shared/GameVideo";

// Replace the bare "Super Bowl" round label with a numbered one ("SB 50"
// for the 2015 season, "SB " + roman for every other Super Bowl). Other
// round names ("NFL Champ", "Wk 18", "Divisional", etc.) pass through.
// Compact US-state abbreviator. Mirrors lib/nfl.ts US_STATE_ABBR so the
// client bundle doesn't need to import a value from the server-only data
// module. Non-US states (international NFL games) pass through unchanged.
const US_STATE_ABBR: Record<string, string> = {
  "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR",
  "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE",
  "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID",
  "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
  "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
  "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS",
  "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
  "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT",
  "Vermont": "VT", "Virginia": "VA", "Washington": "WA", "West Virginia": "WV",
  "Wisconsin": "WI", "Wyoming": "WY", "District of Columbia": "DC",
};

function abbrevState(state: string | null | undefined): string {
  if (!state) return "";
  return US_STATE_ABBR[state] || state;
}

function roundLabel(seasonYear: number, round: string): string {
  if (round !== "Super Bowl") return round;
  const n = seasonYear - 1965;
  if (n < 1) return round;
  if (n === 50) return "SB 50";
  return "SB " + toRoman(n);
}

function toRoman(num: number): string {
  const lookup: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let result = "";
  for (const [value, sym] of lookup) {
    while (num >= value) { result += sym; num -= value; }
  }
  return result;
}


type Row = TopGameLeagueRow & { video?: GameVideo };

type Props = {
  allTime: Row[];
  byDecade: Record<string, Row[]>;
};

// Decade keys are integer-strings like "1920", "1930", ..., "2020".
// Sort descending so the most recent decade comes first after "All-time".
function decadeKeys(byDecade: Record<string, TopGameLeagueRow[]>): string[] {
  return Object.keys(byDecade)
    .filter((k) => /^\d{4}$/.test(k))
    .sort((a, b) => Number(b) - Number(a));
}

export default function TopGamesTable({ allTime, byDecade }: Props) {
  const [bucket, setBucket] = useState<string>("all"); // "all" | "1920" | ...
  const rows = bucket === "all" ? allTime : (byDecade[bucket] ?? []);

  const decades = decadeKeys(byDecade);

  return (
    <section
      className="rounded-xl border p-5 mt-4"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <h2 className="text-base font-semibold">Top games of all-time</h2>
      <p className="text-xs text-[var(--text-muted)] mt-1 mb-3">
        Ranked by the site's Game Score (ELO) metric, which combines hype, quality, stakes,
        and matchup rank. Switch the filter for the top 10 of any decade.
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
                key={`${g.year}-${g.winner_canonical}-${g.loser_canonical}-${i}`}
                className="border-t"
                style={{ borderColor: "var(--border)" }}
              >
                <td className="py-2 pr-3 text-[var(--text-muted)]">{i + 1}</td>
                <td className="py-2 pr-3 whitespace-nowrap">{g.date ?? g.year}</td>
                <td className="py-2 pr-3 text-[var(--text-muted)]">
                  {g.year}{g.round ? ` ${roundLabel(g.year, g.round)}` : ""}{g.ot ? " · OT" : ""}
                </td>
                <td className="py-2 pr-3">
                  <div className="leading-tight">
                    {g.winner_slug ? (
                      <Link href={`/teams/nfl/${g.winner_slug}`} className="font-semibold hover:text-[var(--accent)] hover:underline decoration-dotted underline-offset-2">
                        {g.winner_city} {g.winner_team}
                      </Link>
                    ) : (
                      <span className="font-semibold">{g.winner_city} {g.winner_team}</span>
                    )}{" "}
                    <span className="tabular-nums font-semibold" style={{ color: "var(--accent)" }}>{g.winner_score}</span>
                    <span className="mx-1 text-[var(--text-dim)]">{g.is_tie ? "=" : "-"}</span>
                    <span className="tabular-nums text-[var(--text-muted)]">{g.loser_score}</span>{" "}
                    {g.loser_slug ? (
                      <Link href={`/teams/nfl/${g.loser_slug}`} className="text-[var(--text-muted)] hover:text-[var(--accent)] hover:underline decoration-dotted underline-offset-2">
                        {g.loser_city} {g.loser_team}
                      </Link>
                    ) : (
                      <span className="text-[var(--text-muted)]">{g.loser_city} {g.loser_team}</span>
                    )}
                  </div>
                  {g.stadium ? (
                    <div
                      className="text-[10px] mt-0.5 truncate font-medium tracking-wide"
                      style={{ color: "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace" }}
                      title={[g.stadium, g.stadium_city, g.stadium_state].filter(Boolean).join(" — ")}
                    >
                      {g.stadium}
                      {g.stadium_city ? (
                        <span className="ml-1 opacity-80">
                          · {g.stadium_city}{g.stadium_state ? `, ${abbrevState(g.stadium_state)}` : ""}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  {g.video ? <WatchButton video={g.video} /> : null}
                </td>
                <td className="py-2 text-right font-semibold">{g.du.toFixed(3)}</td>
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
