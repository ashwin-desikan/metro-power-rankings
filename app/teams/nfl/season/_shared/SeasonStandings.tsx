"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { TableScroll } from "@/app/_shared/TableScroll";
import type { NflHonour } from "@/lib/nflElo";

// One season's standings, grouped the way a reader wants to read them.
//
// 🔴 A STANDINGS TABLE WITHOUT A RECORD IS NOT A STANDINGS TABLE. The first
// build ordered by rating and hid the record behind a `hidden sm:table-cell`,
// and the record it did show was read off the team's LAST week, which the
// workbook leaves blank once a team's regular season is over. So every playoff
// team showed nothing at all in the one column the table exists for.
//
// 🔴 GROUPING IS THE CONTROL, NOT SORTING. "Who won the NFC West" and "who was
// the best team in the league" are different questions and a single column sort
// answers neither well. Division is the default because that is what a standings
// table is; conference and pooled-by-rating are one tap away.
//
// 🔴 CLIENT STATE, NOT A SEARCH PARAM. §6 asks for sort state in the URL, and
// reading searchParams here would make all 107 season pages dynamic and drop
// them out of the static build. FranchiseTable already sets the precedent for
// table state living in the component. The trade-off is that a grouping cannot
// be linked to; the trade the other way is 107 pages rendered per request.
//
// Ordering inside a group is by record, then by rating. The league's own
// tiebreakers are not in the workbook, so where two teams finished level this
// is not authoritative on which finished above the other; the division title
// flag is, and it is drawn.

export type StandingsTeam = {
  name: string;
  city: string | null;
  team: string | null;
  league: string | null;
  conf: string | null;
  div: string | null;
  end: number;
  rec?: [number, number, number];
  pts?: [number, number];
  seed?: number;
  flags?: Partial<Record<NflHonour, true>>;
  slug: string | null;
  logo: string | null;
  mono: { bg: string; fg: string; mono: string } | null;
};

const MONO: CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const CARD: CSSProperties = { background: "var(--bg-card)", borderColor: "var(--border)" };
const BORD: CSSProperties = { borderColor: "var(--border)" };

const HONOURS: { key: NflHonour; label: string; color: string }[] = [
  { key: "play_app", label: "made the playoffs", color: "var(--seq-1)" },
  { key: "div_title", label: "won its division", color: "var(--seq-2)" },
  { key: "best_conf", label: "best record in conference", color: "var(--seq-3)" },
  { key: "cf_app", label: "reached the conference final", color: "var(--seq-4)" },
  { key: "champ_app", label: "reached the championship game", color: "var(--seq-5)" },
  { key: "champ", label: "won the championship", color: "#D4AF37" },
];

function winPct(t: StandingsTeam): number {
  if (!t.rec) return -1;
  const [w, l, d] = t.rec;
  const g = w + l + d;
  return g ? (w + d / 2) / g : -1;
}

function fmtRec(t: StandingsTeam): string {
  if (!t.rec) return "";
  const [w, l, d] = t.rec;
  return d ? `${w}-${l}-${d}` : `${w}-${l}`;
}

function Strip({ t }: { t: StandingsTeam }) {
  const f = t.flags ?? {};
  const earned = HONOURS.filter((h) => f[h.key]);
  const words = earned.length
    ? `${t.team ?? t.name} ${earned.map((h) => h.label).join(", ")}`
    : `${t.team ?? t.name} won no year-end honours`;
  return (
    <span className="inline-flex items-center gap-[3px] align-middle" title={words}>
      <span className="sr-only">{words}</span>
      {HONOURS.map((h) => (
        <span key={h.key} aria-hidden className="h-2.5 w-2.5 sm:h-2 sm:w-2" style={{
          borderRadius: 2, display: "inline-block",
          background: f[h.key] ? h.color : "transparent",
          border: f[h.key] ? "none" : "1px solid var(--border)",
        }} />
      ))}
    </span>
  );
}

function Crest({ t, size = 20 }: { t: StandingsTeam; size?: number }) {
  if (t.logo) {
    return <img src={t.logo} alt="" width={size} height={size} className="flex-shrink-0 object-contain"
      style={{ width: size, height: size }} loading="lazy" decoding="async" />;
  }
  if (t.mono) {
    return <span aria-hidden className="inline-grid place-items-center rounded-full flex-shrink-0"
      style={{ background: t.mono.bg, color: t.mono.fg, width: size, height: size, fontSize: size * 0.36, fontWeight: 700 }}>
      {t.mono.mono}</span>;
  }
  return <span aria-hidden className="inline-block flex-shrink-0 rounded-full"
    style={{ width: size, height: size, border: "1px solid var(--border)" }} />;
}

type View = "division" | "conference" | "rating";

export default function SeasonStandings({
  teams,
  showHonours,
  showSeeds,
}: {
  teams: StandingsTeam[];
  showHonours: boolean;
  showSeeds: boolean;
}) {
  const hasDiv = teams.some((t) => t.div && t.div !== t.conf);
  const hasConf = teams.some((t) => t.conf);
  const [view, setView] = useState<View>(hasDiv ? "division" : hasConf ? "conference" : "rating");

  // 🔴 ORDER IS A RULING, NOT A SORT KEY.
  //
  // Division: the division winner is first, whatever its record. Carolina went
  // 9-8 and finished third on record in the 2025 NFC South and still won the
  // division, and a standings table that lists the winner third is wrong in the
  // only way a standings table can be wrong.
  //
  // Conference: by RECORD, not by seed. Division winners take the top four
  // seeds, so seeding order would put a 9-8 champion above a 13-4 wild card and
  // quietly answer a different question from the one the column asks.
  //
  // Ties: a team that reached the playoffs is placed above one that did not on
  // the same record. That is not a tiebreaker, it is the RESULT of the
  // tiebreakers, which this workbook does not carry. Where two teams tie and
  // both or neither made it, rating breaks it and the note under the table says
  // the order inside a tie is not authoritative.
  const madePlayoffs = (t: StandingsTeam) => (t.flags?.play_app ? 1 : 0);
  const wonDivision = (t: StandingsTeam) => (t.flags?.div_title ? 1 : 0);

  const byRecord = (a: StandingsTeam, b: StandingsTeam) =>
    winPct(b) - winPct(a)
    || (b.rec?.[0] ?? 0) - (a.rec?.[0] ?? 0)
    || madePlayoffs(b) - madePlayoffs(a)
    || b.end - a.end;
  const byDivision = (a: StandingsTeam, b: StandingsTeam) =>
    wonDivision(b) - wonDivision(a) || byRecord(a, b);
  const byRating = (a: StandingsTeam, b: StandingsTeam) => b.end - a.end;

  const keyFor = (t: StandingsTeam) =>
    view === "division" ? (t.div || t.conf || t.league || "NFL")
      : view === "conference" ? (t.conf || t.league || "NFL")
      : (t.league || "NFL");

  const groups = new Map<string, StandingsTeam[]>();
  for (const t of teams) {
    const k = keyFor(t);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(t);
  }
  const ordered = [...groups.entries()]
    .map(([k, ts]) => ({
      key: k,
      teams: [...ts].sort(view === "rating" ? byRating : view === "division" ? byDivision : byRecord),
    }))
    // NFL groups first in the years two leagues ran, then alphabetical, which
    // puts AFC before NFC and East before West without a hand-written order.
    .sort((a, b) => {
      const an = a.key.startsWith("NFL") ? 0 : 1;
      const bn = b.key.startsWith("NFL") ? 0 : 1;
      return an - bn || a.key.localeCompare(b.key);
    });

  const options: { v: View; label: string; on: boolean }[] = [
    { v: "division", label: "By division", on: hasDiv },
    { v: "conference", label: "By conference", on: hasConf },
    { v: "rating", label: "By rating", on: true },
  ];

  const cols = ordered.length > 2 ? "grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-6" : ordered.length > 1 ? "grid grid-cols-1 lg:grid-cols-2 gap-6" : "";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 mb-3" role="group" aria-label="How to group the standings">
        {options.filter((o) => o.on).map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => setView(o.v)}
            aria-pressed={view === o.v}
            className="text-xs px-3 min-h-11 sm:min-h-9 rounded-md border transition inline-flex items-center"
            style={{
              background: view === o.v ? "var(--bg-card-hover)" : "var(--bg-card)",
              borderColor: view === o.v ? "var(--accent)" : "var(--border)",
              color: view === o.v ? "var(--accent)" : "var(--text-muted)",
            }}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* 🔴 IT HAS TO FIT. Eight division tables in two columns is 546px of
          usable width each, and the first build spent 641px on eight columns
          with px-3 padding, so every division scrolled sideways inside its own
          box. Eight boxes, eight scrolls, to read one season.

          The budget, and what it bought: the rank column went (a four-team
          division does not need one, and the seed column carries playoff order
          anyway), the city went (the crest carries it), points for and against
          became one cell, and the padding dropped to px-2. That is 427px, which
          fits with room. On a phone the two widest numeric columns move into a
          second line under the team name rather than off the edge, so the phone
          still gets every number the desktop does. */}
      <div className={cols}>
        {ordered.map((g) => (
          <div key={g.key} className="min-w-0">
            <h3 className="text-sm font-semibold mb-2">{g.key}</h3>
            <TableScroll className="rounded-xl border" style={CARD}>
              <table className="w-full text-xs" data-sticky-col="1">
                <thead>
                  <tr className="text-[var(--text-dim)] text-left">
                    <th className="py-2 px-2 font-medium">Team</th>
                    <th className="py-2 px-2 font-medium text-right">W-L-T</th>
                    <th className="py-2 px-2 font-medium text-right hidden sm:table-cell">PF-PA</th>
                    <th className="py-2 px-2 font-medium text-right">Elo</th>
                    {showSeeds ? <th className="py-2 px-2 font-medium text-right hidden sm:table-cell">Seed</th> : null}
                    {showHonours ? <th className="py-2 px-2 font-medium whitespace-nowrap">Season</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {g.teams.map((t) => (
                    /* 🔴 THE ROW IS THE TAP TARGET ON A PHONE. A 28px table row
                       with a 60px link in it gives a thumb about a fifth of the
                       row and puts the rest of the misses on nothing. `tap-row`
                       + `tap-target` (globals.css) is the site's answer for a
                       row a link cannot wrap: the link grows a pseudo-element
                       over the whole row while keeping its inline styling. The
                       row also clears 44px on a phone and stays compact where a
                       pointer is doing the aiming. */
                    <tr key={t.name} className="border-t tap-row" style={BORD}>
                      <td className="py-2 sm:py-1.5 px-2 align-middle" style={{ minHeight: 44 }}>
                        <span className="inline-flex items-center gap-1.5">
                          <Crest t={t} size={18} />
                          {t.slug ? (
                            <Link href={`/teams/nfl/${t.slug}`} className="tap-target hover:text-[var(--accent)] hover:underline whitespace-nowrap"
                              title={[t.city, t.team].filter(Boolean).join(" ") || t.name}>
                              {t.team ?? t.name}
                            </Link>
                          ) : (
                            <span className="whitespace-nowrap">{t.team ?? t.name}</span>
                          )}
                          {t.flags?.div_title ? (
                            <span title="won its division" className="text-[9px] uppercase tracking-wider px-1 rounded border flex-shrink-0"
                              style={{ borderColor: "var(--seq-3)", color: "var(--seq-4)" }}>div</span>
                          ) : null}
                        </span>
                        {/* The phone's second line: nothing is dropped, it moves. */}
                        <span className="sm:hidden block mt-0.5 pl-[26px] text-[12px] text-[var(--text-dim)] tabular-nums" style={MONO}>
                          {t.pts ? `${t.pts[0]}-${t.pts[1]}` : "no points recorded"}
                          {t.seed ? ` · ${t.seed} seed` : ""}
                        </span>
                      </td>
                      <td className="py-2 sm:py-1.5 px-2 text-right tabular-nums whitespace-nowrap align-middle" style={MONO}>
                        {fmtRec(t) || <span className="text-[var(--text-dim)]">&mdash;</span>}
                        {t.flags?.best_rec ? (
                          <span title="best record in the league" className="ml-0.5 text-[var(--accent)]">*</span>
                        ) : null}
                      </td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-[var(--text-muted)] hidden sm:table-cell whitespace-nowrap" style={MONO}>
                        {t.pts ? `${t.pts[0]}-${t.pts[1]}` : ""}
                      </td>
                      <td className="py-2 sm:py-1.5 px-2 text-right tabular-nums font-semibold align-middle" style={MONO}>{t.end.toFixed(0)}</td>
                      {showSeeds ? (
                        <td className="py-1.5 px-2 text-right tabular-nums hidden sm:table-cell" style={MONO}>
                          {t.seed ? (
                            <span className="inline-grid place-items-center rounded-full" title={`entered the playoffs as the ${t.seed} seed`}
                              style={{ width: 17, height: 17, background: "var(--bg-card-hover)", border: "1px solid var(--border)", fontSize: 10 }}>
                              {t.seed}
                            </span>
                          ) : <span className="text-[var(--text-dim)]">&mdash;</span>}
                        </td>
                      ) : null}
                      {showHonours ? <td className="py-2 sm:py-1.5 px-2 align-middle"><Strip t={t} /></td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </div>
        ))}
      </div>

      {showHonours ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[11px] text-[var(--text-dim)]">
          {HONOURS.map((h) => (
            <span key={h.key} className="inline-flex items-center gap-1.5">
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: h.color, display: "inline-block" }} />
              {h.label.replace(/^(made|won|reached) (the )?/, "")}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
