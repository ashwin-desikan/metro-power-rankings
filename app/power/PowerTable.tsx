"use client";

import { useState } from "react";
import type { PowerEntry, DroppedEntry } from "@/lib/powerRanking";
import { CappedList } from "@/app/_shared/Disclosure";

const CAT: Record<string, string> = {
  National: "text-blue-700 dark:text-blue-300 bg-blue-500/10",
  "Sub-national": "text-teal-700 dark:text-teal-300 bg-teal-500/10",
  Mayor: "text-green-700 dark:text-green-300 bg-green-500/10",
  "US federal": "text-indigo-700 dark:text-indigo-300 bg-indigo-500/10",
  Org: "text-purple-700 dark:text-purple-300 bg-purple-500/10",
  "Central bank": "text-amber-700 dark:text-amber-300 bg-amber-500/10",
  Billionaire: "text-emerald-700 dark:text-emerald-300 bg-emerald-500/10",
  Corporate: "text-cyan-700 dark:text-cyan-300 bg-cyan-500/10",
  Finance: "text-fuchsia-700 dark:text-fuchsia-300 bg-fuchsia-500/10",
  Media: "text-pink-700 dark:text-pink-300 bg-pink-500/10",
  Sport: "text-orange-700 dark:text-orange-300 bg-orange-500/10",
  Culture: "text-violet-700 dark:text-violet-300 bg-violet-500/10",
  Crown: "text-amber-800 dark:text-amber-200 bg-amber-600/10",
  Judiciary: "text-rose-700 dark:text-rose-300 bg-rose-500/10",
  Faith: "text-yellow-700 dark:text-yellow-300 bg-yellow-500/10",
};

// "Office & wealth" view: formal office plus economic control. Hides the softer,
// reach-based and symbolic categories (media, sport, culture, royalty, faith).
const CORE = new Set([
  "National", "US federal", "Sub-national", "Mayor", "Central bank",
  "Org", "Judiciary", "Billionaire", "Corporate", "Finance",
]);

// /power hides the warning glyph (kept on every other surface). Strips the
// leading ⚠ (+ variation selector + space); keeps the 👑 crown.
const stripWarn = (s: string) => s.replace(/\u26a0\ufe0f?\s*/g, "");

function Move({ r }: { r: PowerEntry }) {
  if (r.isNew) return <span className="text-[10px] px-1 py-0.5 rounded font-semibold" style={{ background: "color-mix(in srgb, var(--accent) 18%, transparent)", color: "var(--accent)" }}>NEW</span>;
  const d = r.delta;
  if (d === null || d === undefined) return null;
  if (d === 0) return <span className="text-[10px] text-[var(--text-dim)]" title="No change">–</span>;
  if (d > 0) return <span className="text-[10px] font-semibold tabular-nums text-green-600 dark:text-green-400" title={`Up ${d}`}>▲{d}</span>;
  return <span className="text-[10px] font-semibold tabular-nums text-red-600 dark:text-red-400" title={`Down ${Math.abs(d)}`}>▼{Math.abs(d)}</span>;
}

export default function PowerTable({ rows, dropped = [], prevSnapshotDate = null }: { rows: PowerEntry[]; dropped?: DroppedEntry[]; prevSnapshotDate?: string | null }) {
  const [view, setView] = useState<"all" | "core">("all");
  const shown = view === "core" ? rows.filter((r) => CORE.has(r.category)) : rows;
  const max = shown.length ? Math.max(...shown.map((r) => r.power)) : 1;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="inline-flex rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
          {(["all", "core"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className="px-3 py-1.5 text-xs transition-colors"
              style={view === v ? { background: "var(--accent)", color: "#08080d", fontWeight: 600 } : { color: "var(--text-muted)" }}
            >
              {v === "all" ? "All power" : "Office & wealth"}
            </button>
          ))}
        </div>
        <span className="text-xs text-[var(--text-dim)]">
          {shown.length} of {rows.length}
          {view === "core" ? " · hides media, sport, culture, royalty, faith" : ""}
          {prevSnapshotDate ? <> · <span className="text-green-600 dark:text-green-400">▲</span><span className="text-red-600 dark:text-red-400">▼</span> vs {prevSnapshotDate}</> : ""}
        </span>
      </div>

      {/* Capped on phones. The desktop table gets an 80vh scroll box free
          from the globals.css table rule; this card list is not a table and
          got nothing, so it ran 10.1x longer than the desktop page
          (measured 2026-08-30). DESIGN-STANDARDS.md, "Density by
          environment". */}
      {/* Same view-filtered rows as the desktop table. */}
      <div className="grid grid-cols-1 gap-2 sm:hidden">
        <CappedList
          key={`${view}-${shown.length}`}
          initial={12}
          noun="people"
          className="rounded-lg border border-[var(--border)]"
          bodyClassName="grid grid-cols-1 gap-2 p-2 pt-0"
          items={shown.map((r, i) => (
          <div key={`${r.name}-${i}-card`} className="rounded-lg border p-3" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium text-sm text-[var(--text)]">{stripWarn(r.name)}</div>
                <div className="text-xs text-[var(--text-muted)]">{r.role}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="tabular-nums font-bold text-[var(--text-dim)] text-xs">#{i + 1}</div>
                <div className="mt-0.5"><Move r={r} /></div>
                <div className="tabular-nums font-semibold text-[var(--text)]">{Math.round(r.power)}</div>
              </div>
            </div>
            {r.transition ? (
              <div className="mt-1.5">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-700 dark:text-sky-300 whitespace-normal">⏳ {r.transition}</span>
              </div>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${CAT[r.category] ?? "text-[var(--text-muted)]"}`}>{r.category}</span>
              {r.metroSlug ? (
                <a href={`/rankings/${r.metroSlug}`} className="text-[var(--accent)] hover:underline">{r.metro}</a>
              ) : (
                <span className="text-[var(--text-muted)]">{r.metro}</span>
              )}
              <span className="text-[var(--text-muted)]">
                {r.jurisdictionHref ? (
                  <a href={r.jurisdictionHref} className="hover:text-[var(--accent)] hover:underline">{r.jurisdiction}</a>
                ) : r.jurisdiction}
              </span>
            </div>
          </div>
        ))}
        />
      </div>

      <div className="rounded-xl border overflow-x-auto hidden sm:block" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-xs uppercase tracking-wider text-[var(--text-dim)]" style={{ borderColor: "var(--border)" }}>
              <th className="py-2 px-4 text-right">#</th>
              <th className="py-2 px-4">Person</th>
              <th className="py-2 px-4 hidden sm:table-cell">Category</th>
              <th className="py-2 px-4 hidden sm:table-cell">Metro</th>
              <th className="py-2 px-4 hidden md:table-cell">Jurisdiction</th>
              <th className="py-2 px-4 text-right">Power</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={`${r.name}-${i}`} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <td className="py-2 px-4 text-right tabular-nums font-bold text-[var(--text-dim)]">
                  <div>{i + 1}</div>
                  <div className="mt-0.5"><Move r={r} /></div>
                </td>
                <td className="py-2 px-4">
                  <div className="font-medium text-[var(--text)]">{stripWarn(r.name)}</div>
                  <div className="text-xs text-[var(--text-muted)]">{r.role}</div>
                  {r.transition ? (
                    <div className="mt-1">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-700 dark:text-sky-300 whitespace-normal">⏳ {r.transition}</span>
                    </div>
                  ) : null}
                </td>
                <td className="py-2 px-4 hidden sm:table-cell">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${CAT[r.category] ?? "text-[var(--text-muted)]"}`}>{r.category}</span>
                </td>
                <td className="py-2 px-4 hidden sm:table-cell">
                  {r.metroSlug ? (
                    <a href={`/rankings/${r.metroSlug}`} className="text-[var(--accent)] hover:underline">{r.metro}</a>
                  ) : (
                    <span className="text-[var(--text-muted)]">{r.metro}</span>
                  )}
                </td>
                <td className="py-2 px-4 hidden md:table-cell text-[var(--text-muted)]">
                  {r.jurisdictionHref ? (
                    <a href={r.jurisdictionHref} className="hover:text-[var(--accent)] hover:underline">{r.jurisdiction}</a>
                  ) : r.jurisdiction}
                </td>
                <td className="py-2 px-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span className="hidden lg:block h-1.5 rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(4, (r.power / max) * 70)}px` }} />
                    <span className="tabular-nums font-semibold text-[var(--text)]">{Math.round(r.power)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dropped.length ? (
        <div className="mt-4 rounded-xl border p-3" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-card)" }}>
          <div className="text-xs uppercase tracking-wider text-[var(--text-dim)]">
            Dropped off{prevSnapshotDate ? ` since ${prevSnapshotDate}` : ""} · {dropped.length}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {dropped.map((d) => (
              <span key={d.name} className="text-xs px-2 py-1 rounded border" style={{ borderColor: "var(--border)" }} title={`${d.category} · ${d.jurisdiction}`}>
                {stripWarn(d.name)} <span className="text-[var(--text-dim)] tabular-nums">#{d.prevRank}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
