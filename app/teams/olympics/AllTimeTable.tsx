"use client";

// All-time Olympic medal table with linked filters.
//   Scope:  Total / Summer / Winter
//   Year:   multi-select, limited to years held in the chosen scope
//   Sport:  multi-select, limited to sports held in the chosen scope AND the
//           selected years (and vice versa)
// Default (all years, all sports) reproduces the precomputed teams.json totals
// exactly. When a filter is active the table re-aggregates from the per-team /
// year / sport breakdown (public/data/olympics/medals-breakdown.json), which
// folds to the same lineage entities and the same grand totals.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { flagCdnUrl } from "@/lib/international-display";

export type AllTimeRow = {
  slug: string;
  name: string;
  special?: boolean; // dissolved state kept whole, or a combined/neutral team
  g: number; s: number; b: number; total: number;
  apps: number; summer_apps: number; winter_apps: number;
  first: number; last: number;
  summer: { g: number; s: number; b: number; first: number | null; last: number | null };
  winter: { g: number; s: number; b: number; first: number | null; last: number | null };
};

type Scope = "total" | "summer" | "winter";
type Breakdown = { slugs: string[]; sports: string[]; rows: number[][] }; // [si,year,seas,spi,g,s,b]
const GOLD = "#d4af37";
const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const card = { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" } as const;

const SCOPES: { key: Scope; label: string }[] = [
  { key: "total", label: "Total" },
  { key: "summer", label: "Summer" },
  { key: "winter", label: "Winter" },
];

function view(row: AllTimeRow, scope: Scope) {
  if (scope === "summer")
    return { g: row.summer.g, s: row.summer.s, b: row.summer.b,
             total: row.summer.g + row.summer.s + row.summer.b,
             apps: row.summer_apps, first: row.summer.first, last: row.summer.last };
  if (scope === "winter")
    return { g: row.winter.g, s: row.winter.s, b: row.winter.b,
             total: row.winter.g + row.winter.s + row.winter.b,
             apps: row.winter_apps, first: row.winter.first, last: row.winter.last };
  return { g: row.g, s: row.s, b: row.b, total: row.total,
           apps: row.apps, first: row.first, last: row.last };
}

const SEAS_OK = (seas: number, scope: Scope) =>
  scope === "total" || (scope === "summer" ? seas === 0 : seas === 1);

function MultiSelect<T extends string | number>({
  label, options, selected, onToggle, onAll, onClear, render,
}: {
  label: string; options: T[]; selected: Set<T>;
  onToggle: (v: T) => void; onAll: () => void; onClear: () => void;
  render: (v: T) => string;
}) {
  const summary = selected.size === 0 ? `All ${label.toLowerCase()}s` : `${selected.size} ${label.toLowerCase()}${selected.size !== 1 ? "s" : ""}`;
  return (
    <details className="relative">
      <summary className="text-xs px-3 py-1.5 rounded-md border cursor-pointer select-none list-none"
               style={{ ...card, color: "var(--text)" }}>
        {label}: <span className="font-semibold">{summary}</span>
      </summary>
      <div className="absolute z-20 mt-1 w-56 max-h-72 overflow-y-auto rounded-md border p-2 shadow-lg"
           style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
        <div className="flex gap-3 mb-2 text-xs">
          <button type="button" onClick={onAll} className="hover:text-[var(--accent)] underline">All</button>
          <button type="button" onClick={onClear} className="hover:text-[var(--accent)] underline">Clear</button>
        </div>
        <ul className="space-y-0.5">
          {options.map((o) => (
            <li key={String(o)}>
              <label className="flex items-center gap-2 text-xs px-1 py-0.5 rounded cursor-pointer hover:bg-[var(--bg-card-hover)]">
                <input type="checkbox" checked={selected.has(o)} onChange={() => onToggle(o)} />
                <span>{render(o)}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

export default function AllTimeTable({ rows }: { rows: AllTimeRow[] }) {
  const [scope, setScope] = useState<Scope>("total");
  const [bd, setBd] = useState<Breakdown | null>(null);
  const [years, setYears] = useState<Set<number>>(new Set());
  const [sports, setSports] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/data/olympics/medals-breakdown.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setBd(d))
      .catch(() => setBd(null));
  }, []);

  const rowBySlug = useMemo(() => new Map(rows.map((r) => [r.slug, r])), [rows]);

  const availYears = useMemo(() => {
    if (!bd) return [] as number[];
    const set = new Set<number>();
    for (const r of bd.rows) if (SEAS_OK(r[2], scope)) set.add(r[1]);
    return Array.from(set).sort((a, b) => b - a);
  }, [bd, scope]);

  const availSports = useMemo(() => {
    if (!bd) return [] as string[];
    const set = new Set<string>();
    for (const r of bd.rows)
      if (SEAS_OK(r[2], scope) && (years.size === 0 || years.has(r[1]))) set.add(bd.sports[r[3]]);
    return Array.from(set).sort();
  }, [bd, scope, years]);

  // Switching scope clears year/sport (the year sets differ by season).
  useEffect(() => { setYears(new Set()); setSports(new Set()); }, [scope]);
  // Prune sport selections the current year selection no longer allows.
  useEffect(() => {
    setSports((prev) => {
      if (prev.size === 0) return prev;
      const ok = new Set(availSports);
      const next = new Set([...prev].filter((s) => ok.has(s)));
      return next.size === prev.size ? prev : next;
    });
  }, [availSports]);

  const filtersActive = years.size > 0 || sports.size > 0;

  const visible = useMemo(() => {
    if (!filtersActive || !bd) {
      return rows
        .map((r) => ({ row: r, v: view(r, scope) }))
        .filter(({ v }) => v.apps > 0)
        .sort((a, b) => b.v.g - a.v.g || b.v.s - a.v.s || b.v.b - a.v.b);
    }
    type Agg = { g: number; s: number; b: number; eds: Set<string>; min: number; max: number };
    const agg = new Map<string, Agg>();
    for (const r of bd.rows) {
      const [si, year, seas, spi, g, s, b] = r;
      if (!SEAS_OK(seas, scope)) continue;
      if (years.size > 0 && !years.has(year)) continue;
      if (sports.size > 0 && !sports.has(bd.sports[spi])) continue;
      const slug = bd.slugs[si];
      let a = agg.get(slug);
      if (!a) { a = { g: 0, s: 0, b: 0, eds: new Set(), min: year, max: year }; agg.set(slug, a); }
      a.g += g; a.s += s; a.b += b; a.eds.add(`${year}-${seas}`);
      a.min = Math.min(a.min, year); a.max = Math.max(a.max, year);
    }
    const out: { row: AllTimeRow; v: ReturnType<typeof view> }[] = [];
    for (const [slug, a] of agg) {
      const row = rowBySlug.get(slug);
      if (!row || a.g + a.s + a.b === 0) continue;
      out.push({ row, v: { g: a.g, s: a.s, b: a.b, total: a.g + a.s + a.b, apps: a.eds.size, first: a.min, last: a.max } });
    }
    return out.sort((x, y) => y.v.g - x.v.g || y.v.s - x.v.s || y.v.b - x.v.b);
  }, [filtersActive, bd, rows, scope, years, sports, rowBySlug]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {SCOPES.map((s) => (
          <button key={s.key} type="button" onClick={() => setScope(s.key)}
            className="text-xs px-3 py-1.5 rounded-md border transition-colors"
            style={{
              backgroundColor: scope === s.key ? "var(--accent)" : "var(--bg-card)",
              borderColor: scope === s.key ? "var(--accent)" : "var(--border)",
              color: scope === s.key ? "var(--bg)" : "var(--text)",
              fontWeight: scope === s.key ? 600 : 400,
            }}>
            {s.label}
          </button>
        ))}
        <span className="mx-1 text-[var(--border)]">|</span>
        <MultiSelect<number>
          label="Year" options={availYears} selected={years}
          onToggle={(y) => setYears((p) => { const n = new Set(p); if (n.has(y)) n.delete(y); else n.add(y); return n; })}
          onAll={() => setYears(new Set())} onClear={() => setYears(new Set())}
          render={(y) => String(y)} />
        <MultiSelect<string>
          label="Sport" options={availSports} selected={sports}
          onToggle={(s) => setSports((p) => { const n = new Set(p); if (n.has(s)) n.delete(s); else n.add(s); return n; })}
          onAll={() => setSports(new Set())} onClear={() => setSports(new Set())}
          render={(s) => s} />
        {filtersActive && (
          <button type="button" onClick={() => { setYears(new Set()); setSports(new Set()); }}
            className="text-xs px-2 py-1.5 text-[var(--text-muted)] hover:text-[var(--accent)] underline">
            Reset
          </button>
        )}
        {!bd && <span className="text-xs text-[var(--text-dim)]">loading filters…</span>}
      </div>

      {/* Mobile: one card per team instead of a horizontally scrolling
          table. Same `visible` array (post filter/scope) as the desktop
          table below, so filtering/sorting never forks between the two. */}
      <div className="grid grid-cols-1 gap-2 sm:hidden">
        {visible.map(({ row, v }, i) => (
          <Link
            key={row.slug}
            href={`/teams/olympics/${row.slug}`}
            className="block rounded-lg border p-3 hover:border-[var(--accent)] transition-colors"
            style={card}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[10px] text-[var(--text-dim)] tabular-nums flex-shrink-0" style={mono}>#{i + 1}</span>
                {flagCdnUrl(row.slug) && (
                  <img src={flagCdnUrl(row.slug)!} alt="" aria-hidden width={20} height={15} className="inline-block flex-shrink-0" loading="lazy" decoding="async" />
                )}
                <span className="font-medium truncate">{row.name}</span>
                {row.special && (
                  <span className="text-[var(--text-dim)] flex-shrink-0" style={mono}
                        title="Dissolved state kept whole, or a combined/neutral team">‡</span>
                )}
              </div>
              <span className="text-xs text-[var(--text-muted)] tabular-nums flex-shrink-0" style={mono}>
                {v.first && v.last ? `${v.first}–${v.last}` : ""}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-5 gap-x-2 gap-y-1 text-xs tabular-nums">
              <div>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: GOLD }}>Gold</div>
                <div className="font-semibold" style={{ ...mono, color: v.g > 0 ? GOLD : "var(--text-dim)" }}>{v.g.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Silver</div>
                <div style={mono}>{v.s.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Bronze</div>
                <div style={mono}>{v.b.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Total</div>
                <div className="font-semibold" style={mono}>{v.total.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Games</div>
                <div style={mono}>{v.apps}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="rounded-xl border overflow-x-auto max-h-[560px] overflow-y-auto hidden sm:block" style={card}>
        <table className="w-full text-sm min-w-[680px]">
          <thead className="sticky top-0" style={{ backgroundColor: "var(--bg-card)" }}>
            <tr className="text-left text-xs text-[var(--text-muted)]">
              <th className="py-2 px-3 font-medium">#</th>
              <th className="py-2 px-3 font-medium">Team</th>
              <th className="py-2 px-3 text-right font-medium" style={{ color: GOLD }}>G</th>
              <th className="py-2 px-3 text-right font-medium">S</th>
              <th className="py-2 px-3 text-right font-medium">B</th>
              <th className="py-2 px-3 text-right font-medium">Total</th>
              <th className="py-2 px-3 text-right font-medium">Games</th>
              <th className="py-2 px-3 font-medium">Span</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(({ row, v }, i) => (
              <tr key={row.slug} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-1.5 px-3 tabular-nums" style={mono}>{i + 1}</td>
                <td className="py-1.5 px-3 font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    {flagCdnUrl(row.slug) && (
                      <img src={flagCdnUrl(row.slug)!} alt="" aria-hidden width={20} height={15} className="inline-block" loading="lazy" decoding="async" />
                    )}
                    <Link href={`/teams/olympics/${row.slug}`} className="hover:text-[var(--accent)]">
                      {row.name}
                    </Link>
                    {row.special && (
                      <span className="text-[var(--text-dim)]" style={mono}
                            title="Dissolved state kept whole, or a combined/neutral team">‡</span>
                    )}
                  </span>
                </td>
                <td className="py-1.5 px-3 text-right tabular-nums font-semibold"
                    style={{ ...mono, color: v.g > 0 ? GOLD : "var(--text-dim)" }}>
                  {v.g.toLocaleString()}
                </td>
                <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{v.s.toLocaleString()}</td>
                <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{v.b.toLocaleString()}</td>
                <td className="py-1.5 px-3 text-right tabular-nums font-semibold" style={mono}>{v.total.toLocaleString()}</td>
                <td className="py-1.5 px-3 text-right tabular-nums" style={mono}>{v.apps}</td>
                <td className="py-1.5 px-3 tabular-nums text-xs text-[var(--text-muted)]" style={mono}>
                  {v.first && v.last ? `${v.first}–${v.last}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-[var(--text-dim)]">
        ‡ Dissolved state kept whole (East Germany) or a combined / neutral team
        (Australasia, the West Indies Federation, the Netherlands Antilles, the Mixed,
        Refugee, Independent and Neutral Athlete delegations).
      </p>
      {filtersActive && (
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Filtered: {visible.length} team{visible.length !== 1 ? "s" : ""} ·{" "}
          {years.size === 0 ? "all years" : `${years.size} year${years.size !== 1 ? "s" : ""}`} ·{" "}
          {sports.size === 0 ? "all sports" : `${sports.size} sport${sports.size !== 1 ? "s" : ""}`}.
          Totals re-aggregated from medal-level data.
        </p>
      )}
    </div>
  );
}
