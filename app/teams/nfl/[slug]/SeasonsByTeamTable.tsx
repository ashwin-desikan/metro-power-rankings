"use client";

import { useMemo, useState } from "react";
import type { Season } from "@/lib/nfl";

// Sortable Season-by-season table for /teams/nfl/[slug]. Client component so
// header clicks can re-sort without a round trip. Server-side wrapper passes
// the workbook rows plus an optional in-progress row (is_live: true) sourced
// from ESPN standings; the live row is pinned to the top regardless of sort
// so an unfinished season is never ranked against completed ones.

type SeasonRow = Season & { is_live?: boolean };

type SortKey =
  | "year"
  | "w"
  | "l"
  | "t"
  | "win_pct"
  | "pf"
  | "pa"
  | "division"
  | "place";

type SortDir = "asc" | "desc";

type Props = {
  rows: SeasonRow[];
  sourceLabel?: string;
  week?: number | null;
};

// Inlined to avoid pulling @/lib/nfl (server-only) into the client bundle.
// Same values as TITLE_COLORS.sb in lib/nfl.ts.
const TITLE_GOLD = "#d4af37";
const PRE_SB_BRONZE = "#b08d57";

function pfrYearUrl(year: number, league: string): string {
  const lg = (league || "").toUpperCase();
  if (lg === "APFA") return `https://www.pro-football-reference.com/years/${year}_APFA/`;
  if (lg === "AAFC") return `https://www.pro-football-reference.com/years/${year}_AAFC/`;
  if (lg === "AFL") return `https://www.pro-football-reference.com/years/${year}_AFL/`;
  return `https://www.pro-football-reference.com/years/${year}/`;
}

// Numeric sort with a stable secondary on year so equal records keep
// chronological order among themselves. Place ("#1", "#2", or strings like
// "1st") is parsed as a leading integer where possible.
function parseFinish(p: string): number {
  if (!p) return Number.POSITIVE_INFINITY;
  const m = p.match(/-?\d+/);
  return m ? Number(m[0]) : Number.POSITIVE_INFINITY;
}

function compare(a: SeasonRow, b: SeasonRow, key: SortKey): number {
  switch (key) {
    case "year": return a.year - b.year;
    case "w": return a.w - b.w;
    case "l": return a.l - b.l;
    case "t": return a.t - b.t;
    case "win_pct": return a.win_pct - b.win_pct;
    case "pf": return a.pf - b.pf;
    case "pa": return a.pa - b.pa;
    case "division": return (a.division || "").localeCompare(b.division || "");
    case "place": return parseFinish(a.place) - parseFinish(b.place);
  }
}

export default function SeasonsByTeamTable({ rows, sourceLabel, week }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("year");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { liveRow, sortedHistorical } = useMemo(() => {
    const live = rows.find((r) => r.is_live === true) || null;
    const historical = rows.filter((r) => !r.is_live);
    historical.sort((a, b) => {
      const cmp = compare(a, b, sortKey);
      // Secondary: most-recent year for tie-breaking, except when year is
      // the primary key.
      const tiebreak = sortKey === "year" ? 0 : b.year - a.year;
      const combined = cmp !== 0 ? cmp : tiebreak;
      return sortDir === "asc" ? combined : -combined;
    });
    return { liveRow: live, sortedHistorical: historical };
  }, [rows, sortKey, sortDir]);

  function toggle(key: SortKey) {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(key);
    // Numeric and recency columns default to desc on first click.
    // Text columns and "place" (lower is better) default to asc.
    const desc: SortKey[] = ["year", "w", "win_pct", "pf"];
    setSortDir(desc.includes(key) ? "desc" : "asc");
  }

  const displayRows = liveRow ? [liveRow, ...sortedHistorical] : sortedHistorical;

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="text-[var(--text-muted)]">
              <Th label="Season" k="year" cur={sortKey} dir={sortDir} onClick={toggle} />
              <th className="text-left font-medium py-2 uppercase tracking-wider text-[10px]">
                Team
              </th>
              <Th label="W" k="w" cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
              <Th label="L" k="l" cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
              <Th label="T" k="t" cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
              <Th label="Win%" k="win_pct" cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
              <Th label="PF" k="pf" cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
              <Th label="PA" k="pa" cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
              <Th label="Division" k="division" cur={sortKey} dir={sortDir} onClick={toggle} className="pl-3" />
              <Th label="Finish" k="place" cur={sortKey} dir={sortDir} onClick={toggle} />
              <th className="text-left font-medium py-2 uppercase tracking-wider text-[10px]">
                Postseason
              </th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((s) => {
              const isLive = s.is_live === true;
              const isSb = s.year >= 1966;
              const champColor = s.champ ? (isSb ? TITLE_GOLD : PRE_SB_BRONZE) : undefined;
              return (
                <tr
                  key={`${s.year}-${s.team}${isLive ? "-live" : ""}`}
                  className="border-t"
                  style={{
                    borderColor: "var(--border)",
                    background: s.champ
                      ? "rgba(212,175,55,0.07)"
                      : isLive
                      ? "rgba(78,205,196,0.06)"
                      : undefined,
                    fontStyle: isLive ? "italic" : undefined,
                  }}
                  title={
                    isLive && sourceLabel
                      ? `In progress · live record from ESPN (${sourceLabel}). Replaced by the workbook row after the season ends.`
                      : undefined
                  }
                >
                  <td
                    className="py-1.5"
                    style={{
                      color: champColor,
                      fontWeight: s.champ || isLive ? 600 : undefined,
                    }}
                  >
                    {isLive ? (
                      <span title={`${s.year} season in progress`}>{s.year}</span>
                    ) : (
                      <a
                        href={pfrYearUrl(s.year, s.league)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline decoration-dotted underline-offset-2"
                        title={`${s.year} season on Pro Football Reference`}
                      >
                        {s.year}
                      </a>
                    )}
                  </td>
                  <td className="py-1.5 text-[var(--text-muted)]">
                    {s.city} {s.team}
                  </td>
                  <td className="text-right py-1.5">{s.w}</td>
                  <td className="text-right py-1.5">{s.l}</td>
                  <td className="text-right py-1.5">{s.t}</td>
                  <td className="text-right py-1.5">{s.win_pct.toFixed(3)}</td>
                  <td className="text-right py-1.5">{s.pf}</td>
                  <td className="text-right py-1.5">{s.pa}</td>
                  <td className="pl-3 py-1.5 text-[var(--text-muted)]">{s.division}</td>
                  <td className="py-1.5 text-[var(--text-muted)]">{s.place}</td>
                  <td className="py-1.5">
                    {isLive ? (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider border"
                        style={{
                          borderColor: "var(--border)",
                          color: "var(--text-muted)",
                          background: "var(--bg-card)",
                        }}
                        title={`Live record from ESPN${week ? ` · Week ${week}` : ""}`}
                      >
                        <span
                          aria-hidden
                          className="inline-block w-1.5 h-1.5 rounded-full"
                          style={{ background: "rgb(34,197,94)" }}
                        />
                        In progress · ESPN
                      </span>
                    ) : (
                      <SeasonBadges
                        playoff={s.playoff}
                        divTitle={s.div_title}
                        confFinal={s.conf_final}
                        champApp={s.champ_app}
                        champ={s.champ}
                        year={s.year}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {liveRow ? (
        <p className="text-[10px] mt-3" style={{ color: "var(--text-dim)" }}>
          In-progress {liveRow.year} row pulled from ESPN public standings, refreshed hourly. Replaced by the canonical workbook row after the season concludes.
        </p>
      ) : null}
    </>
  );
}

// Sortable column header. Mirrors the pattern used by FranchiseTable.
function Th({
  label,
  k,
  cur,
  dir,
  onClick,
  align,
  className,
}: {
  label: string;
  k: SortKey;
  cur: SortKey;
  dir: SortDir;
  onClick: (k: SortKey) => void;
  align?: "right";
  className?: string;
}) {
  const isActive = cur === k;
  return (
    <th
      className={`font-medium py-2 uppercase tracking-wider text-[10px] cursor-pointer select-none hover:text-[var(--text)] ${align === "right" ? "text-right" : "text-left"} ${className ?? ""}`}
      onClick={() => onClick(k)}
      style={{ color: isActive ? "var(--text)" : undefined }}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive && (
          <span aria-hidden style={{ color: "var(--accent)" }}>
            {dir === "asc" ? "▲" : "▼"}
          </span>
        )}
      </span>
    </th>
  );
}

// Same badge set rendered in the prior server-side table. Inlined here so
// the client component does not import from @/lib/nfl. SB era boundary is
// 1966 (first AFL-NFL Championship); older champion rows render in bronze.
function SeasonBadges({
  playoff,
  divTitle,
  confFinal,
  champApp,
  champ,
  year,
}: {
  playoff: boolean;
  divTitle: boolean;
  confFinal: boolean;
  champApp: boolean;
  champ: boolean;
  year: number;
}) {
  const isSb = year >= 1966;
  const eraBg = isSb ? TITLE_GOLD : PRE_SB_BRONZE;
  const eraTextOnBg = isSb ? "#1a1a1a" : "#fff";
  const badges: React.ReactNode[] = [];
  if (champ) {
    badges.push(
      <span
        key="champ"
        className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
        style={{ background: eraBg, color: eraTextOnBg }}
        title={isSb ? "Won Super Bowl" : "Won NFL/AAFC/AFL championship"}
      >
        Champion
      </span>,
    );
  } else if (champApp) {
    badges.push(
      <span
        key="champapp"
        className="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide"
        style={{ border: `1px solid ${eraBg}`, color: eraBg }}
        title={isSb ? "Reached Super Bowl, lost" : "Reached championship game, lost"}
      >
        {isSb ? "SB App" : "Title App"}
      </span>,
    );
  } else if (confFinal) {
    badges.push(
      <span
        key="cf"
        className="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide"
        style={{ background: "rgba(78,205,196,0.16)", color: "var(--accent)" }}
        title="Reached conference championship game"
      >
        Conf Final
      </span>,
    );
  }
  if (divTitle) {
    badges.push(
      <span
        key="div"
        className="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide"
        style={{ background: "rgba(123,104,238,0.18)", color: "#a99bff" }}
        title="Won division"
      >
        Div Title
      </span>,
    );
  }
  if (playoff && !divTitle && !confFinal && !champApp && !champ) {
    badges.push(
      <span
        key="po"
        className="text-[10px] font-medium px-1.5 py-0.5 rounded"
        style={{ background: "rgba(255,255,255,0.04)", color: "var(--text-muted)" }}
        title="Made the playoffs"
      >
        Playoffs
      </span>,
    );
  }
  if (badges.length === 0) return <span className="text-[var(--text-dim)]">—</span>;
  return <span className="inline-flex flex-wrap gap-1">{badges}</span>;
}
