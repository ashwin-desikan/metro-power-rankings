"use client";

// All-time franchise table for /teams/nhl. Current franchises plus (when the
// filter is "All") defunct franchises from historical.json, tagged Defunct.
// Defunct rows show last city in Metro, a computed points %, and dashes where
// data isn't tracked.

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Franchise, HistoricalFranchise } from "@/lib/nhl";

type Mono = { bg: string; fg: string; mono: string };

type SortKey =
  | "name" | "metro" | "main_div" | "founded" | "championships"
  | "champ_apps" | "presidents" | "playoff_apps" | "pts_pct" | "last_cup";
type SortDir = "asc" | "desc";
type View = "current" | "all";

type Row = {
  key: string; slug: string | null; name: string; defunct: boolean; isO6: boolean;
  metroLabel: string | null; metroSlug: string | null;
  division: string | null; founded: number | null; ended: number | null;
  championships: number; champApps: number; presidents: number | null;
  playoffApps: number | null; ptsPct: number | null; lastCup: number | null;
};

type Props = {
  franchises: Franchise[];
  historical: HistoricalFranchise[];
  logoMap: Record<string, string | null>;
  monoMap: Record<string, Mono | null>;
  originalSix: Set<string>;
};

function activeRow(f: Franchise, originalSix: Set<string>): Row {
  return {
    key: f.slug, slug: f.slug, name: f.display_name, defunct: false, isO6: originalSix.has(f.name),
    metroLabel: f.metro, metroSlug: f.metro_slug, division: f.current_main_div,
    founded: f.founded, ended: null, championships: f.championships,
    champApps: f.champ_appearances, presidents: f.best_record_seasons,
    playoffApps: f.playoff_appearances, ptsPct: f.pts_pct, lastCup: f.last_championship,
  };
}
function defunctRow(h: HistoricalFranchise): Row {
  const games = h.all_time_w + h.all_time_l + h.all_time_t + h.all_time_otl;
  return {
    key: `def-${h.slug}`, slug: h.slug, name: h.display_name ?? h.name, defunct: true, isO6: false,
    metroLabel: h.metro || h.last_city, metroSlug: h.metro_slug ?? null, division: null,
    founded: h.founded, ended: h.ended, championships: h.championships,
    champApps: h.champ_appearances, presidents: null, playoffApps: null,
    ptsPct: games > 0 ? h.all_time_pts / (2 * games) : null, lastCup: h.last_championship,
  };
}

function compare(a: Row, b: Row, key: SortKey): number {
  switch (key) {
    case "name": return a.name.localeCompare(b.name);
    case "metro": return (a.metroLabel || "").localeCompare(b.metroLabel || "");
    case "main_div": return (a.division || "").localeCompare(b.division || "");
    case "founded": return (a.founded ?? 0) - (b.founded ?? 0);
    case "championships": return a.championships - b.championships;
    case "champ_apps": return a.champApps - b.champApps;
    case "presidents": return (a.presidents ?? -1) - (b.presidents ?? -1);
    case "playoff_apps": return (a.playoffApps ?? -1) - (b.playoffApps ?? -1);
    case "pts_pct": return (a.ptsPct ?? -1) - (b.ptsPct ?? -1);
    case "last_cup": return (a.lastCup ?? 0) - (b.lastCup ?? 0);
  }
}

export default function FranchiseTable({ franchises, historical, logoMap, monoMap, originalSix }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("championships");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [view, setView] = useState<View>("current");
  const [announce, setAnnounce] = useState("");

  const sorted = useMemo(() => {
    const base = franchises.map((f) => activeRow(f, originalSix));
    const rows = view === "all" ? [...base, ...historical.map(defunctRow)] : base;
    rows.sort((a, b) => {
      const cmp = compare(a, b, sortKey);
      const tiebreak = sortKey === "championships" ? ((a.ptsPct ?? 0) - (b.ptsPct ?? 0)) : 0;
      const combined = cmp !== 0 ? cmp : tiebreak;
      return sortDir === "asc" ? combined : -combined;
    });
    return rows;
  }, [franchises, historical, sortKey, sortDir, view, originalSix]);

  function toggle(key: SortKey) {
    if (key === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      const numeric: SortKey[] = ["championships", "champ_apps", "presidents", "playoff_apps", "pts_pct", "founded", "last_cup"];
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
            <option value="name">Franchise</option>
            <option value="metro">Metro</option>
            <option value="main_div">Division</option>
            <option value="founded">Founded</option>
            <option value="championships">Cups</option>
            <option value="champ_apps">Finals</option>
            <option value="presidents">Pres.</option>
            <option value="playoff_apps">Playoff app</option>
            <option value="pts_pct">Pts %</option>
            <option value="last_cup">Last Cup</option>
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

      {/* Mobile: one stacked card per franchise instead of a 10-column table. */}
      <div className="grid grid-cols-1 gap-2 sm:hidden">
        {sorted.map((r) => {
          const logo = r.slug ? logoMap[r.slug] : null;
          const mono = r.slug ? monoMap[r.slug] : null;
          return (
            <Link
              key={`${r.key}-card`}
              href={`/teams/nhl/${r.slug}`}
              className="block rounded-lg border p-3 hover:border-[var(--accent)] transition-colors"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
            >
              <div className="flex items-center gap-2 min-w-0">
                {r.defunct ? null : logo ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={logo} alt="" className="w-6 h-6 flex-shrink-0 object-contain" loading="lazy" decoding="async" />
                ) : mono ? (
                  <span className="inline-grid place-items-center rounded-full flex-shrink-0" style={{ background: mono.bg, color: mono.fg, width: 24, height: 24, fontSize: 9, fontWeight: 700 }} aria-hidden>{mono.mono}</span>
                ) : null}
                <span className="font-medium text-sm truncate">{r.name}</span>
                {r.defunct && (
                  <span className="flex-shrink-0 text-[8px] uppercase tracking-widest font-semibold px-1.5 py-0.5 rounded" style={{ background: "rgba(120,120,140,0.18)", color: "var(--text-dim)" }}>Defunct</span>
                )}
                {r.isO6 && (
                  <span title="Original Six (1942-1967)" className="flex-shrink-0 text-[8px] uppercase tracking-widest font-semibold px-1.5 py-0.5 rounded" style={{ background: "#3a2e1a", color: "#d4af37" }}>O6</span>
                )}
              </div>
              <div className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                {r.metroLabel || "—"}{r.division ? ` · ${r.division}` : ""}
              </div>
              <div className="mt-2.5 grid grid-cols-3 gap-x-3 gap-y-2 text-xs">
                <div>
                  <div className="text-[9px] uppercase tracking-wide text-[var(--text-dim)]">Founded</div>
                  <div className="tabular-nums font-medium">{r.founded ?? dash}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wide text-[var(--text-dim)]">Cups</div>
                  <div className="tabular-nums font-medium">
                    {r.championships > 0 ? (
                      <span className="inline-flex items-center justify-center font-semibold px-1.5 rounded" style={{ background: "#3a2e1a", color: "#d4af37" }}>{r.championships}</span>
                    ) : (
                      <span className="text-[var(--text-dim)]">0</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wide text-[var(--text-dim)]">Finals</div>
                  <div className="tabular-nums font-medium">{r.champApps}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wide text-[var(--text-dim)]">Pres.</div>
                  <div className="tabular-nums font-medium text-[var(--text-muted)]">{r.presidents ?? dash}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wide text-[var(--text-dim)]">Playoff app</div>
                  <div className="tabular-nums font-medium text-[var(--text-muted)]">{r.playoffApps ?? dash}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wide text-[var(--text-dim)]">Pts %</div>
                  <div className="tabular-nums font-medium text-[var(--text-muted)]">{r.ptsPct != null ? r.ptsPct.toFixed(3).replace(/^0/, "") : dash}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wide text-[var(--text-dim)]">Last Cup</div>
                  <div className="tabular-nums font-medium text-[var(--text-muted)]">{r.lastCup ?? dash}</div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="rounded-xl border overflow-x-auto hidden sm:block" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <table className="w-full text-xs sm:text-sm tabular-nums">
          <thead>
            <tr className="text-left text-[var(--text-muted)] border-b" style={{ borderColor: "var(--border)" }}>
              <Th label="Franchise"   k="name"          cur={sortKey} dir={sortDir} onClick={toggle} className="pl-4" />
              <Th label="Metro"       k="metro"         cur={sortKey} dir={sortDir} onClick={toggle} />
              <Th label="Division"    k="main_div"      cur={sortKey} dir={sortDir} onClick={toggle} />
              <Th label="Founded"     k="founded"       cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
              <Th label="Cups"        k="championships" cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
              <Th label="Finals"      k="champ_apps"    cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
              <Th label="Pres."       k="presidents"    cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
              <Th label="Playoff app" k="playoff_apps"  cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
              <Th label="Pts %"       k="pts_pct"       cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
              <Th label="Last Cup"    k="last_cup"      cur={sortKey} dir={sortDir} onClick={toggle} align="right" className="pr-4" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const logo = r.slug ? logoMap[r.slug] : null;
              const mono = r.slug ? monoMap[r.slug] : null;
              return (
                <tr key={r.key} className="border-b last:border-b-0 hover:bg-[var(--bg-card-hover)]" style={{ borderColor: "var(--border)" }}>
                  <td className="pl-4 py-2">
                    {r.defunct ? (
                      <Link href={`/teams/nhl/${r.slug}`} className="flex items-center gap-2 hover:text-[var(--accent)] transition-colors">
                        <span className="font-medium">{r.name}</span>
                        <span className="text-[8px] uppercase tracking-widest font-semibold px-1.5 py-0.5 rounded" style={{ background: "rgba(120,120,140,0.18)", color: "var(--text-dim)" }}>Defunct</span>
                      </Link>
                    ) : (
                      <Link href={`/teams/nhl/${r.slug}`} className="flex items-center gap-2 hover:text-[var(--accent)] transition-colors">
                        {logo ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={logo} alt="" className="w-5 h-5 flex-shrink-0 object-contain" loading="lazy" decoding="async" />
                        ) : mono ? (
                          <span className="inline-grid place-items-center rounded-full flex-shrink-0" style={{ background: mono.bg, color: mono.fg, width: 20, height: 20, fontSize: 8, fontWeight: 700 }} aria-hidden>{mono.mono}</span>
                        ) : null}
                        <span className="font-medium">{r.name}</span>
                        {r.isO6 && (<span title="Original Six (1942-1967)" className="text-[8px] uppercase tracking-widest font-semibold px-1.5 py-0.5 rounded" style={{ background: "#3a2e1a", color: "#d4af37" }}>O6</span>)}
                      </Link>
                    )}
                  </td>
                  <td className="py-2 pr-2 text-[var(--text-muted)]">
                    {r.metroSlug ? (<Link href={`/rankings/${r.metroSlug}`} className="hover:text-[var(--accent)] transition-colors">{r.metroLabel}</Link>) : (r.metroLabel || dash)}
                  </td>
                  <td className="py-2 text-[var(--text-muted)]">{r.division || dash}</td>
                  <td className="py-2 text-right" title={r.defunct && r.founded && r.ended ? `${r.founded}-${r.ended}` : undefined}>{r.founded ?? dash}</td>
                  <td className="py-2 text-right">
                    {r.championships > 0 ? (<span className="inline-flex items-center justify-center font-semibold px-1.5 rounded" style={{ background: "#3a2e1a", color: "#d4af37" }}>{r.championships}</span>) : (<span className="text-[var(--text-dim)]">0</span>)}
                  </td>
                  <td className="py-2 text-right">{r.champApps}</td>
                  <td className="py-2 text-right">{r.presidents ?? dash}</td>
                  <td className="py-2 text-right">{r.playoffApps ?? dash}</td>
                  <td className="py-2 text-right text-[var(--text-muted)]">{r.ptsPct != null ? r.ptsPct.toFixed(3).replace(/^0/, "") : dash}</td>
                  <td className="py-2 pr-4 text-right text-[var(--text-muted)]">{r.lastCup ?? dash}</td>
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
  const active = k === cur;
  const arrow = active ? (dir === "asc" ? " ▲" : " ▼") : "";
  return (
    <th className={`py-3 px-2 font-medium text-[10px] uppercase tracking-wider whitespace-nowrap select-none cursor-pointer ${align === "right" ? "text-right" : "text-left"} ${className}`} onClick={() => onClick(k)}>
      <span className={active ? "text-[var(--text)]" : ""}>{label}</span><span className="text-[var(--text-dim)]">{arrow}</span>
    </th>
  );
}
