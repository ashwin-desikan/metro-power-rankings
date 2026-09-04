import Link from "next/link";
import TeamCrest from "@/app/teams/_shared/TeamCrest";
import { getFootballClubByName, monogramForFootball } from "@/lib/football";
import type { LiveComp, LiveRow } from "@/lib/clubFootballLive";
import { ResponsiveTable, RankRow } from "@/app/teams/_shared/ResponsiveTable";
import { DataBar } from "@/app/_shared/DataBar";

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

export default function LiveCompGroups({ comp, season, note }: { comp: LiveComp; season: string | null; note?: string }) {
  if (comp.groups.length === 0) return null;
  const heading = comp.groups.length > 1 ? "Group stage" : "League phase";
  return (
    <section id="groups" className="mb-8">
      <h2 className="text-lg font-semibold mb-3">
        {season ? `${season} ` : ""}{heading} <span className="text-[var(--text-muted)] font-normal text-sm">· {note ?? "live"}</span>
      </h2>
      <div className={comp.groups.length > 1 ? "grid grid-cols-1 sm:grid-cols-2 gap-3 items-start" : ""}>
        {comp.groups.slice().sort((a, b) => a.group_label.localeCompare(b.group_label)).map((g) => {
          // Points is this group's argument; max is this group's own
          // maximum, computed once per group, never per row.
          const ptsMax = Math.max(...g.rows.map((r) => r.points ?? 0), 1);
          return (
          <div key={g.group_label} className="rounded-xl border p-3" style={cardStyle}>
            {comp.groups.length > 1 && <div className="text-[11px] font-semibold text-[var(--text-muted)] mb-1">{g.group_label}</div>}
            <ResponsiveTable
              compact
              variant="list"
              className="rounded-lg border"
              style={cardStyle}
              mobileNoun="clubs"
              mobileRows={g.rows.slice().sort(byPts).map((r, i) => {
                const c = getFootballClubByName(r.lookup ?? "") ?? getFootballClubByName(r.name ?? "");
                const nm = c?.cur_name ?? r.lookup ?? r.name ?? "-";
                return (
                  <RankRow
                    key={i}
                    rank={r.rank ?? i + 1}
                    name={
                      <>
                        <TeamCrest name={nm} size={16} fallback={<ColorBall slug={c?.slug ?? null} name={nm} />} />
                        {c?.slug ? <Link href={`/teams/football/${c.slug}`} className="hover:underline truncate">{nm}</Link> : <span className="truncate">{nm}</span>}
                      </>
                    }
                    sub={<>{n(r.played)} P · {n(r.win)}-{n(r.draw)}-{n(r.lose)} · {typeof r.gd === "number" && r.gd > 0 ? `+${r.gd}` : n(r.gd)} GD</>}
                    right={n(r.points)}
                    rightSub="pts"
                  />
                );
              })}
            >
              <table className="w-full text-sm min-w-[320px]" data-sticky-col="2">
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
                          COLS[j] === "Pts" ? (
                            <td key={j} className="py-1.5 text-right">
                              <DataBar v={r.points} max={ptsMax} width={72} label="points" />
                            </td>
                          ) : (
                            <td key={j} className="py-1.5 text-right tabular-nums" style={mono}>{v}</td>
                          )
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ResponsiveTable>
          </div>
          );
        })}
      </div>
    </section>
  );
}
