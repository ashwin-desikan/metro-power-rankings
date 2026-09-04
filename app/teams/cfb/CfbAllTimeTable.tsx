"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import TeamCrest from "@/app/teams/_shared/TeamCrest";
import type { CfbTeam } from "@/lib/cfbShared";
import { DataBar } from "@/app/_shared/DataBar";

type Col = { key: string; label: string; get: (t: CfbTeam) => number | string; num: boolean; hide?: string };
const COLS: Col[] = [
  { key: "name", label: "Program", get: (t) => t.name.toLowerCase(), num: false },
  { key: "conf", label: "Conference", get: (t) => (t.conference ?? "").toLowerCase(), num: false },
  { key: "games", label: "Gm", get: (t) => t.games, num: true, hide: "hidden md:table-cell" },
  { key: "w", label: "W", get: (t) => t.w, num: true },
  { key: "l", label: "L", get: (t) => t.l, num: true },
  { key: "tie", label: "T", get: (t) => t.tie, num: true, hide: "hidden sm:table-cell" },
  { key: "pct", label: "Pct", get: (t) => t.pct, num: true },
  { key: "maj_seasons", label: "Maj Seas", get: (t) => t.maj_seasons, num: true, hide: "hidden lg:table-cell" },
  { key: "conf_champ_app", label: "Conf App", get: (t) => t.conf_champ_app, num: true, hide: "hidden lg:table-cell" },
  { key: "maj_conf_champ", label: "Conf Title", get: (t) => t.maj_conf_champ, num: true, hide: "hidden xl:table-cell" },
  { key: "bowl_app", label: "Bowls", get: (t) => t.bowl_app, num: true, hide: "hidden sm:table-cell" },
  { key: "maj_bowl", label: "Maj Bowl", get: (t) => t.maj_bowl, num: true, hide: "hidden lg:table-cell" },
  { key: "playoff_app", label: "Playoff", get: (t) => t.playoff_app, num: true, hide: "hidden sm:table-cell" },
  { key: "nat_champ_count", label: "Natl", get: (t) => t.nat_champ_years.length, num: true },
];

export default function CfbAllTimeTable({ teams }: { teams: CfbTeam[] }) {
  const [scope, setScope] = useState<"fbs" | "all">("fbs");
  const [conf, setConf] = useState("All");
  const [sort, setSort] = useState("nat_champ_count");
  const [asc, setAsc] = useState(false);

  const scoped = useMemo(() => (scope === "fbs" ? teams.filter((t) => t.current_fbs) : teams), [teams, scope]);
  const conferences = useMemo(() => ["All", ...Array.from(new Set(scoped.map((t) => t.conference).filter(Boolean) as string[])).sort()], [scoped]);
  const rows = useMemo(() => {
    const f = conf === "All" ? scoped : scoped.filter((t) => t.conference === conf);
    const col = COLS.find((c) => c.key === sort)!;
    return [...f].sort((a, b) => {
      const va = col.get(a), vb = col.get(b);
      const c = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return asc ? c : -c;
    });
  }, [scoped, conf, sort, asc]);

  // Natl (national championships) is this board's default-sort argument;
  // max is the column's own maximum over the current filtered/sorted rows,
  // computed once, never per row.
  const natlMax = useMemo(() => Math.max(...rows.map((t) => t.nat_champ_years.length), 1), [rows]);

  const fmt = (t: CfbTeam, key: string): string => {
    if (key === "conf") return t.conference ?? "";
    if (key === "pct") return t.pct.toFixed(3);
    const c = COLS.find((x) => x.key === key)!;
    const v = c.get(t);
    return typeof v === "number" ? (v ? String(v) : "") : "";
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="inline-flex rounded-md border overflow-hidden text-xs" style={{ borderColor: "var(--border)" }}>
          {(["fbs", "all"] as const).map((s) => (
            <button key={s} onClick={() => { setScope(s); setConf("All"); }} className="px-3 py-2"
              style={s === scope ? { background: "var(--accent)", color: "var(--bg)" } : { color: "var(--text-muted)" }}>
              {s === "fbs" ? "Current FBS" : "All major programs"}
            </button>
          ))}
        </div>
        <select value={conf} onChange={(e) => setConf(e.target.value)} className="text-xs rounded-md border bg-transparent px-2 py-2 focus:outline-none focus:border-[var(--accent)]" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
          {conferences.map((c) => <option key={c} value={c} style={{ background: "var(--bg-card)" }}>{c}</option>)}
        </select>
        <span className="text-xs text-[var(--text-muted)] tabular-nums">{rows.length} programs</span>
      </div>

      {/* Mobile: one card per program. Same sorted/filtered `rows` array that
          drives the desktop table below - only the presentation differs, so
          the scope/conference/sort state stays a single source of truth. */}
      <div className="grid grid-cols-1 gap-2 md:hidden max-h-[70vh] overflow-auto rounded-lg border p-2" style={{ borderColor: "var(--border)" }}>
        {rows.map((t) => (
          <div key={t.slug} className="rounded-lg border p-3" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2 mb-1 min-w-0">
              <TeamCrest name={t.name} size={22} fallback={<span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: t.color }} aria-hidden />} />
              <Link href={`/teams/cfb/${t.slug}`} className="font-medium text-sm truncate hover:text-[var(--accent)]">{t.name}</Link>
              {!t.current_fbs && <span className="flex-shrink-0 text-[9px] uppercase text-[var(--text-dim)]">{t.fbs_fcs || "former"}</span>}
            </div>
            <div className="text-xs text-[var(--text-muted)] mb-2 truncate">{t.conference || "—"}</div>
            <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs tabular-nums">
              <StatCell label="Record" value={`${t.w}-${t.l}${t.tie ? `-${t.tie}` : ""}`} />
              <StatCell label="Pct" value={t.pct.toFixed(3)} />
              <StatCell label="Games" value={t.games} />
              <StatCell label="Maj Seas" value={t.maj_seasons} />
              <StatCell label="Conf App" value={t.conf_champ_app} />
              <StatCell label="Conf Title" value={t.maj_conf_champ} />
              <StatCell label="Bowls" value={t.bowl_app} />
              <StatCell label="Maj Bowl" value={t.maj_bowl} />
              <StatCell label="Playoff" value={t.playoff_app} />
              <StatCell
                label="Natl"
                value={t.nat_champ_years.length}
                valueStyle={{ color: t.nat_champ_years.length ? "var(--accent)" : "var(--text-dim)" }}
                bold
              />
            </div>
          </div>
        ))}
      </div>

      <div className="hidden md:block max-h-[70vh] overflow-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-xs sm:text-sm tabular-nums whitespace-nowrap [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-[var(--bg-card)]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--text-dim)] border-b" style={{ borderColor: "var(--border)" }}>
              {COLS.map((c) => (
                <th key={c.key}
                  className={`px-2 py-2.5 cursor-pointer select-none hover:text-[var(--accent)] ${c.key === "name" || c.key === "conf" ? "text-left" : "text-right"} ${c.hide ?? ""}`}
                  onClick={() => { if (sort === c.key) setAsc(!asc); else { setSort(c.key); setAsc(false); } }}>
                  {c.label}{sort === c.key ? (asc ? " ↑" : " ↓") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.slug} className="border-b last:border-0 hover:bg-[var(--bg-card-hover)]" style={{ borderColor: "var(--border)" }}>
                <td className="px-2 py-1.5">
                  <TeamCrest name={t.name} size={18} fallback={<span className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle" style={{ background: t.color }} aria-hidden />} />
                  <Link href={`/teams/cfb/${t.slug}`} className="font-medium hover:text-[var(--accent)] align-middle">{t.name}</Link>
                  {!t.current_fbs && <span className="ml-1.5 text-[9px] uppercase text-[var(--text-dim)]">{t.fbs_fcs || "former"}</span>}
                </td>
                {COLS.slice(1).map((c) => (
                  <td key={c.key} className={`px-2 py-1.5 ${c.key === "conf" ? "text-left" : "text-right"} ${c.hide ?? ""} ${c.key === "nat_champ_count" ? "font-semibold" : "text-[var(--text-muted)]"}`}>
                    {c.key === "nat_champ_count" ? (
                      <DataBar v={t.nat_champ_years.length} max={natlMax} dp={0} color="var(--seq-4)" width={72} label="national championships" />
                    ) : fmt(t, c.key)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Labeled stat block for the mobile card grid, shared shape for every
// numeric/derived column so the card mini-grid stays visually consistent.
function StatCell({
  label, value, valueStyle, bold,
}: {
  label: string;
  value: string | number;
  valueStyle?: CSSProperties;
  bold?: boolean;
}) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wide text-[var(--text-dim)]">{label}</div>
      <div className={bold ? "font-semibold" : "text-[var(--text-muted)]"} style={valueStyle}>
        {value === "" ? "—" : value}
      </div>
    </div>
  );
}
