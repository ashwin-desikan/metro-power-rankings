import Link from "next/link";
import TeamCrest from "@/app/teams/_shared/TeamCrest";
import { fgFor, type FootyFranchise, type FootySeason, type FootyGrandFinal } from "@/lib/_footy";
import { TOP_TEAMS, topTeamAnchorId } from "@/lib/topTeams";
import type { FootyStandingRow } from "@/lib/_footyStandings";
import type { FootyCopy } from "./config";
import ChampionBadge from "@/app/teams/ChampionBadge";
import type { Championship } from "@/lib/champions";
import RivalriesSection from "@/app/teams/_shared/RivalriesSection";
import type { ResolvedRival } from "@/lib/rivalries";

function titleCase(slug: string): string {
  return slug.split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");
}

function StatCell({ v, k, sub }: { v: string; k: string; sub?: string }) {
  return (
    <div className="rounded-lg border p-3" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="text-2xl font-bold tracking-tight">{v}</div>
      <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)] mt-0.5">{k}</div>
      {sub && <div className="text-[10px] text-[var(--text-dim)] mt-0.5">{sub}</div>}
    </div>
  );
}

function seasonBadge(s: FootySeason, copy: FootyCopy) {
  if (s.stripped) return { label: "Stripped", bg: "#7f1d1d", color: "#fecaca" };
  if (s.prem) return { label: copy.premiersWord, bg: "#d4af37", color: "#1a1408" };
  if (s.gf) return { label: "Runner-up", bg: "#a07a30", color: "#fff" };
  if (s.finals) return { label: "Finals", bg: "rgba(78,205,196,0.16)", color: "var(--accent)" };
  return null;
}

export default function FootyTeam({ copy, f, seasons, grandFinals, live, liveYear, champions = [], rivals = [] }: {
  copy: FootyCopy; f: FootyFranchise; seasons: FootySeason[]; grandFinals: FootyGrandFinal[];
  live?: FootyStandingRow | null; liveYear?: number | null; champions?: Championship[]; rivals?: ResolvedRival[];
}) {
  const lg = copy.league;
  const fg = f.color.startsWith("#") ? fgFor(f.color) : "#ffffff";
  const yearsLabel = `${f.first_year}–${f.active ? "present" : f.last_year}`;
  const _names = [f.name, ...f.aka].map((n) => n.trim().toLowerCase());
  const _slug = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const topMetro = f.metro_slug
    ? (TOP_TEAMS.find((p) => _slug(p.metro) === f.metro_slug && p.team.split("/").some((t) => _names.includes(t.trim().toLowerCase())))?.metro ?? null)
    : null;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link href="/sports" className="hover:text-[var(--text)]">Sports</Link>
        <span className="mx-1">&rsaquo;</span>
        <Link href={`/teams/${lg}`} className="hover:text-[var(--text)]">{copy.code}</Link>
        <span className="mx-1">&rsaquo;</span>
        <span className="text-[var(--text-dim)]">{f.name}</span>
      </nav>

      <div className="mb-4">
        <Link href={`/teams/${lg}`} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          <span aria-hidden>&larr;</span><span>All {copy.code} clubs</span>
        </Link>
      </div>

      <header className="rounded-2xl border p-7 flex flex-col sm:flex-row gap-6 items-start" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <TeamCrest name={f.name} size={80} fallback={<div className="rounded-full grid place-items-center font-extrabold flex-shrink-0" style={{ background: f.color, color: fg, width: 80, height: 80, fontSize: 22, boxShadow: `inset 0 0 0 3px ${f.color2}` }} aria-hidden>
          {f.abbr}
        </div>} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{f.name}</h1>
            <ChampionBadge items={champions} />
            <span className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded" style={{ background: f.active ? "rgba(78,205,196,0.16)" : "rgba(120,120,140,0.18)", color: f.active ? "var(--accent)" : "var(--text-dim)" }}>
              {f.active ? "Active" : "Defunct"}
            </span>
            {topMetro && (
              <Link href={`/top-teams#${topTeamAnchorId(topMetro)}`} className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded hover:brightness-110 transition" style={{ background: "rgba(245,158,11,0.16)", color: "#fbbf24" }} title={`Top sporting team of ${topMetro} — see The Team That Wins the City`}>
                <span aria-hidden>{"\u2654"}</span> Top Team · {topMetro}
              </Link>
            )}
          </div>
          <p className="text-sm text-[var(--text-muted)] mt-2">
            <span className="text-[var(--text-dim)]">Seasons:</span> <span className="text-[var(--text)]">{yearsLabel}</span>
            {" · "}<span className="text-[var(--text-dim)]">Record:</span> <span className="text-[var(--text)]">{lg === "afl" ? `${f.w}-${f.l}-${f.d}` : `${f.w}-${f.d}-${f.l}`}</span>
            {f.metro_slug && <> {" · "}<Link href={`/rankings/${f.metro_slug}`} className="text-[var(--accent)] hover:underline">{titleCase(f.metro_slug)} metro →</Link></>}
          </p>
          {live && (
            <p className="text-sm mt-2 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(34,197,94,0.14)", color: "rgb(34,197,94)" }}>
                <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "rgb(34,197,94)" }} />Live {liveYear}
              </span>
              <span className="text-[var(--text)] font-semibold">{lg === "afl" ? `${live.w}-${live.l}-${live.d}` : `${live.w}-${live.d}-${live.l}`}</span>
              <span className="text-[var(--text-dim)]">· {live.pts} pts · ladder position {live.rank}</span>
            </p>
          )}
          {f.aka.length > 0 && (
            <p className="text-xs text-[var(--text-muted)] mt-2 italic">Also competed as: {f.aka.join(", ")}</p>
          )}
        </div>
      </header>

      <RivalriesSection rivals={rivals} />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-4">
        <StatCell v={f.premierships.toString()} k={copy.premierWord + "s"} sub={f.stripped_premierships > 0 ? `${f.stripped_premierships} stripped (${f.stripped_years.join(", ")})` : (f.title_years.length ? `Last ${f.title_years[f.title_years.length - 1]}` : undefined)} />
        <StatCell v={f.minor_premierships.toString()} k="Minor Premierships" sub={f.minor_years.length ? `Last ${f.minor_years[f.minor_years.length - 1]}` : undefined} />
        <StatCell v={f.gf_apps.toString()} k="Grand Finals" />
        <StatCell v={f.finals_apps.toString()} k="Finals series" />
        <StatCell v={f.seasons.toString()} k="Seasons" />
        <StatCell v={f.win_pct.toFixed(3)} k="Win pct" />
      </div>

      {seasons.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold mb-3">Season-by-season</h2>
          <div className="rounded-xl border overflow-x-auto" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
            <table className="w-full text-sm tabular-nums min-w-[680px]">
              <thead>
                <tr className="border-b text-[11px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                  <th className="text-left py-2 px-3 font-medium">Year</th>
                  <th className="text-left py-2 px-2 font-medium hidden sm:table-cell">Comp</th>
                  <th className="text-left py-2 px-2 font-medium">Team</th>
                  <th className="text-right py-2 px-2 font-medium">Pos</th>
                  <th className="text-right py-2 px-2 font-medium">P</th>
                  <th className="text-right py-2 px-2 font-medium">W</th>
                  <th className="text-right py-2 px-2 font-medium">{lg === "afl" ? "L" : "D"}</th>
                  <th className="text-right py-2 px-2 font-medium">{lg === "afl" ? "D" : "L"}</th>
                  <th className="text-right py-2 px-2 font-medium">Pts</th>
                  <th className="text-right py-2 px-2 font-medium hidden md:table-cell">For</th>
                  <th className="text-right py-2 px-2 font-medium hidden md:table-cell">Agst</th>
                  <th className="text-left py-2 px-3 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {live && liveYear != null && !seasons.some((s) => s.year === liveYear) && (
                  <tr className="border-b last:border-b-0" style={{ borderColor: "var(--border)", background: "rgba(34,197,94,0.06)", fontStyle: "italic" }}>
                    <td className="py-1.5 px-3" style={{ fontWeight: 600 }}>{liveYear}</td>
                    <td className="py-1.5 px-2 text-[var(--text-dim)] text-xs hidden sm:table-cell">{copy.code}</td>
                    <td className="py-1.5 px-2 text-[var(--text-muted)] text-xs">{f.name}</td>
                    <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{live.rank ?? "—"}</td>
                    <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{live.played ?? "—"}</td>
                    <td className="py-1.5 px-2 text-right">{live.w ?? "—"}</td>
                    <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{(lg === "afl" ? live.l : live.d) ?? "—"}</td>
                    <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{(lg === "afl" ? live.d : live.l) ?? "—"}</td>
                    <td className="py-1.5 px-2 text-right">{live.pts ?? "—"}</td>
                    <td className="py-1.5 px-2 text-right text-[var(--text-dim)] text-xs hidden md:table-cell">{live.pf ?? "—"}</td>
                    <td className="py-1.5 px-2 text-right text-[var(--text-dim)] text-xs hidden md:table-cell">{live.pa ?? "—"}</td>
                    <td className="py-1.5 px-3"><span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide" style={{ background: "rgba(34,197,94,0.14)", color: "rgb(34,197,94)" }}><span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "rgb(34,197,94)" }} />Live</span></td>
                  </tr>
                )}
                {seasons.map((s) => {
                  const b = seasonBadge(s, copy);
                  return (
                    <tr key={`${s.year}-${s.team}`} className="border-b last:border-b-0" style={{ borderColor: "var(--border)", background: s.prem ? "rgba(212,175,55,0.07)" : undefined }}>
                      <td className="py-1.5 px-3" style={{ fontWeight: s.prem ? 600 : undefined, color: s.prem ? "#d4af37" : undefined }}>
                        {s.year}{s.minor && <span className="text-yellow-500 ml-1" title={copy.minorWord}>◆</span>}
                      </td>
                      <td className="py-1.5 px-2 text-[var(--text-dim)] text-xs hidden sm:table-cell">{s.league}</td>
                      <td className="py-1.5 px-2 text-[var(--text-muted)] text-xs">{s.team}</td>
                      <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{s.rank ?? "—"}</td>
                      <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{s.played ?? "—"}</td>
                      <td className="py-1.5 px-2 text-right">{s.w ?? "—"}</td>
                      <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{(lg === "afl" ? s.l : s.d) ?? "—"}</td>
                      <td className="py-1.5 px-2 text-right text-[var(--text-muted)]">{(lg === "afl" ? s.d : s.l) ?? "—"}</td>
                      <td className="py-1.5 px-2 text-right">{s.pts ?? "—"}</td>
                      <td className="py-1.5 px-2 text-right text-[var(--text-dim)] text-xs hidden md:table-cell">{s.pf ?? "—"}</td>
                      <td className="py-1.5 px-2 text-right text-[var(--text-dim)] text-xs hidden md:table-cell">{s.pa ?? "—"}</td>
                      <td className="py-1.5 px-3">
                        {b ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide" style={{ background: b.bg, color: b.color }}>{b.label}</span>
                          : <span className="text-[var(--text-dim)]">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {grandFinals.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold mb-3">Grand Final Appearances</h2>
          <div className="rounded-xl border overflow-x-auto" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
            <table className="w-full text-sm tabular-nums min-w-[560px]">
              <thead>
                <tr className="border-b text-[11px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                  <th className="text-left py-2 px-3 font-medium">Year</th>
                  <th className="text-left py-2 px-2 font-medium">Team</th>
                  <th className="text-left py-2 px-2 font-medium">Result</th>
                  <th className="text-right py-2 px-2 font-medium">Score</th>
                  <th className="text-left py-2 px-2 font-medium">Opponent</th>
                  <th className="text-left py-2 px-3 font-medium hidden sm:table-cell">Venue</th>
                </tr>
              </thead>
              <tbody>
                {grandFinals.map((g, i) => {
                  const won = g.result === "W", drew = g.result === "D";
                  return (
                    <tr key={`${g.year}-${i}`} className="border-b last:border-b-0" style={{ borderColor: "var(--border)", background: won ? "rgba(212,175,55,0.07)" : undefined }}>
                      <td className="py-1.5 px-3 font-medium">{g.year}</td>
                      <td className="py-1.5 px-2 text-[var(--text-muted)] text-xs">{g.team}</td>
                      <td className="py-1.5 px-2">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide" style={{ background: won ? "#d4af37" : drew ? "#6b7280" : "#475569", color: won ? "#1a1408" : "#fff" }}>
                          {won ? "Won" : drew ? "Drawn" : "Lost"}
                        </span>
                      </td>
                      <td className="py-1.5 px-2 text-right text-xs">{g.pf}–{g.pa}</td>
                      <td className="py-1.5 px-2 text-[var(--text-muted)]">{g.opp_team || g.opponent}</td>
                      <td className="py-1.5 px-3 text-[var(--text-dim)] text-xs hidden sm:table-cell">{g.stadium}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="text-xs text-[var(--text-dim)] mt-8">
        {f.active ? `${copy.code} club.` : `Defunct ${copy.code} club.`} All-time honours and season records sourced from{" "}
        <a href="https://afltables.com/" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--text-muted)] underline">afltables.com</a>.
        See <Link href="/methodology" className="hover:text-[var(--text-muted)]">methodology</Link>.
      </p>
    </main>
  );
}
