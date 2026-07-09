"use client";

import { useState } from "react";
import Link from "next/link";
import { euroleagueClubColor, euroleagueMonogram } from "@/lib/euroleague-colors";
import TeamCrest from "@/app/teams/_shared/TeamCrest";

type Club = {
  name: string; country: string; w: number; l: number; seasons: number;
  f4: number; finals: number; titles: number; title_years: string[];
  in_team_list: boolean; metro: string | null; metro_slug: string | null;
};

const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const GOLD = "#d4af37";

export default function EuroleagueClubsTable({ clubs }: { clubs: Club[] }) {
  const [view, setView] = useState<"all" | "current">("all");
  const rows = [...clubs]
    .filter((c) => (view === "current" ? c.in_team_list : true))
    .sort((a, b) => b.titles - a.titles || b.f4 - a.f4 || b.w - a.w);
  const currentCount = clubs.filter((c) => c.in_team_list).length;

  return (
    <div>
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        {([["all", `All teams ${clubs.length}`], ["current", `Current EuroLeague ${currentCount}`]] as const).map(
          ([key, label]) => {
            const active = view === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                className="text-xs rounded-full px-3 py-1 border transition"
                style={{
                  borderColor: active ? "var(--accent)" : "var(--border)",
                  backgroundColor: active ? "var(--accent)" : "transparent",
                  color: active ? "#fff" : "var(--text-muted)",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {label}
              </button>
            );
          },
        )}
      </div>

      {/* Mobile: one card per club instead of a cramped 8-column table.
          Same sorted/filtered `rows` array drives both views. */}
      <div className="grid grid-cols-1 gap-2 sm:hidden max-h-[560px] overflow-y-auto">
        {rows.map((c) => {
          const col = euroleagueClubColor(c.name);
          return (
            <div key={c.name} className="rounded-lg border p-3" style={card}>
              <div className="flex items-center gap-2 min-w-0">
                <TeamCrest
                  name={c.name}
                  size={22}
                  fallback={
                    col.known ? (
                      <span
                        className="inline-grid place-items-center rounded-full flex-shrink-0"
                        style={{ background: col.bg, color: col.fg, width: 22, height: 22, fontSize: 9, fontWeight: 700 }}
                        aria-hidden
                      >
                        {euroleagueMonogram(c.name)}
                      </span>
                    ) : (
                      <span className="inline-block flex-shrink-0" style={{ width: 22 }} aria-hidden />
                    )
                  }
                />
                <span className="truncate font-medium text-sm">{c.name}</span>
                {!c.in_team_list && c.titles > 0 ? (
                  <span className="text-[10px] text-[var(--text-dim)] flex-shrink-0">· historic</span>
                ) : null}
              </div>
              <div className="text-[11px] text-[var(--text-dim)] mt-0.5">
                {c.country}
                {c.metro_slug ? (
                  <>
                    {" · "}
                    <Link href={`/rankings/${c.metro_slug}`} className="hover:text-[var(--accent)]">{c.metro}</Link>
                  </>
                ) : null}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Seasons</div>
                  <div className="tabular-nums" style={mono}>{c.seasons}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">W&ndash;L</div>
                  <div className="tabular-nums" style={mono}>{c.w}&ndash;{c.l}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">F4s</div>
                  <div className="tabular-nums" style={mono}>{c.f4}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Titles</div>
                  <div className="tabular-nums font-semibold" style={{ ...mono, color: c.titles > 0 ? GOLD : "var(--text-dim)" }}>{c.titles}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border overflow-x-auto max-h-[560px] overflow-y-auto hidden sm:block" style={card}>
        <table className="w-full text-sm min-w-[700px]">
          <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
            <tr className="text-left text-xs text-[var(--text-muted)]">
              <th className="py-2 px-3 font-medium">Club</th>
              <th className="py-2 px-3 font-medium">Country</th>
              <th className="py-2 px-3 font-medium">Metro</th>
              <th className="py-2 px-3 text-right font-medium">Seasons</th>
              <th className="py-2 px-3 text-right font-medium">W</th>
              <th className="py-2 px-3 text-right font-medium">L</th>
              <th className="py-2 px-3 text-right font-medium">F4s</th>
              <th className="py-2 px-3 text-right font-medium" style={{ color: GOLD }}>Titles</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const col = euroleagueClubColor(c.name);
              return (
                <tr key={c.name} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 px-3 font-medium">
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <TeamCrest
                        name={c.name}
                        size={20}
                        fallback={
                          col.known ? (
                            <span
                              className="inline-grid place-items-center rounded-full flex-shrink-0"
                              style={{ background: col.bg, color: col.fg, width: 20, height: 20, fontSize: 8, fontWeight: 700 }}
                              aria-hidden
                            >
                              {euroleagueMonogram(c.name)}
                            </span>
                          ) : (
                            <span className="inline-block flex-shrink-0" style={{ width: 20 }} aria-hidden />
                          )
                        }
                      />
                      <span className="truncate">{c.name}</span>
                      {!c.in_team_list && c.titles > 0 ? (
                        <span className="text-[10px] text-[var(--text-dim)]">· historic</span>
                      ) : null}
                    </span>
                  </td>
                  <td className="py-1.5 px-3 text-xs text-[var(--text-muted)]">{c.country}</td>
                  <td className="py-1.5 px-3 text-xs">
                    {c.metro_slug ? (
                      <Link href={`/rankings/${c.metro_slug}`} className="hover:text-[var(--accent)]">{c.metro}</Link>
                    ) : (
                      <span className="text-[var(--text-dim)]">—</span>
                    )}
                  </td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{c.seasons}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{c.w}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{c.l}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{c.f4}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums font-semibold"
                      style={{ ...mono, color: c.titles > 0 ? GOLD : "var(--text-dim)" }}>
                    {c.titles}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-[var(--text-dim)] mt-2">
        Seasons counts a club&apos;s appearances in the workbook record. For 1958&ndash;1987,
        before the Final Four era, only the two finalists are recorded each year, so a club&apos;s
        pre-1988 participation beyond reaching the final is not included in this count. Final Four
        counts begin with the 1987&ndash;88 season.
      </p>
    </div>
  );
}
