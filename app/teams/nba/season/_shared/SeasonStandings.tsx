"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { NbaEloTeam } from "@/lib/nbaElo";
import SortableBoard, { type BoardCol, type BoardRow } from "@/app/_shared/SortableBoard";
import { useThroughWeek } from "./WeekScrubber";
import { winPct, confKey, divKey, recordsAtWeek } from "./standingsSort";

// One season's table, as it stood after the scrubbed week.
//
// 🔴 EVERY TABLE ON THIS SITE IS SORTABLE. This one shipped on a hand-rolled
// <table> with data-static-sort and an argument for why it was the exception:
// the rank column IS the Elo order, so re-sorting would leave a rank that no
// longer numbers its own rows. That argument was wrong on the facts, because
// SortableBoard's `rank` renumbers as it sorts, and wrong on the principle,
// because sortability is a standing design rule and not a per-table judgement
// call. (Ashwin, 2026-09-17.) If a future table looks like an exception, it is
// almost certainly this mistake again.
//
// 🔴 NOTHING HERE IS RECOMPUTED OR MODELLED. The season shard already stores,
// per team and per week, the rating, the rank and the cumulative record, so
// "after week N" is a lookup.

type Props = {
  teams: NbaEloTeam[];
  slugByName?: Record<string, string | null>;
  colorByName?: Record<string, string | null>;
};

const MONO = "'JetBrains Mono', monospace";

/** "62-20", or the null-fallback glyph when there is no record to show. */
function rec(r: [number, number] | null | undefined): string {
  return r ? `${r[0]}-${r[1]}` : "—";
}

/** The team's row as it stood after `through`, or its last week when null. */
function atWeek(t: NbaEloTeam, through: number | null) {
  const weeks = t.weeks;
  if (!weeks.length) return null;
  if (through == null) return weeks[weeks.length - 1];
  let best = weeks[0];
  for (const w of weeks) {
    if (w.w <= through) best = w;
    else break;
  }
  return best;
}

const signed = (n: number) => `${n > 0 ? "+" : ""}${Math.round(n)}`;

// The sort keys live in ./standingsSort so they can be unit-tested; the
// reasoning behind the inverted, zero-padded percentage is documented there.

export default function SeasonStandings({ teams, slugByName = {}, colorByName = {} }: Props) {
  const through = useThroughWeek();

  const shown = teams
    .map((t) => ({ t, w: atWeek(t, through) }))
    .filter((r) => r.w != null) as { t: NbaEloTeam; w: NonNullable<ReturnType<typeof atWeek>> }[];
  if (!shown.length) return null;

  const honours = (t: NbaEloTeam) => {
    if (t.flags?.champ) return { label: "Champion", bg: "#d4af37", fg: "#1a1408" };
    if (t.flags?.champ_app) return { label: "Finals", bg: "#a07a30", fg: "#fff" };
    if (t.flags?.cf_app) return { label: "Conf. Finals", bg: "#5b5b5b", fg: "#fff" };
    if (t.flags?.play_app) return { label: "Playoffs", bg: "#3a3a3a", fg: "#cfcfcf" };
    return null;
  };

  // 🔴 ONE TABLE, WITH CONFERENCE AND DIVISION AS COLUMNS. This used to be two
  // tables behind a conference picker, which is a filter pretending to be a
  // standing: it hid the league-wide ordering, and it had no concept of
  // divisions at all. A classic standings table carries both groupings as
  // SORTABLE columns, so a reader can order the whole league by rating, or
  // group it the traditional way, without the page deciding for them.
  // (Ashwin, 2026-09-17.)
  const cols: BoardCol[] = [
    { key: "team", label: "Team", sortable: true },
    { key: "conf", label: "Conf", right: false, sortable: true, demote: "sm" },
    { key: "div", label: "Division", sortable: true, demote: "md" },
    { key: "seed", label: "Sd", short: "Sd", right: true, sortable: true, title: "Playoff seed" },
    { key: "reg", label: "Regular", right: true, sortable: true,
      title: "Regular-season record" },
    { key: "post", label: "Playoffs", right: true, sortable: true, demote: "sm",
      title: "Postseason record. Blank means they were not in it, which is not 0-0." },
    { key: "total", label: "Total", right: true, sortable: true, demote: "md",
      title: "Regular season plus postseason" },
    { key: "elo", label: "Elo", right: true, sortable: true,
      title: "Rating at the scrubbed week. 1500 is average." },
    // 🔴 YEAR OVER YEAR, NOT WEEK ON WEEK. This column used to carry the Elo
    // change over the final SEVEN DAYS of a season that ran eight months,
    // which is a live-board number wearing a season-aggregate's clothes. It
    // now reports where the team finished against where it finished LAST
    // season, so it spans the offseason and answers the question a year-end
    // table is actually asked: did they get better or worse.
    { key: "yoy", label: "vs Last", right: true, sortable: true, demote: "sm",
      title: "Rating at the end of this season against the end of the previous one" },
  ];

  const boardRows: BoardRow[] = shown.map(({ t, w }) => {
    const h = honours(t);
    const slug = slugByName[t.name];
    // The records AS THEY STOOD after the scrubbed week, not the season's final
    // ones. `w` is already the scrubbed week (atWeek above), and w.rec is the
    // cumulative [wins, losses] through it; recordsAtWeek splits that into the
    // regular season and the playoffs. Unscrubbed, atWeek returns the last week
    // and this reduces to the season row.
    const at = recordsAtWeek(t.reg, t.post, w.rec);
    const tot = at.total;
    // Both halves must exist: an upcoming shell has no `end`, a first season
    // has no `prev_end`. Either way there is no year-over-year number, which
    // is a real absence rather than a zero.
    const yoy = t.prev_end != null && t.end != null ? t.end - t.prev_end : null;
    const name = `${t.city ?? ""} ${t.team ?? t.name}`.trim();
    const colour = colorByName[t.name] ?? null;

    const nameCell = (
      <span className="flex items-center gap-2 min-w-0">
        <span
          aria-hidden
          className="shrink-0 rounded-sm"
          style={{ background: colour ?? "var(--text-dim)", width: 3, height: 14 }}
        />
        {slug ? (
          <Link href={`/teams/nba/${slug}`} className="truncate hover:text-[var(--accent)]">
            {name}
          </Link>
        ) : (
          <span className="truncate">{name}</span>
        )}
        {h ? (
          <span
            className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
            style={{ background: h.bg, color: h.fg }}
          >
            {h.label}
          </span>
        ) : null}
      </span>
    );

    return {
      key: t.name,
      sort: {
        team: name,
        conf: confKey(t.conf, at.reg),
        div: divKey(t.conf, t.div, at.reg),
        seed: t.seed ?? 99,
        // Percentage rather than wins, so a 60-game season and an 82-game one
        // rank on the same scale.
        reg: winPct(at.reg) ?? -1,
        post: at.post ? at.post[0] : -1,
        total: tot ? tot[0] : -1,
        elo: w.e,
        yoy: yoy ?? Number.NEGATIVE_INFINITY,
      },
      cells: [
        nameCell,
        <span key="conf" className="text-xs text-[var(--text-muted)]">{t.conf ?? "—"}</span>,
        <span key="div" className="text-xs text-[var(--text-muted)]">{t.div ?? "—"}</span>,
        <span key="sd" style={{ fontFamily: MONO }}>{t.seed ?? "—"}</span>,
        <span key="reg" style={{ fontFamily: MONO }}>{rec(at.reg)}</span>,
        <span key="post" style={{ fontFamily: MONO, color: at.post ? undefined : "var(--text-dim)" }}>
          {rec(at.post)}
        </span>,
        <span key="tot" style={{ fontFamily: MONO, color: "var(--text-muted)" }}>{rec(tot)}</span>,
        <span key="elo" style={{ fontFamily: MONO }}>{Math.round(w.e)}</span>,
        <span
          key="yoy"
          style={{
            fontFamily: MONO,
            color: yoy == null ? "var(--text-dim)"
              : yoy > 0 ? "var(--div-pos, #6ea97f)"
              : yoy < 0 ? "var(--div-neg, #c08a8a)" : "var(--text-muted)",
          }}
        >
          {yoy == null ? "—" : signed(yoy)}
        </span>,
      ],
      mobile: {
        name: nameCell,
        // The phone card carries the division, because that is the column a
        // reader loses first when the table narrows.
        sub: (
          <span style={{ fontFamily: MONO }} className="text-[11px] text-[var(--text-dim)]">
            {rec(at.reg)}
            {at.post ? <span className="text-[var(--accent)]"> +{rec(at.post)}</span> : null}
            {t.div ? <span> · {t.div}</span> : null}
            {t.seed ? <span> · seed {t.seed}</span> : null}
          </span>
        ),
        right: <span style={{ fontFamily: MONO }}>{Math.round(w.e)}</span>,
        rightSub: (
          <span style={{ fontFamily: MONO }} className="text-[11px]">
            {yoy == null ? "—" : `${signed(yoy)} yr`}
          </span>
        ),
        highlight: Boolean(t.flags?.champ),
      },
    };
  });

  return (
    <SortableBoard
      cols={cols}
      rows={boardRows}
      initial={{ key: "elo", dir: "desc" }}
      rank
      mobileNoun="teams"
      mobileInitial={12}
    />
  );
}
