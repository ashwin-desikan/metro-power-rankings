"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Franchise, HistoricalFranchise } from "@/lib/mlb";

// All-time franchise table for /teams/mlb. Current franchises plus (when the
// filter is "All") defunct franchises from historical.json, tagged Defunct.
// Defunct rows show last city in Metro and dashes where data isn't tracked.

type SortKey =
  | "name" | "metro" | "division" | "founding_year"
  | "championships" | "pennants" | "win_pct" | "record" | "playoff_appearances";
type SortDir = "asc" | "desc";
type View = "current" | "all";
type Mono = { bg: string; fg: string; mono: string };

type Row = {
  key: string; slug: string | null; name: string; defunct: boolean;
  metroLabel: string | null; metroSlug: string | null;
  division: string | null; founded: number | null; ended: number | null;
  championships: number; wsTitle: string;
  pennants: number | null; playoffApps: number | null;
  wlt: string; allTimeW: number; winPct: number;
};

// Defunct rows arrive with a server-computed slug (lib/mlb is server-only,
// so the runtime defunctSlug can't be imported into this client component).
type HistoricalWithSlug = HistoricalFranchise & { slug: string };

type Props = {
  franchises: Franchise[];
  historical: HistoricalWithSlug[];
  logoMap: Record<string, string | null>;
  monoMap: Record<string, Mono>;
};

const TITLE_GOLD = "#d4af37";

function activeRow(f: Franchise): Row {
  return {
    key: f.slug, slug: f.slug, name: f.display_name, defunct: false,
    metroLabel: f.metro, metroSlug: f.metro_slug, division: f.division,
    founded: f.founding_year, ended: null, championships: f.championships,
    wsTitle: f.pre_ws_championships > 0 ? `${f.championships} World Series · ${f.pre_ws_championships} pre-1903 cup` : `${f.championships} World Series`,
    pennants: f.ws_appearances, playoffApps: f.playoff_appearances,
    wlt: `${f.all_time_w}-${f.all_time_l}`, allTimeW: f.all_time_w, winPct: f.win_pct,
  };
}

function defunctRow(h: HistoricalWithSlug): Row {
  return {
    key: `def-${h.canonical}`, slug: h.slug, name: h.display_name ?? h.name, defunct: true,
    metroLabel: h.metro || h.city, metroSlug: h.metro_slug ?? null, division: null,
    founded: h.first_year, ended: h.last_year, championships: h.championships,
    wsTitle: `${h.championships} World Series`,
    pennants: null, playoffApps: null,
    wlt: `${h.w}-${h.l}`, allTimeW: h.w, winPct: h.win_pct,
  };
}

function compare(a: Row, b: Row, key: SortKey): number {
  switch (key) {
    case "name": return a.name.localeCompare(b.name);
    case "metro": return (a.metroLabel || "").localeCompare(b.metroLabel || "");
    case "division": return (a.division || "").localeCompare(b.division || "");
    case "founding_year": return (a.founded ?? 0) - (b.founded ?? 0);
    case "championships": return a.championships - b.championships;
    case "pennants": return (a.pennants ?? -1) - (b.pennants ?? -1);
    case "win_pct": return a.winPct - b.winPct;
    case "record": return a.allTimeW - b.allTimeW;
    case "playoff_appearances": return (a.playoffApps ?? -1) - (b.playoffApps ?? -1);
  }
}

export default function FranchiseTable({ franchises, historical, logoMap, monoMap }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("championships");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [view, setView] = useState<View>("current");

  const sorted = useMemo(() => {
    const base = franchises.map(activeRow);
    const rows = view === "all" ? [...base, ...historical.map(defunctRow)] : base;
    rows.sort((a, b) => {
      const cmp = compare(a, b, sortKey);
      const tiebreak = sortKey === "championships" ? (a.winPct - b.winPct) : 0;
      const combined = cmp !== 0 ? cmp : tiebreak;
      return sortDir === "asc" ? combined : -combined;
    });
    return rows;
  }, [franchises, historical, sortKey, sortDir, view]);

  function toggle(key: SortKey) {
    if (key === sortKey) { setSortDir(sortDir === "asc" ? "desc" : "asc"); }
    else {
      setSortKey(key);
      const numeric: SortKey[] = ["championships", "pennants", "win_pct", "record", "playoff_appearances", "founding_year"];
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
      <div className="rounded-xl border overflow-x-auto" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <table className="w-full text-xs sm:text-sm tabular-nums">
          <thead>
            <tr className="text-left text-[var(--text-muted)] border-b" style={{ borderColor: "var(--border)" }}>
              <Th label="Franchise" k="name"                cur={sortKey} dir={sortDir} onClick={toggle} className="pl-4" />
              <Th label="Metro"     k="metro"               cur={sortKey} dir={sortDir} onClick={toggle} />
              <Th label="Division"  k="division"            cur={sortKey} dir={sortDir} onClick={toggle} />
              <Th label="Founded"   k="founding_year"       cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
              <Th label="WS"        k="championships"       cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
              <Th label="Pennants"  k="pennants"            cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
              <Th label="Playoffs"  k="playoff_appearances" cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
              <Th label="All-time"  k="record"              cur={sortKey} dir={sortDir} onClick={toggle} align="right" />
              <Th label="Win%"      k="win_pct"             cur={sortKey} dir={sortDir} onClick={toggle} align="right" className="pr-4" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const logo = r.slug ? logoMap[r.slug] : null;
              const mono = r.slug ? monoMap[r.slug] : null;
              return (
                <tr key={r.key} className="border-b last:border-b-0 hover:bg-[var(--bg-card-hover)] transition-colors" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2.5 pl-4 pr-3">
                    {r.defunct ? (
                      <span className="flex items-center gap-2">
                        {r.slug ? (
                          <Link href={`/teams/mlb/${r.slug}`} className="font-semibold hover:text-[var(--accent)] transition-colors">{r.name}</Link>
                        ) : (
                          <span className="font-semibold text-[var(--text-muted)]">{r.name}</span>
                        )}
                        <span className="text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded" style={{ background: "rgba(120,120,140,0.18)", color: "var(--text-dim)" }}>Defunct</span>
                      </span>
                    ) : (
                      <Link href={`/teams/mlb/${r.slug}`} className="flex items-center gap-3 hover:text-[var(--accent)] transition-colors">
                        {logo ? (
                          <img src={logo} alt="" className="w-8 h-8 flex-shrink-0 object-contain" />
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
                  <td className="py-2.5 pr-3 text-[var(--text-muted)]">{r.division || dash}</td>
                  <td className="py-2.5 pr-3 text-right text-[var(--text-muted)]" title={r.defunct && r.founded && r.ended ? `${r.founded}-${r.ended}` : undefined}>{r.founded ?? dash}</td>
                  <td className="py-2.5 pr-3 text-right">
                    <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded" style={{ background: r.championships > 0 ? "rgba(212,175,55,0.16)" : "rgba(85,85,106,0.16)", color: r.championships > 0 ? TITLE_GOLD : "var(--text-dim)" }} title={r.wsTitle}>{r.championships}</span>
                  </td>
                  <td className="py-2.5 pr-3 text-right text-[var(--text-muted)]">{r.pennants ?? dash}</td>
                  <td className="py-2.5 pr-3 text-right text-[var(--text-muted)]">{r.playoffApps ?? dash}</td>
                  <td className="py-2.5 pr-3 text-right text-[var(--text-muted)]">{r.wlt}</td>
                  <td className="py-2.5 pr-4 text-right">{r.winPct.toFixed(3)}</td>
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

function Th({ label, k, cur, dir, onClick, align, className }: {
  label: string; k: SortKey; cur: SortKey; dir: SortDir; onClick: (k: SortKey) => void; align?: "right"; className?: string;
}) {
  const isActive = cur === k;
  return (
    <th className={`font-medium py-2 pr-3 uppercase tracking-wider text-[10px] cursor-pointer select-none hover:text-[var(--text)] ${align === "right" ? "text-right" : "text-left"} ${className ?? ""}`}
      onClick={() => onClick(k)} style={{ color: isActive ? "var(--text)" : undefined }}>
      <span className="inline-flex items-center gap-1">{label}{isActive && (<span aria-hidden style={{ color: "var(--accent)" }}>{dir === "asc" ? "▲" : "▼"}</span>)}</span>
    </th>
  );
}
