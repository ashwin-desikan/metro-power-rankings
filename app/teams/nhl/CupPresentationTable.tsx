"use client";

import Link from "next/link";
import { useState } from "react";
import type { CupPresentationGame } from "@/lib/nhl";

const ABBR: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA",
  Colorado: "CO", Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA",
  Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA",
  Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO",
  Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ",
  "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH",
  Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT",
  Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY",
  "District of Columbia": "DC",
  Alberta: "AB", "British Columbia": "BC", Manitoba: "MB", "New Brunswick": "NB",
  "Newfoundland and Labrador": "NL", Newfoundland: "NL", "Nova Scotia": "NS",
  Ontario: "ON", "Prince Edward Island": "PE", Quebec: "QC", Saskatchewan: "SK",
  "Northwest Territories": "NT", Nunavut: "NU", Yukon: "YT",
};
function abbrev(s: string): string {
  return ABBR[s] || s;
}

function roundLabel(round: string): string {
  if (/challenge/i.test(round)) return "SC Challenge";
  if (/final/i.test(round)) return "SC Final";
  return round;
}

function decadeKeys(byDecade: Record<string, CupPresentationGame[]>): string[] {
  return Object.keys(byDecade)
    .filter((k) => /^\d{4}$/.test(k))
    .sort((a, b) => Number(b) - Number(a));
}

type Props = {
  allTime: CupPresentationGame[];
  byDecade: Record<string, CupPresentationGame[]>;
};

export default function CupPresentationTable({ allTime, byDecade }: Props) {
  const decades = decadeKeys(byDecade);
  const [bucket, setBucket] = useState<string>(decades[0] ?? "all");
  const rows = bucket === "all" ? allTime : (byDecade[bucket] ?? []);

  const tab = (active: boolean) =>
    active
      ? { background: "var(--accent-dim)", color: "var(--text)", borderColor: "var(--accent-dim)" }
      : { background: "var(--bg-card)", color: "var(--text-muted)", borderColor: "var(--border)" };

  return (
    <section
      className="rounded-xl border p-5 mt-4"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <h2 className="text-base font-semibold">Stanley Cup presentation games</h2>
      <p className="text-xs text-[var(--text-muted)] mt-1 mb-3">
        Every game and challenge at which the Stanley Cup was awarded, from the
        first challenge in 1893 to today. Filter by decade, or show the full list.
      </p>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {decades.map((d) => (
          <button key={d} type="button" onClick={() => setBucket(d)}
            className="text-xs px-3 py-1 rounded-full border transition-colors" style={tab(bucket === d)}>
            {d}s
          </button>
        ))}
        <button type="button" onClick={() => setBucket("all")}
          className="text-xs px-3 py-1 rounded-full border transition-colors" style={tab(bucket === "all")}>
          All {allTime.length}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="text-[var(--text-muted)]">
              <th className="text-left font-medium py-2 uppercase tracking-wider text-[10px] pr-3">#</th>
              <th className="text-left font-medium py-2 uppercase tracking-wider text-[10px] pr-3">Date</th>
              <th className="text-left font-medium py-2 uppercase tracking-wider text-[10px] pr-3">Season</th>
              <th className="text-left font-medium py-2 uppercase tracking-wider text-[10px] pr-3">Champion &amp; result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g, i) => {
              const winner = `${g.winner_city} ${g.winner_team}`.trim();
              const loser = `${g.loser_city} ${g.loser_team}`.trim();
              const loc = [g.arena_city, g.arena_state ? abbrev(g.arena_state) : ""].filter(Boolean).join(", ");
              return (
                <tr key={`${g.au}-${g.winner_canonical}-${i}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 pr-3 text-[var(--text-muted)]">{i + 1}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">{g.date ?? g.year}</td>
                  <td className="py-2 pr-3 text-[var(--text-muted)] whitespace-nowrap">
                    {g.year}
                    {g.round ? ` · ${roundLabel(g.round)}` : ""}
                    {g.game_num ? ` · Game ${g.game_num}` : ""}
                    {g.ot ? " · OT" : ""}
                  </td>
                  <td className="py-2 pr-3">
                    <div className="leading-tight">
                      {g.winner_slug ? (
                        <Link href={`/teams/nhl/${g.winner_slug}`} className="font-semibold hover:text-[var(--accent)] hover:underline decoration-dotted underline-offset-2">{winner}</Link>
                      ) : (
                        <span className="font-semibold">{winner}</span>
                      )}
                      {g.league_winner ? (
                        <span className="ml-1.5 text-[var(--text-muted)] italic">League Winner</span>
                      ) : (
                        <>
                          {g.winner_score != null && g.loser_score != null ? (
                            <>
                              {" "}
                              <span className="tabular-nums font-semibold" style={{ color: "var(--accent)" }}>{g.winner_score}</span>
                              <span className="mx-1 text-[var(--text-dim)]">–</span>
                              <span className="tabular-nums text-[var(--text-muted)]">{g.loser_score}</span>{" "}
                            </>
                          ) : (
                            <span className="mx-1 text-[var(--text-dim)]">def.</span>
                          )}
                          {(g.loser_city || g.loser_team) &&
                            (g.loser_slug ? (
                              <Link href={`/teams/nhl/${g.loser_slug}`} className="text-[var(--text-muted)] hover:text-[var(--accent)] hover:underline decoration-dotted underline-offset-2">{loser}</Link>
                            ) : (
                              <span className="text-[var(--text-muted)]">{loser}</span>
                            ))}
                        </>
                      )}
                    </div>
                    {g.arena ? (
                      <div className="text-[10px] mt-0.5 truncate font-medium tracking-wide"
                        style={{ color: "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace" }}
                        title={[g.arena, g.arena_city, g.arena_state].filter(Boolean).join(" — ")}>
                        {g.arena}
                        {loc ? <span className="opacity-80"> · {loc}</span> : null}
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={4} className="py-6 text-center text-[var(--text-dim)] italic">No Cup presentations recorded for this period.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
