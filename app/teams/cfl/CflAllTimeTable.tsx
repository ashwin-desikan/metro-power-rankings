"use client";

import { useState } from "react";
import Link from "next/link";
import TeamCrest from "@/app/teams/_shared/TeamCrest";

// Filterable CFL all-time table. Client component so the current / current+defunct
// toggle works without a round trip. Monogram logic is inlined (lib/cfl is server-only).

type Row = {
  slug: string;
  name: string;
  active: boolean;
  grey_cups: number;
  gc_finals: number;
  playoff_apps: number;
  w: number; l: number; t: number;
  win_pct: number;
  title_years: number[];
  gc_final_years: number[];
};

function monogram(name: string, slug: string): { mono: string; bg: string; fg: string } {
  const first = name.split(/\s+/)[0];
  const mono = (first === "BC" ? "BC" : first.slice(0, 3)).toUpperCase();
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) % 360;
  return { mono, bg: `hsl(${h} 55% 32%)`, fg: "#FFFFFF" };
}

const last = (a: number[]) => (a.length ? a[a.length - 1] : null);

export default function CflAllTimeTable({ franchises }: { franchises: Row[] }) {
  const [scope, setScope] = useState<"current" | "all">("all");
  const rows = [...franchises]
    .filter(f => scope === "all" || f.active)
    .sort(
      (a, b) =>
        b.grey_cups - a.grey_cups ||
        b.gc_finals - a.gc_finals ||
        b.playoff_apps - a.playoff_apps ||
        b.win_pct - a.win_pct ||
        a.name.localeCompare(b.name)
    );

  const Toggle = ({ value, label }: { value: "current" | "all"; label: string }) => (
    <button
      onClick={() => setScope(value)}
      className="text-xs px-3 py-1 rounded-full border transition-colors"
      style={{
        borderColor: scope === value ? "var(--accent)" : "var(--border)",
        color: scope === value ? "var(--accent)" : "var(--text-muted)",
        background: scope === value ? "rgba(78,205,196,0.10)" : "transparent",
        fontWeight: scope === value ? 600 : 400,
      }}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <Toggle value="current" label="Current franchises" />
        <Toggle value="all" label="Current + defunct" />
      </div>
      <div className="rounded-xl border overflow-x-auto" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <table className="w-full text-sm tabular-nums min-w-[640px]">
          <thead>
            <tr className="border-b text-[11px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
              <th className="text-left py-2 px-3 font-medium">Franchise</th>
              <th className="text-right py-2 px-2 font-medium">Grey Cups</th>
              <th className="text-right py-2 px-2 font-medium">Last Cup</th>
              <th className="text-right py-2 px-2 font-medium">Finals</th>
              <th className="text-right py-2 px-2 font-medium">Last Final</th>
              <th className="text-right py-2 px-2 font-medium">Playoffs</th>
              <th className="text-right py-2 px-2 font-medium">Record</th>
              <th className="text-right py-2 px-3 font-medium">Win%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(f => {
              const m = monogram(f.name, f.slug);
              const lc = last(f.title_years);
              const lf = last(f.gc_final_years);
              return (
                <tr key={f.slug} className="border-b last:border-b-0" style={{ borderColor: "var(--border)", background: f.grey_cups > 0 ? "rgba(212,175,55,0.05)" : undefined }}>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <TeamCrest name={f.name} size={22} fallback={<span className="inline-flex items-center justify-center font-bold rounded flex-shrink-0" style={{ background: m.bg, color: m.fg, width: 26, height: 16, fontSize: m.mono.length > 2 ? 9 : 11, letterSpacing: "0.02em" }}>{m.mono}</span>} />
                      <Link href={`/teams/cfl/${f.slug}`} className="hover:text-[var(--accent)] transition-colors">{f.name}</Link>
                      {!f.active && <span className="text-[9px] uppercase tracking-wide px-1 py-0.5 rounded" style={{ background: "rgba(120,120,140,0.18)", color: "var(--text-dim)" }}>defunct</span>}
                    </div>
                  </td>
                  <td className="py-2 px-2 text-right font-semibold" style={{ color: f.grey_cups > 0 ? "#d4af37" : "var(--text-dim)" }}>{f.grey_cups}</td>
                  <td className="py-2 px-2 text-right text-[var(--text-muted)] text-xs">{lc ?? "—"}</td>
                  <td className="py-2 px-2 text-right text-[var(--text-muted)]">{f.gc_finals}</td>
                  <td className="py-2 px-2 text-right text-[var(--text-muted)] text-xs">{lf ?? "—"}</td>
                  <td className="py-2 px-2 text-right text-[var(--text-muted)]">{f.playoff_apps}</td>
                  <td className="py-2 px-2 text-right text-[var(--text-muted)] text-xs">{f.w}-{f.l}-{f.t}</td>
                  <td className="py-2 px-3 text-right">{f.win_pct.toFixed(3)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--text-dim)] mt-2">
        Grey Cups, finals, and last-Cup/last-final cover the full Grey Cup history (1909–). Playoff appearances, record, and win% cover CFL-era seasons (1945–).
      </p>
    </div>
  );
}
