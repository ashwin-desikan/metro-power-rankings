"use client";

import { useState } from "react";
import Link from "next/link";
import { monogramForFootball } from "@/lib/football-colors";
import TeamCrest from "@/app/teams/_shared/TeamCrest";

// MLS all-time table: every franchise by honors, including defunct clubs.
// A Current/All filter toggles defunct clubs; defunct clubs are tagged.

type Row = {
  cur_name: string; slug: string | null; mls_cups: number; supporters_shields: number;
  finals: number; playoffs: number; seasons: number; last_title: number | null;
  metro: string | null; defunct: boolean;
};
type SortKey = "mls_cups" | "supporters_shields" | "finals" | "playoffs" | "seasons";
type View = "current" | "all";

function ColorBall({ slug, name }: { slug: string | null; name: string }) {
  const m = monogramForFootball(name, slug ?? undefined);
  return <span className="inline-grid place-items-center rounded-full flex-shrink-0" style={{ background: m.bg, color: m.fg, width: 18, height: 18, fontSize: 8, fontWeight: 700 }} aria-hidden>{m.mono}</span>;
}

export default function MlsMostDecorated({ rows }: { rows: Row[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("mls_cups");
  const [view, setView] = useState<View>("current");
  const defunctCount = rows.filter((r) => r.defunct).length;
  const visible = view === "all" ? rows : rows.filter((r) => !r.defunct);
  const sorted = [...visible].sort((a, b) => (b[sortKey] - a[sortKey]) || (b.mls_cups - a.mls_cups) || (b.supporters_shields - a.supporters_shields) || a.cur_name.localeCompare(b.cur_name));
  const Th = ({ k, label }: { k: SortKey; label: string }) => (
    <th className="py-3 px-2 text-right font-medium cursor-pointer select-none hover:text-[var(--text)]" onClick={() => setSortKey(k)} style={{ color: sortKey === k ? "var(--text)" : undefined }}>
      <span className="inline-flex items-center gap-1 justify-end">{label}{sortKey === k && <span aria-hidden style={{ color: "var(--accent)" }}>▼</span>}</span>
    </th>
  );
  const Stat = ({ label, v, strong }: { label: string; v: number; strong?: boolean }) => (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">{label}</div>
      <div className={`tabular-nums ${strong ? "font-semibold" : "text-[var(--text-muted)]"}`}>{v || "—"}</div>
    </div>
  );
  return (
    <section className="mb-8">
      <header className="mb-3 flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-lg font-semibold">All-time table</h2>
        <div className="flex items-center gap-1.5 text-xs">
          {(["current", "all"] as View[]).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} className="px-3 py-1 rounded-full border transition-colors"
              style={view === v ? { background: "var(--accent-dim)", color: "var(--text)", borderColor: "var(--accent-dim)" } : { background: "var(--bg-card)", color: "var(--text-muted)", borderColor: "var(--border)" }}>
              {v === "current" ? "Current" : `All (incl. ${defunctCount} defunct)`}
            </button>
          ))}
        </div>
      </header>
      <p className="text-xs text-[var(--text-muted)] mb-3">All MLS franchises by honors. Switch to All to include defunct clubs. Tap a column to sort.</p>

      {/* Mobile sort control: the desktop header buttons (onClick={() => setSortKey(k)})
          are hidden along with the table below sm, so cards need their own way
          to drive the same `sortKey` state. This table's sort is always
          descending with no direction toggle (the desktop buttons only ever
          call setSortKey(k), never flip a direction), so the mobile control
          is a Sort-by select alone - no flip button, matching the desktop
          behavior exactly. */}
      <div className="flex items-center gap-2 mb-3 sm:hidden">
        <label className="flex-1 flex items-center gap-2 text-xs min-w-0">
          <span className="uppercase tracking-wide text-[var(--text-dim)] flex-shrink-0">Sort</span>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text)" }}
          >
            <option value="mls_cups">MLS Cups</option>
            <option value="supporters_shields">Shields</option>
            <option value="finals">Cup Finals</option>
            <option value="playoffs">Playoffs</option>
            <option value="seasons">Seasons</option>
          </select>
        </label>
      </div>

      {/* Mobile: one card per club instead of a 7-column table. Same
          `sorted` array drives both presentations. */}
      <div className="grid grid-cols-1 gap-2 sm:hidden">
        {sorted.map((r) => (
          <div key={r.cur_name} className="rounded-lg border p-3" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 min-w-0">
                <TeamCrest name={r.cur_name} size={20} fallback={<ColorBall slug={r.slug} name={r.cur_name} />} />
                {r.slug ? (
                  <Link href={`/teams/football/${r.slug}`} className="hover:underline font-medium truncate">{r.cur_name}</Link>
                ) : (
                  <span className="font-medium truncate">{r.cur_name}</span>
                )}
              </span>
              {r.defunct && (
                <span className="flex-shrink-0 text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded" style={{ background: "rgba(120,120,140,0.18)", color: "var(--text-dim)" }}>Defunct</span>
              )}
            </div>
            <div className="mt-0.5 text-xs text-[var(--text-muted)]">{r.metro || "—"}</div>
            <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs">
              <Stat label="MLS Cups" v={r.mls_cups} strong />
              <Stat label="Shields" v={r.supporters_shields} />
              <Stat label="Cup Finals" v={r.finals} />
              <Stat label="Playoffs" v={r.playoffs} />
              <Stat label="Seasons" v={r.seasons} />
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border overflow-x-auto hidden sm:block" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <table className="w-full text-sm tabular-nums min-w-[640px]">
          <thead>
            <tr className="border-b text-[11px] uppercase tracking-wide" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
              <th className="py-2 px-3 text-left font-medium">Club</th>
              <th className="py-2 px-2 text-left font-medium">Metro</th>
              <Th k="mls_cups" label="MLS Cups" />
              <Th k="supporters_shields" label="Shields" />
              <Th k="finals" label="Cup Finals" />
              <Th k="playoffs" label="Playoffs" />
              <Th k="seasons" label="Seasons" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.cur_name} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                <td className="py-1.5 px-3">
                  <span className="inline-flex items-center gap-1.5">
                    <TeamCrest name={r.cur_name} size={18} fallback={<ColorBall slug={r.slug} name={r.cur_name} />} />
                    {r.slug ? <Link href={`/teams/football/${r.slug}`} className="hover:underline font-medium">{r.cur_name}</Link> : <span className="font-medium">{r.cur_name}</span>}
                    {r.defunct && <span className="text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded" style={{ background: "rgba(120,120,140,0.18)", color: "var(--text-dim)" }}>Defunct</span>}
                  </span>
                </td>
                <td className="py-1.5 px-2 text-[var(--text-muted)]">{r.metro || <span className="text-[var(--text-dim)]">—</span>}</td>
                <td className="py-1.5 px-2 text-right font-semibold">{r.mls_cups || "—"}</td>
                <td className="py-1.5 px-2 text-right">{r.supporters_shields || "—"}</td>
                <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{r.finals || "—"}</td>
                <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{r.playoffs || "—"}</td>
                <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{r.seasons}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
