"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import type { NflSeedsFile } from "@/lib/nflElo";
import type { TeamIdent } from "./TeamCell";
import { useThroughWeek } from "./WeekScrubber";

// The playoff picture, week by week: one row per team, one cell per
// regular-season week, the number in the cell the seed the team held had the
// season ended after that week, by the NFL tiebreaking procedure
// (scripts/nfl/playoff_seeds.py). Ashwin's ask (2026-09-09): "see the
// progression of a team in a playoff spot, where that manifested over time,
// and what ultimately happened".
//
// 🔴 A SEED IS A POSITION, NOT A PROBABILITY. Nothing here is a forecast: the
// 3 in week 9 says the team WAS third in its conference by the league's own
// rules with nine weeks played, and the blank beside it says another team was
// seventh. The scrubber's week gets a highlighted column so the standings
// table above and this strip agree on what "now" is.
//
// Rows are grouped by conference and ordered by the final week's conference
// rank, which is seeding order (division winners first), so the top of each
// group is the bracket as it was and the eye reads down to the teams that
// were never in it.
//
// 🔴 A NUMBER MEANS NOTHING IN A DIVISION-ONLY ERA. From 1933 to 1969 (and
// the AAFC's two-division years) only division winners played on and the
// bracket was fixed by division, so "1" against "2" was a rank between two
// clubs that never competed for the same place. Ashwin, 2026-09-10: "who
// cares? Who knows what division you're talking about, 1 or 2?" A pool whose
// qualifiers are exactly one per division marks the division leader with a
// `div` chip instead; a pool that took two per division (the 1969 AFL) shows
// the DIVISION rank, which is the thing that decided the pairing; a single
// group (the 1949 AAFC, the pre-1933 league) keeps its rank, which is real.

const MONO: CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const CELL = 22;

export type SeedTimelineTeam = {
  name: string;
  city: string | null;
  team: string | null;
  abbr: string;
  ident: TeamIdent | undefined;
};

export default function SeedTimeline({
  seeds,
  teams,
}: {
  seeds: NflSeedsFile;
  teams: SeedTimelineTeam[];
}) {
  const through = useThroughWeek();
  const weeks = Array.from({ length: seeds.through_week }, (_, i) => i + 1);
  const byName = new Map(teams.map((t) => [t.name, t]));
  const word = seeds.label === "seed" ? "seed" : seeds.label === "place" ? "playoff place" : "league leader";
  const confs = [...new Set(Object.values(seeds.teams).map((t) => t.conf))].sort();
  const tiebreaks = seeds.tiebreaks ?? [];
  const teamLabel = (name: string) => { const m = byName.get(name); return m ? [m.city, m.team].filter(Boolean).join(" ") || name : name; };
  // The other clubs level with `name` for its division after week i.
  const levelWith = (name: string, i: number) =>
    Object.entries(seeds.teams).filter(([n, u]) => n !== name && u.div === seeds.teams[name].div && u.tie?.[i]).map(([n]) => teamLabel(n));
  const marked = through != null && through >= 1 && through <= seeds.through_week ? through : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {confs.map((conf) => {
        const rows = Object.entries(seeds.teams)
          .filter(([, t]) => t.conf === conf)
          .sort((a, b) => a[1].cr[a[1].cr.length - 1] - b[1].cr[b[1].cr.length - 1]);
        const pool = seeds.pools?.[conf];
        const n = pool?.seeds ?? seeds.seeds_per_conf;
        const mode = seedCellMode(seeds.label, pool);
        return (
          <div key={conf} className="min-w-0">
            <h3 className="text-sm font-semibold mb-2">{conf}</h3>
            <div className="overflow-x-auto rounded-xl border" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
              <table className="text-[10px] border-separate" style={{ borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 text-left font-medium px-2 py-1.5 text-[var(--text-dim)]" style={{ background: "var(--bg-card)" }}>Team</th>
                    {weeks.map((w) => (
                      <th key={w} className="font-medium text-[var(--text-dim)] text-center" style={{ ...MONO, width: CELL, background: marked === w ? "var(--bg-card-hover)" : undefined }}>
                        {w === 1 || w % 5 === 0 || w === weeks.length ? w : ""}
                      </th>
                    ))}
                    {tiebreaks.length ? (
                      <th title="The played-off division title" className="font-medium text-[var(--accent)] text-center" style={{ ...MONO, width: CELL + 4 }}>PO</th>
                    ) : null}
                    <th className="font-medium text-[var(--text-dim)] text-right px-2 whitespace-nowrap">weeks in</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([name, t], ri) => {
                    const meta = byName.get(name);
                    const label = meta ? [meta.city, meta.team].filter(Boolean).join(" ") || name : name;
                    const weeksIn = t.seed.filter((s) => s != null).length;
                    const finalSeed = t.seed[t.seed.length - 1];
                    const line = ri === n; // first row out of the bracket on the final week
                    return (
                      <tr key={name} style={line ? { borderTop: "2px solid var(--accent)" } : undefined}>
                        <td className="sticky left-0 z-10 px-2 py-0.5 whitespace-nowrap" style={{ background: "var(--bg-card)", borderTop: line ? "2px solid var(--accent)" : "1px solid var(--border)" }}>
                          <span className="inline-flex items-center gap-1.5">
                            {meta?.ident?.logo ? (
                              <img src={meta.ident.logo} alt="" width={14} height={14} className="flex-shrink-0 object-contain" style={{ width: 14, height: 14 }} loading="lazy" decoding="async" />
                            ) : null}
                            {meta?.ident?.slug ? (
                              <Link href={`/teams/nfl/${meta.ident.slug}`} title={label} className="font-semibold hover:underline" style={MONO}>{meta.abbr}</Link>
                            ) : (
                              <span className="font-semibold" style={MONO} title={label}>{meta?.abbr ?? name}</span>
                            )}
                          </span>
                        </td>
                        {weeks.map((w, i) => {
                          const s = t.seed[i];
                          const inBracket = s != null;
                          const tied = mode === "div" && Boolean(t.tie?.[i]);
                          const shown = mode === "div" ? `${divAbbr(t.div, conf)}${tied ? "*" : ""}` : mode === "divrank" ? t.dr[i] : s;
                          const top = inBracket && !tied && (mode === "div" || (mode === "divrank" ? t.dr[i] === 1 : s <= 4));
                          const title = `${label}, week ${w}: ${
                            !inBracket ? `out, ${ordinal(t.cr[i])} in the ${conf}`
                            : tied ? `level with ${levelWith(name, i).join(" and ")} for the ${t.div}; a playoff would decide it`
                            : mode === "div" ? `leading the ${t.div}`
                            : mode === "divrank" ? `${ordinal(t.dr[i])} in the ${t.div}, in the playoffs`
                            : n === 1 ? word : `${word} ${s}`
                          }${t.div !== conf && mode === "rank" ? `, ${ordinal(t.dr[i])} in the ${t.div}` : ""}`;
                          return (
                            <td key={w} title={title} className="text-center align-middle p-0"
                              style={{ width: CELL, height: CELL, borderTop: line ? "2px solid var(--accent)" : "1px solid var(--border)", background: marked === w ? "var(--bg-card-hover)" : undefined }}>
                              {inBracket ? (
                                <span className="inline-grid place-items-center rounded-[3px] tabular-nums" style={{
                                  ...MONO, width: mode === "div" ? 20 : 16, height: 16, fontSize: mode === "div" ? 8 : 9, fontWeight: 700,
                                  background: top ? "var(--accent)" : "transparent",
                                  color: top ? "var(--bg-card)" : "var(--accent)",
                                  border: top ? "none" : "1px solid var(--accent)",
                                }}>{shown}</span>
                              ) : (
                                <span aria-hidden className="inline-block rounded-full" style={{ width: 3, height: 3, background: "var(--border)" }} />
                              )}
                            </td>
                          );
                        })}
                        {tiebreaks.length ? (() => {
                          const tb = tiebreaks.find((x) => x.home === name || x.away === name);
                          const won = tb ? tb.winner === name : null;
                          const other = tb ? teamLabel(tb.home === name ? tb.away : tb.home) : "";
                          const sc = tb ? (tb.home === name ? tb.score : tb.score.split("-").reverse().join("-")) : "";
                          return (
                            <td className="text-center align-middle p-0"
                              title={tb ? (won ? `won the ${t.div} playoff, ${sc} over ${other}${tb.date ? `, ${tb.date}` : ""}` : `lost the ${t.div} playoff, ${sc} to ${other}${tb.date ? `, ${tb.date}` : ""}`) : undefined}
                              style={{ width: CELL + 4, height: CELL, borderTop: line ? "2px solid var(--accent)" : "1px solid var(--border)" }}>
                              {tb ? (
                                <span className="inline-grid place-items-center rounded-[3px]" style={{
                                  ...MONO, width: 20, height: 16, fontSize: 8, fontWeight: 700,
                                  background: won ? "var(--accent)" : "transparent",
                                  color: won ? "var(--bg-card)" : "var(--text-dim)",
                                  border: won ? "none" : "1px solid var(--border)",
                                  textDecoration: won ? "none" : "line-through",
                                }}>{divAbbr(t.div, conf)}</span>
                              ) : null}
                            </td>
                          );
                        })() : null}
                        <td className="text-right px-2 tabular-nums text-[var(--text-muted)] whitespace-nowrap" style={{ ...MONO, borderTop: line ? "2px solid var(--accent)" : "1px solid var(--border)" }}
                          title={
                            mode !== "rank"
                              ? (finalSeed ? `won the ${t.div}` : `finished behind the ${t.div} leader`)
                              : finalSeed ? (n === 1 ? `finished as ${word}` : `finished as ${word} ${finalSeed}`) : n === 1 ? "finished behind the leader" : "finished outside the bracket"
                          }>
                          {weeksIn}/{weeks.length}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * What a filled cell should say for this pool. "div": one qualifier per
 * division, the number is meaningless, mark the division leader. "divrank":
 * more than one per division (the 1969 AFL), show the division rank. "rank":
 * the seed or the league rank, which is a real ordering.
 */
export function seedCellMode(
  label: NflSeedsFile["label"],
  pool: { seeds: number; per_division: number; divisions: number } | undefined,
): "div" | "divrank" | "rank" {
  if (label !== "place" || !pool || pool.divisions <= 1) return "rank";
  return pool.per_division === 1 ? "div" : "divrank";
}

/**
 * The division, short enough for a 20px cell. "div" alone said a club led
 * SOME division; with four leaders in 1969 the reader could not tell which
 * (Ashwin, 2026-09-10). East and West are one letter; the 1967-69 NFL's four
 * C-divisions need three. The full name stays in the tooltip.
 */
export function divAbbr(div: string, conf: string): string {
  const bare = div.replace(new RegExp(`^${conf}\\s+`), "").trim();
  switch (bare) {
    case "East": case "Eastern": return "E";
    case "West": case "Western": return "W";
    case "Capitol": return "CAP";
    case "Century": return "CEN";
    case "Coastal": return "CST";
    case "Central": return "CTR";
    default: return bare.slice(0, 3).toUpperCase();
  }
}

function ordinal(k: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = k % 100;
  return `${k}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
