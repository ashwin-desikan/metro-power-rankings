"use client";

import Link from "next/link";
import type { CfbGame } from "@/lib/cfbShared";
import CrestIcon from "@/app/teams/_shared/CrestIcon";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(d: string | null): string | null {
  if (!d) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${MON[+m[2] - 1]} ${+m[3]}, ${m[1]}` : null;
}
function tags(g: CfbGame): { label: string; cls: string }[] {
  const out: { label: string; cls: string }[] = [];
  if (g.nat_champ) out.push({ label: "National Title", cls: "text-[var(--accent)]" });
  if (g.playoff) out.push({ label: "Playoff", cls: "text-amber-300" });
  if (g.major_bowl && !g.playoff) out.push({ label: "Major Bowl", cls: "text-[var(--text-muted)]" });
  if (g.conf_champ) out.push({ label: "Conf Title", cls: "text-[var(--text-muted)]" });
  if (g.conf_game && !g.conf_champ) out.push({ label: "Conf Game", cls: "text-[var(--text-dim)]" });
  if (g.rivalry) out.push({ label: "Rivalry", cls: "text-pink-300" });
  return out;
}

export default function CfbGamesTable({ games, linkSlugs = [] }: { games: CfbGame[]; linkSlugs?: string[] }) {
  const has = new Set(linkSlugs);
  const name = (n: string, slug: string, bold: boolean) => {
    const cls = bold ? "font-semibold" : "text-[var(--text-muted)]";
    return (
      <span className="inline-flex items-center">
        <CrestIcon name={n} size={18} className="mr-1.5 align-middle" />
        {has.has(slug) ? <Link href={`/teams/cfb/${slug}`} className={`${cls} hover:text-[var(--accent)]`}>{n}</Link> : <span className={cls}>{n}</span>}
      </span>
    );
  };

  // Shared matchup markup (rank, teams, score, OT) used by both the mobile
  // card and the desktop "Match" cell so the two views can never drift.
  const matchup = (g: CfbGame) => (
    <div className="leading-tight">
      {g.rank ? <span className="text-[var(--text-dim)]">#{g.rank} </span> : null}
      {name(g.team, g.team_slug, true)}
      <span className="text-[var(--text-muted)]"> {g.pf}-{g.pa} </span>
      {g.opp_rank ? <span className="text-[var(--text-dim)]">#{g.opp_rank} </span> : null}
      {name(g.opp, g.opp_slug, false)}
      {g.ot ? <span className="text-[10px] text-[var(--text-dim)]"> ({g.ot})</span> : null}
    </div>
  );

  return (
    <div>
      {/* Mobile: one card per game. Same `games` array/order that drives the
          desktop table below - no separate state, no data dropped (date,
          bowl, designation tags, location, and video link all appear here). */}
      <div className="grid grid-cols-1 gap-2 sm:hidden max-h-[70vh] overflow-auto rounded-lg border p-2" style={{ borderColor: "var(--border)" }}>
        {games.map((g, i) => {
          const loc = [g.stadium, g.metro, g.state].filter(Boolean).join(", ");
          const t = tags(g);
          const date = fmtDate(g.date);
          return (
            <div key={`${g.season}-${g.team}-${g.opp}-${i}-card`} className="rounded-lg border p-3" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="text-[11px] text-[var(--text-dim)] tabular-nums">
                  #{i + 1} · {g.season}{date ? ` · ${date}` : ""}
                </div>
                <div className="text-sm font-semibold text-[var(--accent)] tabular-nums flex-shrink-0">{g.gs.toFixed(2)}</div>
              </div>
              {g.bowl_name && <div className="text-[11px] text-[var(--text-muted)] mb-1">{g.bowl_name}</div>}
              {matchup(g)}
              {loc && <div className="mt-0.5 text-[10px] text-[var(--text-dim)] leading-tight">{loc}</div>}
              {t.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] uppercase tracking-wide">
                  {t.map((x) => <span key={x.label} className={x.cls}>{x.label}</span>)}
                </div>
              )}
              {g.video && (
                <div className="mt-1">
                  <a href={g.video} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-[var(--accent)] hover:underline">&#9654; Watch</a>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="hidden sm:block max-h-[70vh] overflow-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-xs sm:text-sm tabular-nums [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-[var(--bg-card)]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--text-dim)] border-b" style={{ borderColor: "var(--border)" }}>
              <th className="px-2 py-2 w-8">#</th>
              <th className="px-2 py-2 whitespace-nowrap hidden sm:table-cell">Date</th>
              <th className="px-2 py-2 w-14">Season</th>
              <th className="px-2 py-2 hidden md:table-cell">Bowl</th>
              <th className="px-2 py-2">Match</th>
              <th className="px-2 py-2 hidden lg:table-cell">Designation</th>
              <th className="px-2 py-2 text-right w-16">Game Score</th>
            </tr>
          </thead>
          <tbody>
            {games.map((g, i) => {
              const loc = [g.stadium, g.metro, g.state].filter(Boolean).join(", ");
              const t = tags(g);
              return (
                <tr key={`${g.season}-${g.team}-${g.opp}-${i}`} className="border-b last:border-0 hover:bg-[var(--bg-card-hover)] align-top" style={{ borderColor: "var(--border)" }}>
                  <td className="px-2 py-2 text-[var(--text-dim)]">{i + 1}</td>
                  <td className="px-2 py-2 text-[var(--text-muted)] whitespace-nowrap hidden sm:table-cell">{fmtDate(g.date) ?? ""}</td>
                  <td className="px-2 py-2 text-[var(--text-muted)]">{g.season}</td>
                  <td className="px-2 py-2 text-[var(--text-muted)] hidden md:table-cell">{g.bowl_name || ""}</td>
                  <td className="px-2 py-2">
                    {matchup(g)}
                    {loc && <div className="mt-0.5 text-[10px] text-[var(--text-dim)] leading-tight">{loc}</div>}
                    {t.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-x-2 text-[10px] uppercase tracking-wide lg:hidden">
                        {t.map((x) => <span key={x.label} className={x.cls}>{x.label}</span>)}
                      </div>
                    )}
                    {g.video && (
                      <div className="mt-0.5">
                        <a href={g.video} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-[var(--accent)] hover:underline">&#9654; Watch</a>
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2 hidden lg:table-cell">
                    <div className="flex flex-col gap-0.5 text-[10px] uppercase tracking-wide">
                      {t.map((x) => <span key={x.label} className={x.cls}>{x.label}</span>)}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right text-[var(--accent)] font-medium">{g.gs.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
