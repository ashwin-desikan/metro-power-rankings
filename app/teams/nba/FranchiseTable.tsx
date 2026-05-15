"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Franchise, PlayoffStateRecord } from "@/lib/nba";

// Inlined from lib/nba (kept client-safe; lib/nba is server-only).
// Keep in sync with lib/nba PLAYOFF_STATE_COLORS.
const PLAYOFF_STATE_COLORS: Record<PlayoffStateRecord["state"], { bg: string; text: string; label: string }> = {
  champion:           { bg: "#d4af37", text: "#1a1408", label: "NBA Champion" },
  lost_finals:        { bg: "#a07a30", text: "#fff", label: "Lost Finals" },
  eliminated_cf:      { bg: "#5b5b5b", text: "#fff", label: "Eliminated Conf. Finals" },
  eliminated_semis:   { bg: "#5b5b5b", text: "#fff", label: "Eliminated Semifinals" },
  eliminated_qf:      { bg: "#5b5b5b", text: "#fff", label: "Eliminated First Round" },
  eliminated_play_in: { bg: "#5b5b5b", text: "#fff", label: "Eliminated Play-In" },
  active_finals:      { bg: "#d4af37", text: "#1a1408", label: "In the Finals" },
  active_cf:          { bg: "#3a5a8a", text: "#fff", label: "Conference Finals" },
  active_semis:       { bg: "#5b7aa8", text: "#fff", label: "Conference Semifinals" },
  active_qf:          { bg: "#6e8aa6", text: "#0c1320", label: "First Round" },
  active_play_in:     { bg: "#8aa1bd", text: "#0c1320", label: "Play-In" },
};


// Sortable franchise table for /teams/nba. Mirrors lib/mlb FranchiseTable
// pattern, with a postseason-status column gated on the workbook's
// playoff-state file. Server-rendered logo + monogram maps.

type SortKey =
  | "name"
  | "conf"
  | "founding_year"
  | "championships"
  | "champ_apps"
  | "cf_apps"
  | "win_pct"
  | "record"
  | "playoff_appearances"
  | "all_stars"
  | "postseason";

type SortDir = "asc" | "desc";

type Mono = { bg: string; fg: string; mono: string };

type Props = {
  franchises: Franchise[];
  playoffState: Record<string, PlayoffStateRecord>;
  logoMap: Record<string, string | null>;
  monoMap: Record<string, Mono>;
};

// Rank ordering for postseason sort: champion at the top, descending through active rounds,
// then eliminated rounds, then teams with no row.
const POSTSEASON_RANK: Record<string, number> = {
  champion: 100,
  active_finals: 90,
  active_cf: 80,
  active_semis: 70,
  active_qf: 60,
  active_play_in: 55,
  lost_finals: 50,
  eliminated_cf: 40,
  eliminated_semis: 30,
  eliminated_qf: 20,
  eliminated_play_in: 10,
};

function postseasonRank(canonical: string, state: Record<string, PlayoffStateRecord>): number {
  const st = state[canonical];
  if (!st) return 0;
  return POSTSEASON_RANK[st.state] ?? 0;
}

function compare(a: Franchise, b: Franchise, key: SortKey, state: Record<string, PlayoffStateRecord>): number {
  switch (key) {
    case "name": return a.name.localeCompare(b.name);
    case "conf": return (a.conf || "").localeCompare(b.conf || "");
    case "founding_year": return (a.founding_year ?? 0) - (b.founding_year ?? 0);
    case "championships": return a.championships - b.championships;
    case "champ_apps": return a.championship_appearances - b.championship_appearances;
    case "cf_apps": return a.cf_appearances - b.cf_appearances;
    case "win_pct": return a.win_pct - b.win_pct;
    case "record": return a.all_time_w - b.all_time_w;
    case "playoff_appearances": return a.playoff_appearances - b.playoff_appearances;
    case "all_stars": return a.all_star_count - b.all_star_count;
    case "postseason": return postseasonRank(a.canonical, state) - postseasonRank(b.canonical, state);
  }
}

export default function FranchiseTable({ franchises, playoffState, logoMap, monoMap }: Props) {
  const showPostseason = Object.keys(playoffState).length > 0;
  const [sortKey, setSortKey] = useState<SortKey>("championships");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const arr = [...franchises];
    arr.sort((a, b) => {
      const cmp = compare(a, b, sortKey, playoffState);
      const tiebreak = sortKey === "championships" ? (a.win_pct - b.win_pct) : 0;
      const combined = cmp !== 0 ? cmp : tiebreak;
      return sortDir === "asc" ? combined : -combined;
    });
    return arr;
  }, [franchises, sortKey, sortDir, playoffState]);

  function toggle(key: SortKey) {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      const numeric: SortKey[] = [
        "championships", "champ_apps", "cf_apps", "win_pct", "record",
        "playoff_appearances", "founding_year", "all_stars", "postseason",
      ];
      setSortDir(numeric.includes(key) ? "desc" : "asc");
    }
  }

  return (
    <section
      className="rounded-xl border overflow-x-auto"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <table className="w-full text-xs sm:text-sm tabular-nums">
        <thead>
          <tr className="text-left text-[var(--text-muted)] border-b" style={{ borderColor: "var(--border)" }}>
            <Th label="Franchise"          k="name"                cur={sortKey} dir={sortDir} onClick={toggle} className="pl-4" />
            <Th label="Conf"               k="conf"                cur={sortKey} dir={sortDir} onClick={toggle} />
            <Th label="Founded"            k="founding_year"       cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
            <Th label="Titles"             k="championships"       cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
            <Th label="Finals"             k="champ_apps"          cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
            <Th label="CF"                 k="cf_apps"             cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
            <Th label="Playoffs"           k="playoff_appearances" cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
            <Th label="All-Stars"          k="all_stars"           cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
            <Th label="All-time"           k="record"              cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
            <Th label="Win%"               k="win_pct"             cur={sortKey} dir={sortDir} onClick={toggle} align="right" className={showPostseason ? "" : "pr-4"} />
            {showPostseason && <Th label="Postseason"         k="postseason"          cur={sortKey} dir={sortDir} onClick={toggle} align="right" className="pr-4" />}
          </tr>
        </thead>
        <tbody>
          {sorted.map((f) => {
            const logo = logoMap[f.slug];
            const mono = monoMap[f.slug];
            const ps = playoffState[f.canonical];
            const psStyle = ps ? PLAYOFF_STATE_COLORS[ps.state] : null;
            return (
              <tr
                key={f.slug}
                className="border-b last:border-b-0 hover:bg-[var(--bg-card-hover)] transition-colors"
                style={{ borderColor: "var(--border)" }}
              >
                <td className="py-2.5 pl-4 pr-3">
                  <Link href={`/teams/nba/${f.slug}`} className="flex items-center gap-3 hover:text-[var(--accent)] transition-colors">
                    {logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logo} alt="" className="w-8 h-8 flex-shrink-0 object-contain" />
                    ) : (
                      <span
                        className="inline-grid place-items-center rounded-full flex-shrink-0"
                        style={{
                          background: mono?.bg,
                          color: mono?.fg,
                          width: 28,
                          height: 28,
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: "-0.02em",
                        }}
                        aria-hidden
                      >
                        {mono?.mono}
                      </span>
                    )}
                    <span className="font-semibold">{f.display_name}</span>
                  </Link>
                </td>
                <td className="py-2.5 pr-3 text-[var(--text-muted)]">{f.conf}</td>
                <td className="py-2.5 pr-3 text-right text-[var(--text-muted)]">{f.founding_year ?? "—"}</td>
                <td className="py-2.5 pr-3 text-right">
                  {f.championships > 0 ? (
                    <span
                      className="inline-block rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums"
                      style={{ background: "rgba(212,175,55,0.16)", color: "#d4af37" }}
                      title={`${f.championships} championship${f.championships === 1 ? "" : "s"}`}
                    >
                      {f.championships}
                    </span>
                  ) : (
                    <span className="text-[var(--text-dim)]">—</span>
                  )}
                </td>
                <td className="py-2.5 pr-3 text-right text-[var(--text-muted)]">{f.championship_appearances || ""}</td>
                <td className="py-2.5 pr-3 text-right text-[var(--text-muted)]">{f.cf_appearances || ""}</td>
                <td className="py-2.5 pr-3 text-right text-[var(--text-muted)]">{f.playoff_appearances || ""}</td>
                <td className="py-2.5 pr-3 text-right text-[var(--text-muted)]">{f.all_star_count || ""}</td>
                <td className="py-2.5 pr-3 text-right text-[var(--text-muted)]">
                  {f.all_time_w}-{f.all_time_l}
                </td>
                <td className="py-2.5 pr-3 text-right text-[var(--text-muted)]">
                  {f.win_pct ? f.win_pct.toFixed(3).replace(/^0/, "") : "—"}
                </td>
                {showPostseason && (
                  <td className="py-2.5 pr-4 text-right">
                    {psStyle && ps ? (
                      <a
                        href={`https://en.wikipedia.org/wiki/${ps.year}_NBA_playoffs`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-block rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap hover:opacity-80 transition-opacity"
                        style={{ background: psStyle.bg, color: psStyle.text }}
                        title={`${ps.year} NBA playoffs · ${ps.last_round} (Wikipedia)`}
                      >
                        {psStyle.label}
                      </a>
                    ) : (
                      <span className="text-[var(--text-dim)] text-[10px]">—</span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function Th({
  label,
  k,
  cur,
  dir,
  onClick,
  align = "left",
  className = "",
}: {
  label: string;
  k: SortKey;
  cur: SortKey;
  dir: SortDir;
  onClick: (k: SortKey) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = cur === k;
  const arrow = active ? (dir === "asc" ? "↑" : "↓") : "";
  return (
    <th
      className={`py-2 pr-3 font-medium uppercase tracking-wider text-[10px] cursor-pointer select-none hover:text-[var(--text)] ${
        align === "right" ? "text-right" : ""
      } ${className}`}
      onClick={() => onClick(k)}
    >
      {label}
      {arrow && <span className="ml-1 text-[var(--accent)]">{arrow}</span>}
    </th>
  );
}
