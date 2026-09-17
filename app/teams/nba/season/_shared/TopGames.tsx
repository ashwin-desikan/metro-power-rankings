"use client";

import Link from "next/link";
import type { NbaTopGame } from "@/lib/nbaElo";
import SortableBoard, { type BoardCol, type BoardRow } from "@/app/_shared/SortableBoard";

// The season's best games, ranked by the workbook's Game Score.
//
// 🔴 THE SCORE IS READ, NOT COMPUTED. Game Score is a frozen column in
// NBA_RegSeason: scripts/build-nba-data.py only regenerates it behind an
// explicit --refresh-game-scores flag. This board ranks what is already there,
// so it cannot disagree with /teams/nba's all-time and by-decade boards about
// which game was better. Same metric, same numbers, different slice.
//
// Sortable, like every table on this site. The default is Game Score
// descending, which is the board's whole premise, but a reader who wants the
// season in date order or the biggest blowouts can have either.

const MONO = "'JetBrains Mono', monospace";

type Props = {
  games: NbaTopGame[];
  slugByName?: Record<string, string | null>;
  colorByName?: Record<string, string | null>;
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "2-digit", timeZone: "UTC",
  });
}

export default function TopGames({ games, slugByName = {}, colorByName = {} }: Props) {
  if (!games.length) return null;

  const teamLink = (canonical: string, city: string | null, team: string | null) => {
    const slug = slugByName[canonical];
    const label = `${city ?? ""} ${team ?? canonical}`.trim();
    const body = (
      <span className="inline-flex items-center gap-1.5 min-w-0">
        <span
          aria-hidden
          className="shrink-0 rounded-sm"
          style={{ background: colorByName[canonical] ?? "var(--text-dim)", width: 3, height: 13 }}
        />
        <span className="truncate">{label}</span>
      </span>
    );
    // 🔴 THE TAP TARGET IS THE ANCHOR, NOT THE ROW IT SITS IN. Putting the
    // 44px minimum on the surrounding cell measures fine to the eye and still
    // fails: the probe, and a thumb, both hit the <a>. Two of these sit side
    // by side in one cell, so each takes the height rather than the width.
    return slug ? (
      <Link
        href={`/teams/nba/${slug}`}
        className="inline-flex items-center min-w-0 min-h-11 sm:min-h-0 hover:text-[var(--accent)]"
      >
        {body}
      </Link>
    ) : body;
  };

  const cols: BoardCol[] = [
    { key: "date", label: "Date", sortable: true },
    { key: "matchup", label: "Game", sortable: true },
    { key: "score", label: "Score", right: true, sortable: true },
    { key: "round", label: "Round", sortable: true, demote: "sm" },
    { key: "gs", label: "Score", short: "GS", right: true, sortable: true,
      title: "Game Score: the workbook's composite game-quality rating, roughly zero-centred" },
  ];

  const rows: BoardRow[] = games.map((g, i) => {
    const margin = g.winner_pts - g.loser_pts;
    const matchup = (
      <span className="flex items-center gap-1.5 min-w-0 flex-wrap">
        {teamLink(g.winner_canonical, g.winner_city, g.winner_team)}
        <span className="text-[var(--text-dim)] text-xs shrink-0">beat</span>
        {teamLink(g.loser_canonical, g.loser_city, g.loser_team)}
      </span>
    );
    return {
      key: `${g.date}-${g.winner_canonical}-${i}`,
      sort: {
        date: g.date ?? "",
        matchup: `${g.winner_city ?? ""} ${g.winner_team ?? g.winner_canonical}`.trim(),
        // Sorting "Score" by MARGIN, not by the winner's points: the question a
        // reader asks of a score column on a best-games board is how close it
        // was, and the closest games sort to the top when ascending.
        score: margin,
        round: g.round ?? "",
        gs: g.game_score,
      },
      cells: [
        <span key="d" style={{ fontFamily: MONO }} className="whitespace-nowrap">{fmtDate(g.date)}</span>,
        matchup,
        <span key="s" style={{ fontFamily: MONO }} className="whitespace-nowrap">
          {g.winner_pts}-{g.loser_pts}
          {g.ot ? (
            <span className="text-[var(--accent)] text-[10px] ml-1">{g.ot_label ?? "OT"}</span>
          ) : null}
        </span>,
        <span key="r" className="text-xs text-[var(--text-muted)]">
          {g.round ?? "—"}
          {g.game_num ? <span className="text-[var(--text-dim)]"> g{g.game_num}</span> : null}
        </span>,
        <span key="g" style={{ fontFamily: MONO }}>{g.game_score.toFixed(2)}</span>,
      ],
      mobile: {
        name: matchup,
        sub: (
          <span className="text-[11px] text-[var(--text-dim)]" style={{ fontFamily: MONO }}>
            {fmtDate(g.date)}
            {g.round ? <span> · {g.round}</span> : null}
          </span>
        ),
        right: (
          <span style={{ fontFamily: MONO }}>
            {g.winner_pts}-{g.loser_pts}
            {g.ot ? <span className="text-[var(--accent)] text-[10px] ml-1">{g.ot_label ?? "OT"}</span> : null}
          </span>
        ),
        rightSub: (
          <span className="text-[11px]" style={{ fontFamily: MONO }}>{g.game_score.toFixed(2)}</span>
        ),
      },
    };
  });

  return (
    <SortableBoard
      cols={cols}
      rows={rows}
      initial={{ key: "gs", dir: "desc" }}
      rank
      mobileNoun="games"
      mobileInitial={10}
    />
  );
}
