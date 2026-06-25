"use client";

import Link from "next/link";
import type { CbbGame } from "@/lib/cbbShared";
import CrestIcon from "@/app/teams/_shared/CrestIcon";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(d: string | null): string | null {
  if (!d) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${MON[+m[2] - 1]} ${+m[3]}, ${m[1]}` : null;
}
function tags(g: CbbGame): { label: string; cls: string }[] {
  const r = (g.round || "").toLowerCase();
  const out: { label: string; cls: string }[] = [];
  if (r.includes("championship") || r.includes("national final")) out.push({ label: "National Title", cls: "text-[var(--accent)]" });
  else if (r.includes("final four") || r.includes("national semi")) out.push({ label: "Final Four", cls: "text-amber-300" });
  else if (r.includes("regional final") || r.includes("elite")) out.push({ label: "Elite Eight", cls: "text-[var(--text-muted)]" });
  else if (r.includes("regional semi") || r.includes("sweet")) out.push({ label: "Sweet 16", cls: "text-[var(--text-muted)]" });
  if (r.includes("nit")) out.push({ label: "NIT", cls: "text-[var(--text-dim)]" });
  return out;
}

export default function CbbGamesTable({ games, linkSlugs = [] }: { games: CbbGame[]; linkSlugs?: string[] }) {
  const has = new Set(linkSlugs);
  const name = (n: string, slug: string, bold: boolean) => {
    const cls = bold ? "font-semibold" : "text-[var(--text-muted)]";
    return (
      <span className="inline-flex items-center">
        <CrestIcon name={n} size={18} className="mr-1.5 align-middle" />
        {has.has(slug) ? <Link href={`/teams/cbb/${slug}`} className={`${cls} hover:text-[var(--accent)]`}>{n}</Link> : <span className={cls}>{n}</span>}
      </span>
    );
  };
  return (
    <div className="max-h-[70vh] overflow-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
      <table className="w-full text-xs sm:text-sm tabular-nums [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-[var(--bg-card)]">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--text-dim)] border-b" style={{ borderColor: "var(--border)" }}>
            <th className="px-2 py-2 w-8">#</th>
            <th className="px-2 py-2 whitespace-nowrap hidden sm:table-cell">Date</th>
            <th className="px-2 py-2 w-14">Season</th>
            <th className="px-2 py-2 hidden md:table-cell">Round</th>
            <th className="px-2 py-2">Match</th>
            <th className="px-2 py-2 text-right w-16">Game Score</th>
          </tr>
        </thead>
        <tbody>
          {games.map((g, i) => {
            const loc = [g.arena, g.metro, g.state].filter(Boolean).join(", ");
            const t = tags(g);
            const ot = g.ot && String(g.ot).trim() && String(g.ot).trim() !== "0";
            return (
              <tr key={`${g.season}-${g.team}-${g.opp}-${i}`} className="border-b last:border-0 hover:bg-[var(--bg-card-hover)] align-top" style={{ borderColor: "var(--border)" }}>
                <td className="px-2 py-2 text-[var(--text-dim)]">{i + 1}</td>
                <td className="px-2 py-2 text-[var(--text-muted)] whitespace-nowrap hidden sm:table-cell">{fmtDate(g.date) ?? ""}</td>
                <td className="px-2 py-2 text-[var(--text-muted)]">{g.season}</td>
                <td className="px-2 py-2 text-[var(--text-muted)] hidden md:table-cell">{g.round || ""}</td>
                <td className="px-2 py-2">
                  <div className="leading-tight">
                    {g.rank ? <span className="text-[var(--text-dim)]">#{g.rank} </span> : null}
                    {name(g.team, g.team_slug, true)}
                    <span className="text-[var(--text-muted)]"> {g.pf}-{g.pa} </span>
                    {g.opp_rank ? <span className="text-[var(--text-dim)]">#{g.opp_rank} </span> : null}
                    {name(g.opp, g.opp_slug, false)}
                    {ot ? <span className="text-[10px] text-[var(--text-dim)]"> ({String(g.ot)})</span> : null}
                  </div>
                  {loc && <div className="mt-0.5 text-[10px] text-[var(--text-dim)] leading-tight">{loc}</div>}
                  {t.length > 0 && (
                    <div className="mt-0.5 flex flex-wrap gap-x-2 text-[10px] uppercase tracking-wide">
                      {t.map((x) => <span key={x.label} className={x.cls}>{x.label}</span>)}
                    </div>
                  )}
                </td>
                <td className="px-2 py-2 text-right text-[var(--accent)] font-medium">{g.gs.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
