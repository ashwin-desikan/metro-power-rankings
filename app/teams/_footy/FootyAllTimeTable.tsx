"use client";

import { useState } from "react";
import Link from "next/link";
import TeamCrest from "@/app/teams/_shared/TeamCrest";

type Row = {
  slug: string; name: string; active: boolean;
  premierships: number; minor_premierships: number; gf_apps: number;
  finals_apps: number; seasons: number; w: number; d: number; l: number;
  win_pct: number; title_years: number[]; color: string; color2: string; abbr: string;
};

function fg(bg: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((bg || "").trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#10131a" : "#ffffff";
}
const last = (a: number[]) => (a.length ? a[a.length - 1] : null);

function Badge({ r }: { r: Row }) {
  return (
    <span className="inline-flex items-center justify-center font-bold rounded flex-shrink-0"
      style={{ background: r.color, color: fg(r.color), width: 26, height: 16,
        fontSize: r.abbr.length > 2 ? 9 : 11, letterSpacing: "0.02em",
        boxShadow: `inset 0 0 0 1.5px ${r.color2}` }}>{r.abbr}</span>
  );
}

export default function FootyAllTimeTable({ franchises, league }: { franchises: Row[]; league: "afl" | "nrl" }) {
  const [scope, setScope] = useState<"current" | "all">("all");
  const rows = [...franchises]
    .filter((f) => scope === "all" || f.active)
    .sort((a, b) =>
      b.premierships - a.premierships ||
      b.minor_premierships - a.minor_premierships ||
      b.gf_apps - a.gf_apps ||
      b.win_pct - a.win_pct ||
      a.name.localeCompare(b.name));

  const Toggle = ({ value, label }: { value: "current" | "all"; label: string }) => (
    <button onClick={() => setScope(value)} className="text-xs px-3 py-1 rounded-full border transition-colors"
      style={{ borderColor: scope === value ? "var(--accent)" : "var(--border)",
        color: scope === value ? "var(--accent)" : "var(--text-muted)",
        background: scope === value ? "rgba(78,205,196,0.10)" : "transparent",
        fontWeight: scope === value ? 600 : 400 }}>{label}</button>
  );

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <Toggle value="current" label="Current clubs" />
        <Toggle value="all" label="Current + defunct" />
      </div>
      {/* Mobile: one card per club instead of an 8-column table forcing
          sideways scroll. Same `rows` array, card presentation only. */}
      <div className="grid grid-cols-1 gap-2 sm:hidden">
        {rows.map((f) => (
          <div key={`${f.slug}-card`} className="rounded-lg border p-3" style={{ background: "var(--bg-card)", borderColor: f.premierships > 0 ? "rgba(212,175,55,0.3)" : "var(--border)" }}>
            <div className="flex items-center gap-2 min-w-0">
              <TeamCrest name={f.name} size={20} fallback={<Badge r={f} />} />
              <Link href={`/teams/${league}/${f.slug}`} className="hover:text-[var(--accent)] transition-colors font-medium text-sm truncate">{f.name}</Link>
              {!f.active && <span className="text-[9px] uppercase tracking-wide px-1 py-0.5 rounded flex-shrink-0" style={{ background: "rgba(120,120,140,0.18)", color: "var(--text-dim)" }}>defunct</span>}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Premierships</div>
                <div className="tabular-nums font-semibold" style={{ color: f.premierships > 0 ? "#d4af37" : "var(--text-dim)" }}>{f.premierships}{f.title_years.length > 0 ? ` (last ${last(f.title_years)})` : ""}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Minor</div>
                <div className="tabular-nums text-[var(--text-muted)]">{f.minor_premierships}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">GFs</div>
                <div className="tabular-nums text-[var(--text-muted)]">{f.gf_apps}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Seasons</div>
                <div className="tabular-nums text-[var(--text-muted)]">{f.seasons}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Record</div>
                <div className="tabular-nums text-[var(--text-muted)]">{league === "afl" ? `${f.w}-${f.l}-${f.d}` : `${f.w}-${f.d}-${f.l}`}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-dim)]">Win%</div>
                <div className="tabular-nums">{f.win_pct.toFixed(3)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border overflow-x-auto hidden sm:block" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <table className="w-full text-sm tabular-nums min-w-[640px]">
          <thead>
            <tr className="border-b text-[11px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
              <th className="text-left py-2 px-3 font-medium">Club</th>
              <th className="text-right py-2 px-2 font-medium">Premierships</th>
              <th className="text-right py-2 px-2 font-medium hidden sm:table-cell">Last</th>
              <th className="text-right py-2 px-2 font-medium">Minor</th>
              <th className="text-right py-2 px-2 font-medium">GFs</th>
              <th className="text-right py-2 px-2 font-medium">Seasons</th>
              <th className="text-right py-2 px-2 font-medium hidden md:table-cell">Record</th>
              <th className="text-right py-2 px-3 font-medium">Win%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.slug} className="border-b last:border-b-0" style={{ borderColor: "var(--border)", background: f.premierships > 0 ? "rgba(212,175,55,0.05)" : undefined }}>
                <td className="py-2 px-3">
                  <div className="flex items-center gap-2">
                    <TeamCrest name={f.name} size={20} fallback={<Badge r={f} />} />
                    <Link href={`/teams/${league}/${f.slug}`} className="hover:text-[var(--accent)] transition-colors">{f.name}</Link>
                    {!f.active && <span className="text-[9px] uppercase tracking-wide px-1 py-0.5 rounded" style={{ background: "rgba(120,120,140,0.18)", color: "var(--text-dim)" }}>defunct</span>}
                  </div>
                </td>
                <td className="py-2 px-2 text-right font-semibold" style={{ color: f.premierships > 0 ? "#d4af37" : "var(--text-dim)" }}>{f.premierships}</td>
                <td className="py-2 px-2 text-right text-[var(--text-muted)] text-xs hidden sm:table-cell">{last(f.title_years) ?? "—"}</td>
                <td className="py-2 px-2 text-right text-[var(--text-muted)]">{f.minor_premierships}</td>
                <td className="py-2 px-2 text-right text-[var(--text-muted)]">{f.gf_apps}</td>
                <td className="py-2 px-2 text-right text-[var(--text-muted)]">{f.seasons}</td>
                <td className="py-2 px-2 text-right text-[var(--text-muted)] text-xs hidden md:table-cell">{league === "afl" ? `${f.w}-${f.l}-${f.d}` : `${f.w}-${f.d}-${f.l}`}</td>
                <td className="py-2 px-3 text-right">{f.win_pct.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[var(--text-dim)] mt-2">
        All-time premierships, minor premierships, Grand Final appearances and seasons across the full {league.toUpperCase()} (and predecessor) history. Win% counts a draw as a half-win.
      </p>
    </div>
  );
}
