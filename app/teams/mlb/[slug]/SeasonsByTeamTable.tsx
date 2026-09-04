"use client";

import { useMemo, useState } from "react";
import type { Season } from "@/lib/mlb";
import { CappedList } from "@/app/_shared/Disclosure";
import { DataBar } from "@/app/_shared/DataBar";

// Sortable Season-by-season table for /teams/mlb/[slug]. Mirrors the NFL
// version's UX exactly: live in-progress row pinned to top, italic + accent
// background to disambiguate, normal historical rows sortable on every
// numeric column. MLB columns: Season, Team, W, L, Win%, RS, RA, Division,
// Finish, Postseason. No PF/PA (those are NFL); MLB uses Runs Scored / Runs
// Allowed and the live ESPN row populates them from ESPN's standings
// "pointsFor"/"pointsAgainst" stats.

type SeasonRow = Season & { is_live?: boolean };

type SortKey =
  | "year"
  | "w"
  | "l"
  | "win_pct"
  | "rs"
  | "ra"
  | "division"
  | "place";

type SortDir = "asc" | "desc";

type Props = {
  rows: SeasonRow[];
  sourceLabel?: string;
  fetchedAt?: string;   // ISO timestamp from ESPN standings; rendered as a sub-line on the live row
};

const TITLE_GOLD = "#d4af37";
const PRE_WS_SLATE = "#6e8aa6";

// MLB year-page URL on Baseball-Reference. Modern era (1903+) uses the
// unified "majors" standings page. Pre-1903 routes to the workbook's
// league-specific page (AA = American Association 1882-1891; NL pennant
// races back to 1876; the short-lived PL, FL, UA, NA leagues likewise).
function brefYearUrl(year: number, league: string): string {
  if (year >= 1903) return `https://www.baseball-reference.com/leagues/majors/${year}-standings.shtml`;
  const lg = (league || "").toUpperCase().trim();
  if (lg === "AA") return `https://www.baseball-reference.com/leagues/AA/${year}.shtml`;
  if (lg === "NL") return `https://www.baseball-reference.com/leagues/NL/${year}.shtml`;
  if (lg === "AL") return `https://www.baseball-reference.com/leagues/AL/${year}.shtml`;
  if (lg === "PL") return `https://www.baseball-reference.com/leagues/PL/${year}.shtml`;
  if (lg === "FL") return `https://www.baseball-reference.com/leagues/FL/${year}.shtml`;
  if (lg === "UA") return `https://www.baseball-reference.com/leagues/UA/${year}.shtml`;
  if (lg === "NA") return `https://www.baseball-reference.com/leagues/NA/${year}.shtml`;
  return `https://www.baseball-reference.com/leagues/majors/${year}-standings.shtml`;
}

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
    case "win_pct": return a.win_pct - b.win_pct;
    case "rs": return a.rs - b.rs;
    case "ra": return a.ra - b.ra;
    case "division": return (a.division || "").localeCompare(b.division || "");
    case "place": return parseFinish(a.place) - parseFinish(b.place);
  }
}

// Format the "as of" date for the live in-progress row. The build runs
// once a day around 08:00 UTC (see .github/workflows/daily-rebuild.yml),
// at which point ESPN's standings cache reflects games played the
// previous calendar day in UTC terms. Subtract 24h from fetched_at and
// render in UTC so readers see the date that matches the games on the
// row, not the build timestamp. Fixed UTC formatting keeps the label
// stable across reader timezones.
function formatFetchedDate(iso: string | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const yesterday = new Date(d.getTime() - 24 * 60 * 60 * 1000);
    return yesterday.toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
    });
  } catch {
    return null;
  }
}

export default function SeasonsByTeamTable({ rows, sourceLabel, fetchedAt }: Props) {
  const asOfDate = formatFetchedDate(fetchedAt);
  const [sortKey, setSortKey] = useState<SortKey>("year");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [announce, setAnnounce] = useState("");

  const { liveRow, sortedHistorical } = useMemo(() => {
    const live = rows.find((r) => r.is_live === true) || null;
    const historical = rows.filter((r) => !r.is_live);
    historical.sort((a, b) => {
      const cmp = compare(a, b, sortKey);
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
    const desc: SortKey[] = ["year", "w", "win_pct", "rs"];
    setSortDir(desc.includes(key) ? "desc" : "asc");
  }

  const displayRows = liveRow ? [liveRow, ...sortedHistorical] : sortedHistorical;
  // Win% is the clearest single magnitude column in a season-by-season log.
  // colMax is computed once here over the full displayRows set (not a
  // paginated/visible slice), before both the mobile and desktop row maps.
  const colMax = Math.max(...displayRows.map((s) => s.win_pct), 0.001);

  return (
    <>
      {/* Mobile sort control: the desktop header cells (onClick={() => toggle(k)})
          are hidden along with the table below sm, so cards need their own way
          to drive the same sortKey/sortDir state. */}
      <div
        className="sticky top-20 z-30 flex items-center gap-2 py-2 mb-1 sm:hidden"
        style={{ backgroundColor: "var(--bg)" }}
      >
        <label className="flex-1 flex items-center gap-2 text-xs min-w-0">
          <span className="uppercase tracking-wide text-[var(--text-dim)] flex-shrink-0">Sort</span>
          <select
            value={sortKey}
            onChange={(e) => {
              const label = e.target.options[e.target.selectedIndex]?.text ?? "";
              toggle(e.target.value as SortKey);
              setAnnounce(`Sorted by ${label}`);
            }}
            className="flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            <option value="year">Season</option>
            <option value="w">W</option>
            <option value="l">L</option>
            <option value="win_pct">Win%</option>
            <option value="rs">RS</option>
            <option value="ra">RA</option>
            <option value="division">Division</option>
            <option value="place">Finish</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            toggle(sortKey);
            setAnnounce(`Sort direction: ${sortDir === "asc" ? "descending" : "ascending"}`);
          }}
          aria-label={sortDir === "asc" ? "Sort ascending" : "Sort descending"}
          className="rounded-lg border px-3 py-2 text-sm flex-shrink-0"
          style={{ borderColor: "var(--border)", color: "var(--text)" }}
        >
          {sortDir === "asc" ? "▲" : "▼"}
        </button>
        <span aria-live="polite" className="sr-only">{announce}</span>
      </div>

      {/* Mobile: one card per season instead of a 10-column table that would
          need sideways scrolling to read Win%, RS/RA, division, and
          postseason status together. Same `displayRows` drives both this
          list and the desktop table below. */}
      <div className="grid grid-cols-1 gap-2 sm:hidden">
        <CappedList
          initial={12}
          noun="seasons"
          className="rounded-lg border border-[var(--border)]"
          bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
          items={displayRows.map((s) => {
          const isLive = s.is_live === true;
          const champColor = s.champ
            ? (s.year >= 1903 ? TITLE_GOLD : PRE_WS_SLATE)
            : undefined;
          return (
            <div
              key={`${s.year}-${s.team}${isLive ? "-live" : ""}-card`}
              className="rounded-lg border p-3"
              style={{
                borderColor: "var(--border)",
                background: s.champ
                  ? "rgba(212,175,55,0.07)"
                  : isLive
                  ? "rgba(78,205,196,0.06)"
                  : "var(--bg-card)",
                fontStyle: isLive ? "italic" : undefined,
              }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className="text-sm"
                  style={{
                    color: champColor,
                    fontWeight: s.champ || isLive ? 600 : undefined,
                  }}
                >
                  {isLive ? (
                    <span title={`${s.year} season in progress`}>{s.year}</span>
                  ) : (
                    <a
                      href={brefYearUrl(s.year, s.league)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline decoration-dotted underline-offset-2"
                      title={`${s.year} season on Baseball-Reference`}
                    >
                      {s.year}
                    </a>
                  )}
                </span>
                <span className="text-xs text-[var(--text-muted)] not-italic">
                  {[s.city, s.team].filter(Boolean).join(" ")}
                </span>
              </div>
              {isLive && asOfDate ? (
                <div
                  className="text-[9px] mt-0.5 not-italic"
                  style={{ color: "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace" }}
                  title={`Live record from ESPN, fetched ${fetchedAt}`}
                >
                  as of {asOfDate}
                </div>
              ) : null}
              <div className="mt-2 grid grid-cols-4 gap-1.5 text-xs tabular-nums text-center">
                <div>
                  <div className="text-[9px] uppercase tracking-wide text-[var(--text-dim)]">W-L</div>
                  <div className="font-semibold">{s.w}-{s.l}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wide text-[var(--text-dim)]">Win%</div>
                  <div>{s.win_pct.toFixed(3)}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wide text-[var(--text-dim)]">RS</div>
                  <div>{s.rs}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wide text-[var(--text-dim)]">RA</div>
                  <div>{s.ra}</div>
                </div>
              </div>
              <div className="mt-1.5 text-[11px] text-[var(--text-muted)] not-italic">
                {s.division}{s.division && s.place ? " · " : ""}{s.place}
              </div>
              <div className="mt-1.5 not-italic">
                {isLive ? (
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider border"
                    style={{
                      borderColor: "var(--border)",
                      color: "var(--text-muted)",
                      background: "var(--bg-card)",
                    }}
                    title={`Live record from ESPN`}
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
                    lcsApp={s.lcs_app}
                    wsApp={s.ws_app}
                    champ={s.champ}
                    otherCupApp={s.oth_chmp_app}
                    otherCupWon={s.oth_chmp}
                    tiebreaker={s.tiebreaker === true}
                    year={s.year}
                  />
                )}
              </div>
            </div>
          );
        })}
        />
      </div>

      <div className="overflow-x-auto hidden sm:block">
        <table className="w-full min-w-[680px] text-xs tabular-nums">
          <thead>
            <tr className="text-[var(--text-muted)]">
              <Th label="Season" k="year" cur={sortKey} dir={sortDir} onClick={toggle} />
              <th className="text-left font-medium py-2 uppercase tracking-wider text-[10px]">
                Team
              </th>
              <Th label="W" k="w" cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
              <Th label="L" k="l" cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
              <Th label="Win%" k="win_pct" cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
              <Th label="RS" k="rs" cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
              <Th label="RA" k="ra" cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
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
              const champColor = s.champ
                ? (s.year >= 1903 ? TITLE_GOLD : PRE_WS_SLATE)
                : undefined;
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
                        href={brefYearUrl(s.year, s.league)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline decoration-dotted underline-offset-2"
                        title={`${s.year} season on Baseball-Reference`}
                      >
                        {s.year}
                      </a>
                    )}
                  </td>
                  <td className="py-1.5 text-[var(--text-muted)]">
                    <div className="leading-tight">
                      {[s.city, s.team].filter(Boolean).join(" ")}
                    </div>
                    {isLive && asOfDate ? (
                      <div
                        className="text-[9px] mt-0.5 not-italic"
                        style={{ color: "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace" }}
                        title={`Live record from ESPN, fetched ${fetchedAt}`}
                      >
                        as of {asOfDate}
                      </div>
                    ) : null}
                  </td>
                  <td className="text-right py-1.5">{s.w}</td>
                  <td className="text-right py-1.5">{s.l}</td>
                  <td className="text-right py-1.5">
                    <DataBar v={s.win_pct} max={colMax} dp={3} width={72} label="win percentage" />
                  </td>
                  <td className="text-right py-1.5">{s.rs}</td>
                  <td className="text-right py-1.5">{s.ra}</td>
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
                        title={`Live record from ESPN`}
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
                        lcsApp={s.lcs_app}
                        wsApp={s.ws_app}
                        champ={s.champ}
                        otherCupApp={s.oth_chmp_app}
                        otherCupWon={s.oth_chmp}
                        tiebreaker={s.tiebreaker === true}
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
          In-progress {liveRow.year} row pulled from ESPN public standings{asOfDate ? `, as of ${asOfDate}` : ""}. Refreshed hourly via Next ISR; the record on the row reflects the most recent ESPN snapshot.
        </p>
      ) : null}
    </>
  );
}

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

// MLB-specific postseason badges. Era boundary is 1903 (start of modern
// World Series). Pre-1903 cup wins (Temple Cup, Chronicle-Telegraph,
// World's Series, NL pennants) get the slate treatment; WS wins get gold.
function SeasonBadges({
  playoff,
  divTitle,
  lcsApp,
  wsApp,
  champ,
  otherCupApp,
  otherCupWon,
  tiebreaker,
  year,
}: {
  playoff: boolean;
  divTitle: boolean;
  lcsApp: boolean;
  wsApp: boolean;
  champ: boolean;
  otherCupApp: boolean;
  otherCupWon: boolean;
  tiebreaker: boolean;
  year: number;
}) {
  const isWsEra = year >= 1903;
  const eraBg = isWsEra ? TITLE_GOLD : PRE_WS_SLATE;
  const eraTextOnBg = isWsEra ? "#1a1a1a" : "#fff";
  const badges: React.ReactNode[] = [];
  if (champ) {
    badges.push(
      <span
        key="champ"
        className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
        style={{ background: eraBg, color: eraTextOnBg }}
        title={isWsEra ? "Won World Series" : "Won pre-1903 cup / NL pennant"}
      >
        Champion
      </span>,
    );
  } else if (wsApp) {
    badges.push(
      <span
        key="wsapp"
        className="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide"
        style={{ border: `1px solid ${eraBg}`, color: eraBg }}
        title="Reached World Series, lost"
      >
        WS App
      </span>,
    );
  } else if (otherCupWon) {
    badges.push(
      <span
        key="othcup-won"
        className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
        style={{ background: PRE_WS_SLATE, color: "#fff" }}
        title="Won pre-1903 cup / NL pennant"
      >
        Champion
      </span>,
    );
  } else if (otherCupApp) {
    badges.push(
      <span
        key="othcup-app"
        className="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide"
        style={{ border: `1px solid ${PRE_WS_SLATE}`, color: PRE_WS_SLATE }}
        title="Reached pre-1903 cup, lost"
      >
        Cup App
      </span>,
    );
  } else if (lcsApp) {
    badges.push(
      <span
        key="lcs"
        className="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide"
        style={{ background: "rgba(78,205,196,0.16)", color: "var(--accent)" }}
        title="Reached League Championship Series"
      >
        LCS
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
  if (playoff && !divTitle && !lcsApp && !wsApp && !champ && !otherCupApp) {
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
  if (tiebreaker && !playoff) {
    badges.push(
      <span
        key="tb"
        className="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide"
        style={{ background: "rgba(110,138,166,0.16)", color: "#a9b8cc", border: "1px solid rgba(110,138,166,0.45)" }}
        title="Played a one-game tiebreaker and missed the playoffs"
      >
        Tiebreaker
      </span>,
    );
  }
  if (badges.length === 0) return <span className="text-[var(--text-dim)]">—</span>;
  return <span className="inline-flex flex-wrap gap-1">{badges}</span>;
}
