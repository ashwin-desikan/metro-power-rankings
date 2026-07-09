"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Franchise, HistoricalFranchise, PlayoffStateRecord } from "@/lib/nba";

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

// All-time franchise table for /teams/nba. Current franchises plus (when the
// filter is "All") defunct franchises from historical.json, tagged Defunct.
// Defunct rows show their last city in Metro and dashes where data is absent;
// the live postseason column applies to current teams only.

type SortKey =
  | "name" | "metro" | "conf" | "founding_year" | "championships" | "aba_titles"
  | "champ_apps" | "cf_apps" | "win_pct" | "record" | "playoff_appearances"
  | "all_stars" | "postseason";
type SortDir = "asc" | "desc";
type View = "current" | "all";
type Mono = { bg: string; fg: string; mono: string };

type Row = {
  key: string; slug: string | null; canonical: string; name: string; defunct: boolean;
  metroLabel: string | null; metroSlug: string | null;
  conf: string | null; founded: number | null; ended: number | null;
  championships: number; abaTitles: number; champApps: number | null; cfApps: number | null;
  playoffApps: number | null; allStars: number | null;
  wlt: string; allTimeW: number; winPct: number;
};

type Props = {
  franchises: Franchise[];
  historical: HistoricalFranchise[];
  playoffState: Record<string, PlayoffStateRecord>;
  logoMap: Record<string, string | null>;
  monoMap: Record<string, Mono>;
};

const POSTSEASON_RANK: Record<string, number> = {
  champion: 100, active_finals: 90, active_cf: 80, active_semis: 70, active_qf: 60,
  active_play_in: 55, lost_finals: 50, eliminated_cf: 40, eliminated_semis: 30,
  eliminated_qf: 20, eliminated_play_in: 10,
};
function postseasonRank(canonical: string, state: Record<string, PlayoffStateRecord>): number {
  const st = state[canonical];
  return st ? (POSTSEASON_RANK[st.state] ?? 0) : 0;
}

function activeRow(f: Franchise): Row {
  return {
    key: f.slug, slug: f.slug, canonical: f.canonical, name: f.display_name, defunct: false,
    metroLabel: f.metro, metroSlug: f.metro_slug, conf: f.conf,
    founded: f.founding_year, ended: null, championships: f.championships, abaTitles: f.aba_titles ?? 0,
    champApps: f.championship_appearances, cfApps: f.cf_appearances,
    playoffApps: f.playoff_appearances, allStars: f.all_star_count,
    wlt: `${f.all_time_w}-${f.all_time_l}`, allTimeW: f.all_time_w, winPct: f.win_pct,
  };
}
function defunctRow(h: HistoricalFranchise): Row {
  const lastCity = (h.city_history || "").split("/").pop() || null;
  return {
    key: `def-${h.canonical}`, slug: h.slug, canonical: h.canonical, name: h.display_name, defunct: true,
    metroLabel: h.metro || lastCity, metroSlug: h.metro_slug ?? null, conf: null,
    founded: h.first_year, ended: h.last_year, championships: h.championships, abaTitles: h.aba_titles ?? 0,
    champApps: h.championship_appearances, cfApps: h.cf_appearances,
    playoffApps: h.playoff_appearances, allStars: null,
    wlt: `${h.all_time_w}-${h.all_time_l}`, allTimeW: h.all_time_w, winPct: h.win_pct,
  };
}

function compare(a: Row, b: Row, key: SortKey, state: Record<string, PlayoffStateRecord>): number {
  switch (key) {
    case "name": return a.name.localeCompare(b.name);
    case "metro": return (a.metroLabel || "").localeCompare(b.metroLabel || "");
    case "conf": return (a.conf || "").localeCompare(b.conf || "");
    case "founding_year": return (a.founded ?? 0) - (b.founded ?? 0);
    case "championships": return a.championships - b.championships;
    case "aba_titles": return a.abaTitles - b.abaTitles;
    case "champ_apps": return (a.champApps ?? -1) - (b.champApps ?? -1);
    case "cf_apps": return (a.cfApps ?? -1) - (b.cfApps ?? -1);
    case "win_pct": return a.winPct - b.winPct;
    case "record": return a.allTimeW - b.allTimeW;
    case "playoff_appearances": return (a.playoffApps ?? -1) - (b.playoffApps ?? -1);
    case "all_stars": return (a.allStars ?? -1) - (b.allStars ?? -1);
    case "postseason": return postseasonRank(a.canonical, state) - postseasonRank(b.canonical, state);
  }
}

export default function FranchiseTable({ franchises, historical, playoffState, logoMap, monoMap }: Props) {
  const showPostseason = Object.keys(playoffState).length > 0;
  const [sortKey, setSortKey] = useState<SortKey>("championships");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [view, setView] = useState<View>("current");
  const [announce, setAnnounce] = useState("");

  const sorted = useMemo(() => {
    const base = franchises.map(activeRow);
    const rows = view === "all" ? [...base, ...historical.map(defunctRow)] : base;
    rows.sort((a, b) => {
      const cmp = compare(a, b, sortKey, playoffState);
      const tiebreak = sortKey === "championships" ? (a.winPct - b.winPct) : 0;
      const combined = cmp !== 0 ? cmp : tiebreak;
      return sortDir === "asc" ? combined : -combined;
    });
    return rows;
  }, [franchises, historical, sortKey, sortDir, view, playoffState]);

  function toggle(key: SortKey) {
    if (key === sortKey) { setSortDir(sortDir === "asc" ? "desc" : "asc"); }
    else {
      setSortKey(key);
      const numeric: SortKey[] = ["championships", "aba_titles", "champ_apps", "cf_apps", "win_pct", "record", "playoff_appearances", "founding_year", "all_stars", "postseason"];
      setSortDir(numeric.includes(key) ? "desc" : "asc");
    }
  }

  const dash = <span className="text-[var(--text-dim)]">—</span>;

  return (
    <section className="mt-2">
      <header className="mb-3 flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-lg font-bold tracking-tight">All-time table</h2>
        <ViewToggle view={view} setView={setView} defunctCount={historical.length} />
      </header>

      {/* Mobile sort control: the desktop Th cells (onClick={() => onClick(k)},
          which is `toggle`) live only in the table below, hidden below sm, so
          cards need their own way to drive the same sortKey/sortDir state. */}
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
            <option value="name">Franchise</option>
            <option value="metro">Metro</option>
            <option value="conf">Conf</option>
            <option value="founding_year">Founded</option>
            <option value="championships">Titles</option>
            <option value="aba_titles">Oth Titles</option>
            <option value="champ_apps">Finals</option>
            <option value="cf_apps">CF</option>
            <option value="playoff_appearances">Playoffs</option>
            <option value="all_stars">All-Stars</option>
            <option value="record">All-time</option>
            <option value="win_pct">Win%</option>
            {showPostseason && <option value="postseason">Postseason</option>}
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
          {sortDir === "asc" ? "↑" : "↓"}
        </button>
        <span aria-live="polite" className="sr-only">{announce}</span>
      </div>

      {/* Mobile: one card per franchise instead of a 12-column table forcing
          horizontal scroll at phone widths. Same `sorted` data, driven by the
          same sort/view state, as the desktop table below. */}
      <div className="grid grid-cols-1 gap-2 sm:hidden">
        {sorted.map((r) => {
          const logo = r.slug ? logoMap[r.slug] : null;
          const mono = r.slug ? monoMap[r.slug] : null;
          const ps = playoffState[r.canonical];
          const psStyle = ps ? PLAYOFF_STATE_COLORS[ps.state] : null;
          return (
            <div
              key={r.key}
              className="rounded-lg border p-3"
              style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  {logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logo} alt="" className="w-7 h-7 flex-shrink-0 object-contain" loading="lazy" decoding="async" />
                  ) : (
                    <span
                      className="inline-grid place-items-center rounded-full flex-shrink-0"
                      style={{ background: mono?.bg ?? "#2a2a36", color: mono?.fg ?? "#9d9db0", width: 28, height: 28, fontSize: 10, fontWeight: 700, letterSpacing: "-0.02em" }}
                      aria-hidden
                    >
                      {mono?.mono ?? "—"}
                    </span>
                  )}
                  <div className="min-w-0">
                    {r.slug ? (
                      <Link href={`/teams/nba/${r.slug}`} className="font-semibold text-sm hover:text-[var(--accent)] transition-colors truncate block">
                        {r.name}
                      </Link>
                    ) : (
                      <span className="font-semibold text-sm text-[var(--text-muted)] truncate block">{r.name}</span>
                    )}
                    <div className="text-xs text-[var(--text-muted)] truncate">
                      {r.metroSlug ? (
                        <Link href={`/rankings/${r.metroSlug}`} className="hover:text-[var(--accent)] transition-colors">{r.metroLabel}</Link>
                      ) : (
                        r.metroLabel || dash
                      )}
                      {r.conf ? ` · ${r.conf}` : ""}
                    </div>
                  </div>
                </div>
                {r.defunct && (
                  <span
                    className="flex-shrink-0 text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded"
                    style={{ background: "rgba(120,120,140,0.18)", color: "var(--text-dim)" }}
                  >
                    Defunct
                  </span>
                )}
              </div>
              <div className="mt-2.5 grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs">
                <StatChip label="Founded" value={r.founded ?? "—"} />
                <StatChip label="Titles" value={r.championships || "—"} accent={r.championships > 0} />
                <StatChip label="Oth Titles" value={r.abaTitles || "—"} />
                <StatChip label="Finals" value={r.champApps ?? "—"} />
                <StatChip label="CF" value={r.cfApps ?? "—"} />
                <StatChip label="Playoffs" value={r.playoffApps ?? "—"} />
                <StatChip label="All-Stars" value={r.allStars ?? "—"} />
                <StatChip label="All-time" value={r.wlt} />
                <StatChip label="Win%" value={r.winPct ? r.winPct.toFixed(3).replace(/^0/, "") : "—"} />
              </div>
              {showPostseason && (
                <div className="mt-2.5">
                  {psStyle && ps ? (
                    <a
                      href={`https://en.wikipedia.org/wiki/${ps.year}_NBA_playoffs`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide hover:opacity-80 transition-opacity"
                      style={{ background: psStyle.bg, color: psStyle.text }}
                      title={`${ps.year} NBA playoffs · ${ps.last_round} (Wikipedia)`}
                    >
                      {psStyle.label}
                    </a>
                  ) : (
                    <span className="text-[var(--text-dim)] text-[10px]">No live postseason data</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="hidden sm:block rounded-xl border overflow-x-auto" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <table className="w-full text-xs sm:text-sm tabular-nums">
          <thead>
            <tr className="text-left text-[var(--text-muted)] border-b" style={{ borderColor: "var(--border)" }}>
              <Th label="Franchise" k="name"                cur={sortKey} dir={sortDir} onClick={toggle} className="pl-4" />
              <Th label="Metro"     k="metro"               cur={sortKey} dir={sortDir} onClick={toggle} />
              <Th label="Conf"      k="conf"                cur={sortKey} dir={sortDir} onClick={toggle} />
              <Th label="Founded"   k="founding_year"       cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
              <Th label="Titles"    k="championships"       cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
              <Th label="Oth Titles" k="aba_titles" cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
              <Th label="Finals"    k="champ_apps"          cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
              <Th label="CF"        k="cf_apps"             cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
              <Th label="Playoffs"  k="playoff_appearances" cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
              <Th label="All-Stars" k="all_stars"           cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
              <Th label="All-time"  k="record"              cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
              <Th label="Win%"      k="win_pct"             cur={sortKey} dir={sortDir} onClick={toggle} align="right" className={showPostseason ? "" : "pr-4"} />
              {showPostseason && <Th label="Postseason" k="postseason" cur={sortKey} dir={sortDir} onClick={toggle} align="right" className="pr-4" />}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const logo = r.slug ? logoMap[r.slug] : null;
              const mono = r.slug ? monoMap[r.slug] : null;
              const ps = playoffState[r.canonical];
              const psStyle = ps ? PLAYOFF_STATE_COLORS[ps.state] : null;
              return (
                <tr key={r.key} className="border-b last:border-b-0 hover:bg-[var(--bg-card-hover)] transition-colors" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2.5 pl-4 pr-3">
                    {r.defunct ? (
                      r.slug ? (
                        <span className="flex items-center gap-2">
                          <Link href={`/teams/nba/${r.slug}`} className="font-semibold hover:text-[var(--accent)] transition-colors">{r.name}</Link>
                          <span className="text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded" style={{ background: "rgba(120,120,140,0.18)", color: "var(--text-dim)" }}>Defunct</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <span className="font-semibold text-[var(--text-muted)]">{r.name}</span>
                          <span className="text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded" style={{ background: "rgba(120,120,140,0.18)", color: "var(--text-dim)" }}>Defunct</span>
                        </span>
                      )
                    ) : (
                      <Link href={`/teams/nba/${r.slug}`} className="flex items-center gap-3 hover:text-[var(--accent)] transition-colors">
                        {logo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={logo} alt="" className="w-8 h-8 flex-shrink-0 object-contain" loading="lazy" decoding="async" />
                        ) : (
                          <span className="inline-grid place-items-center rounded-full flex-shrink-0" style={{ background: mono?.bg, color: mono?.fg, width: 28, height: 28, fontSize: 10, fontWeight: 700, letterSpacing: "-0.02em" }} aria-hidden>{mono?.mono}</span>
                        )}
                        <span className="font-semibold">{r.name}</span>
                      </Link>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-[var(--text-muted)]">
                    {r.metroSlug ? (<Link href={`/rankings/${r.metroSlug}`} className="hover:text-[var(--accent)] transition-colors">{r.metroLabel}</Link>) : (r.metroLabel || dash)}
                  </td>
                  <td className="py-2.5 pr-3 text-[var(--text-muted)]">{r.conf || dash}</td>
                  <td className="py-2.5 pr-3 text-right text-[var(--text-muted)]" title={r.defunct && r.founded && r.ended ? `${r.founded}-${r.ended}` : undefined}>{r.founded ?? dash}</td>
                  <td className="py-2.5 pr-3 text-right">
                    {r.championships > 0 ? (
                      <span className="inline-block rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums" style={{ background: "rgba(212,175,55,0.16)", color: "#d4af37" }} title={`${r.championships} championship${r.championships === 1 ? "" : "s"}`}>{r.championships}</span>
                    ) : dash}
                  </td>
                  <td className="py-2.5 pr-3 text-right">
                    {r.abaTitles > 0 ? (
                      <span className="inline-block rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums" style={{ background: "rgba(120,140,170,0.18)", color: "#aab4c4" }} title={`${r.abaTitles} ABA championship${r.abaTitles === 1 ? "" : "s"}`}>{r.abaTitles}</span>
                    ) : dash}
                  </td>
                  <td className="py-2.5 pr-3 text-right text-[var(--text-muted)]">{r.champApps ?? dash}</td>
                  <td className="py-2.5 pr-3 text-right text-[var(--text-muted)]">{r.cfApps ?? dash}</td>
                  <td className="py-2.5 pr-3 text-right text-[var(--text-muted)]">{r.playoffApps ?? dash}</td>
                  <td className="py-2.5 pr-3 text-right text-[var(--text-muted)]">{r.allStars ?? dash}</td>
                  <td className="py-2.5 pr-3 text-right text-[var(--text-muted)]">{r.wlt}</td>
                  <td className="py-2.5 pr-3 text-right text-[var(--text-muted)]">{r.winPct ? r.winPct.toFixed(3).replace(/^0/, "") : dash}</td>
                  {showPostseason && (
                    <td className="py-2.5 pr-4 text-right">
                      {psStyle && ps ? (
                        <a href={`https://en.wikipedia.org/wiki/${ps.year}_NBA_playoffs`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-block rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap hover:opacity-80 transition-opacity" style={{ background: psStyle.bg, color: psStyle.text }} title={`${ps.year} NBA playoffs · ${ps.last_round} (Wikipedia)`}>{psStyle.label}</a>
                      ) : (<span className="text-[var(--text-dim)] text-[10px]">—</span>)}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ViewToggle({ view, setView, defunctCount }: { view: View; setView: (v: View) => void; defunctCount: number }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {(["current", "all"] as View[]).map((v) => (
        <button key={v} type="button" onClick={() => setView(v)} className="px-3 py-1 rounded-full border transition-colors"
          style={view === v ? { background: "var(--accent-dim)", color: "var(--text)", borderColor: "var(--accent-dim)" } : { background: "var(--bg-card)", color: "var(--text-muted)", borderColor: "var(--border)" }}>
          {v === "current" ? "Current" : `All (incl. ${defunctCount} defunct)`}
        </button>
      ))}
    </div>
  );
}

function Th({ label, k, cur, dir, onClick, align = "left", className = "" }: {
  label: string; k: SortKey; cur: SortKey; dir: SortDir; onClick: (k: SortKey) => void; align?: "left" | "right"; className?: string;
}) {
  const active = cur === k;
  const arrow = active ? (dir === "asc" ? "↑" : "↓") : "";
  return (
    <th className={`py-3 pr-3 font-medium uppercase tracking-wider text-[10px] cursor-pointer select-none hover:text-[var(--text)] ${align === "right" ? "text-right" : ""} ${className}`} onClick={() => onClick(k)}>
      {label}{arrow && <span className="ml-1 text-[var(--accent)]">{arrow}</span>}
    </th>
  );
}

// Compact labeled stat chip for mobile cards: small uppercase label above a
// value, matching the mini-grid pattern used elsewhere (e.g. ChampionsTable).
function StatChip({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">{label}</div>
      <div className={accent ? "font-bold" : "text-[var(--text-muted)]"} style={accent ? { color: "#d4af37" } : undefined}>
        {value}
      </div>
    </div>
  );
}
