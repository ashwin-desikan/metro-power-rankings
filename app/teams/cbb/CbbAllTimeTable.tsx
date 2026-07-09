"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import TeamCrest from "@/app/teams/_shared/TeamCrest";
import type { CbbTeam } from "@/lib/cbbShared";

type Col = { key: string; label: string; get: (t: CbbTeam) => number | string; num: boolean; hide?: string };
const COLS: Col[] = [
  { key: "name", label: "Program", get: (t) => t.name.toLowerCase(), num: false },
  { key: "conf", label: "Conference", get: (t) => (t.conference ?? "").toLowerCase(), num: false },
  { key: "w", label: "W", get: (t) => t.w, num: true },
  { key: "l", label: "L", get: (t) => t.l, num: true, hide: "hidden sm:table-cell" },
  { key: "pct", label: "Pct", get: (t) => t.pct, num: true },
  { key: "tour_app", label: "Apps", get: (t) => t.tour_app, num: true, hide: "hidden md:table-cell" },
  { key: "sweet16", label: "S16", get: (t) => t.sweet16, num: true, hide: "hidden xl:table-cell" },
  { key: "elite8", label: "E8", get: (t) => t.elite8, num: true, hide: "hidden lg:table-cell" },
  { key: "final4", label: "F4", get: (t) => t.final4, num: true, hide: "hidden sm:table-cell" },
  { key: "seed1", label: "#1 Seeds", get: (t) => t.seed1, num: true, hide: "hidden xl:table-cell" },
  { key: "weeks_at_1", label: "Wks #1", get: (t) => t.weeks_at_1, num: true, hide: "hidden lg:table-cell" },
  { key: "titles", label: "Titles", get: (t) => t.titles, num: true },
];

export default function CbbAllTimeTable({ teams }: { teams: CbbTeam[] }) {
  const [scope, setScope] = useState<"d1" | "all">("d1");
  const [conf, setConf] = useState("All");
  const [sort, setSort] = useState("titles");
  const [asc, setAsc] = useState(false);

  const scoped = useMemo(() => (scope === "d1" ? teams.filter((t) => t.current_d1) : teams), [teams, scope]);
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

  const fmt = (t: CbbTeam, key: string): string => {
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
          {(["d1", "all"] as const).map((s) => (
            <button key={s} onClick={() => { setScope(s); setConf("All"); }} className="px-3 py-1"
              style={s === scope ? { background: "var(--accent)", color: "var(--bg)" } : { color: "var(--text-muted)" }}>
              {s === "d1" ? "Current D-I" : "All programs"}
            </button>
          ))}
        </div>
        <select value={conf} onChange={(e) => setConf(e.target.value)} className="text-xs rounded-md border bg-transparent px-2 py-1 focus:outline-none focus:border-[var(--accent)]" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
          {conferences.map((c) => <option key={c} value={c} style={{ background: "var(--bg-card)" }}>{c}</option>)}
        </select>
        <span className="text-xs text-[var(--text-muted)] tabular-nums">{rows.length} programs</span>
      </div>
      {/* Mobile: one card per program instead of a 12-column table. Same
          `rows` data (already sorted/filtered above) drives both views. */}
      <div className="grid grid-cols-1 gap-2 sm:hidden">
        {rows.map((t) => (
          <div key={`${t.slug}-card`} className="rounded-lg border p-3" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <TeamCrest name={t.name} size={18} fallback={<span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: t.color }} aria-hidden />} />
                <Link href={`/teams/cbb/${t.slug}`} className="font-medium text-sm hover:text-[var(--accent)] truncate">{t.name}</Link>
                {!t.current_d1 && <span className="flex-shrink-0 text-[9px] uppercase text-[var(--text-dim)]">former</span>}
              </div>
            </div>
            {t.conference && <div className="text-[11px] text-[var(--text-dim)] mb-2">{t.conference}</div>}
            <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">W-L</div>
                <div className="tabular-nums text-[var(--text-muted)]">{t.w}-{t.l}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Pct</div>
                <div className="tabular-nums text-[var(--text-muted)]">{t.pct.toFixed(3)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Titles</div>
                <div className="tabular-nums font-semibold" style={{ color: t.titles ? "var(--accent)" : "var(--text-dim)" }}>{t.titles || 0}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Tourney apps</div>
                <div className="tabular-nums text-[var(--text-muted)]">{t.tour_app || 0}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Final Fours</div>
                <div className="tabular-nums text-[var(--text-muted)]">{t.final4 || 0}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Elite 8</div>
                <div className="tabular-nums text-[var(--text-muted)]">{t.elite8 || 0}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Sweet 16</div>
                <div className="tabular-nums text-[var(--text-muted)]">{t.sweet16 || 0}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">#1 seeds</div>
                <div className="tabular-nums text-[var(--text-muted)]">{t.seed1 || 0}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Wks #1</div>
                <div className="tabular-nums text-[var(--text-muted)]">{t.weeks_at_1 || 0}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="max-h-[70vh] overflow-auto rounded-lg border hidden sm:block" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-xs sm:text-sm tabular-nums whitespace-nowrap [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-[var(--bg-card)]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--text-dim)] border-b" style={{ borderColor: "var(--border)" }}>
              {COLS.map((c) => (
                <th key={c.key}
                  className={`px-2 py-3 cursor-pointer select-none hover:text-[var(--accent)] ${c.key === "name" || c.key === "conf" ? "text-left" : "text-right"} ${c.hide ?? ""}`}
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
                  <Link href={`/teams/cbb/${t.slug}`} className="font-medium hover:text-[var(--accent)] align-middle">{t.name}</Link>
                  {!t.current_d1 && <span className="ml-1.5 text-[9px] uppercase text-[var(--text-dim)]">former</span>}
                </td>
                {COLS.slice(1).map((c) => (
                  <td key={c.key} className={`px-2 py-1.5 ${c.key === "conf" ? "text-left" : "text-right"} ${c.hide ?? ""} ${c.key === "titles" ? "font-semibold" : "text-[var(--text-muted)]"}`}
                    style={c.key === "titles" ? { color: t.titles ? "var(--accent)" : "var(--text-dim)" } : undefined}>
                    {fmt(t, c.key)}
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
