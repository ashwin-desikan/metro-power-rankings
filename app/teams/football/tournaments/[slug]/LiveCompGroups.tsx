import Link from "next/link";
import TeamCrest from "@/app/teams/_shared/TeamCrest";
import { getFootballClubByName, monogramForFootball } from "@/lib/football";
import type { LiveComp, LiveRow } from "@/lib/clubFootballLive";
import { ResponsiveTable, MiniStat, MiniCardHeader } from "@/app/teams/_shared/ResponsiveTable";

// Live group / league-phase tables for a continental competition, fed from the
// api-football -> Supabase -> ISR bundle. Server component (resolves crest + club
// slug via lib/football). Renders nothing until the standings exist (i.e. once the
// league phase begins), so it sits dormant through the summer qualifying rounds.

const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const cardStyle = { background: "var(--bg-card)", borderColor: "var(--border)" } as const;
const n = (v: number | null) => (v == null ? "-" : v);
const byPts = (a: LiveRow, b: LiveRow) => (b.points ?? 0) - (a.points ?? 0) || (b.gd ?? 0) - (a.gd ?? 0);
const COLS = ["P", "W", "D", "L", "GD", "Pts"];

function ColorBall({ slug, name }: { slug: string | null; name: string }) {
  const m = monogramForFootball(name, slug ?? undefined);
  return <span className="inline-grid place-items-center rounded-full flex-shrink-0" style={{ background: m.bg, color: m.fg, width: 18, height: 18, fontSize: 8, fontWeight: 700 }} aria-hidden>{m.mono}</span>;
}

export default function LiveCompGroups({ comp, season }: { comp: LiveComp; season: string | null }) {
  if (comp.groups.length === 0) return null;
  const heading = comp.groups.length > 1 ? "Group stage" : "League phase";
  return (
    <section id="groups" className="mb-8">
      <h2 className="text-lg font-semibold mb-3">
        {season ? `${season} ` : ""}{heading} <span className="text-[var(--text-muted)] font-normal text-sm">· live</span>
      </h2>
      <div className={comp.groups.length > 1 ? "grid grid-cols-1 sm:grid-cols-2 gap-3 items-start" : ""}>
        {comp.groups.slice().sort((a, b) => a.group_label.localeCompare(b.group_label)).map((g) => (
          <div key={g.group_label} className="rounded-xl border p-3" style={cardStyle}>
            {comp.groups.length > 1 && <div className="text-[11px] font-semibold text-[var(--text-muted)] mb-1">{g.group_label}</div>}
            <ResponsiveTable
              compact
              className="rounded-lg border"
              style={cardStyle}
              mobileRows={g.rows.slice().sort(byPts).map((r, i) => {
                const c = getFootballClubByName(r.lookup ?? "") ?? getFootballClubByName(r.name ?? "");
                const nm = c?.cur_name ?? r.lookup ?? r.name ?? "-";
                return (
                  <div key={i}>
                    <MiniCardHeader
                      left={
                        <span className="inline-flex items-center gap-1.5 min-w-0">
                          <span className="text-[var(--text-dim)] flex-shrink-0 tabular-nums" style={mono}>{r.rank ?? i + 1}</span>
                          <TeamCrest name={nm} size={16} fallback={<ColorBall slug={c?.slug ?? null} name={nm} />} />
                          {c?.slug ? <Link href={`/teams/football/${c.slug}`} className="hover:underline font-medium truncate">{nm}</Link> : <span className="font-medium truncate">{nm}</span>}
                        </span>
                      }
                      right={<span className="tabular-nums font-semibold" style={mono}>{n(r.points)} pts</span>}
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <MiniStat label="P" value={n(r.played)} />
                      <MiniStat label="W-D-L" value={`${n(r.win)}-${n(r.draw)}-${n(r.lose)}`} />
                      <MiniStat label="GD" value={n(r.gd)} />
                    </div>
                  </div>
                );
              })}
            >
              <table className="w-full text-sm min-w-[320px]">
                <thead>
                  <tr className="text-xs text-[var(--text-muted)] uppercase tracking-wide border-b" style={{ borderColor: "var(--border)" }}>
                    <th className="py-1.5 text-left font-medium">#</th>
                    <th className="py-1.5 text-left font-medium">Club</th>
                    {COLS.map((c) => <th key={c} className="py-1.5 text-right font-medium">{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {g.rows.slice().sort(byPts).map((r, i) => {
                    const c = getFootballClubByName(r.lookup ?? "") ?? getFootballClubByName(r.name ?? "");
                    const nm = c?.cur_name ?? r.lookup ?? r.name ?? "-";
                    return (
                      <tr key={i} className="border-b" style={{ borderColor: "var(--border)" }}>
                        <td className="py-1.5 tabular-nums text-[var(--text-muted)]" style={mono}>{r.rank ?? i + 1}</td>
                        <td className="py-1.5">
                          <span className="inline-flex items-center gap-1.5">
                            <TeamCrest name={nm} size={18} fallback={<ColorBall slug={c?.slug ?? null} name={nm} />} />
                            {c?.slug ? <Link href={`/teams/football/${c.slug}`} className="hover:underline font-medium">{nm}</Link> : <span className="font-medium">{nm}</span>}
                          </span>
                        </td>
                        {[n(r.played), n(r.win), n(r.draw), n(r.lose), n(r.gd), n(r.points)].map((v, j) => (
                          <td key={j} className={`py-1.5 text-right tabular-nums ${COLS[j] === "Pts" ? "font-semibold" : ""}`} style={mono}>{v}</td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ResponsiveTable>
          </div>
        ))}
      </div>
    </section>
  );
}
