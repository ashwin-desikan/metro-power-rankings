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
    <th className="py-2 px-2 text-right font-medium cursor-pointer select-none hover:text-[var(--text)]" onClick={() => setSortKey(k)} style={{ color: sortKey === k ? "var(--text)" : undefined }}>
      <span className="inline-flex items-center gap-1 justify-end">{label}{sortKey === k && <span aria-hidden style={{ color: "var(--accent)" }}>▼</span>}</span>
    </th>
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
      <div className="rounded-xl border overflow-x-auto" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
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
