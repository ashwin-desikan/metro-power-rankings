import Link from "next/link";
import CrestIcon from "@/app/teams/_shared/CrestIcon";
import type { ClubGame } from "@/lib/clubGames";

// Per-club "greatest games" on a club page: this club's top matches by the
// unified club Game Score, this-club perspective, mirroring the national-team
// TeamTopGames pattern. Era names display; canonical identity links and
// fetches crests.
const RES: Record<string, { label: string; color: string }> = {
  W: { label: "W", color: "var(--accent)" },
  D: { label: "D", color: "var(--text-muted)" },
  L: { label: "L", color: "var(--text-dim)" },
};

export default function TeamGreatestGames({ rows, slug, teamName }: { rows: ClubGame[]; slug: string; teamName: string }) {
  if (!rows || rows.length === 0) return null;
  return (
    <section className="rounded-xl border p-5 mb-6" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <h2 className="text-base font-semibold">Greatest games</h2>
      <p className="text-xs text-[var(--text-muted)] mt-1 mb-3">
        {teamName}&apos;s top matches by the club Game Score: closeness, stakes, quality and upset over
        one unified rating of league and European play.
        <Link href="/sports/games#clubfb" className="ml-1 underline decoration-dotted hover:text-[var(--text)]">All-time board</Link>.
      </p>
      <div className="overflow-x-auto">
        <table data-sticky-col="2" className="w-full text-xs tabular-nums">
          <thead>
            <tr className="text-[var(--text-muted)]">
              <th className="text-left font-medium py-2 uppercase tracking-wider text-[10px] pr-3">#</th>
              <th className="text-left font-medium py-2 uppercase tracking-wider text-[10px] pr-3">Date</th>
              <th className="text-left font-medium py-2 uppercase tracking-wider text-[10px] pr-3">Stage</th>
              <th className="text-left font-medium py-2 uppercase tracking-wider text-[10px] pr-3">Result</th>
              <th className="text-right font-medium py-2 uppercase tracking-wider text-[10px]">Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g, i) => {
              const isHome = g.homeSlug === slug;
              const pf = isHome ? g.hg : g.ag;
              const pa = isHome ? g.ag : g.hg;
              const r = pf > pa ? RES.W : pf === pa ? RES.D : RES.L;
              const oppName = isHome ? g.away : g.home;
              const oppCanon = isHome ? g.awayCanon : g.homeCanon;
              const oppSlug = isHome ? g.awaySlug : g.homeSlug;
              const venue = g.neutral ? "N" : isHome ? "H" : "A";
              const legBit = g.leg === 2 ? ` · 2nd leg${g.agg ? `, agg ${isHome ? g.agg : g.agg.split("-").reverse().join("-")}` : ""}` : g.leg === 1 ? " · 1st leg" : "";
              return (
                <tr key={`${g.date}-${i}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 pr-3 text-[var(--text-muted)]">{i + 1}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">{g.date}</td>
                  <td className="py-2 pr-3 text-[var(--text-muted)] whitespace-nowrap">{g.comp}{g.rivalry ? ` · ${g.rivalry}` : ""}{g.round ? ` · ${g.round}` : ""}{legBit}</td>
                  <td className="py-2 pr-3">
                    <span className="text-[10px] text-[var(--text-dim)] mr-1" title={g.neutral ? "neutral venue" : isHome ? "home" : "away"}>{venue}</span>
                    <span className="font-semibold" style={{ color: r.color }}>{r.label}</span>{" "}
                    <span className="tabular-nums">{pf}-{pa}</span>{" "}
                    <span className="text-[var(--text-muted)]">v</span>{" "}
                    <CrestIcon name={oppCanon} size={14} className="mr-0.5 align-[-2px]" />
                    {oppSlug ? (
                      <Link href={`/teams/football/${oppSlug}`} title={oppCanon !== oppName ? `${oppCanon} (as ${oppName})` : undefined} className="hover:text-[var(--accent)] hover:underline decoration-dotted underline-offset-2">{oppName}</Link>
                    ) : (
                      <span>{oppName}</span>
                    )}
                    {g.pens ? <span className="ml-1 text-[10px] text-[var(--text-dim)]">(pens {g.pens})</span> : null}
                    {g.floored ? <span className="ml-1" title={`All-time classic (curated floor); model score ${g.base.toFixed(1)}`} style={{ color: "#e0a83e" }}>&#9733;</span> : null}
                  </td>
                  <td className="py-2 text-right font-semibold" style={{ color: "var(--accent)" }}>{g.gs.toFixed(1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
