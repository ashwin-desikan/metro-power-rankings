"use client";

import { useMemo, useState } from "react";
import type { HistoricalFranchise, Championship, Season } from "@/lib/nfl";

// Inlined from lib/nfl.ts so this client component does not import any
// value from the server-only data module. Keep in sync with TITLE_COLORS
// in lib/nfl.ts (slate for pre-Super Bowl, gold for Super Bowl era).
const TITLE_COLORS = {
  pre_sb: { bg: "#6e8aa6", text: "#0c1320" },
  sb:     { bg: "#d4af37", text: "#1a1408" },
} as const;

// Sortable, expandable defunct-franchise table for /teams/nfl/historical.
// Each row is a native <details> element so the +/- toggle survives even
// when JavaScript is disabled or fails to hydrate. The header buttons are
// the only thing that needs the client runtime; on first render the table
// is sorted exactly as the ETL emitted it (champions first, then any row
// with a stolen title, then by city).

type SortKey =
  | "name"
  | "city"
  | "league"
  | "first_year"
  | "last_year"
  | "seasons"
  | "w"
  | "l"
  | "t"
  | "win_pct"
  | "championships";

type SortDir = "asc" | "desc";

// Pro Football Reference year-URL resolver. Branches by Season.league so
// AAFC (1946-49), AFL (1960-69), and APFA (1920-21) seasons route to the
// league-specific PFR endpoint. NFL and unknown leagues use the generic
// /years/{year}/ page (which on PFR is the NFL-era ledger).
function pfrYearUrl(year: number, league: string): string {
  const lg = (league || "").toUpperCase();
  if (lg === "APFA") return `https://www.pro-football-reference.com/years/${year}_APFA/`;
  if (lg === "AAFC") return `https://www.pro-football-reference.com/years/${year}_AAFC/`;
  if (lg === "AFL")  return `https://www.pro-football-reference.com/years/${year}_AFL/`;
  return `https://www.pro-football-reference.com/years/${year}/`;
}

// Historical-franchise monogram presets. Slightly desaturated so the eye
// reads "no longer active" without being punitive. Era-appropriate where
// the team's known colors are documented.
const HIST_MONO: Record<string, { bg: string; fg: string; mono: string }> = {
  "Maroons":              { bg: "#5e1414", fg: "#f1e4c5", mono: "TOL" },
  "Bulldogs (Canton)":    { bg: "#b22222", fg: "#ffffff", mono: "CAN" },
  "Indians (Akron)":      { bg: "#1b3a6f", fg: "#e8b87c", mono: "AKR" },
  "Bulldogs (Cleveland)": { bg: "#4a2c1a", fg: "#f5c75c", mono: "CLB" },
  "Yellow Jackets":       { bg: "#1a1a1a", fg: "#f6d33a", mono: "FRA" },
  "Triangles":            { bg: "#1f4a26", fg: "#d8c87b", mono: "DAY" },
  "Stapletons":           { bg: "#2f2f2f", fg: "#cccccc", mono: "SI" },
  "Wolverines":           { bg: "#5e3a1e", fg: "#f5d57a", mono: "CLE" },
  "Tigers":               { bg: "#1d1d1d", fg: "#f7b733", mono: "BKN" },
  "Bulldogs (Boston)":    { bg: "#532d1a", fg: "#e3c08a", mono: "POT" },
  "Independents":         { bg: "#5a3a2a", fg: "#e6c98b", mono: "RII" },
};

function monoFor(canonical: string): { bg: string; fg: string; mono: string } {
  return HIST_MONO[canonical] || {
    bg: "#2a2a36", fg: "#9d9db0",
    mono: (canonical.slice(0, 3) || "—").toUpperCase(),
  };
}

// Grid template matches the header strip. Eleven columns: franchise label,
// city, league, first, last, seasons, w, l, t, win%, titles. Tight on
// mobile; the parent <section> handles horizontal overflow.
const GRID = "1.05fr 1.1fr 0.6fr 0.45fr 0.45fr 0.5fr 0.45fr 0.45fr 0.45fr 0.55fr 1.1fr";

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
    case "t": return a.t - b.t;
    case "win_pct": return a.win_pct - b.win_pct;
    case "championships": return a.championships - b.championships;
  }
}

type Props = {
  rows: HistoricalFranchise[];
  histChamps: Record<string, Championship[]>;
  histSeasons: Record<string, Season[]>;
};

export default function HistoricalTable({ rows, histChamps, histSeasons }: Props) {
  // null sortKey means "default sort" — i.e. trust the order the ETL emits
  // (championships desc, then stolen, then city). Once the user clicks a
  // header we switch to client-side sorting.
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    if (sortKey == null) return rows;
    const arr = [...rows];
    arr.sort((a, b) => {
      const cmp = compare(a, b, sortKey);
      // Tie-breakers keep the sort stable and intuitive:
      //   sorting by name resolves ties on city
      //   any numeric sort resolves ties on championships then name
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
    // Numeric columns default to desc (most champs/wins/years first),
    // text columns default to asc.
    const numeric: SortKey[] = [
      "first_year", "last_year", "seasons", "w", "l", "t", "win_pct", "championships",
    ];
    setSortDir(numeric.includes(key) ? "desc" : "asc");
  }

  return (
    <>
      {/* Header strip doubles as the sort UI. The first cell is reserved
          for the +/- disclosure column so labels line up with rows below. */}
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
        <Th k="t" label="T" cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
        <Th k="win_pct" label="Win%" cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
        <Th k="championships" label="Titles" cur={sortKey} dir={sortDir} onClick={toggle} />
      </div>

      {/* Mobile sort control: the desktop header strip above (Th buttons
          calling onClick={() => toggle(k)}) is hidden below md, so cards
          need their own way to drive the same sortKey/sortDir state. */}
      <div className="flex items-center gap-2 mb-3 md:hidden">
        <label className="flex-1 flex items-center gap-2 text-xs min-w-0">
          <span className="uppercase tracking-wide text-[var(--text-dim)] flex-shrink-0">Sort</span>
          <select
            value={sortKey ?? ""}
            onChange={(e) => toggle(e.target.value as SortKey)}
            className="flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            <option value="" disabled>Choose…</option>
            <option value="name">Franchise</option>
            <option value="city">City</option>
            <option value="league">League</option>
            <option value="first_year">First</option>
            <option value="last_year">Last</option>
            <option value="seasons">Sea</option>
            <option value="w">W</option>
            <option value="l">L</option>
            <option value="t">T</option>
            <option value="win_pct">Win%</option>
            <option value="championships">Titles</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => sortKey && toggle(sortKey)}
          disabled={!sortKey}
          aria-label={sortDir === "asc" ? "Sort ascending" : "Sort descending"}
          className="rounded-lg border px-3 py-2 text-sm flex-shrink-0 disabled:opacity-40"
          style={{ borderColor: "var(--border)", color: "var(--text)" }}
        >
          {sortDir === "asc" ? "▲" : "▼"}
        </button>
      </div>

      <section
        className="rounded-xl border overflow-hidden"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        {sorted.map((r) => {
          const mono = monoFor(r.canonical);
          const titleEntries = histChamps[r.canonical] || [];
          const seasonRows = histSeasons[r.canonical] || [];
          const hasStolen = r.stolen_championships > 0;
          return (
            <details
              key={r.canonical}
              className="group border-b last:border-b-0"
              style={{
                borderColor: "var(--border)",
                background: hasStolen ? "rgba(94, 20, 20, 0.08)" : undefined,
              }}
            >
              <summary className="flex items-start gap-3 cursor-pointer select-none px-4 py-3 hover:bg-[var(--bg-card-hover)] transition-colors">
                <span
                  className="inline-grid place-items-center rounded-full flex-shrink-0 text-xs font-bold transition-transform"
                  style={{
                    background: "transparent",
                    color: "var(--text-muted)",
                    border: "1px solid var(--border)",
                    width: 22, height: 22, fontSize: 14, lineHeight: 1,
                    marginTop: 4,
                  }}
                  aria-hidden
                >
                  <span className="group-open:hidden">+</span>
                  <span className="hidden group-open:inline">−</span>
                </span>

                {/* Mobile: stacked card, no horizontal scrolling needed */}
                <div className="flex-1 min-w-0 md:hidden">
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
                    <span className="truncate text-sm font-medium">{r.display_name ?? r.name}</span>
                  </div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">
                    {r.city} · {r.league} · {r.first_year ?? "—"}–{r.last_year ?? "—"}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
                    <span className="font-medium">{r.w}-{r.l}-{r.t}</span>
                    <span className="text-[var(--text-muted)]">Win% {r.win_pct.toFixed(3)}</span>
                    <span className="text-[var(--text-muted)]">{r.seasons} seasons</span>
                  </div>
                  {titleEntries.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <TitleBadges entries={titleEntries} />
                    </div>
                  )}
                </div>

                {/* Desktop: aligned grid matching the header strip */}
                <div
                  className="hidden md:grid flex-1 items-center gap-3 text-sm"
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
                    <span className="truncate">{r.display_name ?? r.name}</span>
                  </div>
                  <div className="text-[var(--text-muted)] truncate">{r.city}</div>
                  <div className="text-[var(--text-muted)]">{r.league}</div>
                  <div className="text-right tabular-nums text-[var(--text-muted)]">{r.first_year ?? "—"}</div>
                  <div className="text-right tabular-nums text-[var(--text-muted)]">{r.last_year ?? "—"}</div>
                  <div className="text-center tabular-nums text-[var(--text-muted)]">{r.seasons}</div>
                  <div className="text-right tabular-nums">{r.w}</div>
                  <div className="text-right tabular-nums">{r.l}</div>
                  <div className="text-right tabular-nums">{r.t}</div>
                  <div className="text-right tabular-nums">{r.win_pct.toFixed(3)}</div>
                  <div>
                    {titleEntries.length === 0 ? (
                      <span className="text-[var(--text-dim)]">—</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        <TitleBadges entries={titleEntries} />
                      </span>
                    )}
                  </div>
                </div>
              </summary>

              {/* Body: per-season records for this franchise */}
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
                          <th className="text-right font-medium py-1.5 pr-3 uppercase tracking-wider text-[10px]">T</th>
                          <th className="text-right font-medium py-1.5 pr-3 uppercase tracking-wider text-[10px]">Win%</th>
                          <th className="text-left font-medium py-1.5 pr-3 uppercase tracking-wider text-[10px]">Finish</th>
                          <th className="text-left font-medium py-1.5 uppercase tracking-wider text-[10px]">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {seasonRows.map((s) => (
                          <tr
                            key={`${s.year}-${s.team}`}
                            className="border-t"
                            style={{
                              borderColor: "var(--border)",
                              background: s.champ ? "rgba(212,175,55,0.07)" : undefined,
                            }}
                          >
                            <td className="py-1.5 pr-3" style={{ color: s.champ ? TITLE_COLORS.sb.bg : undefined, fontWeight: s.champ ? 600 : undefined }}>
                              <a
                                href={pfrYearUrl(s.year, s.league)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:underline decoration-dotted underline-offset-2"
                                title={`${s.year} season on Pro Football Reference`}
                              >
                                {s.year}
                              </a>
                            </td>
                            <td className="py-1.5 pr-3 text-[var(--text-muted)]">{s.league}</td>
                            <td className="py-1.5 pr-3 text-[var(--text-muted)]">{s.city} {s.team}</td>
                            <td className="py-1.5 pr-3 text-right">{s.w}</td>
                            <td className="py-1.5 pr-3 text-right">{s.l}</td>
                            <td className="py-1.5 pr-3 text-right">{s.t}</td>
                            <td className="py-1.5 pr-3 text-right">{s.win_pct.toFixed(3)}</td>
                            <td className="py-1.5 pr-3 text-[var(--text-muted)]">{s.place}</td>
                            <td className="py-1.5 text-[var(--text-muted)]">
                              {s.champ ? "Champion" : s.champ_app ? "Title game" : s.playoff ? "Playoffs" : ""}
                            </td>
                          </tr>
                        ))}
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

// Championship-year badges, shared by the mobile card and desktop grid
// layouts so the striped "stolen title" treatment stays in one place.
function TitleBadges({ entries }: { entries: Championship[] }) {
  return (
    <>
      {entries.map((c) => {
        if (c.stolen) {
          return (
            <span
              key={c.year}
              title={c.stolen_note}
              className="inline-flex items-center text-xs font-semibold pr-4 pl-2 py-0.5 rounded relative"
              style={{
                background:
                  "repeating-linear-gradient(45deg, #5e1414 0, #5e1414 5px, #d4af37 5px, #d4af37 10px)",
                color: "#fff",
                border: "1px solid #d4af37",
                textShadow: "0 1px 0 rgba(0,0,0,0.6)",
              }}
            >
              {c.year}
              <span
                className="absolute right-1 top-1/2"
                style={{
                  transform: "translateY(-50%)",
                  color: "#d4af37",
                  textShadow: "0 1px 0 rgba(0,0,0,0.8)",
                  fontSize: "10px",
                }}
                aria-hidden
              >
                ★
              </span>
            </span>
          );
        }
        return (
          <span
            key={c.year}
            className="text-xs font-semibold px-2 py-0.5 rounded"
            style={{ background: TITLE_COLORS.pre_sb.bg, color: TITLE_COLORS.pre_sb.text }}
            title={c.season_team ? `${c.season_city ?? ""} ${c.season_team}` : undefined}
          >
            {c.year}
          </span>
        );
      })}
    </>
  );
}

// Sortable header cell. Click toggles direction when active, switches column
// otherwise. The default render (no column active) leaves the indicator off
// so the user can tell the table is in "ETL order" rather than client sort.
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
