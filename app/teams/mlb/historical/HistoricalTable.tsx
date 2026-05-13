"use client";

import { useMemo, useState } from "react";
import type { HistoricalFranchise, Season } from "@/lib/mlb";

// Sortable, expandable defunct-franchise table for /teams/mlb/historical.
// Mirrors the NFL HistoricalTable's +/- disclosure pattern: each row is a
// native <details> element so the toggle works without JavaScript, header
// buttons drive client-side sorting after the first click. The disclosure
// body renders that franchise's full season-by-season record with W-L,
// Win%, RS-RA, division/finish, and pennant/championship flags.

// Inlined to avoid pulling @/lib/mlb (server-only) into the client bundle.
const TITLE_COLORS = {
  pre_ws: { bg: "#6e8aa6", text: "#0c1320" },
  ws:     { bg: "#d4af37", text: "#1a1408" },
} as const;

type SortKey =
  | "name"
  | "city"
  | "league"
  | "first_year"
  | "last_year"
  | "seasons"
  | "w"
  | "l"
  | "win_pct"
  | "championships";

type SortDir = "asc" | "desc";

function brefYearUrl(year: number): string {
  return `https://www.baseball-reference.com/leagues/majors/${year}.shtml`;
}

// Historical-franchise monogram presets. Slightly desaturated so the eye
// reads "no longer active" without being punitive. Covers the better-known
// 19th-century franchises; the rest fall back to a neutral preset.
const HIST_MONO: Record<string, { bg: string; fg: string; mono: string }> = {
  "Orioles (1)":      { bg: "#5a2818", fg: "#f1c98a", mono: "BAL" },
  "Grays":            { bg: "#2c3e50", fg: "#cbd5e0", mono: "PRO" },
  "Spiders":          { bg: "#1a3a52", fg: "#c8a47e", mono: "CLE" },
  "Colonels":         { bg: "#2a4d2a", fg: "#d4af37", mono: "LOU" },
  "Brown Stockings (S)": { bg: "#3a2418", fg: "#d4b07a", mono: "SLB" },
  "Quakers":          { bg: "#1f2a4a", fg: "#bfb091", mono: "PHQ" },
  "Wolverines":       { bg: "#3a1a1a", fg: "#d4af37", mono: "DET" },
  "Bisons":           { bg: "#1f2937", fg: "#c4d5b7", mono: "BUF" },
  "Maroons":          { bg: "#5a1414", fg: "#e8c992", mono: "TOL" },
  "Hartfords":        { bg: "#1c2541", fg: "#c2d3eb", mono: "HRT" },
  "Red Stockings":    { bg: "#4a2828", fg: "#e8c4a8", mono: "BOS" },
  "Reds (1)":         { bg: "#4a1818", fg: "#e8c4a8", mono: "CIN" },
  "Mutuals":          { bg: "#2a3a2a", fg: "#c8d5c8", mono: "NYM" },
  "Solons":           { bg: "#3a2818", fg: "#d4b07a", mono: "WAS" },
  "Metropolitans":    { bg: "#2a4a3a", fg: "#c8d8c0", mono: "NYM" },
};

function monoFor(canonical: string): { bg: string; fg: string; mono: string } {
  return HIST_MONO[canonical] || {
    bg: "#2a2a36",
    fg: "#9d9db0",
    mono: (canonical.replace(/\([^)]*\)/g, "").trim().slice(0, 3) || "—").toUpperCase(),
  };
}

const GRID = "1.1fr 1.0fr 0.55fr 0.45fr 0.45fr 0.5fr 0.5fr 0.5fr 0.55fr 0.7fr";

function compare(a: HistoricalFranchise, b: HistoricalFranchise, key: SortKey): number {
  switch (key) {
    case "name": return a.name.localeCompare(b.name);
    case "city": return (a.city || "").localeCompare(b.city || "");
    case "league": return (a.league || "").localeCompare(b.league || "");
    case "first_year": return (a.first_year ?? 9999) - (b.first_year ?? 9999);
    case "last_year": return (a.last_year ?? 0) - (b.last_year ?? 0);
    case "seasons": return a.seasons - b.seasons;
    case "w": return a.w - b.w;
    case "l": return a.l - b.l;
    case "win_pct": return a.win_pct - b.win_pct;
    case "championships": return a.championships - b.championships;
  }
}

type Props = {
  rows: HistoricalFranchise[];
  histSeasons: Record<string, Season[]>;
};

export default function HistoricalTable({ rows, histSeasons }: Props) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    if (sortKey == null) return rows;
    const arr = [...rows];
    arr.sort((a, b) => {
      const cmp = compare(a, b, sortKey);
      let tiebreak = 0;
      if (cmp === 0) {
        if (sortKey === "name") tiebreak = (a.city || "").localeCompare(b.city || "");
        else tiebreak = (b.championships - a.championships) || a.name.localeCompare(b.name);
      }
      const combined = cmp !== 0 ? cmp : tiebreak;
      return sortDir === "asc" ? combined : -combined;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  function toggle(key: SortKey) {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(key);
    const numeric: SortKey[] = ["first_year", "last_year", "seasons", "w", "l", "win_pct", "championships"];
    setSortDir(numeric.includes(key) ? "desc" : "asc");
  }

  return (
    <>
      <div
        className="hidden md:grid gap-3 px-4 py-2 text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-medium"
        style={{ gridTemplateColumns: GRID }}
      >
        <Th k="name" label="Franchise" cur={sortKey} dir={sortDir} onClick={toggle} className="pl-9" />
        <Th k="city" label="City" cur={sortKey} dir={sortDir} onClick={toggle} />
        <Th k="league" label="League" cur={sortKey} dir={sortDir} onClick={toggle} />
        <Th k="first_year" label="First" cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
        <Th k="last_year" label="Last" cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
        <Th k="seasons" label="Sea" cur={sortKey} dir={sortDir} onClick={toggle} align="center" />
        <Th k="w" label="W" cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
        <Th k="l" label="L" cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
        <Th k="win_pct" label="Win%" cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
        <Th k="championships" label="Cups/Pen" cur={sortKey} dir={sortDir} onClick={toggle} />
      </div>

      <section
        className="rounded-xl border overflow-hidden"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        {sorted.map((r) => {
          const mono = monoFor(r.canonical);
          const seasonRows = histSeasons[r.canonical] || [];
          const champSeasons = seasonRows.filter((s) => s.champ || s.oth_chmp || s.ws_app || s.oth_chmp_app);
          return (
            <details
              key={r.canonical}
              className="group border-b last:border-b-0"
              style={{ borderColor: "var(--border)" }}
            >
              <summary className="flex items-center gap-3 cursor-pointer select-none px-4 py-3 hover:bg-[var(--bg-card-hover)] transition-colors">
                <span
                  className="inline-grid place-items-center rounded-full flex-shrink-0 text-xs font-bold transition-transform"
                  style={{
                    background: "transparent",
                    color: "var(--text-muted)",
                    border: "1px solid var(--border)",
                    width: 22, height: 22, fontSize: 14, lineHeight: 1,
                  }}
                  aria-hidden
                >
                  <span className="group-open:hidden">+</span>
                  <span className="hidden group-open:inline">−</span>
                </span>
                <div
                  className="flex-1 grid items-center gap-3 text-xs sm:text-sm"
                  style={{ gridTemplateColumns: GRID }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="inline-grid place-items-center rounded-full flex-shrink-0"
                      style={{
                        background: mono.bg, color: mono.fg,
                        width: 28, height: 28, fontSize: 10, fontWeight: 700, letterSpacing: "-0.02em",
                      }}
                      aria-hidden
                    >
                      {mono.mono}
                    </span>
                    <span className="truncate">{r.name}</span>
                  </div>
                  <div className="text-[var(--text-muted)] truncate">{r.city}</div>
                  <div className="text-[var(--text-muted)]">{r.league}</div>
                  <div className="text-right tabular-nums text-[var(--text-muted)]">{r.first_year ?? "—"}</div>
                  <div className="text-right tabular-nums text-[var(--text-muted)]">{r.last_year ?? "—"}</div>
                  <div className="text-center tabular-nums text-[var(--text-muted)]">{r.seasons}</div>
                  <div className="text-right tabular-nums">{r.w}</div>
                  <div className="text-right tabular-nums">{r.l}</div>
                  <div className="text-right tabular-nums">{r.win_pct.toFixed(3)}</div>
                  <div>
                    {champSeasons.length === 0 ? (
                      <span className="text-[var(--text-dim)]">—</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {champSeasons.map((c) => {
                          const won = c.champ || c.oth_chmp;
                          const ws = c.year >= 1903;
                          const color = ws ? TITLE_COLORS.ws : TITLE_COLORS.pre_ws;
                          return (
                            <span
                              key={c.year}
                              className="text-xs font-semibold px-2 py-0.5 rounded"
                              style={won
                                ? { background: color.bg, color: color.text }
                                : { border: `1px solid ${color.bg}`, color: color.bg }
                              }
                              title={won ? `${c.year} ${ws ? "World Series" : "pre-1903 cup / NL pennant"}` : `${c.year} appearance, lost`}
                            >
                              {c.year}
                            </span>
                          );
                        })}
                      </span>
                    )}
                  </div>
                </div>
              </summary>

              <div className="px-4 pb-4 pt-1 border-t" style={{ borderColor: "var(--border)" }}>
                {seasonRows.length === 0 ? (
                  <p className="text-xs text-[var(--text-dim)] italic py-3">
                    No season-by-season records in the source workbook.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs tabular-nums mt-2">
                      <thead>
                        <tr className="text-[var(--text-muted)]">
                          <th className="text-left font-medium py-1.5 pr-3 uppercase tracking-wider text-[10px]">Year</th>
                          <th className="text-left font-medium py-1.5 pr-3 uppercase tracking-wider text-[10px]">League</th>
                          <th className="text-left font-medium py-1.5 pr-3 uppercase tracking-wider text-[10px]">Team</th>
                          <th className="text-right font-medium py-1.5 pr-3 uppercase tracking-wider text-[10px]">W</th>
                          <th className="text-right font-medium py-1.5 pr-3 uppercase tracking-wider text-[10px]">L</th>
                          <th className="text-right font-medium py-1.5 pr-3 uppercase tracking-wider text-[10px]">Win%</th>
                          <th className="text-right font-medium py-1.5 pr-3 uppercase tracking-wider text-[10px]">RS</th>
                          <th className="text-right font-medium py-1.5 pr-3 uppercase tracking-wider text-[10px]">RA</th>
                          <th className="text-left font-medium py-1.5 pr-3 uppercase tracking-wider text-[10px]">Finish</th>
                          <th className="text-left font-medium py-1.5 uppercase tracking-wider text-[10px]">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {seasonRows.map((s) => {
                          const ws = s.year >= 1903;
                          const champColor = s.champ || s.oth_chmp ? (ws ? TITLE_COLORS.ws.bg : TITLE_COLORS.pre_ws.bg) : undefined;
                          return (
                            <tr
                              key={`${s.year}-${s.team}`}
                              className="border-t"
                              style={{
                                borderColor: "var(--border)",
                                background: (s.champ || s.oth_chmp) ? "rgba(212,175,55,0.07)" : undefined,
                              }}
                            >
                              <td className="py-1.5 pr-3" style={{ color: champColor, fontWeight: (s.champ || s.oth_chmp) ? 600 : undefined }}>
                                <a
                                  href={brefYearUrl(s.year)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hover:underline decoration-dotted underline-offset-2"
                                  title={`${s.year} season on Baseball-Reference`}
                                >
                                  {s.year}
                                </a>
                              </td>
                              <td className="py-1.5 pr-3 text-[var(--text-muted)]">{s.league}</td>
                              <td className="py-1.5 pr-3 text-[var(--text-muted)]">{s.city} {s.team}</td>
                              <td className="py-1.5 pr-3 text-right">{s.w}</td>
                              <td className="py-1.5 pr-3 text-right">{s.l}</td>
                              <td className="py-1.5 pr-3 text-right">{s.win_pct.toFixed(3)}</td>
                              <td className="py-1.5 pr-3 text-right">{s.rs}</td>
                              <td className="py-1.5 pr-3 text-right">{s.ra}</td>
                              <td className="py-1.5 pr-3 text-[var(--text-muted)]">{s.place}</td>
                              <td className="py-1.5 text-[var(--text-muted)]">
                                {s.champ
                                  ? "World Series champion"
                                  : s.oth_chmp
                                  ? "Pre-1903 cup / pennant winner"
                                  : s.ws_app
                                  ? "World Series appearance"
                                  : s.oth_chmp_app
                                  ? "Pre-1903 cup appearance"
                                  : s.lcs_app
                                  ? "LCS"
                                  : s.playoff
                                  ? "Playoffs"
                                  : s.tiebreaker
                                  ? "Tiebreaker (missed playoffs)"
                                  : ""}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </details>
          );
        })}
      </section>
    </>
  );
}

function Th({
  k, label, cur, dir, onClick, align, className,
}: {
  k: SortKey;
  label: string;
  cur: SortKey | null;
  dir: SortDir;
  onClick: (k: SortKey) => void;
  align?: "right" | "center";
  className?: string;
}) {
  const isActive = cur === k;
  const justify =
    align === "right" ? "text-right" :
    align === "center" ? "text-center" :
    "text-left";
  return (
    <button
      type="button"
      onClick={() => onClick(k)}
      className={`font-medium uppercase tracking-wider text-[10px] cursor-pointer select-none hover:text-[var(--text)] ${justify} ${className ?? ""}`}
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
    </button>
  );
}
