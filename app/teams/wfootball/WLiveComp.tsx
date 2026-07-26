"use client";

import Link from "next/link";
import CrestIcon from "@/app/teams/_shared/CrestIcon";
import type { WLiveCompVM, WLiveGroupVM } from "@/lib/wLive";

// Live UEFA Women's Champions League view: group/league-phase tables plus recent
// and upcoming fixtures. Mirrors the men's continental-competition card. Rows are
// pre-resolved server-side.

const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const COLS = ["P", "W", "D", "L", "GD", "Pts"];
const FINISHED = new Set(["FT", "AET", "PEN", "AWD", "WO"]);
const isFinished = (s: string | null) => !!s && FINISHED.has(s);
const fmtDate = (d: string | null): string => {
  if (!d) return "TBD";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? "TBD" : dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
};

function GroupTable({ group }: { group: WLiveGroupVM }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-[300px]">
        <thead>
          <tr className="text-left text-[var(--text-muted)]">
            <th className="py-1 px-1.5 font-medium text-right">#</th>
            <th className="py-1 px-1.5 font-medium">Club</th>
            {COLS.map((c) => <th key={c} className="py-1 px-1.5 font-medium text-right tabular-nums">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {group.rows.map((r, i) => {
            // rows carry P W D L GF GA GD Pts; the compact comp table shows P W D L GD Pts.
            const [p, w, d, l, , , gd, pts] = r.cells;
            return (
              <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-1 px-1.5 text-right tabular-nums text-[var(--text-dim)]" style={mono}>{r.rank ?? i + 1}</td>
                <td className="py-1 px-1.5 font-medium whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    <CrestIcon name={r.name} size={14} className="flex-shrink-0" />
                    {r.slug ? <Link href={`/teams/wfootball/clubs/${r.slug}`} className="hover:text-[var(--accent)]">{r.name}</Link> : <span>{r.name}</span>}
                  </span>
                </td>
                {[p, w, d, l, gd, pts].map((v, j) => (
                  <td key={j} className="py-1 px-1.5 text-right tabular-nums" style={mono}>{v}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function WLiveComp({ comp }: { comp: WLiveCompVM }) {
  const groups = comp.groups.filter((g) => g.rows.length > 0);
  const upcoming = comp.fixtures.filter((f) => !isFinished(f.status)).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")).slice(0, 6);
  const recent = comp.fixtures.filter((f) => isFinished(f.status)).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")).slice(0, 6);

  const fxLine = (f: WLiveCompVM["fixtures"][number]) => {
    const res = isFinished(f.status) && f.homeGoals !== null && f.awayGoals !== null ? `${f.homeGoals}–${f.awayGoals}` : fmtDate(f.date);
    return { key: f.id, home: f.home, away: f.away, res };
  };
  const side = (t: { name: string; slug: string | null }) =>
    t.slug ? <Link href={`/teams/wfootball/clubs/${t.slug}`} className="hover:underline">{t.name}</Link> : <span>{t.name}</span>;

  return (
    <div className="space-y-4">
      {groups.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {groups.slice().sort((a, b) => (a.label ?? "").localeCompare(b.label ?? "")).map((g, gi) => (
            <div key={gi}>
              {g.label && <div className="text-[11px] font-semibold text-[var(--text-muted)] mb-1">{g.label}</div>}
              <GroupTable group={g} />
            </div>
          ))}
        </div>
      )}
      {(recent.length > 0 || upcoming.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {recent.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-[var(--text-muted)] mb-1">Recent</div>
              {recent.map(fxLine).map((f) => (
                <div key={f.key} className="flex justify-between gap-2 py-0.5">
                  <span className="truncate">{side(f.home)} <span className="text-[var(--text-dim)]">v</span> {side(f.away)}</span>
                  <span className="tabular-nums text-[var(--text-dim)] flex-shrink-0" style={mono}>{f.res}</span>
                </div>
              ))}
            </div>
          )}
          {upcoming.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-[var(--text-muted)] mb-1">Upcoming</div>
              {upcoming.map(fxLine).map((f) => (
                <div key={f.key} className="flex justify-between gap-2 py-0.5">
                  <span className="truncate">{side(f.home)} <span className="text-[var(--text-dim)]">v</span> {side(f.away)}</span>
                  <span className="tabular-nums text-[var(--text-dim)] flex-shrink-0" style={mono}>{f.res}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
